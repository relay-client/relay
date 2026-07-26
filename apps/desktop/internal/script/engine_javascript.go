package script

import (
	"encoding/base64"
	"encoding/hex"
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

	timeout := resolveTimeout(ctx.Timeout)
	timer := time.AfterFunc(timeout, func() {
		vm.Interrupt("script timed out after " + timeout.String())
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
			if v, ok := ctx.ResolveVariable(k); ok {
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

		"globalGet": func(k string) goja.Value {
			if v, ok := ctx.Variables[k]; ok {
				return vm.ToValue(v)
			}
			return undef
		},

		"collGet": func(k string) goja.Value {
			if v, ok := ctx.CollectionVariables[k]; ok {
				return vm.ToValue(v)
			}
			return undef
		},
		"collSet": func(k, v string) {
			ctx.CollectionVariables[limitJSHostString(k)] = limitJSHostString(v)
		},
		"collUnset": func(k string) { delete(ctx.CollectionVariables, limitJSHostString(k)) },
		"collClear": func() {
			for k := range ctx.CollectionVariables {
				delete(ctx.CollectionVariables, k)
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

		"infoRequestName":    func() string { return ctx.Info.RequestName },
		"infoIteration":      func() int { return ctx.Info.Iteration },
		"infoIterationCount": func() int { return ctx.Info.IterationCount },

		"skipRequest": func() {
			if !hasResponse {
				ctx.SkipRequest = true
			}
		},

		"cookieGet": func(name string) goja.Value {
			for _, cookie := range ctx.Cookies {
				if cookie.Name == name {
					return vm.ToValue(cookie.Value)
				}
			}
			return undef
		},
		"cookieHas": func(name string) bool {
			for _, cookie := range ctx.Cookies {
				if cookie.Name == name {
					return true
				}
			}
			return false
		},
		"cookieNames": func() goja.Value {
			names := make([]string, 0, len(ctx.Cookies))
			for _, cookie := range ctx.Cookies {
				names = append(names, cookie.Name)
			}
			return vm.ToValue(names)
		},

		"cryptoHash": func(algorithm, data, encoding string) goja.Value {
			digest, err := hashDigest(algorithm, data)
			if err != nil {
				panic(vm.NewTypeError(err.Error()))
			}
			return vm.ToValue(encodeDigest(digest, encoding))
		},
		"cryptoHmac": func(algorithm, key, data, encoding string) goja.Value {
			digest, err := hmacDigest(algorithm, key, data)
			if err != nil {
				panic(vm.NewTypeError(err.Error()))
			}
			return vm.ToValue(encodeDigest(digest, encoding))
		},
		"cryptoReencode": func(hexDigest, encoding string) goja.Value {
			raw, err := hex.DecodeString(hexDigest)
			if err != nil {
				panic(vm.NewTypeError("not a hex digest: " + err.Error()))
			}
			return vm.ToValue(encodeDigest(raw, encoding))
		},
		"cryptoBase64Encode": func(data string) string {
			return base64.StdEncoding.EncodeToString([]byte(data))
		},
		"cryptoBase64Decode": func(data string) goja.Value {
			decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(data))
			if err != nil {
				panic(vm.NewTypeError("base64 decode failed: " + err.Error()))
			}
			return vm.ToValue(string(decoded))
		},
		"cryptoRandomHex": func(n int) goja.Value {
			out, err := randomHex(n)
			if err != nil {
				panic(vm.NewTypeError(err.Error()))
			}
			return vm.ToValue(out)
		},
		"cryptoUUID": func() goja.Value {
			out, err := randomUUID()
			if err != nil {
				panic(vm.NewTypeError(err.Error()))
			}
			return vm.ToValue(out)
		},

		"hasResponse": hasResponse && ctx.Response != nil,
		"canSend":     ctx.Send != nil,
	}

	if ctx.Send != nil {
		host["sendRequest"] = func(method, url string, headers map[string]string, body string) goja.Value {
			resp := ctx.Send(SendRequest{
				Method:  method,
				URL:     url,
				Headers: headers,
				Body:    body,
			})
			out := map[string]any{
				"code":         resp.StatusCode,
				"status":       resp.Status,
				"body":         resp.Body,
				"responseTime": resp.DurationMs,
				"size":         resp.Size,
				"headers":      resp.Headers,
				"error":        resp.Error,
			}
			return vm.ToValue(out)
		}
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

  function hostHash(alg) {
    return function (data, enc) { return host.cryptoHash(alg, valStr(data), enc === undefined ? 'hex' : String(enc)); };
  }
  function hostHmac(alg) {
    return function (data, key, enc) { return host.cryptoHmac(alg, valStr(key), valStr(data), enc === undefined ? 'hex' : String(enc)); };
  }

  var crypto = {
    md5: hostHash('md5'),
    sha1: hostHash('sha1'),
    sha256: hostHash('sha256'),
    sha384: hostHash('sha384'),
    sha512: hostHash('sha512'),
    hash: function (alg, data, enc) { return host.cryptoHash(String(alg), valStr(data), enc === undefined ? 'hex' : String(enc)); },
    hmacSha1: hostHmac('sha1'),
    hmacSha256: hostHmac('sha256'),
    hmacSha384: hostHmac('sha384'),
    hmacSha512: hostHmac('sha512'),
    hmac: function (alg, data, key, enc) { return host.cryptoHmac(String(alg), valStr(key), valStr(data), enc === undefined ? 'hex' : String(enc)); },
    base64Encode: function (data) { return host.cryptoBase64Encode(valStr(data)); },
    base64Decode: function (data) { return host.cryptoBase64Decode(valStr(data)); },
    randomHex: function (n) { return host.cryptoRandomHex(n === undefined ? 16 : Number(n)); },
    uuid: function () { return host.cryptoUUID(); }
  };

  var pm = {
    variables: kv('varGet', 'varSet', 'varUnset', 'varClear'),
    environment: kv('envGet', 'envSet', 'envUnset', 'envClear'),
    globals: {
      get: function (k) { return host.globalGet(String(k)); },
      set: function (k, v) { host.varSet(String(k), valStr(v)); },
      unset: function (k) { host.varUnset(String(k)); },
      clear: function () { host.varClear(); }
    },
    collectionVariables: kv('collGet', 'collSet', 'collUnset', 'collClear'),
    crypto: crypto,
    cookies: {
      get: function (k) { return host.cookieGet(String(k)); },
      has: function (k) { return host.cookieHas(String(k)); },
      names: function () { return host.cookieNames(); }
    },
    execution: {
      skipRequest: function () { host.skipRequest(); }
    },
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

  pm.info = {};
  Object.defineProperty(pm.info, 'requestName', { get: function () { return host.infoRequestName(); }, configurable: true });
  Object.defineProperty(pm.info, 'iteration', { get: function () { return host.infoIteration(); }, configurable: true });
  Object.defineProperty(pm.info, 'iterationCount', { get: function () { return host.infoIterationCount(); }, configurable: true });
  Object.defineProperty(pm.info, 'eventName', { get: function () { return host.hasResponse ? 'test' : 'prerequest'; }, configurable: true });

  function wrapSentResponse(raw) {
    var headers = raw.headers || {};
    var res = {
      code: raw.code,
      status: raw.status,
      responseTime: raw.responseTime,
      time: raw.responseTime,
      size: raw.size,
      text: function () { return raw.body; },
      body: function () { return raw.body; },
      json: function () { return JSON.parse(raw.body); },
      headers: {
        get: function (name) {
          var want = String(name).toLowerCase();
          for (var key in headers) {
            if (String(key).toLowerCase() === want) return headers[key];
          }
          return undefined;
        }
      }
    };
    Object.defineProperty(res, 'to', { get: function () { return new Assertion(res); }, configurable: true });
    return res;
  }

  pm.sendRequest = function (options, callback) {
    if (!host.canSend) {
      var disabled = new Error('pm.sendRequest is disabled — turn on "Allow pm.sendRequest" in the Settings tab of this request, or pass --allow-send-request to relay run');
      if (typeof callback === 'function') return callback(disabled, undefined);
      throw disabled;
    }

    var method = 'GET', url = '', headers = {}, body = '';
    if (typeof options === 'string') {
      url = options;
    } else if (options && typeof options === 'object') {
      url = String(options.url || '');
      if (options.method) method = String(options.method).toUpperCase();
      var h = options.header || options.headers;
      if (Array.isArray(h)) {
        for (var i = 0; i < h.length; i++) {
          if (h[i] && h[i].key !== undefined) headers[String(h[i].key)] = valStr(h[i].value);
        }
      } else if (h && typeof h === 'object') {
        for (var k in h) headers[String(k)] = valStr(h[k]);
      }
      if (options.body !== undefined && options.body !== null) {
        var b = options.body;
        if (typeof b === 'string') body = b;
        else if (b.raw !== undefined) body = valStr(b.raw);
        else if (b.mode === 'raw') body = valStr(b.raw);
        else body = valStr(b);
      }
    } else {
      throw new Error('pm.sendRequest expects a URL string or an options object');
    }
    if (!url) throw new Error('pm.sendRequest requires a url');

    var raw = host.sendRequest(method, url, headers, body);
    if (raw.error) {
      var err = new Error(raw.error);
      if (typeof callback === 'function') return callback(err, undefined);
      throw err;
    }
    var wrapped = wrapSentResponse(raw);
    if (typeof callback === 'function') return callback(null, wrapped);
    return wrapped;
  };

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

  function wordArray(hex) {
    return {
      __relayDigestHex: hex,
      toString: function (encoder) {
        if (encoder && encoder.__relayEnc && encoder.__relayEnc !== 'hex') return host.cryptoReencode(hex, encoder.__relayEnc);
        return hex;
      }
    };
  }
  function cryptoJSDigest(alg) {
    return function (message) { return wordArray(host.cryptoHash(alg, valStr(message), 'hex')); };
  }
  function cryptoJSHmac(alg) {
    return function (message, key) { return wordArray(host.cryptoHmac(alg, valStr(key), valStr(message), 'hex')); };
  }
  var CryptoJS = {
    MD5: cryptoJSDigest('md5'),
    SHA1: cryptoJSDigest('sha1'),
    SHA256: cryptoJSDigest('sha256'),
    SHA384: cryptoJSDigest('sha384'),
    SHA512: cryptoJSDigest('sha512'),
    HmacMD5: cryptoJSHmac('md5'),
    HmacSHA1: cryptoJSHmac('sha1'),
    HmacSHA256: cryptoJSHmac('sha256'),
    HmacSHA384: cryptoJSHmac('sha384'),
    HmacSHA512: cryptoJSHmac('sha512'),
    enc: {
      Hex: { __relayEnc: 'hex', stringify: function (wa) { return wa.toString(); } },
      Base64: { __relayEnc: 'base64', stringify: function (wa) { return wa.toString({ __relayEnc: 'base64' }); } },
      Utf8: {
        __relayEnc: 'hex',
        parse: function (s) { return valStr(s); },
        stringify: function (wa) { return wa.toString(); }
      }
    }
  };

  return { pm: pm, expect: expect, console: console, CryptoJS: CryptoJS };
})(__relayHost);

var pm = __relayAPI.pm;
var expect = __relayAPI.expect;
var console = __relayAPI.console;
var CryptoJS = __relayAPI.CryptoJS;
__relayHost = undefined;
__relayAPI = undefined;
`
