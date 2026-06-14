package monitor

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"xdtest/config"
)

type SysMetrics struct {
	PID     int     `json:"pid"`
	CPU     float64 `json:"cpu"`
	RAM     float64 `json:"ram"` // in MB
	Running bool    `json:"running"`
}

// GetXdMetrics attempts to find the Xd process by its port and get its CPU/RAM usage.
func GetXdMetrics() SysMetrics {
	var metrics SysMetrics

	// 1. Find PID using lsof
	// lsof -t -i:2025 returns just the PID
	lsofCmd := exec.Command("lsof", "-t", fmt.Sprintf("-i:%d", config.XdPort))
	out, err := lsofCmd.Output()
	if err != nil {
		// Process is likely not running or lsof is not installed
		return metrics
	}

	pidStr := strings.TrimSpace(string(out))
	if pidStr == "" {
		return metrics
	}

	// It might return multiple PIDs if child processes exist, grab the first one
	pids := strings.Split(pidStr, "\n")
	pid, err := strconv.Atoi(pids[0])
	if err != nil {
		return metrics
	}

	metrics.PID = pid
	metrics.Running = true

	// 2. Get CPU and RAM using ps
	// ps -p <PID> -o %cpu,rss --no-headers
	psCmd := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "%cpu,rss", "--no-headers")
	psOut, err := psCmd.Output()
	if err == nil {
		parts := strings.Fields(string(psOut))
		if len(parts) >= 2 {
			cpu, _ := strconv.ParseFloat(parts[0], 64)
			rssKb, _ := strconv.ParseFloat(parts[1], 64)
			
			metrics.CPU = cpu
			metrics.RAM = rssKb / 1024.0 // convert KB to MB
		}
	}

	return metrics
}
