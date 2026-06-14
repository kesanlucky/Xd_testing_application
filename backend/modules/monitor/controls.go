package monitor

import (
	"encoding/json"
	"net/http"
	"strings"

	"xdtest/config"
)

type ActionReq struct {
	ID string `json:"id,omitempty"` // Used for streamer ID if applicable
}

// executeAction is a helper to run a command and return JSON to the frontend
func executeAction(w http.ResponseWriter, r *http.Request, cmdTemplate []string) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ActionReq
	// Try to decode ID if present, ignore errors if body is empty
	json.NewDecoder(r.Body).Decode(&req)

	out, err := RunXadminCommand(cmdTemplate, req.ID)
	
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		// If command fails, still return a json object with the error
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"output":  string(out),
		})
		return
	}

	// The output should already be JSON (due to --format json)
	// If it's empty, return a generic success
	if len(strings.TrimSpace(string(out))) == 0 {
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
		return
	}

	w.Write(out)
}

func handleXdStart(w http.ResponseWriter, r *http.Request) {
	executeAction(w, r, config.CmdXdStart)
}

func handleXdStop(w http.ResponseWriter, r *http.Request) {
	executeAction(w, r, config.CmdXdStop)
}

func handleStreamerStart(w http.ResponseWriter, r *http.Request) {
	executeAction(w, r, config.CmdStreamerStart)
}

func handleStreamerStop(w http.ResponseWriter, r *http.Request) {
	executeAction(w, r, config.CmdStreamerStop)
}

func handleStreamerRestart(w http.ResponseWriter, r *http.Request) {
	executeAction(w, r, config.CmdStreamerRestart)
}

func handleStreamerLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id parameter required", http.StatusBadRequest)
		return
	}

	out, err := RunXadminCommand(config.CmdStreamerLogs, id)
	w.Header().Set("Content-Type", "application/json")
	
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"output":  string(out),
		})
		return
	}

	// Output is expected to be JSON. If it's empty, return empty array.
	if len(strings.TrimSpace(string(out))) == 0 {
		w.Write([]byte(`{}`))
		return
	}

	w.Write(out)
}

// RegisterRoutes registers all monitor HTTP routes
func RegisterRoutes(mux *http.ServeMux, corsWrap func(http.HandlerFunc) http.HandlerFunc) {
	// SSE Stream
	mux.HandleFunc("/api/system/stream", handleMetricsStream)
	
	// Controls
	mux.HandleFunc("/api/monitor/xd/start", corsWrap(handleXdStart))
	mux.HandleFunc("/api/monitor/xd/stop", corsWrap(handleXdStop))
	mux.HandleFunc("/api/monitor/streamer/start", corsWrap(handleStreamerStart))
	mux.HandleFunc("/api/monitor/streamer/stop", corsWrap(handleStreamerStop))
	mux.HandleFunc("/api/monitor/streamer/restart", corsWrap(handleStreamerRestart))
	
	// Logs
	mux.HandleFunc("/api/monitor/streamer/logs", corsWrap(handleStreamerLogs))
}
