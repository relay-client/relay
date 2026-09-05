import { describe, expect, it } from 'vitest';
import { parseCurl, toCurl } from '../lib/curl';
import { DEFAULT_REQUEST_SETTINGS, mkRow } from '../lib/constants';
import { requestBodyFeature } from '../lib/stores/features/requestBody';

function makeHost() {
  return {
    requestType: 'http',
    url: '',
    params: [mkRow()],
    method: 'GET',
    followRedirects: DEFAULT_REQUEST_SETTINGS.followRedirects,
    reqHeaders: [mkRow()],
    authType: 'none',
    bearerToken: '',
    basicUser: '',
    basicPass: '',
    apiKeyValue: '',
    oauth2Token: '',
    awsAccessKey: '',
    awsSecretKey: '',
    bodyType: 'none',
    rawBodyType: 'json',
    bodyContent: '',
    bodyFilePath: '',
    bodyFileName: '',
    formRows: [mkRow()],
    requestTab: 'params',
    enableSSLVerification: DEFAULT_REQUEST_SETTINGS.enableSSLVerification,
    timeoutMs: DEFAULT_REQUEST_SETTINGS.timeoutMs,
    proxyUrl: DEFAULT_REQUEST_SETTINGS.proxyUrl,
    resetBodyState() {
      this.bodyContent = '';
      this.bodyFilePath = '';
      this.bodyFileName = '';
      this.formRows = [mkRow()];
    },
  };
}

function paste(command: string) {
  const host = makeHost();
  const parsed = parseCurl(command);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestBodyFeature.applyParsedCurl.call(host as any, parsed);
  return host;
}

const baseCurlRequest = {
  method: 'POST',
  url: 'https://example.test/things',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: '',
  formData: [],
};

describe('toCurl declares the Content-Type the sender declares', () => {
  it.each([
    ['xml', '<a/>', 'application/xml'],
    ['html', '<p>hi</p>', 'text/html'],
    ['text', 'plain words', 'text/plain'],
    ['json', '{"a":1}', 'application/json'],
    ['graphql', '{"query":"{ me }"}', 'application/json'],
  ])('%s body carries %s', (bodyType, body, expected) => {
    const curl = toCurl({ ...baseCurlRequest, bodyType, body });
    expect(curl).toContain(`-H 'Content-Type: ${expected}'`);
  });

  it('leaves a Content-Type the user typed alone', () => {
    const curl = toCurl({
      ...baseCurlRequest,
      bodyType: 'xml',
      body: '<a/>',
      headers: [{ key: 'Content-Type', value: 'application/soap+xml', enabled: true }],
    });
    expect(curl).toContain('application/soap+xml');
    expect(curl).not.toContain("-H 'Content-Type: application/xml'");
  });

  it('sends a body opening with @ literally', () => {
    const curl = toCurl({ ...baseCurlRequest, bodyType: 'text', body: '@not-a-file' });
    expect(curl).toContain("--data-raw '@not-a-file'");
    expect(curl).not.toMatch(/(^|\s)-d /);
  });

  it('still labels an empty raw body on a method that carries one', () => {
    const curl = toCurl({ ...baseCurlRequest, bodyType: 'json', body: '' });
    expect(curl).toContain("-H 'Content-Type: application/json'");
  });

  it('leaves GET with an empty raw body alone', () => {
    const curl = toCurl({ ...baseCurlRequest, method: 'GET', bodyType: 'json', body: '' });
    expect(curl).not.toContain('Content-Type');
    expect(curl).not.toContain('--data-raw');
  });
});

describe('pasting a curl command keeps what the parser found', () => {
  it('keeps a form part Content-Type', () => {
    const host = paste(
      `curl 'https://example.test/upload' -F 'avatar=@/tmp/a.png;type=image/png' -F 'meta={"a":1};type=application/json'`,
    );
    expect(host.formRows[0]).toMatchObject({ key: 'avatar', isFile: true, contentType: 'image/png' });
    expect(host.formRows[1]).toMatchObject({ key: 'meta', contentType: 'application/json' });
  });

  it('round-trips a part Content-Type back out again', () => {
    const host = paste(`curl 'https://example.test/upload' -F 'avatar=@/tmp/a.png;type=image/png'`);
    const curl = toCurl({
      ...baseCurlRequest,
      bodyType: 'form',
      formData: host.formRows.filter(row => row.key),
    });
    expect(curl).toContain(';type=image/png');
  });

  it('maps -k onto the SSL verification setting', () => {
    expect(paste(`curl -k 'https://self-signed.test/'`).enableSSLVerification).toBe(false);
    expect(paste(`curl --insecure 'https://self-signed.test/'`).enableSSLVerification).toBe(false);
    expect(paste(`curl 'https://example.test/'`).enableSSLVerification).toBe(true);
  });

  it('maps --max-time onto the timeout', () => {
    expect(paste(`curl -m 5 'https://example.test/'`).timeoutMs).toBe(5000);
    expect(paste(`curl --max-time 0.5 'https://example.test/'`).timeoutMs).toBe(500);
  });

  it('maps --proxy onto the proxy URL', () => {
    expect(paste(`curl -x 'http://proxy.test:8080' 'https://example.test/'`).proxyUrl).toBe('http://proxy.test:8080');
  });

  it('ignores a max-time that is not a usable number', () => {
    expect(paste(`curl -m nonsense 'https://example.test/'`).timeoutMs).toBe(DEFAULT_REQUEST_SETTINGS.timeoutMs);
  });

  it('does not touch the settings a command says nothing about', () => {
    const host = paste(`curl 'https://example.test/'`);
    expect(host.timeoutMs).toBe(DEFAULT_REQUEST_SETTINGS.timeoutMs);
    expect(host.proxyUrl).toBe(DEFAULT_REQUEST_SETTINGS.proxyUrl);
  });
});
