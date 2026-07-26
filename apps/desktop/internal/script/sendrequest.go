package script

type SendRequest struct {
	Method  string
	URL     string
	Headers map[string]string
	Body    string
}

type SendResponse struct {
	StatusCode int
	Status     string
	Headers    map[string]string
	Body       string
	DurationMs int64
	Size       int64
	Error      string
}
