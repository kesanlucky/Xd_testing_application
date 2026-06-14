package monitor

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"xdtest/config"
)

type StreamPayload struct {
	Metrics   SysMetrics  `json:"metrics"`
	Streamers interface{} `json:"streamers"`
}

func handleMetricsStream(w http.ResponseWriter, r *http.Request) {
	// Set headers for Server-Sent Events (SSE)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Allow CORS specifically for this stream if needed
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	clientGone := r.Context().Done()
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-clientGone:
			log.Println("SSE client disconnected")
			return
		case <-ticker.C:
			// 1. Get Hardware Metrics
			metrics := GetXdMetrics()

			// 2. Get Streamer Status from xadmin
			var streamers interface{}
			out, err := RunXadminCommand(config.CmdStreamerStatus, "")
			if err == nil && len(out) > 0 {
				json.Unmarshal(out, &streamers)
			} else {
				// Fallback to empty list or basic error structure
				streamers = []interface{}{}
			}

			// 3. Construct Payload
			payload := StreamPayload{
				Metrics:   metrics,
				Streamers: streamers,
			}

			data, _ := json.Marshal(payload)

			// SSE format: data: <json>\n\n
			fmt.Fprintf(w, "data: %s\n\n", string(data))
			flusher.Flush()
		}
	}
}
