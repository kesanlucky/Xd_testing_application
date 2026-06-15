package config

// DB connection configuration
var (
	DBUser     = "root"
	DBPassword = "Admin@123"
	DBHost     = "127.0.0.1"
	DBPort     = 3306
	DBName     = "xstreami_testing"
)

// Xd & Monitor Configuration
var (
	XdPort     = 2025
	XadminPath = "./xadmin"

	// Configurable xadmin commands. '{id}' will be dynamically replaced.
	CmdStreamerStatus  = []string{"streamer", "status", "--format", "json"}
	CmdStreamerInfo    = []string{"streamer", "info", "{id}", "--format", "json"}
	CmdStreamerLogs    = []string{"streamer", "logs", "{id}", "--format", "json"}
	CmdStreamerStart   = []string{"streamer", "start", "{id}", "--format", "json"}
	CmdStreamerStop    = []string{"streamer", "stop", "{id}", "--format", "json"}
	CmdStreamerRestart = []string{"streamer", "restart", "{id}", "--format", "json"}
	CmdXdStart         = []string{"Xd", "start", "--format", "json"}
	CmdXdStop          = []string{"Xd", "stop", "--format", "json"}
)

// Monitoring Log Configuration
var (
	MonLogDir         = "./logs/monitor"     // Directory for monitoring log files
	MonLogMaxFileSize = 10 * 1024 * 1024     // 10 MB default max per log file
	MonLogMaxFiles    = 5                     // Keep at most 5 log files, oldest auto-deleted
	MonLogInterval    = 5                     // Seconds between log entries
)

// Performance Test Configuration
var (
	XdConfigPath = "./xd_config.yaml"   // Path to the Xd YAML config file
)
