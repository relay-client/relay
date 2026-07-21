package model

type UpdateInfo struct {
	Version      string `json:"version"`
	ReleaseNotes string `json:"releaseNotes"`
	PublishedAt  string `json:"publishedAt"`
	DownloadURL  string `json:"downloadUrl"`
	AssetName    string `json:"assetName"`
	SHA256       string `json:"sha256"`
	SignatureURL string `json:"signatureUrl"`
}

type UpdateCheckResult struct {
	Info  *UpdateInfo `json:"info"`
	Error string      `json:"error"`
}
