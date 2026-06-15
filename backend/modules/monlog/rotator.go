package monlog

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const logFilePrefix = "xd_monitor_"
const logFileSuffix = ".log"

// Rotator manages rotating log files with size and count limits.
type Rotator struct {
	mu          sync.Mutex
	dir         string
	maxFileSize int
	maxFiles    int
	currentFile *os.File
	currentSize int64
}

// NewRotator creates a new Rotator instance, ensuring the log directory exists
// and opening the initial log file.
func NewRotator(dir string, maxFileSize int, maxFiles int) (*Rotator, error) {
	// Ensure directory exists
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create log directory %s: %w", dir, err)
	}

	r := &Rotator{
		dir:         dir,
		maxFileSize: maxFileSize,
		maxFiles:    maxFiles,
	}

	// Open the initial log file
	if err := r.openNewFile(); err != nil {
		return nil, err
	}

	return r, nil
}

// Write appends data (a single JSON line + newline) to the current log file.
// It checks size before writing and rotates if necessary.
func (r *Rotator) Write(data []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	line := append(data, '\n')
	lineSize := int64(len(line))

	// Check if we need to rotate BEFORE writing
	if r.currentSize+lineSize > int64(r.maxFileSize) {
		if err := r.rotate(); err != nil {
			return fmt.Errorf("rotation failed: %w", err)
		}
	}

	n, err := r.currentFile.Write(line)
	if err != nil {
		return fmt.Errorf("write failed: %w", err)
	}
	r.currentSize += int64(n)

	return nil
}

// openNewFile creates a new timestamped log file.
func (r *Rotator) openNewFile() error {
	filename := fmt.Sprintf("%s%s%s", logFilePrefix, time.Now().Format("2006-01-02_15-04-05"), logFileSuffix)
	path := filepath.Join(r.dir, filename)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file %s: %w", path, err)
	}

	// Get current size (in case file already exists from a previous run in the same second)
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return fmt.Errorf("failed to stat log file: %w", err)
	}

	r.currentFile = f
	r.currentSize = info.Size()
	log.Printf("[monlog] Opened log file: %s", path)
	return nil
}

// rotate closes the current file, opens a new one, and cleans up old files.
func (r *Rotator) rotate() error {
	// Close current file
	if r.currentFile != nil {
		r.currentFile.Close()
		r.currentFile = nil
		r.currentSize = 0
	}

	// Open new file
	if err := r.openNewFile(); err != nil {
		return err
	}

	// Clean up old files beyond the limit
	r.cleanup()

	return nil
}

// cleanup removes the oldest log files if the total count exceeds maxFiles.
func (r *Rotator) cleanup() {
	files, err := r.listLogFiles()
	if err != nil {
		log.Printf("[monlog] Failed to list log files for cleanup: %v", err)
		return
	}

	if len(files) <= r.maxFiles {
		return
	}

	// Sort by name (timestamp-based, oldest first)
	sort.Strings(files)

	// Delete oldest files until we're within the limit
	toDelete := files[:len(files)-r.maxFiles]
	for _, f := range toDelete {
		path := filepath.Join(r.dir, f)
		if err := os.Remove(path); err != nil {
			log.Printf("[monlog] Failed to delete old log file %s: %v", path, err)
		} else {
			log.Printf("[monlog] Deleted old log file: %s", f)
		}
	}
}

// listLogFiles returns the names of all monitoring log files in the directory.
func (r *Rotator) listLogFiles() ([]string, error) {
	entries, err := os.ReadDir(r.dir)
	if err != nil {
		return nil, err
	}

	var logFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, logFilePrefix) && strings.HasSuffix(name, logFileSuffix) {
			logFiles = append(logFiles, name)
		}
	}
	return logFiles, nil
}
