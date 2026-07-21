package model

type KeyValue struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Enabled  bool   `json:"enabled"`
	IsFile   bool   `json:"isFile"`
	FileName string `json:"fileName"`
}

type AuthConfig struct {
	Type string `json:"type"`

	Token string `json:"token"`

	Username string `json:"username"`
	Password string `json:"password"`

	KeyName  string `json:"keyName"`
	KeyValue string `json:"keyValue"`
	KeyIn    string `json:"keyIn"`

	OAuth2GrantType          string `json:"oauth2GrantType"`
	OAuth2TokenURL           string `json:"oauth2TokenURL"`
	OAuth2AuthURL            string `json:"oauth2AuthURL"`
	OAuth2RedirectURL        string `json:"oauth2RedirectURL"`
	OAuth2ClientID           string `json:"oauth2ClientID"`
	OAuth2Secret             string `json:"oauth2Secret"`
	OAuth2Scope              string `json:"oauth2Scope"`
	OAuth2UsePKCE            bool   `json:"oauth2UsePKCE"`
	OAuth2RefreshToken       string `json:"oauth2RefreshToken"`
	OAuth2InsecureSkipVerify bool   `json:"oauth2InsecureSkipVerify"`

	AWSAccessKey string `json:"awsAccessKey"`
	AWSSecretKey string `json:"awsSecretKey"`
	AWSRegion    string `json:"awsRegion"`
	AWSService   string `json:"awsService"`
}

type OAuth2TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
	Error        string `json:"error,omitempty"`
	ErrorDesc    string `json:"error_description,omitempty"`
}

type Cookie struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	Domain    string `json:"domain"`
	Path      string `json:"path"`
	ExpiresAt int64  `json:"expiresAt"`
	Session   bool   `json:"session"`
	Secure    bool   `json:"secure"`
	HTTPOnly  bool   `json:"httpOnly"`
	SameSite  string `json:"sameSite"`
	HostOnly  bool   `json:"hostOnly"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type CookieJarResult struct {
	Cookies []Cookie `json:"cookies"`
	Error   string   `json:"error,omitempty"`
}

type HttpRequest struct {
	RequestID        string     `json:"requestId"`
	WorkspaceID      string     `json:"workspaceId"`
	Method           string     `json:"method"`
	URL              string     `json:"url"`
	Params           []KeyValue `json:"params"`
	Headers          []KeyValue `json:"headers"`
	Auth             AuthConfig `json:"auth"`
	BodyType         string     `json:"bodyType"`
	Body             string     `json:"body"`
	BodyFilePath     string     `json:"bodyFilePath"`
	FormData         []KeyValue `json:"formData"`
	PreRequestScript string     `json:"preRequestScript"`
	TestScript       string     `json:"testScript"`
	ScriptEngine     string     `json:"scriptEngine"`
	FollowRedirects  bool       `json:"followRedirects"`
	TimeoutMs        int        `json:"timeoutMs"`

	HTTPVersion                  string            `json:"httpVersion"`
	EnableSSLVerification        bool              `json:"enableSSLVerification"`
	FollowOriginalMethod         bool              `json:"followOriginalMethod"`
	FollowAuthorizationHeader    bool              `json:"followAuthorizationHeader"`
	RemoveRefererHeader          bool              `json:"removeRefererHeader"`
	EncodeURLAutomatically       bool              `json:"encodeUrlAutomatically"`
	DisableCookieJar             bool              `json:"disableCookieJar"`
	MaxRedirects                 int               `json:"maxRedirects"`
	SecretEnvironmentKeys        []string          `json:"secretEnvironmentKeys"`
	SecretEnvironmentValues      []string          `json:"secretEnvironmentValues"`
	CollectionVariables          map[string]string `json:"collectionVariables"`
	ProxyURL                     string            `json:"proxyUrl"`
	ProxyMode                    string            `json:"proxyMode"`
	ProxyBypass                  string            `json:"proxyBypass"`
	BrowserEmulation             bool              `json:"browserEmulation"`
	BrowserOrigin                string            `json:"browserOrigin"`
	BrowserWithCredentials       bool              `json:"browserWithCredentials"`
	BrowserEnforceCORS           bool              `json:"browserEnforceCORS"`
	BrowserEnforceCSP            bool              `json:"browserEnforceCSP"`
	BrowserCSP                   string            `json:"browserCSP"`
	WebSocketHandshakeTimeoutMs  int               `json:"wsHandshakeTimeoutMs"`
	WebSocketReconnectAttempts   int               `json:"wsReconnectAttempts"`
	WebSocketReconnectIntervalMs int               `json:"wsReconnectIntervalMs"`
	WebSocketMaxMessageSizeMb    int               `json:"wsMaxMessageSizeMb"`
	WebSocketKeepAliveIntervalMs int               `json:"wsKeepAliveIntervalMs"`
	SocketIOClientVersion        string            `json:"sioClientVersion"`
	SocketIOPath                 string            `json:"sioPath"`
	SocketIONamespace            string            `json:"sioNamespace"`
	SocketIOListenEvents         []string          `json:"sioListenEvents"`
	SSEDisableReconnect          bool              `json:"sseDisableReconnect"`
	SSEReconnectIntervalMs       int               `json:"sseReconnectIntervalMs"`
}

type HttpResponse struct {
	StatusCode       int          `json:"statusCode"`
	Status           string       `json:"status"`
	Headers          []KeyValue   `json:"headers"`
	Body             string       `json:"body"`
	Duration         int64        `json:"duration"`
	Timings          ResponseTime `json:"timings"`
	Size             int64        `json:"size"`
	Error            string       `json:"error,omitempty"`
	PreRequestResult ScriptResult `json:"preRequestResult"`
	TestResult       ScriptResult `json:"testResult"`
}

type ResponseTime struct {
	Total                float64 `json:"total"`
	Prepare              float64 `json:"prepare"`
	SocketInitialization float64 `json:"socketInitialization"`
	DNSLookup            float64 `json:"dnsLookup"`
	TCPHandshake         float64 `json:"tcpHandshake"`
	TLSHandshake         float64 `json:"tlsHandshake"`
	WaitingTTFB          float64 `json:"waitingTTFB"`
	Download             float64 `json:"download"`
	Process              float64 `json:"process"`
}
