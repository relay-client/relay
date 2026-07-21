package model

type WebSocketMessage struct {
	ID        string `json:"id"`
	Direction string `json:"direction"`
	Type      string `json:"type"`
	Data      string `json:"data"`
	Encoding  string `json:"encoding,omitempty"`
	Size      int    `json:"size"`
	Code      int    `json:"code,omitempty"`
	Timestamp int64  `json:"timestamp"`
	IsSystem  bool   `json:"isSystem"`
	IsError   bool   `json:"isError"`
	Message   string `json:"message,omitempty"`
}

type WebSocketOpenEvent struct {
	SessionID       string     `json:"sessionId"`
	URL             string     `json:"url"`
	Status          string     `json:"status"`
	RequestHeaders  []KeyValue `json:"requestHeaders"`
	ResponseHeaders []KeyValue `json:"responseHeaders"`
	Headers         []KeyValue `json:"headers"`
	Protocol        string     `json:"protocol"`
	Timestamp       int64      `json:"timestamp"`
}

type WebSocketCloseEvent struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
	Code      int    `json:"code,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

type WebSocketErrorEvent struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

type WebSocketReconnectEvent struct {
	SessionID   string `json:"sessionId"`
	Attempt     int    `json:"attempt"`
	MaxAttempts int    `json:"maxAttempts"`
	IntervalMs  int    `json:"intervalMs"`
	Timestamp   int64  `json:"timestamp"`
}

type WebSocketPayload struct {
	SessionID string           `json:"sessionId"`
	Event     WebSocketMessage `json:"event"`
}

type WebSocketBatchPayload struct {
	SessionID string             `json:"sessionId"`
	Events    []WebSocketMessage `json:"events"`
}

type WebSocketSendMessage struct {
	Type     string `json:"type"`
	Data     string `json:"data"`
	Encoding string `json:"encoding,omitempty"`
	Code     int    `json:"code,omitempty"`
}

type WebSocketSendResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}
