package script

import (
	"sort"
	"strings"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// Engine identifies which scripting language a request's scripts are written in.
type Engine string

const (
	EngineTengo Engine = "tengo"
	EngineJS    Engine = "js"
)

var scriptExecutionTimeout = 2 * time.Second

const maxScriptExecutionTimeout = 60 * time.Second

const scriptMaxSourceBytes = 1024 * 1024

func resolveTimeout(override time.Duration) time.Duration {
	if override <= 0 {
		return scriptExecutionTimeout
	}
	if override > maxScriptExecutionTimeout {
		return maxScriptExecutionTimeout
	}
	return override
}

// resolveEngine maps the wire value (which may be empty or a friendly alias)
// to a concrete engine. An unspecified engine falls back to Tengo so that
// legacy requests and payloads keep their original behaviour.
func resolveEngine(name string) Engine {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "js", "javascript", "node":
		return EngineJS
	default:
		return EngineTengo
	}
}

type Info struct {
	RequestName    string
	Iteration      int
	IterationCount int
}

type SendFunc func(SendRequest) SendResponse

type Context struct {
	Variables           map[string]string
	Environment         map[string]string
	CollectionVariables map[string]string
	// IterationData holds the current data-file row, exposed to scripts as the
	// read-only pm.iterationData. Empty outside a data-driven run.
	IterationData map[string]string

	RequestURL     string
	RequestMethod  string
	RequestHeaders map[string]string
	RequestParams  map[string]string
	RemovedHeaders map[string]struct{}
	RemovedParams  map[string]struct{}

	Response *model.HttpResponse

	Cookies []model.Cookie

	Info Info

	Timeout time.Duration

	Send SendFunc

	SkipRequest bool

	Tests []model.TestResult
	Logs  []string
}

func NewContext(vars, env map[string]string) *Context {
	if vars == nil {
		vars = make(map[string]string)
	}
	if env == nil {
		env = make(map[string]string)
	}
	return &Context{
		Variables:           vars,
		Environment:         env,
		CollectionVariables: make(map[string]string),
		RequestHeaders:      make(map[string]string),
		RequestParams:       make(map[string]string),
		RemovedHeaders:      make(map[string]struct{}),
		RemovedParams:       make(map[string]struct{}),
	}
}

func (c *Context) ResolveVariable(key string) (string, bool) {
	if v, ok := c.IterationData[key]; ok {
		return v, true
	}
	if v, ok := c.Environment[key]; ok {
		return v, true
	}
	if v, ok := c.CollectionVariables[key]; ok {
		return v, true
	}
	v, ok := c.Variables[key]
	return v, ok
}

func RunPreRequest(engine, src string, ctx *Context) model.ScriptResult {
	return run(engine, src, ctx, false)
}

func RunTests(engine, src string, ctx *Context) model.ScriptResult {
	return run(engine, src, ctx, true)
}

func run(engine, src string, ctx *Context, hasResponse bool) (result model.ScriptResult) {
	if strings.TrimSpace(src) == "" {
		return
	}
	if len(src) > scriptMaxSourceBytes {
		result.Error = "script is too large"
		return
	}

	before := make(map[string]string, len(ctx.CollectionVariables))
	for k, v := range ctx.CollectionVariables {
		before[k] = v
	}

	switch resolveEngine(engine) {
	case EngineJS:
		result.Error = runJS(src, ctx, hasResponse)
	default:
		result.Error = runTengo(src, ctx, hasResponse)
	}

	result.Tests = ctx.Tests
	result.Logs = ctx.Logs
	result.SkippedRequest = ctx.SkipRequest
	result.CollectionVariables, result.CollectionVariablesRemoved = collectionVariableDelta(before, ctx.CollectionVariables)
	return
}

func collectionVariableDelta(before, after map[string]string) (map[string]string, []string) {
	var changed map[string]string
	for key, value := range after {
		if prev, ok := before[key]; !ok || prev != value {
			if changed == nil {
				changed = make(map[string]string)
			}
			changed[key] = value
		}
	}
	var removed []string
	for key := range before {
		if _, ok := after[key]; !ok {
			removed = append(removed, key)
		}
	}
	sort.Strings(removed)
	return changed, removed
}
