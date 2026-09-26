package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type request struct {
	Code           string `json:"code"`
	Mode           string `json:"mode"`
	TimeoutMS      int    `json:"timeout_ms"`
	MaxOutputBytes int    `json:"max_output_bytes"`
}

type response struct {
	Stdout   string         `json:"stdout"`
	Stderr   string         `json:"stderr"`
	ExitCode int            `json:"exit_code"`
	Duration int64          `json:"duration_ms"`
	Visible  map[string]any `json:"visible,omitempty"`
}

type limitBuffer struct {
	b   bytes.Buffer
	max int
}

func (w *limitBuffer) Write(p []byte) (int, error) {
	remaining := w.max - w.b.Len()
	if remaining <= 0 {
		return len(p), nil
	}
	if len(p) > remaining {
		_, _ = w.b.Write(p[:remaining])
		return len(p), nil
	}
	return w.b.Write(p)
}
func (w *limitBuffer) String() string { return w.b.String() }

var slots = make(chan struct{}, 1)
var allowImports = map[string]bool{
	"bufio": true, "bytes": true, "cmp": true, "container/heap": true, "container/list": true, "container/ring": true,
	"encoding/base64": true, "encoding/csv": true, "encoding/hex": true, "encoding/json": true, "errors": true,
	"fmt": true, "hash": true, "hash/crc32": true, "hash/crc64": true, "hash/fnv": true,
	"html": true, "iter": true, "maps": true, "math": true, "math/big": true, "math/bits": true, "math/cmplx": true, "math/rand": true,
	"regexp": true, "regexp/syntax": true, "slices": true, "sort": true, "strconv": true, "strings": true, "sync": true, "sync/atomic": true,
	"text/scanner": true, "text/tabwriter": true, "text/template": true, "time": true, "unicode": true, "unicode/utf8": true,
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func main() {
	addr := getenv("CHATWEBLLM_GO_ADDR", "127.0.0.1:8787")
	http.HandleFunc("/health", cors(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "service": "chatwebllm-go-runner"})
	}))
	http.HandleFunc("/run", cors(runHandler))
	log.Printf("ChatWebLLM Go runner listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func runHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512<<10)
	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if err := validateCode(req.Code); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Mode != "private" && req.Mode != "visible" {
		req.Mode = "private"
	}
	req.TimeoutMS = clamp(req.TimeoutMS, 250, 30000, 5000)
	req.MaxOutputBytes = clamp(req.MaxOutputBytes, 16<<10, 2<<20, 256<<10)

	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	default:
		writeErr(w, http.StatusTooManyRequests, "runner is busy")
		return
	}

	start := time.Now()
	res, err := execute(req)
	res.Duration = time.Since(start).Milliseconds()
	if err != nil && res.Stderr == "" {
		res.Stderr = err.Error()
	}
	_ = json.NewEncoder(w).Encode(res)
}

func execute(req request) (response, error) {
	tmp, err := os.MkdirTemp("", "chatwebllm-go-*")
	if err != nil {
		return response{ExitCode: -1}, err
	}
	defer os.RemoveAll(tmp)
	if err := os.WriteFile(filepath.Join(tmp, "main.go"), []byte(req.Code), 0600); err != nil {
		return response{ExitCode: -1}, err
	}
	if err := os.WriteFile(filepath.Join(tmp, "go.mod"), []byte("module sandbox\n\ngo 1.23\n"), 0600); err != nil {
		return response{ExitCode: -1}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(req.TimeoutMS)*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "run", ".")
	cmd.Dir = tmp
	cmd.Env = append(os.Environ(),
		"GOMAXPROCS=1",
		"GOMEMLIMIT=128MiB",
		"GOTOOLCHAIN=local",
		"GOWORK=off",
		"GONOSUMDB=*",
		"GOPROXY=off",
		"CGO_ENABLED=0",
	)
	out := &limitBuffer{max: req.MaxOutputBytes}
	errOut := &limitBuffer{max: req.MaxOutputBytes}
	cmd.Stdout, cmd.Stderr = out, errOut
	err = cmd.Run()

	res := response{Stdout: out.String(), Stderr: errOut.String(), ExitCode: 0}
	if ctx.Err() == context.DeadlineExceeded {
		res.ExitCode = 124
		res.Stderr = strings.TrimSpace(res.Stderr + "\nexecution timed out")
		return res, ctx.Err()
	}
	if err != nil {
		res.ExitCode = 1
		var exit *exec.ExitError
		if ok := errorAs(err, &exit); ok {
			res.ExitCode = exit.ExitCode()
		}
	}
	if req.Mode == "visible" {
		res.Stdout, res.Visible = extractVisible(res.Stdout)
	}
	return res, err
}

func validateCode(code string) error {
	if len(code) == 0 || len(code) > 400<<10 {
		return fmt.Errorf("code must be between 1 byte and 400 KB")
	}
	f, err := parser.ParseFile(token.NewFileSet(), "main.go", code, parser.ImportsOnly)
	if err != nil {
		return fmt.Errorf("invalid Go source: %w", err)
	}
	for _, imp := range f.Imports {
		path, err := strconv.Unquote(imp.Path.Value)
		if err != nil || !allowImports[path] {
			return fmt.Errorf("import %q is not allowed", path)
		}
		if imp.Name != nil && (imp.Name.Name == "." || imp.Name.Name == "_") {
			return fmt.Errorf("dot and blank imports are not allowed")
		}
	}
	blockedDirectives := []string{"//go:linkname", "//go:cgo_", "//go:generate"}
	for _, marker := range blockedDirectives {
		if strings.Contains(code, marker) {
			return fmt.Errorf("compiler directive %q is not allowed", marker)
		}
	}
	return nil
}

func extractVisible(stdout string) (string, map[string]any) {
	const prefix = "CHATWEBLLM_VISIBLE:"
	lines := strings.Split(stdout, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(line, prefix) {
			continue
		}
		var v map[string]any
		if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, prefix))), &v); err == nil {
			lines = append(lines[:i], lines[i+1:]...)
			return strings.TrimSpace(strings.Join(lines, "\n")), v
		}
	}
	return stdout, nil
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": msg})
}
func clamp(v, min, max, fallback int) int {
	if v == 0 { return fallback }
	if v < min { return min }
	if v > max { return max }
	return v
}
func getenv(k, fallback string) string {
	if v := os.Getenv(k); v != "" { return v }
	return fallback
}

// Avoid importing reflect just for errors.As; this covers exec.ExitError here.
func errorAs(err error, target **exec.ExitError) bool {
	for err != nil {
		if v, ok := err.(*exec.ExitError); ok {
			*target = v
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok { break }
		err = u.Unwrap()
	}
	return false
}

var _ = ast.File{}
var _ io.Reader
var _ sync.Mutex
