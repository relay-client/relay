package model

type SSEEvent struct {
	ID        string `json:"id"`
	Event     string `json:"event"`
	Data      string `json:"data"`
	Timestamp int64  `json:"timestamp"`
	IsSystem  bool   `json:"isSystem"`
	IsError   bool   `json:"isError"`
	Message   string `json:"message,omitempty"`
}

type SSEOpenEvent struct {
	SessionID  string       `json:"sessionId"`
	URL        string       `json:"url"`
	StatusCode int          `json:"statusCode"`
	Status     string       `json:"status"`
	Headers    []KeyValue   `json:"headers"`
	Duration   int64        `json:"duration"`
	Timings    ResponseTime `json:"timings"`
	Timestamp  int64        `json:"timestamp"`
}

type SSECloseEvent struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

type SSEErrorEvent struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

type SSEReconnectEvent struct {
	SessionID   string `json:"sessionId"`
	Attempt     int    `json:"attempt"`
	DelayMs     int    `json:"delayMs"`
	LastEventID string `json:"lastEventId"`
	Message     string `json:"message"`
	Timestamp   int64  `json:"timestamp"`
}

type SSEPayload struct {
	SessionID string   `json:"sessionId"`
	Event     SSEEvent `json:"event"`
}

type SSEBatchPayload struct {
	SessionID string     `json:"sessionId"`
	Events    []SSEEvent `json:"events"`
}
