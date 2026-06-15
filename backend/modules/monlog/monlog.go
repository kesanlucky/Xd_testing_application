package monlog

import (
	"encoding/json"
	"log"
	"time"

	"xdtest/config"
	"xdtest/modules/monitor"
)

// MonitorLogEntry is the structured log entry written to each line of the log file.
type MonitorLogEntry struct {
	Timestamp    string  `json:"timestamp"`
	PID          int     `json:"pid"`
	CPU          float64 `json:"cpu"`
	RAMMB        float64 `json:"ram_mb"`
	Goroutines   int     `json:"goroutines"`
	OpenFDs      int     `json:"open_fds"`
	FDLimit      int     `json:"fd_limit"`
	DiskReadKB   float64 `json:"disk_read_kb"`
	DiskWriteKB  float64 `json:"disk_write_kb"`
	TCPConns     int     `json:"tcp_conns"`
	NetBytesIn   int64   `json:"net_bytes_in"`
	NetBytesOut  int64   `json:"net_bytes_out"`
	VirtualMemMB float64 `json:"virtual_mem_mb"`
	DiskUsagePct float64 `json:"disk_usage_pct"`
	Running      bool    `json:"running"`

	// Streamer summary
	Streamers       interface{} `json:"streamers"`
	TotalEPS        int         `json:"total_eps"`
	TotalThreads    int         `json:"total_threads"`
	ActiveStreamers int         `json:"active_streamers"`
	TotalStreamers  int         `json:"total_streamers"`
}

// StartMonitorLogger starts a background goroutine that periodically collects
// all monitoring data and writes structured log entries to rotating log files.
func StartMonitorLogger() {
	rotator, err := NewRotator(config.MonLogDir, config.MonLogMaxFileSize, config.MonLogMaxFiles)
	if err != nil {
		log.Printf("[monlog] Failed to initialize log rotator: %v", err)
		return
	}

	interval := time.Duration(config.MonLogInterval) * time.Second
	ticker := time.NewTicker(interval)

	log.Printf("[monlog] Monitor logger started — interval=%ds, dir=%s, maxSize=%d bytes, maxFiles=%d",
		config.MonLogInterval, config.MonLogDir, config.MonLogMaxFileSize, config.MonLogMaxFiles)

	go func() {
		defer ticker.Stop()
		for range ticker.C {
			collectAndWrite(rotator)
		}
	}()
}

// collectAndWrite gathers all metrics and writes a single structured log entry.
func collectAndWrite(rotator *Rotator) {
	// 1. Collect system metrics
	sysMetrics := monitor.GetXdMetrics()

	// 2. Collect streamer data from xadmin
	var streamers []streamerSummary
	out, err := monitor.RunXadminCommand(config.CmdStreamerStatus, "")
	if err == nil && len(out) > 0 {
		var rawStreamers []map[string]interface{}
		if json.Unmarshal(out, &rawStreamers) == nil {
			for _, s := range rawStreamers {
				streamers = append(streamers, parseStreamer(s))
			}
		}
	}

	// 3. Compute aggregates
	totalEPS := 0
	totalThreads := 0
	activeStreamers := 0
	for _, s := range streamers {
		totalEPS += s.EPS
		totalThreads += s.Threads
		if s.Status == "running" || s.Status == "Running" {
			activeStreamers++
		}
	}

	// 4. Build log entry
	entry := MonitorLogEntry{
		Timestamp:       time.Now().UTC().Format(time.RFC3339Nano),
		PID:             sysMetrics.PID,
		CPU:             sysMetrics.CPU,
		RAMMB:           sysMetrics.RAM,
		Goroutines:      sysMetrics.Goroutines,
		OpenFDs:         sysMetrics.OpenFDs,
		FDLimit:         sysMetrics.FDLimit,
		DiskReadKB:      sysMetrics.DiskReadKB,
		DiskWriteKB:     sysMetrics.DiskWriteKB,
		TCPConns:        sysMetrics.TCPConns,
		NetBytesIn:      sysMetrics.NetBytesIn,
		NetBytesOut:     sysMetrics.NetBytesOut,
		VirtualMemMB:    sysMetrics.VirtualMem,
		DiskUsagePct:    sysMetrics.DiskUsagePct,
		Running:         sysMetrics.Running,
		Streamers:       streamers,
		TotalEPS:        totalEPS,
		TotalThreads:    totalThreads,
		ActiveStreamers: activeStreamers,
		TotalStreamers:  len(streamers),
	}

	// 5. Marshal to JSON (one line)
	data, err := json.Marshal(entry)
	if err != nil {
		log.Printf("[monlog] Failed to marshal log entry: %v", err)
		return
	}

	// 6. Write through rotator
	if err := rotator.Write(data); err != nil {
		log.Printf("[monlog] Failed to write log entry: %v", err)
	}
}

// streamerSummary is a simplified streamer record for the log entry.
type streamerSummary struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Status  string `json:"status"`
	Threads int    `json:"threads"`
	EPS     int    `json:"eps"`
	Uptime  string `json:"uptime"`
}

// parseStreamer extracts a streamerSummary from the raw xadmin JSON map.
func parseStreamer(raw map[string]interface{}) streamerSummary {
	s := streamerSummary{}
	if v, ok := raw["id"].(string); ok {
		s.ID = v
	}
	if v, ok := raw["name"].(string); ok {
		s.Name = v
	}
	if v, ok := raw["status"].(string); ok {
		s.Status = v
	}
	if v, ok := raw["threads"].(float64); ok {
		s.Threads = int(v)
	}
	if v, ok := raw["eps"].(float64); ok {
		s.EPS = int(v)
	}
	if v, ok := raw["uptime"].(string); ok {
		s.Uptime = v
	}
	return s
}
