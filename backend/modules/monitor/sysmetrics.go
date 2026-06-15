package monitor

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"xdtest/config"
)

type SysMetrics struct {
	PID         int     `json:"pid"`
	CPU         float64 `json:"cpu"`
	RAM         float64 `json:"ram"`           // in MB
	Running     bool    `json:"running"`
	Goroutines  int     `json:"goroutines"`    // OS thread count from /proc/PID/status
	OpenFDs     int     `json:"open_fds"`      // Count of /proc/PID/fd entries
	FDLimit     int     `json:"fd_limit"`      // Max open files from /proc/PID/limits
	DiskReadKB  float64 `json:"disk_read_kb"`  // From /proc/PID/io (cumulative KB)
	DiskWriteKB float64 `json:"disk_write_kb"` // From /proc/PID/io (cumulative KB)
	TCPConns    int     `json:"tcp_conns"`     // Active TCP connections
	NetBytesIn  int64   `json:"net_bytes_in"`  // Network bytes received
	NetBytesOut int64   `json:"net_bytes_out"` // Network bytes sent
	VirtualMem  float64 `json:"virtual_mem"`   // VSZ in MB
	DiskUsagePct float64 `json:"disk_usage_pct"` // Disk usage percentage of data dir
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

	// 2. Get CPU, RAM, and VSZ using ps
	// ps -p <PID> -o %cpu,rss,vsz --no-headers
	psCmd := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "%cpu,rss,vsz", "--no-headers")
	psOut, err := psCmd.Output()
	if err == nil {
		parts := strings.Fields(string(psOut))
		if len(parts) >= 3 {
			cpu, _ := strconv.ParseFloat(parts[0], 64)
			rssKb, _ := strconv.ParseFloat(parts[1], 64)
			vszKb, _ := strconv.ParseFloat(parts[2], 64)

			metrics.CPU = cpu
			metrics.RAM = rssKb / 1024.0   // convert KB to MB
			metrics.VirtualMem = vszKb / 1024.0 // convert KB to MB
		}
	}

	// 3. Get thread/goroutine count from /proc/<PID>/status
	metrics.Goroutines = readProcThreads(pid)

	// 4. Get open file descriptors count
	metrics.OpenFDs = countOpenFDs(pid)

	// 5. Get FD limit
	metrics.FDLimit = readFDLimit(pid)

	// 6. Get Disk I/O from /proc/<PID>/io
	metrics.DiskReadKB, metrics.DiskWriteKB = readDiskIO(pid)

	// 7. Get TCP connection count
	metrics.TCPConns = countTCPConnections(pid)

	// 8. Get network bytes
	metrics.NetBytesIn, metrics.NetBytesOut = readNetworkBytes(pid)

	// 9. Get disk usage percentage
	metrics.DiskUsagePct = getDiskUsage()

	return metrics
}

// readProcThreads reads the thread count from /proc/<pid>/status
func readProcThreads(pid int) int {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "Threads:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				n, _ := strconv.Atoi(parts[1])
				return n
			}
		}
	}
	return 0
}

// countOpenFDs counts entries in /proc/<pid>/fd/
func countOpenFDs(pid int) int {
	entries, err := os.ReadDir(fmt.Sprintf("/proc/%d/fd", pid))
	if err != nil {
		return 0
	}
	return len(entries)
}

// readFDLimit parses /proc/<pid>/limits for the Max open files soft limit
func readFDLimit(pid int) int {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/limits", pid))
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "Max open files") {
			parts := strings.Fields(line)
			// Format: "Max open files            1024                 1048576              files"
			// After Fields split: [Max, open, files, <soft>, <hard>, files]
			if len(parts) >= 4 {
				n, _ := strconv.Atoi(parts[3])
				return n
			}
		}
	}
	return 0
}

// readDiskIO reads cumulative read/write bytes from /proc/<pid>/io
func readDiskIO(pid int) (readKB, writeKB float64) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/io", pid))
	if err != nil {
		return 0, 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		val, _ := strconv.ParseFloat(parts[1], 64)
		switch parts[0] {
		case "read_bytes:":
			readKB = val / 1024.0
		case "write_bytes:":
			writeKB = val / 1024.0
		}
	}
	return
}

// countTCPConnections counts active TCP connections for the process
func countTCPConnections(pid int) int {
	// Use ss to count TCP connections for this pid
	cmd := exec.Command("ss", "-tnp", "--no-header")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}

	pidStr := strconv.Itoa(pid)
	count := 0
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		if strings.Contains(line, "pid="+pidStr) {
			count++
		}
	}
	return count
}

// readNetworkBytes reads cumulative network bytes from /proc/<pid>/net/dev
func readNetworkBytes(pid int) (bytesIn, bytesOut int64) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/net/dev", pid))
	if err != nil {
		return 0, 0
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		// Skip headers and loopback
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "Inter") || strings.HasPrefix(trimmed, "face") {
			continue
		}
		if strings.HasPrefix(trimmed, "lo:") {
			continue
		}
		// Format: iface: rx_bytes rx_packets ... tx_bytes tx_packets ...
		colonIdx := strings.Index(trimmed, ":")
		if colonIdx == -1 {
			continue
		}
		fields := strings.Fields(trimmed[colonIdx+1:])
		if len(fields) >= 9 {
			rx, _ := strconv.ParseInt(fields[0], 10, 64)
			tx, _ := strconv.ParseInt(fields[8], 10, 64)
			bytesIn += rx
			bytesOut += tx
		}
	}
	return
}

// getDiskUsage returns disk usage percentage of the working directory
func getDiskUsage() float64 {
	// Get the absolute path of the current working directory
	wd, err := filepath.Abs(".")
	if err != nil {
		return 0
	}

	var stat syscall.Statfs_t
	err = syscall.Statfs(wd, &stat)
	if err != nil {
		return 0
	}

	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bfree * uint64(stat.Bsize)
	if total == 0 {
		return 0
	}
	used := total - free
	return float64(used) / float64(total) * 100.0
}
