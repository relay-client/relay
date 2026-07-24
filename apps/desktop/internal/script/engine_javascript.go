package script

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dop251/goja"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

const (
	jsMaxCallStackSize  = 1024
	jsMaxHostValueBytes = 256 * 1024
	jsMaxLogEntries     = 200
	jsMaxTestEntries    = 1000
)

func runJS(src string, ctx *Context, hasResponse bool) string {
	vm := goja.New()
	vm.SetMaxCallStackSize(jsMaxCallStackSize)

	if err := vm.Set("__relayHost", buildJSHost(vm, ctx, hasResponse)); err != nil {
		return "setup error: " + err.Error()
	}
	if _, err := vm.RunString(jsPrelude); err != nil {
		return "setup error: " + err.Error()
	}

	timer := time.AfterFunc(scriptExecutionTimeout, func() {
		vm.Interrupt("script timed out after " + scriptExecutionTimeout.String())
	})
	defer timer.Stop()

	if _, err := vm.RunString(src); err != nil {
		return jsErrorMessage(err)
	}
	return ""
}

func limitJSHostString(s string) string {
	if len(s) <= jsMaxHostValueBytes {
		return s
	}
	end := jsMaxHostValueBytes
	for end > 0 && !utf8.ValidString(s[:end]) {
		end--
	}
	return s[:end] + fmt.Sprintf("... [truncated after %d bytes]", jsMaxHostValueBytes)
}

func jsErrorMessage(err error) string {
	switch e := err.(type) {
	case *goja.InterruptedError:
		if s, ok := e.Value().(string); ok {
			return s
		}
		return e.Error()
	case *goja.Exception:
		if v := e.Value(); v != nil {
			return v.String()
		}
		return e.Error()
	default:
		return err.Error()
	}
}

func buildJSHost(vm *goja.Runtime, ctx *Context, hasResponse bool) map[string]interface{} {
	undef := goja.Undefined()

	headerGet := func(store map[string]string, key string) goja.Value {
		for k, v := range store {
			if strings.EqualFold(k, key) {
				return vm.ToValue(v)
			}
		}
		return undef
	}

	host := map[string]interface{}{
		"varGet": func(k string) goja.Value {
			if v, ok := ctx.Variables[k]; ok {
				return vm.ToValue(v)
			}
			return undef
		},
		"varSet":   func(k, v string) { ctx.Variables[limitJSHostString(k)] = limitJSHostString(v) },
		"varUnset": func(k string) { delete(ctx.Variables, limitJSHostString(k)) },
		"varClear": func() {
			for k := range ctx.Variables {
				delete(ctx.Variables, k)
			}
		},

		"envGet": func(k string) goja.Value {
			if v, ok := ctx.Environment[k]; ok {
				return vm.ToValue(v)
			}
			return undef
		},
		"envSet":   func(k, v string) { ctx.Environment[limitJSHostString(k)] = limitJSHostString(v) },
		"envUnset": func(k string) { delete(ctx.Environment, limitJSHostString(k)) },
		"envClear": func() {
			for k := range ctx.Environment {
				delete(ctx.Environment, k)
			}
		},

		"iterGet": func(k string) goja.Value {
			if v, ok := ctx.IterationData[k]; ok {
				return vm.ToValue(v)
			}
			return undef
		},

		"reqGetUrl":    func() string { return ctx.RequestURL },
		"reqSetUrl":    func(u string) { ctx.RequestURL = limitJSHostString(u) },
		"reqGetMethod": func() string { return ctx.RequestMethod },

		"reqHeaderGet": func(k string) goja.Value { return headerGet(ctx.RequestHeaders, k) },
		"reqHeaderSet": func(k, v string) {
			k = limitJSHostString(k)
			for existing := range ctx.RequestHeaders {
				if strings.EqualFold(existing, k) {
					delete(ctx.RequestHeaders, existing)
				}
			}
			ctx.RequestHeaders[k] = limitJSHostString(v)
			delete(ctx.RemovedHeaders, strings.ToLower(k))
		},
		"reqHeaderUnset": func(k string) {
			k = limitJSHostString(k)
			for existing := range ctx.RequestHeaders {
				if strings.EqualFold(existing, k) {
					delete(ctx.RequestHeaders, existing)
				}
			}
			ctx.RemovedHeaders[strings.ToLower(k)] = struct{}{}
		},

		"reqParamGet": func(k string) goja.Value {
			if v, ok := ctx.RequestParams[k]; ok {
				return vm.ToValue(v)
			}
			return undef
		},
		"reqParamSet": func(k, v string) {
			k = limitJSHostString(k)
			ctx.RequestParams[k] = limitJSHostString(v)
			delete(ctx.RemovedParams, k)
		},
		"reqParamUnset": func(k string) {
			k = limitJSHostString(k)
			delete(ctx.RequestParams, k)
			ctx.RemovedParams[k] = struct{}{}
		},

		"recordTest": func(name string, passed bool, errMsg string) {
			if len(ctx.Tests) >= jsMaxTestEntries {
				return
			}
			ctx.Tests = append(ctx.Tests, model.TestResult{Name: limitJSHostString(name), Passed: passed, Error: limitJSHostString(errMsg)})
		},
		"log": func(msg string) {
			if len(ctx.Logs) >= jsMaxLogEntries {
				return
			}
			ctx.Logs = append(ctx.Logs, limitJSHostString(msg))
		},

		"hasResponse": hasResponse && ctx.Response != nil,
	}

	if hasResponse && ctx.Response != nil {
		resp := ctx.Response
		host["resCode"] = func() int { return resp.StatusCode }
		host["resStatus"] = func() string { return resp.Status }
		host["resTime"] = func() int64 { return resp.Duration }
		host["resSize"] = func() int64 { return resp.Size }
		host["resBody"] = func() string { return resp.Body }
		host["resHeaderGet"] = func(k string) goja.Value {
			for _, h := range resp.Headers {
				if strings.EqualFold(h.Key, k) {
					return vm.ToValue(h.Value)
				}
			}
			return undef
		}
	}

	return host
}

// jsPrelude builds the Postman-style `pm` API, a chai-like `expect`, and a
// `console` shim on top of the Go-backed `__relayHost` bridge. Written in
// conservative ES5 so it always parses; user scripts may use modern JS.
const jsPrelude = `
var __relayAPI = (function (host) {
  function valStr(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    return String(v);
  }
  function fmt(v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'function') return v.toString();
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  function deepEqual(a, b) {
    if (a === b) return true;
    var ta = typeOf(a), tb = typeOf(b);
    if (ta !== tb) return false;
    if (ta === 'array') {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) { if (!deepEqual(a[i], b[i])) return false; }
      return true;
    }
    if (ta === 'object') {
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (var j = 0; j < ka.length; j++) {
        var k = ka[j];
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!deepEqual(a[k], b[k])) return false;
      }
      return true;
    }
    return false;
  }

  function Assertion(obj) { this._obj = obj; this._neg = false; this._deep = false; }
  function check(self, pass, msg, negMsg) {
    var ok = self._neg ? !pass : pass;
    if (!ok) throw new Error(self._neg ? negMsg : msg);
    return self;
  }
  function num(self) { return typeof self._obj === 'number' ? self._obj : Number(self._obj); }

  var chains = ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'of', 'same', 'but', 'does', 'still', 'at'];
  for (var ci = 0; ci < chains.length; ci++) {
    (function (name) {
      Object.defineProperty(Assertion.prototype, name, { get: function () { return this; }, configurable: true });
    })(chains[ci]);
  }
  Object.defineProperty(Assertion.prototype, 'not', { get: function () { this._neg = !this._neg; return this; }, configurable: true });
  Object.defineProperty(Assertion.prototype, 'deep', { get: function () { this._deep = true; return this; }, configurable: true });

  function getAssert(name, fn) {
    Object.defineProperty(Assertion.prototype, name, { get: function () { return fn.call(this); }, configurable: true });
  }
  getAssert('ok', function () { return check(this, !!this._obj, 'expected ' + fmt(this._obj) + ' to be truthy', 'expected ' + fmt(this._obj) + ' to be falsy'); });
  getAssert('true', function () { return check(this, this._obj === true, 'expected ' + fmt(this._obj) + ' to be true', 'expected ' + fmt(this._obj) + ' to not be true'); });
  getAssert('false', function () { return check(this, this._obj === false, 'expected ' + fmt(this._obj) + ' to be false', 'expected ' + fmt(this._obj) + ' to not be false'); });
  getAssert('null', function () { return check(this, this._obj === null, 'expected ' + fmt(this._obj) + ' to be null', 'expected ' + fmt(this._obj) + ' to not be null'); });
  getAssert('undefined', function () { return check(this, this._obj === undefined, 'expected ' + fmt(this._obj) + ' to be undefined', 'expected ' + fmt(this._obj) + ' to not be undefined'); });
  getAssert('exist', function () { return check(this, this._obj !== null && this._obj !== undefined, 'expected ' + fmt(this._obj) + ' to exist', 'expected ' + fmt(this._obj) + ' to not exist'); });
  getAssert('empty', function () {
    var o = this._obj, isEmpty;
    if (o === null || o === undefined) isEmpty = true;
    else if (typeof o === 'string' || Array.isArray(o)) isEmpty = o.length === 0;
    else if (typeof o === 'object') isEmpty = Object.keys(o).length === 0;
    else isEmpty = false;
    return check(this, isEmpty, 'expected ' + fmt(o) + ' to be empty', 'expected ' + fmt(o) + ' to not be empty');
  });

  Assertion.prototype.equal = function (v) {
    var pass = this._deep ? deepEqual(this._obj, v) : (this._obj === v);
    return check(this, pass, 'expected ' + fmt(this._obj) + ' to equal ' + fmt(v), 'expected ' + fmt(this._obj) + ' to not equal ' + fmt(v));
  };
  Assertion.prototype.equals = Assertion.prototype.equal;
  Assertion.prototype.eq = Assertion.prototype.equal;
  Assertion.prototype.eql = function (v) {
    return check(this, deepEqual(this._obj, v), 'expected ' + fmt(this._obj) + ' to deeply equal ' + fmt(v), 'expected ' + fmt(this._obj) + ' to not deeply equal ' + fmt(v));
  };
  Assertion.prototype.eqls = Assertion.prototype.eql;
  Assertion.prototype.a = function (type) {
    var actual = typeOf(this._obj);
    return check(this, actual === type, 'expected ' + fmt(this._obj) + ' to be a ' + type + ' but got ' + actual, 'expected ' + fmt(this._obj) + ' to not be a ' + type);
  };
  Assertion.prototype.an = Assertion.prototype.a;
  Assertion.prototype.include = function (v) {
    var o = this._obj, pass = false;
    if (typeof o === 'string') pass = o.indexOf(v) !== -1;
    else if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { if (deepEqual(o[i], v)) { pass = true; break; } } }
    else if (o && typeof o === 'object') {
      if (v && typeof v === 'object') { pass = true; for (var k in v) { if (!deepEqual(o[k], v[k])) { pass = false; break; } } }
      else { pass = Object.prototype.hasOwnProperty.call(o, v); }
    }
    return check(this, pass, 'expected ' + fmt(o) + ' to include ' + fmt(v), 'expected ' + fmt(o) + ' to not include ' + fmt(v));
  };
  Assertion.prototype.contain = Assertion.prototype.include;
  Assertion.prototype.contains = Assertion.prototype.include;
  Assertion.prototype.includes = Assertion.prototype.include;
  Assertion.prototype.property = function (name, val) {
    var has = this._obj !== null && this._obj !== undefined && Object.prototype.hasOwnProperty.call(Object(this._obj), name);
    if (arguments.length < 2) return check(this, has, 'expected ' + fmt(this._obj) + ' to have property ' + fmt(name), 'expected ' + fmt(this._obj) + ' to not have property ' + fmt(name));
    return check(this, has && deepEqual(this._obj[name], val), 'expected property ' + fmt(name) + ' to equal ' + fmt(val), 'expected property ' + fmt(name) + ' to not equal ' + fmt(val));
  };
  Assertion.prototype.lengthOf = function (n) {
    var len = (this._obj === null || this._obj === undefined) ? undefined : this._obj.length;
    return check(this, len === n, 'expected length ' + fmt(len) + ' to equal ' + fmt(n), 'expected length ' + fmt(len) + ' to not equal ' + fmt(n));
  };
  Assertion.prototype.length = Assertion.prototype.lengthOf;
  Assertion.prototype.above = function (n) { return check(this, num(this) > n, 'expected ' + fmt(this._obj) + ' to be above ' + fmt(n), 'expected ' + fmt(this._obj) + ' to not be above ' + fmt(n)); };
  Assertion.prototype.gt = Assertion.prototype.above;
  Assertion.prototype.greaterThan = Assertion.prototype.above;
  Assertion.prototype.below = function (n) { return check(this, num(this) < n, 'expected ' + fmt(this._obj) + ' to be below ' + fmt(n), 'expected ' + fmt(this._obj) + ' to not be below ' + fmt(n)); };
  Assertion.prototype.lt = Assertion.prototype.below;
  Assertion.prototype.lessThan = Assertion.prototype.below;
  Assertion.prototype.least = function (n) { return check(this, num(this) >= n, 'expected ' + fmt(this._obj) + ' to be at least ' + fmt(n), 'expected ' + fmt(this._obj) + ' to be below ' + fmt(n)); };
  Assertion.prototype.most = function (n) { return check(this, num(this) <= n, 'expected ' + fmt(this._obj) + ' to be at most ' + fmt(n), 'expected ' + fmt(this._obj) + ' to be above ' + fmt(n)); };
  Assertion.prototype.within = function (a, b) { var x = num(this); return check(this, x >= a && x <= b, 'expected ' + fmt(this._obj) + ' to be within ' + a + '..' + b, 'expected ' + fmt(this._obj) + ' to not be within ' + a + '..' + b); };
  Assertion.prototype.match = function (re) { return check(this, re.test(String(this._obj)), 'expected ' + fmt(this._obj) + ' to match ' + re, 'expected ' + fmt(this._obj) + ' to not match ' + re); };
  Assertion.prototype.oneOf = function (arr) { var o = this._obj, pass = false; for (var i = 0; i < arr.length; i++) { if (deepEqual(arr[i], o)) { pass = true; break; } } return check(this, pass, 'expected ' + fmt(o) + ' to be one of ' + fmt(arr), 'expected ' + fmt(o) + ' to not be one of ' + fmt(arr)); };
  Assertion.prototype.status = function (n) { var code = (this._obj && typeof this._obj === 'object' && 'code' in this._obj) ? this._obj.code : this._obj; return check(this, code === n, 'expected status ' + fmt(code) + ' to equal ' + fmt(n), 'expected status ' + fmt(code) + ' to not equal ' + fmt(n)); };
  Assertion.prototype.header = function (name) { var o = this._obj; var val = (o && o.headers && o.headers.get) ? o.headers.get(name) : undefined; return check(this, val !== undefined && val !== null, 'expected response to have header ' + fmt(name), 'expected response to not have header ' + fmt(name)); };

  function expect(obj) { return new Assertion(obj); }

  function kv(getName, setName, unsetName, clearName) {
    return {
      get: function (k) { return host[getName](String(k)); },
      set: function (k, v) { host[setName](String(k), valStr(v)); },
      unset: function (k) { host[unsetName](String(k)); },
      clear: function () { host[clearName](); }
    };
  }

  var pm = {
    variables: kv('varGet', 'varSet', 'varUnset', 'varClear'),
    environment: kv('envGet', 'envSet', 'envUnset', 'envClear'),
    iterationData: { get: function (k) { return host.iterGet(String(k)); } },
    request: {
      set_url: function (u) { host.reqSetUrl(String(u)); },
      setUrl: function (u) { host.reqSetUrl(String(u)); },
      headers: {
        get: function (k) { return host.reqHeaderGet(String(k)); },
        set: function (k, v) { host.reqHeaderSet(String(k), valStr(v)); },
        unset: function (k) { host.reqHeaderUnset(String(k)); },
        add: function (h) { if (h && h.key !== undefined) host.reqHeaderSet(String(h.key), valStr(h.value)); }
      },
      params: {
        get: function (k) { return host.reqParamGet(String(k)); },
        set: function (k, v) { host.reqParamSet(String(k), valStr(v)); },
        unset: function (k) { host.reqParamUnset(String(k)); }
      }
    },
    test: function (name, fn) {
      try {
        if (typeof fn === 'function') fn();
        else if (!fn) throw new Error('expected condition to be truthy');
        host.recordTest(String(name), true, '');
      } catch (e) {
        var msg = (e && e.message !== undefined) ? String(e.message) : String(e);
        host.recordTest(String(name), false, msg);
      }
    },
    expect: expect,
    log: function () { var a = []; for (var i = 0; i < arguments.length; i++) a.push(fmt(arguments[i])); host.log(a.join(' ')); }
  };
  Object.defineProperty(pm.request, 'url', { get: function () { return host.reqGetUrl(); }, configurable: true });
  Object.defineProperty(pm.request, 'method', { get: function () { return host.reqGetMethod(); }, configurable: true });

  if (host.hasResponse) {
    var resp = {
      text: function () { return host.resBody(); },
      body: function () { return host.resBody(); },
      json: function () { return JSON.parse(host.resBody()); },
      headers: { get: function (k) { return host.resHeaderGet(String(k)); } }
    };
    Object.defineProperty(resp, 'code', { get: function () { return host.resCode(); }, configurable: true });
    Object.defineProperty(resp, 'status', { get: function () { return host.resStatus(); }, configurable: true });
    Object.defineProperty(resp, 'responseTime', { get: function () { return host.resTime(); }, configurable: true });
    Object.defineProperty(resp, 'time', { get: function () { return host.resTime(); }, configurable: true });
    Object.defineProperty(resp, 'size', { get: function () { return host.resSize(); }, configurable: true });
    Object.defineProperty(resp, 'to', { get: function () { return new Assertion(resp); }, configurable: true });
    pm.response = resp;
  }

  var console = { log: pm.log, info: pm.log, warn: pm.log, error: pm.log, debug: pm.log };

  return { pm: pm, expect: expect, console: console };
})(__relayHost);

var pm = __relayAPI.pm;
var expect = __relayAPI.expect;
var console = __relayAPI.console;
__relayHost = undefined;
__relayAPI = undefined;
`
