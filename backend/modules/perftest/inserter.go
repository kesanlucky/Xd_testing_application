package perftest

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"xdtest/db"

	"github.com/brianvoe/gofakeit/v7"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// InsertMode defines the strategy for inserting rows
type InsertMode string

const (
	InsertModeSingle      InsertMode = "single"
	InsertModeBulk        InsertMode = "bulk"
	InsertModeTransaction InsertMode = "transaction"
)

// InsertConfig holds the configuration for a data insertion run
type InsertConfig struct {
	Server     ServerConfig
	Table      string
	RowCount   int
	Mode       InsertMode
	BatchSize  int
	CleanFirst bool
}

// InsertProgress reports progress during insertion
type InsertProgress struct {
	Inserted  int   `json:"inserted"`
	Total     int   `json:"total"`
	ElapsedMs int64 `json:"elapsed_ms"`
}

// ColumnSchema describes a single column for data generation
type ColumnSchema struct {
	Name     string `json:"name"`
	DataType string `json:"type"`
}

// RunInsert performs data insertion into the source database.
// It sends progress updates through the progress channel.
// The stopCh can be used to cancel the operation.
func RunInsert(cfg InsertConfig, progressCh chan<- InsertProgress, stopCh <-chan struct{}) error {
	if cfg.Server.Flavor == "mongodb" {
		return runMongoInsert(cfg, progressCh, stopCh)
	}
	return runSQLInsert(cfg, progressCh, stopCh)
}

// runSQLInsert handles insertion for MySQL, Postgres, and MSSQL
func runSQLInsert(cfg InsertConfig, progressCh chan<- InsertProgress, stopCh <-chan struct{}) error {
	conn, err := db.ConnectDB(cfg.Server.Flavor, cfg.Server.Username, cfg.Server.Password, cfg.Server.Hostname, cfg.Server.Port, cfg.Server.Database)
	if err != nil {
		return fmt.Errorf("source DB connection failed: %w", err)
	}
	defer conn.Close()

	// Discover table schema
	columns, err := discoverColumns(conn, cfg.Server.Flavor, cfg.Table)
	if err != nil {
		return fmt.Errorf("failed to discover table schema: %w", err)
	}

	if len(columns) == 0 {
		return fmt.Errorf("no columns found for table %s", cfg.Table)
	}

	log.Printf("[perftest] Discovered %d columns for table %s", len(columns), cfg.Table)

	// Clean table if requested
	if cfg.CleanFirst {
		_, _ = conn.Exec(fmt.Sprintf("DELETE FROM %s", cfg.Table))
		log.Printf("[perftest] Cleaned table %s", cfg.Table)
	}

	start := time.Now()
	inserted := 0
	batchSize := cfg.BatchSize
	if batchSize <= 0 {
		batchSize = 100
	}

	switch cfg.Mode {
	case InsertModeSingle:
		for i := 0; i < cfg.RowCount; i++ {
			select {
			case <-stopCh:
				return fmt.Errorf("insertion cancelled after %d rows", inserted)
			default:
			}

			if err := insertSingleRow(conn, cfg.Server.Flavor, cfg.Table, columns); err != nil {
				return fmt.Errorf("insert failed at row %d: %w", i+1, err)
			}
			inserted++

			if inserted%50 == 0 || inserted == cfg.RowCount {
				progressCh <- InsertProgress{
					Inserted:  inserted,
					Total:     cfg.RowCount,
					ElapsedMs: time.Since(start).Milliseconds(),
				}
			}
		}

	case InsertModeBulk:
		for i := 0; i < cfg.RowCount; i += batchSize {
			select {
			case <-stopCh:
				return fmt.Errorf("insertion cancelled after %d rows", inserted)
			default:
			}

			batchEnd := i + batchSize
			if batchEnd > cfg.RowCount {
				batchEnd = cfg.RowCount
			}
			count := batchEnd - i

			if err := insertBulkRows(conn, cfg.Server.Flavor, cfg.Table, columns, count); err != nil {
				return fmt.Errorf("bulk insert failed at batch starting row %d: %w", i+1, err)
			}
			inserted += count

			progressCh <- InsertProgress{
				Inserted:  inserted,
				Total:     cfg.RowCount,
				ElapsedMs: time.Since(start).Milliseconds(),
			}
		}

	case InsertModeTransaction:
		for i := 0; i < cfg.RowCount; i += batchSize {
			select {
			case <-stopCh:
				return fmt.Errorf("insertion cancelled after %d rows", inserted)
			default:
			}

			batchEnd := i + batchSize
			if batchEnd > cfg.RowCount {
				batchEnd = cfg.RowCount
			}
			count := batchEnd - i

			tx, err := conn.Begin()
			if err != nil {
				return fmt.Errorf("transaction begin failed: %w", err)
			}

			for j := 0; j < count; j++ {
				if err := insertSingleRowTx(tx, cfg.Server.Flavor, cfg.Table, columns); err != nil {
					tx.Rollback()
					return fmt.Errorf("insert failed in transaction at row %d: %w", i+j+1, err)
				}
			}

			if err := tx.Commit(); err != nil {
				return fmt.Errorf("transaction commit failed: %w", err)
			}
			inserted += count

			progressCh <- InsertProgress{
				Inserted:  inserted,
				Total:     cfg.RowCount,
				ElapsedMs: time.Since(start).Milliseconds(),
			}
		}
	}

	// Final progress
	progressCh <- InsertProgress{
		Inserted:  inserted,
		Total:     cfg.RowCount,
		ElapsedMs: time.Since(start).Milliseconds(),
	}

	return nil
}

// discoverColumns reads the column names and types from the database
func discoverColumns(conn *sql.DB, flavor, table string) ([]ColumnSchema, error) {
	var query string
	switch flavor {
	case "mysql":
		query = fmt.Sprintf("DESCRIBE %s", table)
	case "postgres", "postgresql":
		query = fmt.Sprintf("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '%s' ORDER BY ordinal_position", table)
	case "mssql", "sqlserver":
		query = fmt.Sprintf("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '%s' ORDER BY ORDINAL_POSITION", table)
	default:
		return nil, fmt.Errorf("unsupported flavor for schema discovery: %s", flavor)
	}

	rows, err := conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []ColumnSchema
	numResultCols, _ := rows.Columns()

	for rows.Next() {
		if flavor == "mysql" {
			// DESCRIBE returns: Field, Type, Null, Key, Default, Extra
			var field, colType, null, key, extra string
			var defaultVal sql.NullString
			if len(numResultCols) >= 6 {
				if err := rows.Scan(&field, &colType, &null, &key, &defaultVal, &extra); err != nil {
					continue
				}
			} else {
				continue
			}
			// Skip auto_increment columns
			if strings.Contains(strings.ToLower(extra), "auto_increment") {
				continue
			}
			cols = append(cols, ColumnSchema{Name: field, DataType: colType})
		} else {
			// Postgres and MSSQL: column_name, data_type
			var name, dtype string
			if err := rows.Scan(&name, &dtype); err != nil {
				continue
			}
			cols = append(cols, ColumnSchema{Name: name, DataType: dtype})
		}
	}

	return cols, nil
}

// generateFakeValue creates a fake value for the given SQL data type
func generateFakeValue(dataType string) interface{} {
	lower := strings.ToLower(dataType)

	switch {
	case strings.Contains(lower, "int"):
		return gofakeit.Number(1, 999999)
	case strings.Contains(lower, "decimal") || strings.Contains(lower, "float") ||
		strings.Contains(lower, "double") || strings.Contains(lower, "numeric") ||
		strings.Contains(lower, "real") || strings.Contains(lower, "money"):
		return gofakeit.Price(0.01, 99999.99)
	case strings.Contains(lower, "datetime") || strings.Contains(lower, "timestamp"):
		return gofakeit.Date().Format("2006-01-02 15:04:05")
	case strings.Contains(lower, "date"):
		return gofakeit.Date().Format("2006-01-02")
	case strings.Contains(lower, "time"):
		return gofakeit.Date().Format("15:04:05")
	case strings.Contains(lower, "bool") || strings.Contains(lower, "bit"):
		if gofakeit.Bool() {
			return 1
		}
		return 0
	case strings.Contains(lower, "json") || strings.Contains(lower, "jsonb"):
		return fmt.Sprintf(`{"key":"%s","value":"%s"}`, gofakeit.Word(), gofakeit.Sentence(3))
	case strings.Contains(lower, "text") || strings.Contains(lower, "longtext") || strings.Contains(lower, "mediumtext"):
		return gofakeit.Sentence(8)
	case strings.Contains(lower, "char") || strings.Contains(lower, "varchar"):
		return gofakeit.Name()
	case strings.Contains(lower, "uuid"):
		return gofakeit.UUID()
	case strings.Contains(lower, "enum"):
		return gofakeit.RandomString([]string{"active", "inactive", "pending"})
	default:
		return gofakeit.Word()
	}
}

// placeholderForFlavor returns the correct placeholder for parameterized queries
func placeholderForFlavor(flavor string, index int) string {
	switch flavor {
	case "postgres", "postgresql":
		return fmt.Sprintf("$%d", index)
	case "mssql", "sqlserver":
		return fmt.Sprintf("@p%d", index)
	default: // mysql
		return "?"
	}
}

func insertSingleRow(conn *sql.DB, flavor, table string, columns []ColumnSchema) error {
	var colNames []string
	var placeholders []string
	var values []interface{}

	for i, col := range columns {
		colNames = append(colNames, col.Name)
		placeholders = append(placeholders, placeholderForFlavor(flavor, i+1))
		values = append(values, generateFakeValue(col.DataType))
	}

	query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		table,
		strings.Join(colNames, ", "),
		strings.Join(placeholders, ", "),
	)

	_, err := conn.Exec(query, values...)
	return err
}

func insertSingleRowTx(tx *sql.Tx, flavor, table string, columns []ColumnSchema) error {
	var colNames []string
	var placeholders []string
	var values []interface{}

	for i, col := range columns {
		colNames = append(colNames, col.Name)
		placeholders = append(placeholders, placeholderForFlavor(flavor, i+1))
		values = append(values, generateFakeValue(col.DataType))
	}

	query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		table,
		strings.Join(colNames, ", "),
		strings.Join(placeholders, ", "),
	)

	_, err := tx.Exec(query, values...)
	return err
}

func insertBulkRows(conn *sql.DB, flavor, table string, columns []ColumnSchema, count int) error {
	if count == 0 {
		return nil
	}

	var colNames []string
	for _, col := range columns {
		colNames = append(colNames, col.Name)
	}

	var allPlaceholders []string
	var allValues []interface{}
	placeholderIdx := 1

	for i := 0; i < count; i++ {
		var rowPlaceholders []string
		for _, col := range columns {
			rowPlaceholders = append(rowPlaceholders, placeholderForFlavor(flavor, placeholderIdx))
			allValues = append(allValues, generateFakeValue(col.DataType))
			placeholderIdx++
		}
		allPlaceholders = append(allPlaceholders, "("+strings.Join(rowPlaceholders, ", ")+")")
	}

	query := fmt.Sprintf("INSERT INTO %s (%s) VALUES %s",
		table,
		strings.Join(colNames, ", "),
		strings.Join(allPlaceholders, ", "),
	)

	_, err := conn.Exec(query, allValues...)
	return err
}

// runMongoInsert handles insertion for MongoDB
func runMongoInsert(cfg InsertConfig, progressCh chan<- InsertProgress, stopCh <-chan struct{}) error {
	uri := fmt.Sprintf("mongodb://%s:%s@%s:%d",
		cfg.Server.Username, cfg.Server.Password, cfg.Server.Hostname, cfg.Server.Port)

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return fmt.Errorf("MongoDB connection failed: %w", err)
	}
	defer client.Disconnect(context.Background())

	collection := client.Database(cfg.Server.Database).Collection(cfg.Table)

	if cfg.CleanFirst {
		collection.DeleteMany(context.Background(), bson.D{})
	}

	start := time.Now()
	inserted := 0
	batchSize := cfg.BatchSize
	if batchSize <= 0 {
		batchSize = 100
	}

	generateDoc := func() bson.D {
		return bson.D{
			{Key: "name", Value: gofakeit.Name()},
			{Key: "email", Value: gofakeit.Email()},
			{Key: "phone", Value: gofakeit.Phone()},
			{Key: "address", Value: gofakeit.Address().Address},
			{Key: "company", Value: gofakeit.Company()},
			{Key: "amount", Value: gofakeit.Price(1, 10000)},
			{Key: "status", Value: gofakeit.RandomString([]string{"active", "inactive", "pending"})},
			{Key: "created_at", Value: gofakeit.Date()},
		}
	}

	switch cfg.Mode {
	case InsertModeSingle:
		for i := 0; i < cfg.RowCount; i++ {
			select {
			case <-stopCh:
				return fmt.Errorf("insertion cancelled after %d docs", inserted)
			default:
			}
			_, err := collection.InsertOne(context.Background(), generateDoc())
			if err != nil {
				return fmt.Errorf("MongoDB insert failed at doc %d: %w", i+1, err)
			}
			inserted++
			if inserted%50 == 0 || inserted == cfg.RowCount {
				progressCh <- InsertProgress{Inserted: inserted, Total: cfg.RowCount, ElapsedMs: time.Since(start).Milliseconds()}
			}
		}

	case InsertModeBulk, InsertModeTransaction:
		// MongoDB bulk uses InsertMany
		for i := 0; i < cfg.RowCount; i += batchSize {
			select {
			case <-stopCh:
				return fmt.Errorf("insertion cancelled after %d docs", inserted)
			default:
			}
			batchEnd := i + batchSize
			if batchEnd > cfg.RowCount {
				batchEnd = cfg.RowCount
			}
			count := batchEnd - i

			var docs []interface{}
			for j := 0; j < count; j++ {
				docs = append(docs, generateDoc())
			}

			_, err := collection.InsertMany(context.Background(), docs)
			if err != nil {
				return fmt.Errorf("MongoDB bulk insert failed: %w", err)
			}
			inserted += count
			progressCh <- InsertProgress{Inserted: inserted, Total: cfg.RowCount, ElapsedMs: time.Since(start).Milliseconds()}
		}
	}

	progressCh <- InsertProgress{Inserted: inserted, Total: cfg.RowCount, ElapsedMs: time.Since(start).Milliseconds()}
	return nil
}

// ListTables returns a list of tables for the given server configuration
func ListTables(server ServerConfig) ([]string, error) {
	if server.Flavor == "mongodb" {
		return listMongoCollections(server)
	}

	conn, err := db.ConnectDB(server.Flavor, server.Username, server.Password, server.Hostname, server.Port, server.Database)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer conn.Close()

	var query string
	switch server.Flavor {
	case "mysql":
		query = "SHOW TABLES"
	case "postgres", "postgresql":
		query = "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
	case "mssql", "sqlserver":
		query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
	default:
		return nil, fmt.Errorf("unsupported flavor: %s", server.Flavor)
	}

	rows, err := conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}
	return tables, nil
}

// ListColumns returns columns and types for a table
func ListColumns(server ServerConfig, table string) ([]ColumnSchema, error) {
	if server.Flavor == "mongodb" {
		// MongoDB is schema-less; return empty
		return []ColumnSchema{}, nil
	}

	conn, err := db.ConnectDB(server.Flavor, server.Username, server.Password, server.Hostname, server.Port, server.Database)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer conn.Close()

	return discoverColumns(conn, server.Flavor, table)
}

func listMongoCollections(server ServerConfig) ([]string, error) {
	uri := fmt.Sprintf("mongodb://%s:%s@%s:%d",
		server.Username, server.Password, server.Hostname, server.Port)

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("MongoDB connection failed: %w", err)
	}
	defer client.Disconnect(context.Background())

	names, err := client.Database(server.Database).ListCollectionNames(context.Background(), bson.D{})
	if err != nil {
		return nil, err
	}
	return names, nil
}
