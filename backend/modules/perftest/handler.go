package perftest

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"xdtest/config"
	"xdtest/modules/monitor"
)

// Global state for the currently running test
var (
	testMu      sync.Mutex
	testRunning bool
	testStopCh  chan struct{}
)

// TestRequest is the JSON payload for starting a performance test
type TestRequest struct {
	SourceTable    string `json:"source_table"`
	DestTable      string `json:"dest_table"`
	RowCount       int    `json:"row_count"`
	InsertMode     string `json:"insert_mode"` // single, bulk, transaction
	BatchSize      int    `json:"batch_size"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	PollIntervalMs int    `json:"poll_interval_ms"`
	CleanBeforeRun bool   `json:"clean_before_run"`
}

// RegisterRoutes registers performance test HTTP routes
func RegisterRoutes(mux *http.ServeMux, corsWrap func(http.HandlerFunc) http.HandlerFunc) {
	mux.HandleFunc("/api/perftest/config", corsWrap(handleGetConfig))
	mux.HandleFunc("/api/perftest/tables", corsWrap(handleGetTables))
	mux.HandleFunc("/api/perftest/columns", corsWrap(handleGetColumns))
	mux.HandleFunc("/api/perftest/start", handleStartTest) // SSE, handles CORS itself
	mux.HandleFunc("/api/perftest/stop", corsWrap(handleStopTest))
}

// handleGetConfig returns the parsed Xd configuration
func handleGetConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cfg, err := LoadXdConfig()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

// handleGetTables lists tables from the source server
func handleGetTables(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	which := r.URL.Query().Get("which") // "source" or "dest"

	cfg, err := LoadXdConfig()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	server := cfg.Source
	if which == "dest" {
		server = cfg.Destination
	}

	tables, err := ListTables(server)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"tables": []string{},
			"error":  err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tables": tables,
	})
}

// handleGetColumns lists columns for a table in the source or dest server
func handleGetColumns(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	table := r.URL.Query().Get("table")
	which := r.URL.Query().Get("which")

	if table == "" {
		http.Error(w, "table parameter required", http.StatusBadRequest)
		return
	}

	cfg, err := LoadXdConfig()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	server := cfg.Source
	if which == "dest" {
		server = cfg.Destination
	}

	columns, err := ListColumns(server, table)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"columns": []ColumnSchema{},
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"columns": columns,
	})
}

// handleStartTest starts a performance test and streams progress via SSE
func handleStartTest(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		sendSSEEvent(w, "error", map[string]string{"message": "Method not allowed"})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Parse request
	var req TestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendSSEEvent(w, "error", map[string]string{"message": "Invalid request body: " + err.Error()})
		flusher.Flush()
		return
	}

	// Set defaults
	if req.RowCount <= 0 {
		req.RowCount = 1000
	}
	if req.BatchSize <= 0 {
		req.BatchSize = 100
	}
	if req.TimeoutSeconds <= 0 {
		req.TimeoutSeconds = 120
	}
	if req.PollIntervalMs <= 0 {
		req.PollIntervalMs = 500
	}
	if req.InsertMode == "" {
		req.InsertMode = "single"
	}

	// Check if a test is already running
	testMu.Lock()
	if testRunning {
		testMu.Unlock()
		sendSSEEvent(w, "error", map[string]string{"message": "A test is already running"})
		flusher.Flush()
		return
	}
	testRunning = true
	testStopCh = make(chan struct{})
	stopCh := testStopCh
	testMu.Unlock()

	defer func() {
		testMu.Lock()
		testRunning = false
		testMu.Unlock()
	}()

	// Load Xd config
	xdCfg, err := LoadXdConfig()
	if err != nil {
		sendSSEEvent(w, "error", map[string]string{"message": "Failed to load Xd config: " + err.Error()})
		flusher.Flush()
		return
	}

	clientGone := r.Context().Done()

	// ── PHASE 1: INSERT DATA INTO SOURCE ──
	sendSSEEvent(w, "phase", map[string]string{"phase": "inserting", "message": "Inserting data into source database..."})
	flusher.Flush()

	insertProgressCh := make(chan InsertProgress, 100)
	insertErrCh := make(chan error, 1)

	insertCfg := InsertConfig{
		Server:     xdCfg.Source,
		Table:      req.SourceTable,
		RowCount:   req.RowCount,
		Mode:       InsertMode(req.InsertMode),
		BatchSize:  req.BatchSize,
		CleanFirst: req.CleanBeforeRun,
	}

	go func() {
		insertErrCh <- RunInsert(insertCfg, insertProgressCh, stopCh)
		close(insertProgressCh)
	}()

	var insertTimeMs int64

	// Stream insert progress
insertLoop:
	for {
		select {
		case <-clientGone:
			close(stopCh)
			return
		case <-stopCh:
			sendSSEEvent(w, "error", map[string]string{"message": "Test cancelled"})
			flusher.Flush()
			return
		case prog, ok := <-insertProgressCh:
			if !ok {
				break insertLoop
			}
			insertTimeMs = prog.ElapsedMs
			sendSSEEvent(w, "insert_progress", prog)
			flusher.Flush()
		}
	}

	// Check for insertion error
	if err := <-insertErrCh; err != nil {
		sendSSEEvent(w, "error", map[string]string{"message": "Insert failed: " + err.Error()})
		flusher.Flush()
		return
	}

	log.Printf("[perftest] Insertion complete: %d rows in %dms", req.RowCount, insertTimeMs)

	// ── PHASE 2: START XD ──
	sendSSEEvent(w, "phase", map[string]string{"phase": "starting_xd", "message": "Starting Xd engine..."})
	flusher.Flush()

	// Start Xd via xadmin
	_, err = monitor.RunXadminCommand(config.CmdXdStart, "")
	if err != nil {
		log.Printf("[perftest] Warning: xadmin start returned error: %v", err)
		// Continue anyway — the real Xd might already be running
	}

	sendSSEEvent(w, "phase", map[string]string{"phase": "polling", "message": "Polling destination for events..."})
	flusher.Flush()

	// ── PHASE 3: POLL DESTINATION ──
	pollProgressCh := make(chan PollProgress, 100)
	pollResultCh := make(chan *BenchmarkResult, 1)
	pollErrCh := make(chan error, 1)

	pollCfg := PollConfig{
		Server:         xdCfg.Destination,
		Table:          req.DestTable,
		ExpectedCount:  req.RowCount,
		PollIntervalMs: req.PollIntervalMs,
		TimeoutSeconds: req.TimeoutSeconds,
	}

	go func() {
		result, err := RunPoll(pollCfg, insertTimeMs, pollProgressCh, stopCh)
		pollResultCh <- result
		pollErrCh <- err
		close(pollProgressCh)
	}()

	// Stream poll progress
pollLoop:
	for {
		select {
		case <-clientGone:
			close(stopCh)
			return
		case <-stopCh:
			sendSSEEvent(w, "error", map[string]string{"message": "Test cancelled"})
			flusher.Flush()
			return
		case prog, ok := <-pollProgressCh:
			if !ok {
				break pollLoop
			}
			sendSSEEvent(w, "poll_progress", prog)
			flusher.Flush()
		}
	}

	// Get final result
	result := <-pollResultCh
	if err := <-pollErrCh; err != nil {
		sendSSEEvent(w, "error", map[string]string{"message": "Poll failed: " + err.Error()})
		flusher.Flush()
		return
	}

	// ── PHASE 4: COMPLETE ──
	sendSSEEvent(w, "phase", map[string]string{"phase": "complete", "message": "Benchmark complete"})
	sendSSEEvent(w, "benchmark_result", result)
	flusher.Flush()

	log.Printf("[perftest] Test complete: %s — %d/%d events, %.1f avg EPS, %dms total",
		result.Status, result.TotalReceived, result.TotalInserted, result.AvgEPS, result.TotalTimeMs)
}

// handleStopTest cancels a running test
func handleStopTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	testMu.Lock()
	defer testMu.Unlock()

	if !testRunning || testStopCh == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": false})
		return
	}

	close(testStopCh)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// sendSSEEvent sends a named SSE event
func sendSSEEvent(w http.ResponseWriter, eventType string, data interface{}) {
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, string(jsonData))
}
