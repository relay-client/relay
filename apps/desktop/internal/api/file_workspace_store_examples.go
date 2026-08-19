package api

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Examples are saved responses paired with the request snapshot that produced
// them. They live beside the collection rather than inside the request file for
// two reasons.
//
// The response body goes in its own file, because a JSON body embedded in YAML
// is a block scalar: unreadable in a diff, and rewritten whole by any
// reformatting. As its own .json file it diffs line by line, which is the entire
// point of keeping the contract in Git.
//
// And the directory is a sibling of requests/, not a child. The request loader
// walks requests/ with filepath.WalkDir — recursively — so every *.yml anywhere
// under it is parsed as a request. An examples folder nested there would come
// back as a pile of malformed-request diagnostics.
const (
	fileStoreExamplesDir = "examples"
	// exampleBodySuffix separates the example's own name from its body file, so
	// "created.yml" is accompanied by "created.body.json".
	exampleBodySuffix = ".body"
)

// filesystemExampleFile is the on-disk shape of one example.
type filesystemExampleFile struct {
	Version int            `yaml:"version" json:"version"`
	Order   int            `yaml:"order,omitempty" json:"order,omitempty"`
	Example map[string]any `yaml:"example" json:"example"`
}

// exampleBodyExtension picks the file extension for a response body from its
// media type, so the body lands on disk as something an editor and a diff tool
// both understand.
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

// writeExampleBodyFile writes a response body beside its example. It mirrors
// writeYAMLFile rather than reusing writeFileAtomic: these files are committed
// to Git, so they take 0644 and not the 0600 the encrypted local profile uses.
// Skipping an unchanged write matters as much as the atomicity — autosave
// rewrites the whole workspace, and touching every body file each time would
// churn mtimes under Git for no reason.
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

// exampleResponseMap returns the example's response object, creating nothing.
func exampleResponseMap(example map[string]any) map[string]any {
	response, _ := example["response"].(map[string]any)
	return response
}

// requestExampleMaps pulls the examples off a request payload. They are removed
// from the request map so they never end up inline in the request YAML.
func requestExampleMaps(request map[string]any) []map[string]any {
	raw, ok := request["examples"]
	delete(request, "examples")
	if !ok {
		return nil
	}
	// Both shapes occur: []any when the payload came through JSON from the
	// frontend, []map[string]any when it was just read off disk and is being
	// written straight back out.
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

// writeRequestExamples writes one directory of example files for a request and
// records every file it wrote, so the pruning pass keeps them.
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

		// The body travels in its own file. Take it off the map first so the
		// YAML carries only the pointer, then write both.
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

// readRequestExamples loads a request's examples back, reattaching each body
// from its own file. A body file that cannot be read is reported rather than
// silently producing an example with no response in it.
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
				// Refuse a body pointer that walks out of the example directory.
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

// isExampleBodyPath reports whether a path is a body file sitting in an
// examples/<request>/ directory. The pruning pass only removes files it can
// recognise this way, so nothing a user dropped elsewhere is at risk.
func isExampleBodyPath(path string) bool {
	if filepath.Ext(path) == fileStoreYAMLExt {
		return false
	}
	parent := filepath.Dir(path)
	return filepath.Base(filepath.Dir(parent)) == fileStoreExamplesDir
}
