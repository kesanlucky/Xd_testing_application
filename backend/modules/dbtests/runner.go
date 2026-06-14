package dbtests

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

type TestConfigPayload struct {
	RowCount       int               `json:"row_count"`
	TimeoutSeconds int               `json:"timeout_seconds"`
	SourceTable    string            `json:"source_table"`
	DestTable      string            `json:"dest_table"`
	SourceCols     map[string]string `json:"source_cols"`
	DestCols       map[string]string `json:"dest_cols"`
	SimulateETL    bool              `json:"simulate_etl"`
}

type RunResult struct {
	Success  bool     `json:"success"`
	Status   string   `json:"status"` // PASS, FAIL, TIMEOUT
	Logs     []string `json:"logs"`
	Injected int      `json:"injected"`
	Verified int      `json:"verified"`
}

// RunDynamicTest executes the dynamic test insertion and verification assertion loop
func RunDynamicTest(db *sql.DB, configName string, rawJSON string) (*RunResult, error) {
	var payload TestConfigPayload
	err := json.Unmarshal([]byte(rawJSON), &payload)
	if err != nil {
		return nil, fmt.Errorf("failed to parse config JSON: %v", err)
	}

	result := &RunResult{
		Success: false,
		Status:  "FAIL",
		Logs:    []string{},
	}

	logMsg := func(format string, args ...any) {
		msg := fmt.Sprintf(format, args...)
		log.Println(msg)
		result.Logs = append(result.Logs, fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), msg))
	}

	logMsg("Starting dynamic test: %s", configName)
	logMsg("Source table: %s, Destination table: %s", payload.SourceTable, payload.DestTable)
	logMsg("Target row count: %d, Timeout: %d seconds", payload.RowCount, payload.TimeoutSeconds)

	// 0. Clean slate: Delete existing records to avoid duplicate key issues
	logMsg("Cleaning slate: deleting existing records from source and destination tables...")
	_, _ = db.Exec(fmt.Sprintf("DELETE FROM %s", payload.SourceTable))
	_, _ = db.Exec(fmt.Sprintf("DELETE FROM %s", payload.DestTable))

	// 1. Data Injection into Source Table
	logMsg("Phase 1: Injecting data into source table %s...", payload.SourceTable)
	for i := 1; i <= payload.RowCount; i++ {
		var colNames []string
		var placeholders []string
		var values []any

		for colName, template := range payload.SourceCols {
			colNames = append(colNames, colName)
			placeholders = append(placeholders, "?")

			// Interpolate {row_index} in the template
			valStr := strings.ReplaceAll(template, "{row_index}", fmt.Sprintf("%d", i))
			values = append(values, valStr)
		}

		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
			payload.SourceTable,
			strings.Join(colNames, ", "),
			strings.Join(placeholders, ", "),
		)

		_, err := db.Exec(query, values...)
		if err != nil {
			logMsg("Error injecting row %d: %v", i, err)
			return result, err
		}
		result.Injected++
	}
	logMsg("Successfully injected %d rows into source table", result.Injected)

	// 1.5 Simulated ETL Replication (if enabled)
	if payload.SimulateETL {
		logMsg("[MOCK ETL] Simulating ETL replication by writing configured expected values to destination table...")
		for i := 1; i <= payload.RowCount; i++ {
			var colNames []string
			var placeholders []string
			var values []any

			for colName, template := range payload.DestCols {
				colNames = append(colNames, colName)
				placeholders = append(placeholders, "?")

				valStr := strings.ReplaceAll(template, "{row_index}", fmt.Sprintf("%d", i))
				values = append(values, valStr)
			}

			query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
				payload.DestTable,
				strings.Join(colNames, ", "),
				strings.Join(placeholders, ", "),
			)

			_, err := db.Exec(query, values...)
			if err != nil {
				logMsg("[MOCK ETL ERROR] Failed to simulate replication for row %d: %v", i, err)
				return result, err
			}
		}
		logMsg("[MOCK ETL] Simulated replication completed for %d rows", payload.RowCount)
	}

	// 2. Propagation Polling & Verification in Destination Table
	logMsg("Phase 2: Polling destination table %s for replication verification...", payload.DestTable)
	startTime := time.Now()
	timeout := time.Duration(payload.TimeoutSeconds) * time.Second

	for {
		verifiedCount := 0
		var mismatchLogs []string

		// Check each expected row
		for i := 1; i <= payload.RowCount; i++ {
			// Construct expected values
			expectedVals := make(map[string]string)
			for colName, template := range payload.DestCols {
				expectedVals[colName] = strings.ReplaceAll(template, "{row_index}", fmt.Sprintf("%d", i))
			}

			// We need to query the destination table to see if a row matches the expected columns
			// Let's build a query dynamically: SELECT * FROM destTable WHERE <primary_key_or_first_col> = ?
			// To be simple and robust, we can query all columns that we configured, using the first configured column as filter
			var filterCol string
			var filterVal string
			for colName, val := range expectedVals {
				filterCol = colName
				filterVal = val
				break // Use first column as filter
			}

			query := fmt.Sprintf("SELECT %s FROM %s WHERE %s = ?",
				joinKeys(expectedVals),
				payload.DestTable,
				filterCol,
			)

			rows, err := db.Query(query, filterVal)
			if err != nil {
				logMsg("Query error on destination: %v", err)
				time.Sleep(1 * time.Second)
				break
			}

			// Scan the row columns dynamically
			cols, _ := rows.Columns()
			foundMatch := false

			for rows.Next() {
				// Prepare pointers to scan values as raw strings/bytes
				scanArgs := make([]any, len(cols))
				values := make([]sql.RawBytes, len(cols))
				for idx := range scanArgs {
					scanArgs[idx] = &values[idx]
				}

				if err := rows.Scan(scanArgs...); err != nil {
					logMsg("Scan error: %v", err)
					continue
				}

				// Map scanned columns to string map
				rowMap := make(map[string]string)
				for idx, col := range cols {
					rowMap[col] = string(values[idx])
				}

				// Compare rowMap with expectedVals
				rowMatches := true
				var mismatchDetails []string
				for colName, expectedVal := range expectedVals {
					actualVal, exists := rowMap[colName]
					if !exists {
						rowMatches = false
						mismatchDetails = append(mismatchDetails, fmt.Sprintf("col %s missing in destination", colName))
					} else {
						// Smart numeric-aware comparison
						if !compareValues(actualVal, expectedVal) {
							rowMatches = false
							mismatchDetails = append(mismatchDetails, fmt.Sprintf("col %s expected '%s' got '%s'", colName, expectedVal, actualVal))
						}
					}
				}

				if rowMatches {
					foundMatch = true
					break
				} else {
					mismatchLogs = append(mismatchLogs, fmt.Sprintf("Row index %d matches filter but has field mismatch: %s", i, strings.Join(mismatchDetails, "; ")))
				}
			}
			rows.Close()

			if foundMatch {
				verifiedCount++
			}
		}

		result.Verified = verifiedCount

		if verifiedCount == payload.RowCount {
			logMsg("Pass! All %d rows verified successfully in destination table", verifiedCount)
			result.Success = true
			result.Status = "PASS"
			break
		}

		if time.Since(startTime) > timeout {
			logMsg("Timeout! Reached timeout limit of %d seconds.", payload.TimeoutSeconds)
			logMsg("Only %d out of %d rows were verified.", verifiedCount, payload.RowCount)
			for _, mLog := range mismatchLogs {
				logMsg(mLog)
			}
			result.Status = "TIMEOUT"
			break
		}

		logMsg("Polling: %d/%d rows verified. Waiting 1 second...", verifiedCount, payload.RowCount)
		time.Sleep(1 * time.Second)
	}

	return result, nil
}

func joinKeys(m map[string]string) string {
	var keys []string
	for k := range m {
		keys = append(keys, k)
	}
	return strings.Join(keys, ", ")
}

// compareValues compares actual and expected string values, parsing as floats to handle decimals if possible
func compareValues(actual, expected string) bool {
	actTrim := strings.TrimSpace(actual)
	expTrim := strings.TrimSpace(expected)
	if actTrim == expTrim {
		return true
	}

	// Try numeric float comparison to handle decimal formats (e.g., "1.00" vs "1")
	actF, err1 := strconv.ParseFloat(actTrim, 64)
	expF, err2 := strconv.ParseFloat(expTrim, 64)
	if err1 == nil && err2 == nil {
		return actF == expF
	}

	return false
}
