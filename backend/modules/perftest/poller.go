package perftest

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"xdtest/db"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// PollConfig holds configuration for destination polling
type PollConfig struct {
	Server         ServerConfig
	Table          string
	ExpectedCount  int
	PollIntervalMs int
	TimeoutSeconds int
}

// PollProgress reports polling progress
type PollProgress struct {
	DestCount int     `json:"dest_count"`
	Expected  int     `json:"expected"`
	ElapsedMs int64   `json:"elapsed_ms"`
	EPS       float64 `json:"eps"` // events per second
}

// BenchmarkResult holds the final benchmark data
type BenchmarkResult struct {
	Success           bool    `json:"success"`
	TotalInserted     int     `json:"total_inserted"`
	TotalReceived     int     `json:"total_received"`
	InsertTimeMs      int64   `json:"insert_time_ms"`
	ReplicationTimeMs int64   `json:"replication_time_ms"`
	TotalTimeMs       int64   `json:"total_time_ms"`
	AvgEPS            float64 `json:"avg_eps"`
	PeakEPS           float64 `json:"peak_eps"`
	FirstEventLatMs   int64   `json:"first_event_lat_ms"`
	Status            string  `json:"status"` // PASS, FAIL, TIMEOUT
}

// RunPoll polls the destination table until expected count is reached or timeout.
// It sends progress updates through progressCh and returns the benchmark result.
func RunPoll(cfg PollConfig, insertTimeMs int64, progressCh chan<- PollProgress, stopCh <-chan struct{}) (*BenchmarkResult, error) {
	if cfg.Server.Flavor == "mongodb" {
		return runMongoPoll(cfg, insertTimeMs, progressCh, stopCh)
	}
	return runSQLPoll(cfg, insertTimeMs, progressCh, stopCh)
}

func runSQLPoll(cfg PollConfig, insertTimeMs int64, progressCh chan<- PollProgress, stopCh <-chan struct{}) (*BenchmarkResult, error) {
	conn, err := db.ConnectDB(cfg.Server.Flavor, cfg.Server.Username, cfg.Server.Password, cfg.Server.Hostname, cfg.Server.Port, cfg.Server.Database)
	if err != nil {
		return nil, fmt.Errorf("destination DB connection failed: %w", err)
	}
	defer conn.Close()

	pollInterval := time.Duration(cfg.PollIntervalMs) * time.Millisecond
	if pollInterval <= 0 {
		pollInterval = 500 * time.Millisecond
	}
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second

	start := time.Now()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	var peakEPS float64
	var firstEventLatMs int64
	firstEventSeen := false
	initialCount := getRowCount(conn, cfg.Table)

	for {
		select {
		case <-stopCh:
			elapsed := time.Since(start).Milliseconds()
			return &BenchmarkResult{
				Success:           false,
				TotalInserted:     cfg.ExpectedCount,
				TotalReceived:     0,
				InsertTimeMs:      insertTimeMs,
				ReplicationTimeMs: elapsed,
				TotalTimeMs:       insertTimeMs + elapsed,
				Status:            "CANCELLED",
			}, nil

		case <-ticker.C:
			currentCount := getRowCount(conn, cfg.Table)
			newCount := currentCount - initialCount
			elapsed := time.Since(start).Milliseconds()

			// Calculate EPS
			var eps float64
			if elapsed > 0 {
				eps = float64(newCount) / (float64(elapsed) / 1000.0)
			}
			if eps > peakEPS {
				peakEPS = eps
			}

			// Track first event latency
			if !firstEventSeen && newCount > 0 {
				firstEventSeen = true
				firstEventLatMs = elapsed
			}

			progressCh <- PollProgress{
				DestCount: newCount,
				Expected:  cfg.ExpectedCount,
				ElapsedMs: elapsed,
				EPS:       eps,
			}

			log.Printf("[perftest] Poll: %d/%d events received (%.1f eps, %dms elapsed)",
				newCount, cfg.ExpectedCount, eps, elapsed)

			// Check completion
			if newCount >= cfg.ExpectedCount {
				totalTime := insertTimeMs + elapsed
				avgEPS := float64(newCount) / (float64(elapsed) / 1000.0)

				return &BenchmarkResult{
					Success:           true,
					TotalInserted:     cfg.ExpectedCount,
					TotalReceived:     newCount,
					InsertTimeMs:      insertTimeMs,
					ReplicationTimeMs: elapsed,
					TotalTimeMs:       totalTime,
					AvgEPS:            avgEPS,
					PeakEPS:           peakEPS,
					FirstEventLatMs:   firstEventLatMs,
					Status:            "PASS",
				}, nil
			}

			// Check timeout
			if time.Since(start) > timeout {
				totalTime := insertTimeMs + elapsed
				var avgEPS float64
				if elapsed > 0 {
					avgEPS = float64(newCount) / (float64(elapsed) / 1000.0)
				}

				return &BenchmarkResult{
					Success:           false,
					TotalInserted:     cfg.ExpectedCount,
					TotalReceived:     newCount,
					InsertTimeMs:      insertTimeMs,
					ReplicationTimeMs: elapsed,
					TotalTimeMs:       totalTime,
					AvgEPS:            avgEPS,
					PeakEPS:           peakEPS,
					FirstEventLatMs:   firstEventLatMs,
					Status:            "TIMEOUT",
				}, nil
			}
		}
	}
}

func getRowCount(conn *sql.DB, table string) int {
	var count int
	err := conn.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&count)
	if err != nil {
		return 0
	}
	return count
}

func runMongoPoll(cfg PollConfig, insertTimeMs int64, progressCh chan<- PollProgress, stopCh <-chan struct{}) (*BenchmarkResult, error) {
	uri := fmt.Sprintf("mongodb://%s:%s@%s:%d",
		cfg.Server.Username, cfg.Server.Password, cfg.Server.Hostname, cfg.Server.Port)

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("MongoDB connection failed: %w", err)
	}
	defer client.Disconnect(context.Background())

	collection := client.Database(cfg.Server.Database).Collection(cfg.Table)

	pollInterval := time.Duration(cfg.PollIntervalMs) * time.Millisecond
	if pollInterval <= 0 {
		pollInterval = 500 * time.Millisecond
	}
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second

	start := time.Now()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	var peakEPS float64
	var firstEventLatMs int64
	firstEventSeen := false

	// Get initial count
	initialCount, _ := collection.CountDocuments(context.Background(), bson.D{})

	for {
		select {
		case <-stopCh:
			return &BenchmarkResult{
				Success:    false,
				Status:     "CANCELLED",
				InsertTimeMs: insertTimeMs,
			}, nil

		case <-ticker.C:
			currentCount, _ := collection.CountDocuments(context.Background(), bson.D{})
			newCount := int(currentCount - initialCount)
			elapsed := time.Since(start).Milliseconds()

			var eps float64
			if elapsed > 0 {
				eps = float64(newCount) / (float64(elapsed) / 1000.0)
			}
			if eps > peakEPS {
				peakEPS = eps
			}

			if !firstEventSeen && newCount > 0 {
				firstEventSeen = true
				firstEventLatMs = elapsed
			}

			progressCh <- PollProgress{
				DestCount: newCount,
				Expected:  cfg.ExpectedCount,
				ElapsedMs: elapsed,
				EPS:       eps,
			}

			if newCount >= cfg.ExpectedCount {
				totalTime := insertTimeMs + elapsed
				avgEPS := float64(newCount) / (float64(elapsed) / 1000.0)
				return &BenchmarkResult{
					Success:           true,
					TotalInserted:     cfg.ExpectedCount,
					TotalReceived:     newCount,
					InsertTimeMs:      insertTimeMs,
					ReplicationTimeMs: elapsed,
					TotalTimeMs:       totalTime,
					AvgEPS:            avgEPS,
					PeakEPS:           peakEPS,
					FirstEventLatMs:   firstEventLatMs,
					Status:            "PASS",
				}, nil
			}

			if time.Since(start) > timeout {
				return &BenchmarkResult{
					Success:           false,
					TotalInserted:     cfg.ExpectedCount,
					TotalReceived:     newCount,
					InsertTimeMs:      insertTimeMs,
					ReplicationTimeMs: elapsed,
					TotalTimeMs:       insertTimeMs + elapsed,
					AvgEPS:            eps,
					PeakEPS:           peakEPS,
					FirstEventLatMs:   firstEventLatMs,
					Status:            "TIMEOUT",
				}, nil
			}
		}
	}
}
