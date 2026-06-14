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
