package api

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// Request history keeps the response a request came back with, not just its
// status line. The bodies live in their own files rather than inside the
// request store: that store is rewritten in full on every autosave, so a
// thousand entries carrying bodies would turn a 1.2-second debounce into a
// steady rewrite of hundreds of megabytes.
//
// They are encrypted with the same key as the rest of the local profile,
// because a response body is exactly the kind of thing that carries a token.

const (
	historyResponseDirName = "history"
	// A response larger than this is kept only as its head. The point of history
	// is to see what came back, and no one reads four megabytes of it in a
	// scrollback — while a thousand of them would cost a gigabyte of disk.
	maxHistoryResponseBytes = 2 * 1024 * 1024
)

// historyStoreMu serialises writes to the history directory. The frontend can
// record several responses at once during a collection run.
var historyStoreMu sync.Mutex

func historyResponseDir() string {
	return filepath.Join(requestStoreDir(), historyResponseDirName)
}

// historyResponsePath refuses an id that is not a plain identifier, so a value
// coming from the frontend cannot walk out of the history directory.
func historyResponsePath(id string) (string, error) {
	if id == "" {
		return "", fmt.Errorf("history id is empty")
	}
	for _, ch := range id {
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9', ch == '-', ch == '_':
		default:
			return "", fmt.Errorf("invalid history id %q", id)
		}
	}
	return filepath.Join(historyResponseDir(), id+".json"), nil
}

// HistoryResponseResult reports what happened to a stored response, and how much
// of it was kept.
type HistoryResponseResult struct {
	Stored    bool   `json:"stored"`
	Truncated bool   `json:"truncated"`
	Payload   string `json:"payload,omitempty"`
	Error     string `json:"error,omitempty"`
}

// SaveHistoryResponse stores the response recorded for a history entry. payload
// is the JSON the frontend will get back verbatim; it is truncated rather than
// rejected when oversized, so a large response still leaves a readable head.
func (a *App) SaveHistoryResponse(id string, payload string) HistoryResponseResult {
	historyStoreMu.Lock()
	defer historyStoreMu.Unlock()

	path, err := historyResponsePath(id)
	if err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	truncated := false
	if len(payload) > maxHistoryResponseBytes {
		payload = payload[:maxHistoryResponseBytes]
		truncated = true
	}
	if err := os.MkdirAll(historyResponseDir(), 0o700); err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	encrypted, err := encryptRequestStorePayload([]byte(payload))
	if err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	if err := writeFileAtomic(path, encrypted); err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	return HistoryResponseResult{Stored: true, Truncated: truncated}
}

// LoadHistoryResponse returns a stored response. A missing file is not an error:
// it means the entry predates this feature, or its body was pruned.
func (a *App) LoadHistoryResponse(id string) HistoryResponseResult {
	path, err := historyResponsePath(id)
	if err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return HistoryResponseResult{}
	}
	if err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	payload, err := decryptRequestStorePayload(data)
	if err != nil {
		return HistoryResponseResult{Error: err.Error()}
	}
	return HistoryResponseResult{Stored: true, Payload: string(payload)}
}

// PruneHistoryResponses deletes stored responses for entries that no longer
// exist. History expires on its own schedule in the frontend, so without this
// the files would outlive every entry that referred to them.
func (a *App) PruneHistoryResponses(keepIDs []string) string {
	historyStoreMu.Lock()
	defer historyStoreMu.Unlock()

	entries, err := os.ReadDir(historyResponseDir())
	if os.IsNotExist(err) {
		return ""
	}
	if err != nil {
		return err.Error()
	}
	keep := make(map[string]struct{}, len(keepIDs))
	for _, id := range keepIDs {
		keep[id] = struct{}{}
	}

	var failures []string
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		if _, wanted := keep[strings.TrimSuffix(name, ".json")]; wanted {
			continue
		}
		if err := os.Remove(filepath.Join(historyResponseDir(), name)); err != nil && !os.IsNotExist(err) {
			failures = append(failures, err.Error())
		}
	}
	if len(failures) == 0 {
		return ""
	}
	sort.Strings(failures)
	return strings.Join(failures, "; ")
}

// ClearHistoryResponses removes every stored response, for "clear history".
func (a *App) ClearHistoryResponses() string {
	historyStoreMu.Lock()
	defer historyStoreMu.Unlock()

	if err := os.RemoveAll(historyResponseDir()); err != nil && !os.IsNotExist(err) {
		return err.Error()
	}
	return ""
}

// writeFileAtomic writes through a temporary file so a crash mid-write leaves
// the previous copy rather than a half-written one.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".history-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() {
		tmp.Close()
		os.Remove(tmpName)
	}()

	if err := tmp.Chmod(0o600); err != nil {
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := replaceFile(tmpName, path); err != nil {
		return err
	}
	return syncDir(dir)
}
