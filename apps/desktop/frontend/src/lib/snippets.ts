import type { SnippetLanguage } from './stores/ui';
import type { RenderedSnippetLine } from './types/models';
import { methodColor, escapeHtml } from './utils';

export type SnippetRequest = {
  method: string; url: string;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  auth: { type: string; token: string; username?: string; password?: string; keyName: string; keyValue: string; keyIn: string };
  bodyType: string; body: string; bodyFilePath?: string;
  formData: Array<{ key: string; value: string; enabled: boolean; isFile?: boolean; fileName?: string }>;
};

function snippetRequestUrl(req: SnippetRequest) {
  const nextUrl = req.url || 'https://example.com';
  const paramsToAdd = req.params.filter(row => row.enabled && row.key);
  if (req.auth.type === 'apikey' && req.auth.keyIn === 'query' && req.auth.keyName) {
    paramsToAdd.push({ key: req.auth.keyName, value: req.auth.keyValue, enabled: true });
  }
  if (!paramsToAdd.length) return nextUrl;
  const joiner = nextUrl.includes('?') ? '&' : '?';
  return `${nextUrl}${joiner}${paramsToAdd.map(row => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`).join('&')}`;
}

function snippetHeaders(req: SnippetRequest) {
  const headers = req.headers.filter(r => r.enabled && r.key).map(r => ({ key: r.key, value: r.value }));
  if ((req.bodyType === 'json' || req.bodyType === 'graphql') && !headers.some(h => h.key.toLowerCase() === 'content-type'))
    headers.push({ key: 'Content-Type', value: 'application/json' });
  if (req.bodyType === 'text' && !headers.some(h => h.key.toLowerCase() === 'content-type'))
    headers.push({ key: 'Content-Type', value: 'text/plain' });
  if (req.bodyType === 'xml' && !headers.some(h => h.key.toLowerCase() === 'content-type'))
    headers.push({ key: 'Content-Type', value: 'application/xml' });
  if (req.auth.type === 'bearer' && req.auth.token) headers.push({ key: 'Authorization', value: `Bearer ${req.auth.token}` });
  if (req.auth.type === 'apikey' && req.auth.keyIn === 'header' && req.auth.keyName) headers.push({ key: req.auth.keyName, value: req.auth.keyValue });
  return headers;
}

function snippetBody(req: SnippetRequest) {
  if (['json', 'text', 'xml', 'html', 'graphql'].includes(req.bodyType)) return req.body;
  if (req.bodyType === 'urlencoded') {
    const sp = new URLSearchParams();
    for (const row of req.formData) if (row.enabled && row.key) sp.append(row.key, row.value);
    return sp.toString();
  }
  return '';
}

const js = JSON.stringify;

function buildFetchSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const lines = [`const response = await fetch(${js(snippetRequestUrl(req))}, {`, `  method: ${js(req.method)},`];
  if (headers.length) { lines.push('  headers: {'); for (const h of headers) lines.push(`    ${js(h.key)}: ${js(h.value)},`); lines.push('  },'); }
  if (body) lines.push(`  body: ${js(body)},`);
  lines.push('});', 'const data = await response.text();', 'console.log(data);');
  return lines.join('\n');
}

function buildPythonSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const lines = ['import requests', '', `url = ${js(snippetRequestUrl(req))}`];
  if (headers.length) { lines.push('headers = {'); for (const h of headers) lines.push(`    ${js(h.key)}: ${js(h.value)},`); lines.push('}'); }
  if (body) lines.push(`payload = ${js(body)}`);
  lines.push('', `response = requests.request(${js(req.method)}, url${headers.length ? ', headers=headers' : ''}${body ? ', data=payload' : ''})`, 'print(response.text)');
  return lines.join('\n');
}

function buildHttpieSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const parts = [`http ${req.method} ${snippetRequestUrl(req)}`];
  for (const h of headers) parts.push(`${h.key}:${h.value}`);
  if (body) parts.push(`body=${js(body)}`);
  return parts.join(' \\\n  ');
}

function buildGoSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const lines = ['package main', '', 'import (', '  "fmt"', '  "io"', '  "net/http"', body ? '  "strings"' : '', ')', '', 'func main() {',
    body ? `  payload := strings.NewReader(${js(body)})` : '  var payload io.Reader',
    `  req, err := http.NewRequest(${js(req.method)}, ${js(snippetRequestUrl(req))}, payload)`,
    '  if err != nil { panic(err) }',
  ].filter(Boolean);
  for (const h of headers) lines.push(`  req.Header.Set(${js(h.key)}, ${js(h.value)})`);
  lines.push('  res, err := http.DefaultClient.Do(req)', '  if err != nil { panic(err) }', '  defer res.Body.Close()', '  data, err := io.ReadAll(res.Body)', '  if err != nil { panic(err) }', '  fmt.Println(string(data))', '}');
  return lines.join('\n');
}

function buildJavaSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const ctHeader = headers.find(h => h.key.toLowerCase() === 'content-type')?.value || 'text/plain';
  const lines = ['OkHttpClient client = new OkHttpClient();',
    body ? `RequestBody body = RequestBody.create(${js(body)}, MediaType.parse(${js(ctHeader)}));` : 'RequestBody body = null;',
    'Request request = new Request.Builder()', `    .url(${js(snippetRequestUrl(req))})`,
  ];
  for (const h of headers) lines.push(`    .addHeader(${js(h.key)}, ${js(h.value)})`);
  lines.push(`    .method(${js(req.method)}, body)`, '    .build();', 'try (Response response = client.newCall(request).execute()) {', '    System.out.println(response.body().string());', '}');
  return lines.join('\n');
}

function buildCSharpSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const methodPascal = req.method[0] + req.method.slice(1).toLowerCase();
  const lines = ['using var client = new HttpClient();', `using var request = new HttpRequestMessage(HttpMethod.${methodPascal}, ${js(snippetRequestUrl(req))});`];
  for (const h of headers) { if (h.key.toLowerCase() !== 'content-type') lines.push(`request.Headers.TryAddWithoutValidation(${js(h.key)}, ${js(h.value)});`); }
  if (body) {
    const ct = headers.find(h => h.key.toLowerCase() === 'content-type')?.value || 'text/plain';
    lines.push(`request.Content = new StringContent(${js(body)}, Encoding.UTF8, ${js(ct)});`);
  }
  lines.push('using var response = await client.SendAsync(request);', 'Console.WriteLine(await response.Content.ReadAsStringAsync());');
  return lines.join('\n');
}

function buildPhpSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const lines = ['$curl = curl_init();', 'curl_setopt_array($curl, [', `  CURLOPT_URL => ${js(snippetRequestUrl(req))},`, '  CURLOPT_RETURNTRANSFER => true,', `  CURLOPT_CUSTOMREQUEST => ${js(req.method)},`];
  if (body) lines.push(`  CURLOPT_POSTFIELDS => ${js(body)},`);
  if (headers.length) { lines.push('  CURLOPT_HTTPHEADER => ['); for (const h of headers) lines.push(`    ${js(`${h.key}: ${h.value}`)},`); lines.push('  ],'); }
  lines.push(']);', '$response = curl_exec($curl);', 'curl_close($curl);', 'echo $response;');
  return lines.join('\n');
}

function buildRubySnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const methodName = req.method[0] + req.method.slice(1).toLowerCase();
  const lines = ["require 'net/http'", "require 'uri'", '', `uri = URI(${js(snippetRequestUrl(req))})`, `request = Net::HTTP::${methodName}.new(uri)`];
  for (const h of headers) lines.push(`request[${js(h.key)}] = ${js(h.value)}`);
  if (body) lines.push(`request.body = ${js(body)}`);
  lines.push('response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(request) }', 'puts response.body');
  return lines.join('\n');
}

function buildSwiftSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const lines = ['import Foundation', '', `var request = URLRequest(url: URL(string: ${js(snippetRequestUrl(req))})!)`, `request.httpMethod = ${js(req.method)}`];
  for (const h of headers) lines.push(`request.setValue(${js(h.value)}, forHTTPHeaderField: ${js(h.key)})`);
  if (body) lines.push(`request.httpBody = ${js(body)}.data(using: .utf8)`);
  lines.push('let (data, _) = try await URLSession.shared.data(for: request)', 'print(String(data: data, encoding: .utf8) ?? "")');
  return lines.join('\n');
}

function buildKotlinSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const ct = headers.find(h => h.key.toLowerCase() === 'content-type')?.value || 'text/plain';
  const lines = ['val client = OkHttpClient()', body ? `val body = ${js(body)}.toRequestBody(${js(ct)}.toMediaType())` : 'val body: RequestBody? = null', 'val request = Request.Builder()', `    .url(${js(snippetRequestUrl(req))})`];
  for (const h of headers) lines.push(`    .addHeader(${js(h.key)}, ${js(h.value)})`);
  lines.push(`    .method(${js(req.method)}, body)`, '    .build()', 'client.newCall(request).execute().use { response ->', '    println(response.body?.string())', '}');
  return lines.join('\n');
}

function buildAxiosSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const url = snippetRequestUrl(req);
  const lines = ["import axios from 'axios';", ''];
  const config: string[] = [];
  config.push(`  method: ${js(req.method.toLowerCase())},`);
  config.push(`  url: ${js(url)},`);
  if (headers.length) {
    config.push('  headers: {');
    for (const h of headers) config.push(`    ${js(h.key)}: ${js(h.value)},`);
    config.push('  },');
  }
  if (body) config.push(`  data: ${js(body)},`);
  lines.push('const response = await axios({');
  lines.push(...config);
  lines.push('});');
  lines.push('console.log(response.data);');
  return lines.join('\n');
}

function buildRustSnippet(req: SnippetRequest) {
  const headers = snippetHeaders(req);
  const body = snippetBody(req);
  const lines = ['let client = reqwest::Client::new();', `let response = client.request(reqwest::Method::${req.method}, ${js(snippetRequestUrl(req))})`];
  for (const h of headers) lines.push(`    .header(${js(h.key)}, ${js(h.value)})`);
  if (body) lines.push(`    .body(${js(body)})`);
  lines.push('    .send().await?;', 'println!("{}", response.text().await?);');
  return lines.join('\n');
}

export function buildSnippet(language: SnippetLanguage, req: SnippetRequest, curlFn: (r: SnippetRequest) => string): string {
  switch (language) {
    case 'go': return buildGoSnippet(req);
    case 'javascript': case 'node': return buildFetchSnippet(req);
    case 'python': return buildPythonSnippet(req);
    case 'java': return buildJavaSnippet(req);
    case 'csharp': return buildCSharpSnippet(req);
    case 'php': return buildPhpSnippet(req);
    case 'ruby': return buildRubySnippet(req);
    case 'swift': return buildSwiftSnippet(req);
    case 'kotlin': return buildKotlinSnippet(req);
    case 'rust': return buildRustSnippet(req);
    case 'httpie': return buildHttpieSnippet(req);
    case 'axios': return buildAxiosSnippet(req);
    default: return curlFn(req);
  }
}

function snippetTokenClass(token: string, language: SnippetLanguage) {
  if (/^['"]/.test(token)) return 'snippet-string';
  if (/^https?:\/\//.test(token)) return 'snippet-url';
  if (/^--?[A-Za-z0-9-]+$/.test(token)) return 'snippet-flag';
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(token)) return `snippet-method ${methodColor(token)}`;
  if (/^(curl|http|fetch|await|const|let|var|import|from|package|func|defer|if|err|nil|panic|return|requests|response|url|headers|payload|OkHttpClient|Request|RequestBody|HttpClient|HttpRequestMessage|HttpMethod|curl_init|curl_setopt_array|require|Net|HTTP|Foundation|URLRequest|URLSession|reqwest|Client|new|use|val|try|using|axios|method|data)$/.test(token)) return 'snippet-keyword';
  if (/^\d+$/.test(token)) return 'snippet-number';
  if (token === '\\') return 'snippet-punctuation';
  if (language === 'python' && /^(True|False|None)$/.test(token)) return 'snippet-keyword';
  return '';
}

function highlightSnippetLine(line: string, language: SnippetLanguage) {
  const tokenRE = /('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|https?:\/\/[^\s'"\\]+|--?[A-Za-z0-9-]+|\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|\b[A-Za-z_][A-Za-z0-9_]*\b|\d+|\\)/g;
  let html = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRE.exec(line)) !== null) {
    if (match.index > last) html += escapeHtml(line.slice(last, match.index));
    const token = match[0];
    const cls = snippetTokenClass(token, language);
    html += cls ? `<span class="${cls}">${escapeHtml(token)}</span>` : escapeHtml(token);
    last = match.index + token.length;
  }
  if (last < line.length) html += escapeHtml(line.slice(last));
  return html || '&nbsp;';
}

export function renderSnippetLines(source: string, language: SnippetLanguage): RenderedSnippetLine[] {
  return source.split(/\r\n|\r|\n/).map((line, idx) => ({
    number: idx + 1,
    html: highlightSnippetLine(line, language),
  }));
}
