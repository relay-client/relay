package api

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		dest := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(dest, info.Mode())
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		s, err := os.Open(p)
		if err != nil {
			return err
		}
		defer s.Close()
		if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
			return err
		}
		d, err := os.Create(dest)
		if err != nil {
			return err
		}
		defer d.Close()
		_, err = io.Copy(d, s)
		return err
	})
}

func TestReproPostmanImportWithUserState(t *testing.T) {
	tmp := t.TempDir()
	srcRoot := os.Getenv("RELAY_REPRO_WORKSPACES")
	postmanFile := os.Getenv("RELAY_REPRO_POSTMAN")
	dstRoot := filepath.Join(tmp, "ws")

	// Local-only reproduction harness: it depends on a developer's workspace
	// state and a Postman export that don't exist in CI. Skip when absent.
	if srcRoot == "" || postmanFile == "" {
		t.Skip("skipping repro: set RELAY_REPRO_WORKSPACES and RELAY_REPRO_POSTMAN to run this test")
	}
	if _, err := os.Stat(srcRoot); err != nil {
		t.Skipf("skipping repro: workspace state not found at %s", srcRoot)
	}
	if _, err := os.Stat(postmanFile); err != nil {
		t.Skipf("skipping repro: postman export not found at %s", postmanFile)
	}

	if err := copyDir(srcRoot, dstRoot); err != nil {
		t.Fatalf("copy state: %v", err)
	}
	localPath := filepath.Join(tmp, "local.json")

	loaded, err := loadRelayStorePayload(localPath, dstRoot)
	if err != nil {
		t.Fatalf("LOAD initial state: %v", err)
	}
	var store map[string]any
	_ = json.Unmarshal([]byte(loaded), &store)
	t.Logf("Loaded OK: %d workspaces, %d collections, %d requests",
		len(mapSlice(store["workspaces"])), len(mapSlice(store["collections"])), len(mapSlice(store["requests"])))

	storeMap, err := decodeJSONMap(loaded)
	if err != nil {
		t.Fatalf("decode loaded: %v", err)
	}

	postmanRaw, err := os.ReadFile(postmanFile)
	if err != nil {
		t.Fatalf("read postman: %v", err)
	}
	var postman struct {
		Item []map[string]any `json:"item"`
		Info map[string]any   `json:"info"`
	}
	if err := json.Unmarshal(postmanRaw, &postman); err != nil {
		t.Fatalf("parse postman: %v", err)
	}

	wsList := mapSlice(storeMap["workspaces"])
	if len(wsList) == 0 {
		t.Fatalf("no workspaces in loaded state")
	}
	wsID := stringValue(wsList[0], "id")
	t.Logf("Using workspace %s", wsID)

	newCollectionID := "collection-hb-test"
	storeMap["collections"] = append(mapSlice(storeMap["collections"]), map[string]any{
		"id":             newCollectionID,
		"workspaceId":    wsID,
		"name":           "HB",
		"filesystemName": "HB",
		"description":    "",
		"collapsed":      false,
		"createdAt":      float64(1700000000000),
		"updatedAt":      float64(1700000000000),
	})

	existingRequests := mapSlice(storeMap["requests"])

	idCounter := 0
	var walk func(items []map[string]any, path []string)
	walk = func(items []map[string]any, path []string) {
		for _, it := range items {
			name, _ := it["name"].(string)
			if subItems, ok := it["item"].([]any); ok {
				converted := make([]map[string]any, 0, len(subItems))
				for _, s := range subItems {
					if m, ok := s.(map[string]any); ok {
						converted = append(converted, m)
					}
				}
				walk(converted, append(path, name))
				continue
			}
			reqRaw, _ := it["request"].(map[string]any)
			if reqRaw == nil {
				continue
			}
			method, _ := reqRaw["method"].(string)
			if method == "" {
				method = "GET"
			}
			folderPathAny := make([]any, len(path))
			for k, p := range path {
				folderPathAny[k] = p
			}
			idCounter++
			existingRequests = append(existingRequests, map[string]any{
				"id":               fmt.Sprintf("req-test-%d", idCounter),
				"name":             name,
				"filesystemName":   "",
				"collectionId":     newCollectionID,
				"collection":       "HB",
				"folderPath":       folderPathAny,
				"requestType":      "http",
				"method":           method,
				"url":              "",
				"requestTab":       "params",
				"params":           []any{},
				"headers":          []any{},
				"auth":             map[string]any{"type": "none"},
				"bodyType":         "none",
				"rawBodyType":      "json",
				"bodyContent":      "",
				"bodyFilePath":     "",
				"bodyFileName":     "",
				"formRows":         []any{},
				"preRequestScript": "",
				"testScript":       "",
				"requestNotes":     "",
				"settings":         map[string]any{},
				"createdAt":        float64(1700000000000),
				"updatedAt":        float64(1700000000000),
			})
		}
	}
	walk(postman.Item, nil)

	storeMap["requests"] = existingRequests
	t.Logf("Total requests after import: %d", len(existingRequests))

	payloadJSON, err := json.Marshal(storeMap)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	err = saveRelayStorePayload(localPath, dstRoot, string(payloadJSON))
	if err != nil {
		t.Fatalf("SAVE FAILED: %v", err)
	}
	t.Logf("SAVE OK")
}
