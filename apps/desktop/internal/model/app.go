package model

type AppInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Runtime   string `json:"runtime"`
	GoVersion string `json:"goVersion"`
}
