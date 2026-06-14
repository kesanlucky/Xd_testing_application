package monitor

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"

	"xdtest/config"
)

// RunXadminCommand replaces "{id}" with the provided id string (if any)
// and executes the xadmin CLI tool, returning its stdout.
func RunXadminCommand(cmdTemplate []string, id string) ([]byte, error) {
	// Prepare the arguments
	var args []string
	for _, part := range cmdTemplate {
		args = append(args, strings.ReplaceAll(part, "{id}", id))
	}

	cmd := exec.Command(config.XadminPath, args...)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("xadmin execution failed: %v, stderr: %s", err, stderr.String())
	}

	return out.Bytes(), nil
}
