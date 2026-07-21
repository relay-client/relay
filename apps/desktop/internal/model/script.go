package model

type TestResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Error  string `json:"error,omitempty"`
}

type ScriptResult struct {
	Tests []TestResult `json:"tests"`
	Logs  []string     `json:"logs,omitempty"`
	Error string       `json:"error,omitempty"`
}
