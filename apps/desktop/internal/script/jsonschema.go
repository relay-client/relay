package script

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strings"
)

// A JSON Schema validator covering the draft-07 keywords that appear in API
// test suites. It exists so scripts can assert a response's shape the way they
// do in Postman — through pm.response.to.have.jsonSchema, tv4, or Ajv — without
// pulling a JavaScript validator into the sandbox.
//
// Deliberately not implemented: remote $ref (the sandbox has no network),
// content/media keywords, and format assertions (Ajv does not check formats by
// default either, so a schema that relies on them would report differently
// there too).

const maxSchemaErrors = 20

type schemaValidator struct {
	root       any
	errors     []string
	suppressed int
}

// ValidateJSONSchema reports every reason data fails schema. An empty result
// means the document is valid.
func ValidateJSONSchema(schema, data any) []string {
	v := &schemaValidator{root: schema}
	v.validate(schema, data, "")
	if v.suppressed > 0 {
		// Reporting 20 of 200 failures as if they were all of them sends people
		// hunting for a bug in the schema when the document is simply far off.
		return append(v.errors, fmt.Sprintf("(and %d more failures — only the first %d are listed)", v.suppressed, maxSchemaErrors))
	}
	return v.errors
}

// ValidateJSONSchemaText takes the JSON text of both sides, which is what the
// script host has on hand.
func ValidateJSONSchemaText(schemaJSON, dataJSON string) ([]string, error) {
	var schema, data any
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return nil, fmt.Errorf("invalid JSON schema: %w", err)
	}
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return nil, fmt.Errorf("invalid JSON data: %w", err)
	}
	return ValidateJSONSchema(schema, data), nil
}

func (v *schemaValidator) fail(path, format string, args ...any) {
	if len(v.errors) >= maxSchemaErrors {
		v.suppressed++
		return
	}
	where := path
	if where == "" {
		where = "(root)"
	}
	v.errors = append(v.errors, where+": "+fmt.Sprintf(format, args...))
}

func (v *schemaValidator) validate(schema, data any, path string) {
	switch s := schema.(type) {
	case bool:
		// A boolean schema accepts everything or nothing.
		if !s {
			v.fail(path, "schema is false, no value is valid")
		}
		return
	case map[string]any:
		v.validateObjectSchema(s, data, path)
	default:
		v.fail(path, "schema must be an object or a boolean")
	}
}

func (v *schemaValidator) validateObjectSchema(schema map[string]any, data any, path string) {
	if ref, ok := schema["$ref"].(string); ok {
		resolved, err := v.resolveRef(ref)
		if err != nil {
			v.fail(path, "%s", err.Error())
			return
		}
		v.validate(resolved, data, path)
		return
	}

	// OpenAPI's nullable is common in schemas exported from specs and costs
	// one line to honour.
	if nullable, ok := schema["nullable"].(bool); ok && nullable && data == nil {
		return
	}

	v.checkType(schema, data, path)
	v.checkEnumAndConst(schema, data, path)
	v.checkNumber(schema, data, path)
	v.checkString(schema, data, path)
	v.checkArray(schema, data, path)
	v.checkObject(schema, data, path)
	v.checkCombinators(schema, data, path)
}

func (v *schemaValidator) resolveRef(ref string) (any, error) {
	if !strings.HasPrefix(ref, "#") {
		return nil, fmt.Errorf("$ref %q is not local — only in-document references are supported", ref)
	}
	current := v.root
	for _, rawSegment := range strings.Split(strings.TrimPrefix(strings.TrimPrefix(ref, "#"), "/"), "/") {
		if rawSegment == "" {
			continue
		}
		segment := strings.ReplaceAll(strings.ReplaceAll(rawSegment, "~1", "/"), "~0", "~")
		obj, ok := current.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("$ref %q could not be resolved", ref)
		}
		next, ok := obj[segment]
		if !ok {
			return nil, fmt.Errorf("$ref %q could not be resolved", ref)
		}
		current = next
	}
	return current, nil
}

func jsonTypeOf(data any) string {
	switch value := data.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case float64:
		if value == math.Trunc(value) && !math.IsInf(value, 0) {
			return "integer"
		}
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return "unknown"
	}
}

func typeMatches(want, actual string) bool {
	if want == actual {
		return true
	}
	// Every integer is also a number; the reverse is not true.
	return want == "number" && actual == "integer"
}

func (v *schemaValidator) checkType(schema map[string]any, data any, path string) {
	raw, ok := schema["type"]
	if !ok {
		return
	}
	actual := jsonTypeOf(data)
	switch want := raw.(type) {
	case string:
		if !typeMatches(want, actual) {
			v.fail(path, "expected %s, got %s", want, actual)
		}
	case []any:
		names := make([]string, 0, len(want))
		for _, entry := range want {
			name, _ := entry.(string)
			if name == "" {
				continue
			}
			names = append(names, name)
			if typeMatches(name, actual) {
				return
			}
		}
		v.fail(path, "expected one of [%s], got %s", strings.Join(names, ", "), actual)
	}
}

func (v *schemaValidator) checkEnumAndConst(schema map[string]any, data any, path string) {
	if values, ok := schema["enum"].([]any); ok {
		for _, candidate := range values {
			if reflect.DeepEqual(candidate, data) {
				return
			}
		}
		v.fail(path, "value %s is not one of the allowed values", describe(data))
	}
	if expected, ok := schema["const"]; ok && !reflect.DeepEqual(expected, data) {
		v.fail(path, "value %s does not equal the required constant %s", describe(data), describe(expected))
	}
}

func (v *schemaValidator) checkNumber(schema map[string]any, data any, path string) {
	number, ok := data.(float64)
	if !ok {
		return
	}
	if limit, ok := schema["minimum"].(float64); ok && number < limit {
		v.fail(path, "%v is below the minimum %v", number, limit)
	}
	if limit, ok := schema["maximum"].(float64); ok && number > limit {
		v.fail(path, "%v is above the maximum %v", number, limit)
	}
	if limit, ok := schema["exclusiveMinimum"].(float64); ok && number <= limit {
		v.fail(path, "%v must be greater than %v", number, limit)
	}
	if limit, ok := schema["exclusiveMaximum"].(float64); ok && number >= limit {
		v.fail(path, "%v must be less than %v", number, limit)
	}
	if step, ok := schema["multipleOf"].(float64); ok && step != 0 {
		if ratio := number / step; math.Abs(ratio-math.Round(ratio)) > 1e-9 {
			v.fail(path, "%v is not a multiple of %v", number, step)
		}
	}
}

func (v *schemaValidator) checkString(schema map[string]any, data any, path string) {
	text, ok := data.(string)
	if !ok {
		return
	}
	runes := len([]rune(text))
	if limit, ok := schema["minLength"].(float64); ok && runes < int(limit) {
		v.fail(path, "string is shorter than %d characters", int(limit))
	}
	if limit, ok := schema["maxLength"].(float64); ok && runes > int(limit) {
		v.fail(path, "string is longer than %d characters", int(limit))
	}
	if pattern, ok := schema["pattern"].(string); ok {
		re, err := regexp.Compile(pattern)
		if err != nil {
			v.fail(path, "pattern %q is not a valid regular expression", pattern)
			return
		}
		if !re.MatchString(text) {
			v.fail(path, "string does not match %s", pattern)
		}
	}
}

func (v *schemaValidator) checkArray(schema map[string]any, data any, path string) {
	items, ok := data.([]any)
	if !ok {
		return
	}
	if limit, ok := schema["minItems"].(float64); ok && len(items) < int(limit) {
		v.fail(path, "array has %d items, fewer than the required %d", len(items), int(limit))
	}
	if limit, ok := schema["maxItems"].(float64); ok && len(items) > int(limit) {
		v.fail(path, "array has %d items, more than the allowed %d", len(items), int(limit))
	}
	if unique, ok := schema["uniqueItems"].(bool); ok && unique {
		for i := range items {
			for j := i + 1; j < len(items); j++ {
				if reflect.DeepEqual(items[i], items[j]) {
					v.fail(path, "items %d and %d are identical but the array must be unique", i, j)
				}
			}
		}
	}
	switch itemSchema := schema["items"].(type) {
	case nil:
	case []any:
		// Tuple form: each position has its own schema.
		for index, entry := range itemSchema {
			if index < len(items) {
				v.validate(entry, items[index], fmt.Sprintf("%s/%d", path, index))
			}
		}
		if extra, ok := schema["additionalItems"]; ok && len(items) > len(itemSchema) {
			if allowed, isBool := extra.(bool); isBool && !allowed {
				v.fail(path, "array has %d items but only %d are allowed", len(items), len(itemSchema))
			} else if !isBool {
				for index := len(itemSchema); index < len(items); index++ {
					v.validate(extra, items[index], fmt.Sprintf("%s/%d", path, index))
				}
			}
		}
	default:
		for index, entry := range items {
			v.validate(itemSchema, entry, fmt.Sprintf("%s/%d", path, index))
		}
	}
}

func (v *schemaValidator) checkObject(schema map[string]any, data any, path string) {
	object, ok := data.(map[string]any)
	if !ok {
		return
	}
	if limit, ok := schema["minProperties"].(float64); ok && len(object) < int(limit) {
		v.fail(path, "object has %d properties, fewer than the required %d", len(object), int(limit))
	}
	if limit, ok := schema["maxProperties"].(float64); ok && len(object) > int(limit) {
		v.fail(path, "object has %d properties, more than the allowed %d", len(object), int(limit))
	}
	for _, entry := range toStringSlice(schema["required"]) {
		if _, present := object[entry]; !present {
			v.fail(path, "missing required property %q", entry)
		}
	}

	properties, _ := schema["properties"].(map[string]any)
	for _, key := range sortedKeys(properties) {
		if value, present := object[key]; present {
			v.validate(properties[key], value, path+"/"+key)
		}
	}

	patterns, _ := schema["patternProperties"].(map[string]any)
	matchedByPattern := map[string]bool{}
	for _, pattern := range sortedKeys(patterns) {
		re, err := regexp.Compile(pattern)
		if err != nil {
			v.fail(path, "patternProperties key %q is not a valid regular expression", pattern)
			continue
		}
		for _, key := range sortedKeys(object) {
			if re.MatchString(key) {
				matchedByPattern[key] = true
				v.validate(patterns[pattern], object[key], path+"/"+key)
			}
		}
	}

	extra, hasExtra := schema["additionalProperties"]
	if !hasExtra {
		return
	}
	for _, key := range sortedKeys(object) {
		if _, declared := properties[key]; declared {
			continue
		}
		if matchedByPattern[key] {
			continue
		}
		if allowed, isBool := extra.(bool); isBool {
			if !allowed {
				v.fail(path, "property %q is not allowed", key)
			}
			continue
		}
		v.validate(extra, object[key], path+"/"+key)
	}
}

func (v *schemaValidator) checkCombinators(schema map[string]any, data any, path string) {
	if branches, ok := schema["allOf"].([]any); ok {
		for _, branch := range branches {
			v.validate(branch, data, path)
		}
	}
	if branches, ok := schema["anyOf"].([]any); ok && !v.matchesAny(branches, data) {
		v.fail(path, "value %s does not match any of the allowed schemas", describe(data))
	}
	if branches, ok := schema["oneOf"].([]any); ok {
		matches := 0
		for _, branch := range branches {
			if len(ValidateJSONSchema(v.rooted(branch), data)) == 0 {
				matches++
			}
		}
		if matches != 1 {
			v.fail(path, "value %s matched %d schemas, expected exactly one", describe(data), matches)
		}
	}
	if not, ok := schema["not"]; ok && len(ValidateJSONSchema(v.rooted(not), data)) == 0 {
		v.fail(path, "value %s matches a schema it must not match", describe(data))
	}
}

func (v *schemaValidator) matchesAny(branches []any, data any) bool {
	for _, branch := range branches {
		if len(ValidateJSONSchema(v.rooted(branch), data)) == 0 {
			return true
		}
	}
	return false
}

// rooted keeps $ref resolvable inside a sub-schema by carrying the definitions
// from the document root along with it.
func (v *schemaValidator) rooted(schema any) any {
	object, ok := schema.(map[string]any)
	if !ok {
		return schema
	}
	root, ok := v.root.(map[string]any)
	if !ok {
		return schema
	}
	merged := make(map[string]any, len(object)+2)
	for key, value := range object {
		merged[key] = value
	}
	for _, key := range []string{"definitions", "$defs"} {
		if _, present := merged[key]; !present {
			if value, ok := root[key]; ok {
				merged[key] = value
			}
		}
	}
	return merged
}

func toStringSlice(value any) []string {
	entries, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if text, ok := entry.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func describe(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	const limit = 80
	if len(encoded) > limit {
		return string(encoded[:limit]) + "…"
	}
	return string(encoded)
}
