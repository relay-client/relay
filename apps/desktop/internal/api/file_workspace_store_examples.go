package api

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	fileStoreExamplesDir = "examples"
	exampleBodySuffix    = ".body"
)

type filesystemExampleFile struct {
	Version int            `yaml:"version" json:"version"`
	Order   int            `yaml:"order,omitempty" json:"order,omitempty"`
	Example map[string]any `yaml:"example" json:"example"`
}

func exampleBodyExtension(mediaType string) string {
	normalized := strings.ToLower(strings.TrimSpace(mediaType))
	if idx := strings.IndexByte(normalized, ';'); idx >= 0 {
		normalized = strings.TrimSpace(normalized[:idx])
	}
	switch {
	case normalized == "":
		return ".txt"
	case strings.HasSuffix(normalized, "+json"), normalized == "application/json", normalized == "text/json":
		return ".json"
	case strings.HasSuffix(normalized, "+xml"), normalized == "application/xml", normalized == "text/xml":
		return ".xml"
	case normalized == "text/html":
		return ".html"
	case normalized == "text/csv":
		return ".csv"
	case normalized == "application/javascript", normalized == "text/javascript":
		return ".js"
	default:
		return ".txt"
	}
}

func writeExampleBodyFile(path string, data []byte) error {
	if info, err := os.Lstat(path); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("refusing to write symlink: %s", path)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("refusing to write non-file path: %s", path)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if existing, err := os.ReadFile(path); err == nil && string(existing) == string(data) {
		return nil
	}
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".relay-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0644); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := replaceFile(tmpPath, path); err != nil {
		return err
	}
	cleanup = false
	return syncDir(dir)
}

func exampleResponseMap(example map[string]any) map[string]any {
	response, _ := example["response"].(map[string]any)
	return response
}

func requestExampleMaps(request map[string]any) []map[string]any {
	raw, ok := request["examples"]
	delete(request, "examples")
	if !ok {
		return nil
	}
	var list []map[string]any
	switch typed := raw.(type) {
	case []map[string]any:
		list = typed
	case []any:
		for _, item := range typed {
			if example, ok := item.(map[string]any); ok {
				list = append(list, example)
			}
		}
	default:
		return nil
	}
	examples := make([]map[string]any, 0, len(list))
	for _, example := range list {
		if stringValue(example, "id") != "" {
			examples = append(examples, example)
		}
	}
	return examples
}

func writeRequestExamples(collectionDir, requestSegment string, examples []map[string]any, desiredFiles map[string]struct{}) error {
	if len(examples) == 0 {
		return nil
	}
	if requestSegment == "" {
		return fmt.Errorf("request has no filesystem name to store its examples under")
	}
	exampleDir := filepath.Join(collectionDir, fileStoreExamplesDir, requestSegment)
	if err := os.MkdirAll(exampleDir, 0755); err != nil {
		return err
	}

	segments := filesystemSegmentsForItems(examples)
	for index, example := range examples {
		id := stringValue(example, "id")
		segment := segments[id]
		if segment == "" {
			continue
		}

		response := exampleResponseMap(example)
		body := ""
		if response != nil {
			body = stringValue(response, "body")
			delete(response, "body")
			delete(response, "bodyFile")
		}
		if response != nil && body != "" {
			bodyName := segment + exampleBodySuffix + exampleBodyExtension(stringValue(response, "bodyMediaType"))
			bodyPath := filepath.Join(exampleDir, bodyName)
			if err := writeExampleBodyFile(bodyPath, []byte(body)); err != nil {
				return err
			}
			response["bodyFile"] = bodyName
			desiredFiles[bodyPath] = struct{}{}
		}

		delete(example, filesystemNameField)
		examplePath := filepath.Join(exampleDir, segment+fileStoreYAMLExt)
		if err := writeYAMLFile(examplePath, filesystemExampleFile{
			Version: fileStoreVersion,
			Order:   index,
			Example: example,
		}); err != nil {
			return err
		}
		desiredFiles[examplePath] = struct{}{}
	}
	return nil
}

func readRequestExamples(collectionDir, requestSegment, workspaceRoot, workspaceID, collectionID, requestID string) ([]map[string]any, []WorkspaceDiagnostic) {
	if requestSegment == "" {
		return nil, nil
	}
	exampleDir := filepath.Join(collectionDir, fileStoreExamplesDir, requestSegment)
	entries, err := readDirNoSymlink(exampleDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, []WorkspaceDiagnostic{workspaceDiagnostic{
			scope: "request", path: exampleDir, root: workspaceRoot, err: err,
			workspaceID: workspaceID, collectionID: collectionID, requestID: requestID,
		}.toDiagnostic()}
	}

	type loadedExample struct {
		order   int
		name    string
		example map[string]any
	}
	var loaded []loadedExample
	var diagnostics []WorkspaceDiagnostic

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != fileStoreYAMLExt {
			continue
		}
		path := filepath.Join(exampleDir, entry.Name())
		var doc filesystemExampleFile
		if err := readYAMLFile(path, &doc); err != nil {
			diagnostics = append(diagnostics, workspaceDiagnostic{
				scope: "request", path: path, root: workspaceRoot, err: err,
				workspaceID: workspaceID, collectionID: collectionID, requestID: requestID,
			}.toDiagnostic())
			continue
		}
		if doc.Example == nil {
			continue
		}
		segment := strings.TrimSuffix(entry.Name(), fileStoreYAMLExt)
		doc.Example[filesystemNameField] = segment

		if response := exampleResponseMap(doc.Example); response != nil {
			bodyFile := stringValue(response, "bodyFile")
			delete(response, "bodyFile")
			if bodyFile != "" {
				if bodyFile != filepath.Base(bodyFile) {
					diagnostics = append(diagnostics, workspaceDiagnostic{
						scope: "request", path: path, root: workspaceRoot,
						message:     fmt.Sprintf("example body file %q must be a plain file name", bodyFile),
						workspaceID: workspaceID, collectionID: collectionID, requestID: requestID,
					}.toDiagnostic())
				} else if data, err := os.ReadFile(filepath.Join(exampleDir, bodyFile)); err != nil {
					diagnostics = append(diagnostics, workspaceDiagnostic{
						scope: "request", path: filepath.Join(exampleDir, bodyFile), root: workspaceRoot, err: err,
						workspaceID: workspaceID, collectionID: collectionID, requestID: requestID,
					}.toDiagnostic())
				} else {
					response["body"] = string(data)
				}
			}
			if _, ok := response["body"]; !ok {
				response["body"] = ""
			}
		}
		loaded = append(loaded, loadedExample{order: doc.Order, name: segment, example: doc.Example})
	}

	sort.SliceStable(loaded, func(i, j int) bool {
		if loaded[i].order != loaded[j].order {
			return loaded[i].order < loaded[j].order
		}
		return loaded[i].name < loaded[j].name
	})
	examples := make([]map[string]any, 0, len(loaded))
	for _, item := range loaded {
		examples = append(examples, item.example)
	}
	if len(examples) == 0 {
		return nil, diagnostics
	}
	return examples, diagnostics
}

func isExampleBodyPath(path string) bool {
	if filepath.Ext(path) == fileStoreYAMLExt {
		return false
	}
	parent := filepath.Dir(path)
	return filepath.Base(filepath.Dir(parent)) == fileStoreExamplesDir
}
