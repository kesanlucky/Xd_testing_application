package perftest

import (
	"fmt"
	"os"

	"xdtest/config"

	"gopkg.in/yaml.v3"
)

// XdConfig represents the full parsed Xd YAML configuration
type XdConfig struct {
	XD          XDSection    `yaml:"XD" json:"xd"`
	Source      ServerConfig `yaml:"source_server" json:"source_server"`
	Destination ServerConfig `yaml:"destination_server" json:"destination_server"`
}

type XDSection struct {
	ClusterName string          `yaml:"cluster_name" json:"cluster_name"`
	Port        int             `yaml:"port" json:"port"`
	Streamers   []XdStreamerCfg `yaml:"streamers" json:"streamers"`
}

type XdStreamerCfg struct {
	ID       int    `yaml:"id" json:"id"`
	Name     string `yaml:"name" json:"name"`
	Type     string `yaml:"type" json:"type"`
	Threads  int    `yaml:"mstream_threads" json:"threads"`
	RunMode  string `yaml:"run_mode" json:"run_mode"`
}

type ServerConfig struct {
	Flavor   string `yaml:"flavor" json:"flavor"`
	Hostname string `yaml:"hostname" json:"hostname"`
	Username string `yaml:"username" json:"username"`
	Password string `yaml:"password" json:"password"`
	Database string `yaml:"database" json:"database"`
	Port     int    `yaml:"port" json:"port"`
}

// LoadXdConfig reads and parses the Xd YAML configuration file
func LoadXdConfig() (*XdConfig, error) {
	data, err := os.ReadFile(config.XdConfigPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read Xd config at %s: %w", config.XdConfigPath, err)
	}

	var cfg XdConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse Xd config YAML: %w", err)
	}

	return &cfg, nil
}
