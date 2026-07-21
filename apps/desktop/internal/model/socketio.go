package model

type SocketIOMessage struct {
	ID        string   `json:"id"`
	Direction string   `json:"direction"`
	EventName string   `json:"eventName"`
	Args      []string `json:"args"`
	Namespace string   `json:"namespace"`
	Timestamp int64    `json:"timestamp"`
	IsSystem  bool     `json:"isSystem"`
	IsError   bool     `json:"isError"`
	Message   string   `json:"message,omitempty"`
}

type SocketIOOpenEvent struct {
	SessionID       string              `json:"sessionId"`
	URL             string              `json:"url"`
	Namespace       string              `json:"namespace"`
	Timestamp       int64               `json:"timestamp"`
	RequestHeaders  []map[string]string `json:"requestHeaders,omitempty"`
	ResponseHeaders []map[string]string `json:"responseHeaders,omitempty"`
	StatusCode      int                 `json:"statusCode,omitempty"`
	StatusText      string              `json:"statusText,omitempty"`
}

type SocketIOCloseEvent struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

type SocketIOHandshake struct {
	URL             string              `json:"url"`
	Method          string              `json:"method"`
	StatusCode      int                 `json:"statusCode,omitempty"`
	StatusText      string              `json:"statusText,omitempty"`
	RequestHeaders  []map[string]string `json:"requestHeaders,omitempty"`
	ResponseHeaders []map[string]string `json:"responseHeaders,omitempty"`
}

type SocketIOErrorEvent struct {
	SessionID string             `json:"sessionId"`
	Message   string             `json:"message"`
	Timestamp int64              `json:"timestamp"`
	Handshake *SocketIOHandshake `json:"handshake,omitempty"`
}

type SocketIOReconnectEvent struct {
	SessionID   string `json:"sessionId"`
	Attempt     int    `json:"attempt"`
	MaxAttempts int    `json:"maxAttempts"`
	IntervalMs  int    `json:"intervalMs"`
	Timestamp   int64  `json:"timestamp"`
}

type SocketIOPayload struct {
	SessionID string          `json:"sessionId"`
	Event     SocketIOMessage `json:"event"`
}

type SocketIOBatchPayload struct {
	SessionID string            `json:"sessionId"`
	Events    []SocketIOMessage `json:"events"`
}

type SocketIOEmitMessage struct {
	EventName string   `json:"eventName"`
	Args      []string `json:"args"`
	Namespace string   `json:"namespace"`
	Ack       bool     `json:"ack"`
}

type SocketIOAckEvent struct {
	SessionID string   `json:"sessionId"`
	AckID     int      `json:"ackId"`
	EventName string   `json:"eventName"`
	Args      []string `json:"args"`
	Namespace string   `json:"namespace"`
	Timestamp int64    `json:"timestamp"`
}

type SocketIOEmitResult struct {
	OK    bool   `json:"ok"`
	AckID int    `json:"ackId,omitempty"`
	Error string `json:"error,omitempty"`
}
