package script

import (
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"strings"
)

type xmlNode struct {
	name     string
	attrs    map[string]any
	children []*xmlNode
	text     strings.Builder
}

func xmlToJSON(source string) (string, error) {
	decoder := xml.NewDecoder(strings.NewReader(source))
	decoder.Strict = false
	root := &xmlNode{}
	stack := []*xmlNode{root}
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", err
		}
		current := stack[len(stack)-1]
		switch typed := token.(type) {
		case xml.StartElement:
			node := &xmlNode{name: xmlName(typed.Name)}
			for _, attr := range typed.Attr {
				if node.attrs == nil {
					node.attrs = map[string]any{}
				}
				node.attrs[xmlName(attr.Name)] = attr.Value
			}
			current.children = append(current.children, node)
			stack = append(stack, node)
		case xml.EndElement:
			if len(stack) > 1 {
				stack = stack[:len(stack)-1]
			}
		case xml.CharData:
			current.text.Write(typed)
		}
	}
	if len(root.children) == 0 {
		return "", errors.New("no XML element found")
	}
	out := map[string]any{}
	for _, child := range root.children {
		addXMLChild(out, child.name, xmlNodeValue(child))
	}
	encoded, err := json.Marshal(out)
	return string(encoded), err
}

func xmlName(name xml.Name) string {
	if name.Space == "" {
		return name.Local
	}
	return name.Space + ":" + name.Local
}

func xmlNodeValue(node *xmlNode) any {
	text := strings.TrimSpace(node.text.String())
	if len(node.children) == 0 && node.attrs == nil {
		return text
	}
	out := map[string]any{}
	if node.attrs != nil {
		out["$"] = node.attrs
	}
	for _, child := range node.children {
		addXMLChild(out, child.name, xmlNodeValue(child))
	}
	if text != "" {
		out["_"] = text
	}
	return out
}

func addXMLChild(out map[string]any, name string, value any) {
	existing, ok := out[name]
	if !ok {
		out[name] = value
		return
	}
	if list, isList := existing.([]any); isList {
		out[name] = append(list, value)
		return
	}
	out[name] = []any{existing, value}
}
