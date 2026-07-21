package script

import (
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

const scriptMaxSourceBytes = 1024 * 1024

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

type Context struct {
	Variables   map[string]string
	Environment map[string]string

	RequestURL     string
	RequestMethod  string
	RequestHeaders map[string]string
	RequestParams  map[string]string
	RemovedHeaders map[string]struct{}
	RemovedParams  map[string]struct{}

	Response *model.HttpResponse

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
		Variables:      vars,
		Environment:    env,
		RequestHeaders: make(map[string]string),
		RequestParams:  make(map[string]string),
		RemovedHeaders: make(map[string]struct{}),
		RemovedParams:  make(map[string]struct{}),
	}
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

	switch resolveEngine(engine) {
	case EngineJS:
		result.Error = runJS(src, ctx, hasResponse)
	default:
		result.Error = runTengo(src, ctx, hasResponse)
	}

	result.Tests = ctx.Tests
	result.Logs = ctx.Logs
	return
}
