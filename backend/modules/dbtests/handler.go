package dbtests

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"xdtest/config"
	"xdtest/db"
)

// RegisterRoutes registers all DB test module HTTP routes on the given mux.
func RegisterRoutes(mux *http.ServeMux, corsWrap func(http.HandlerFunc) http.HandlerFunc) {
	mux.HandleFunc("/api/db/tables", corsWrap(handleGetTables))
	mux.HandleFunc("/api/db/columns", corsWrap(handleGetColumns))
	mux.HandleFunc("/api/config/save-dynamic", corsWrap(handleSaveConfig))
	mux.HandleFunc("/api/config/list-dynamic", corsWrap(handleListConfigs))
	mux.HandleFunc("/api/tests/run-dynamic", corsWrap(handleRunTest))
}

func connectDB() (*sql.DB, error) {
	return db.ConnectDB("mysql", config.DBUser, config.DBPassword, config.DBHost, config.DBPort, config.DBName)
}

func handleGetTables(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	conn, err := connectDB()
	if err != nil {
		http.Error(w, fmt.Sprintf("DB Connection error: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	rows, err := conn.Query("SHOW TABLES")
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to query tables: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err == nil {
			// Skip internal config tables
			if table != "test_configs" {
				tables = append(tables, table)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tables)
}

func handleGetColumns(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Table parameter is required", http.StatusBadRequest)
		return
	}

	conn, err := connectDB()
	if err != nil {
		http.Error(w, fmt.Sprintf("DB Connection error: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	// Use DESCRIBE to fetch column structures
	rows, err := conn.Query(fmt.Sprintf("DESCRIBE %s", tableName))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to describe table: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ColumnInfo struct {
		Field string `json:"field"`
		Type  string `json:"type"`
	}

	var columns []ColumnInfo
	for rows.Next() {
		var field, colType, null, key, extra string
		var defaultVal sql.NullString
		if err := rows.Scan(&field, &colType, &null, &key, &defaultVal, &extra); err == nil {
			columns = append(columns, ColumnInfo{
				Field: field,
				Type:  colType,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(columns)
}

type SaveConfigReq struct {
	ID          *int   `json:"id"`
	Name        string `json:"name"`
	SourceTable string `json:"source_table"`
	DestTable   string `json:"dest_table"`
	ConfigJSON  any    `json:"config_json"`
}

func handleSaveConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SaveConfigReq
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	configBytes, err := json.Marshal(req.ConfigJSON)
	if err != nil {
		http.Error(w, "Failed to serialize config JSON", http.StatusBadRequest)
		return
	}

	conn, err := connectDB()
	if err != nil {
		http.Error(w, fmt.Sprintf("DB Connection error: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	if req.ID != nil && *req.ID > 0 {
		_, err = conn.Exec(
			"UPDATE test_configs SET name = ?, source_table = ?, destination_table = ?, config_json = ? WHERE id = ?",
			req.Name, req.SourceTable, req.DestTable, string(configBytes), *req.ID,
		)
	} else {
		_, err = conn.Exec(
			"INSERT INTO test_configs (name, source_table, destination_table, config_json) VALUES (?, ?, ?, ?)",
			req.Name, req.SourceTable, req.DestTable, string(configBytes),
		)
	}

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to save config: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

type SavedConfig struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	SrcTable  string `json:"source_table"`
	DestTable string `json:"destination_table"`
	Config    string `json:"config_json"`
	CreatedAt string `json:"created_at"`
}

func handleListConfigs(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	conn, err := connectDB()
	if err != nil {
		http.Error(w, fmt.Sprintf("DB Connection error: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	rows, err := conn.Query("SELECT id, name, source_table, destination_table, config_json, created_at FROM test_configs ORDER BY id DESC")
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch configs: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var configs []SavedConfig
	for rows.Next() {
		var cfg SavedConfig
		var rawConfig []byte
		if err := rows.Scan(&cfg.ID, &cfg.Name, &cfg.SrcTable, &cfg.DestTable, &rawConfig, &cfg.CreatedAt); err == nil {
			cfg.Config = string(rawConfig)
			configs = append(configs, cfg)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func handleRunTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "Config ID is required", http.StatusBadRequest)
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid config ID", http.StatusBadRequest)
		return
	}

	conn, err := connectDB()
	if err != nil {
		http.Error(w, fmt.Sprintf("DB Connection error: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	var configName string
	var rawJSON []byte
	err = conn.QueryRow("SELECT name, config_json FROM test_configs WHERE id = ?", id).Scan(&configName, &rawJSON)
	if err != nil {
		http.Error(w, fmt.Sprintf("Config not found: %v", err), http.StatusNotFound)
		return
	}

	// Run test
	runRes, err := RunDynamicTest(conn, configName, string(rawJSON))
	if err != nil {
		// Log errors but return the test logs result so frontend can see what went wrong
		log.Printf("Run finished with execution error: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(runRes)
}
