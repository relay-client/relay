// Dynamic variables resolve at send time instead of coming from an
// environment: {{$guid}}, {{$timestamp}}, {{$randomEmail}} and friends. The
// names match Postman's, so collections imported from it keep working — before
// this, every one of them failed with "unresolved variable".
//
// Each occurrence is resolved independently, exactly like Postman: two
// {{$guid}} in one request produce two different ids.

export type DynamicVariable = {
  name: string;
  description: string;
  generate: () => string;
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(values: readonly T[]): T {
  return values[randomInt(0, values.length - 1)];
}

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = randomInt(0, 15);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function hex(length: number) {
  let out = '';
  for (let index = 0; index < length; index += 1) out += randomInt(0, 15).toString(16);
  return out;
}

function alphaNumericChar() {
  return pick('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''));
}

function offsetDate(msFromNow: number) {
  return new Date(Date.now() + msFromNow).toISOString();
}

const FIRST_NAMES = ['Ada', 'Grace', 'Alan', 'Linus', 'Barbara', 'Dennis', 'Radia', 'Ken', 'Margaret', 'Edsger', 'Katherine', 'Tim'] as const;
const LAST_NAMES = ['Lovelace', 'Hopper', 'Turing', 'Torvalds', 'Liskov', 'Ritchie', 'Perlman', 'Thompson', 'Hamilton', 'Dijkstra', 'Johnson', 'Berners-Lee'] as const;
const CITIES = ['Lisbon', 'Osaka', 'Nairobi', 'Toronto', 'Helsinki', 'Bogota', 'Warsaw', 'Auckland', 'Reykjavik', 'Seoul'] as const;
const COUNTRIES = ['Portugal', 'Japan', 'Kenya', 'Canada', 'Finland', 'Colombia', 'Poland', 'New Zealand', 'Iceland', 'South Korea'] as const;
const COUNTRY_CODES = ['PT', 'JP', 'KE', 'CA', 'FI', 'CO', 'PL', 'NZ', 'IS', 'KR'] as const;
const STREETS = ['Maple Street', 'Harbour Road', 'Rua das Flores', 'Station Avenue', 'Kings Way', 'Cedar Lane'] as const;
const COMPANY_PREFIXES = ['North', 'Bright', 'Iron', 'Quantum', 'Cedar', 'Atlas', 'Nimbus', 'Vertex'] as const;
const COMPANY_SUFFIXES = ['Labs', 'Systems', 'Works', 'Industries', 'Group', 'Collective'] as const;
const JOB_TITLES = ['Backend Engineer', 'Product Designer', 'Data Analyst', 'Site Reliability Engineer', 'Support Lead', 'QA Engineer'] as const;
const WORDS = ['orbit', 'lantern', 'harbor', 'signal', 'ember', 'thicket', 'meridian', 'cobalt', 'quarry', 'drift', 'plateau', 'willow'] as const;
const COLORS = ['red', 'green', 'blue', 'cyan', 'magenta', 'olive', 'teal', 'indigo', 'amber'] as const;
const MIME_TYPES = ['application/json', 'text/plain', 'text/html', 'image/png', 'application/pdf', 'application/xml'] as const;
const FILE_EXTENSIONS = ['json', 'txt', 'csv', 'png', 'pdf', 'xml', 'yaml'] as const;
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'SEK', 'CAD'] as const;
const CURRENCY_NAMES = ['US Dollar', 'Euro', 'Pound Sterling', 'Yen', 'Swiss Franc', 'Swedish Krona', 'Canadian Dollar'] as const;
const CURRENCY_SYMBOLS = ['$', '€', '£', '¥', 'CHF', 'kr', 'C$'] as const;
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
] as const;

function sentence() {
  const length = randomInt(5, 10);
  const words = Array.from({ length }, () => pick(WORDS));
  return `${words[0][0].toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(' ')}.`;
}

function domainWord() {
  return `${pick(WORDS)}${pick(WORDS)}`;
}

function userName() {
  return `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase().replace(/[^a-z]/g, '')}`;
}

const DEFINITIONS: DynamicVariable[] = [
  { name: '$guid', description: 'UUID v4', generate: uuid },
  { name: '$randomUUID', description: 'UUID v4', generate: uuid },
  { name: '$timestamp', description: 'Unix timestamp (seconds)', generate: () => String(Math.floor(Date.now() / 1000)) },
  { name: '$isoTimestamp', description: 'Current time, ISO 8601', generate: () => new Date().toISOString() },
  { name: '$randomInt', description: 'Integer, 0–1000', generate: () => String(randomInt(0, 1000)) },
  { name: '$randomBoolean', description: '"true" or "false"', generate: () => String(Math.random() < 0.5) },
  { name: '$randomAlphaNumeric', description: 'Single alphanumeric character', generate: alphaNumericChar },
  { name: '$randomFirstName', description: 'First name', generate: () => pick(FIRST_NAMES) },
  { name: '$randomLastName', description: 'Last name', generate: () => pick(LAST_NAMES) },
  { name: '$randomFullName', description: 'Full name', generate: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}` },
  { name: '$randomUserName', description: 'Username', generate: userName },
  { name: '$randomEmail', description: 'Email address', generate: () => `${userName()}@${domainWord()}.com` },
  { name: '$randomExampleEmail', description: 'Email on example.com', generate: () => `${userName()}@example.com` },
  { name: '$randomPhoneNumber', description: 'Phone number', generate: () => `${randomInt(200, 999)}-${randomInt(200, 999)}-${String(randomInt(0, 9999)).padStart(4, '0')}` },
  { name: '$randomIP', description: 'IPv4 address', generate: () => Array.from({ length: 4 }, () => randomInt(1, 254)).join('.') },
  { name: '$randomIPV6', description: 'IPv6 address', generate: () => Array.from({ length: 8 }, () => hex(4)).join(':') },
  { name: '$randomMACAddress', description: 'MAC address', generate: () => Array.from({ length: 6 }, () => hex(2)).join(':') },
  { name: '$randomDomainName', description: 'Domain name', generate: () => `${domainWord()}.com` },
  { name: '$randomDomainWord', description: 'Domain word', generate: domainWord },
  { name: '$randomUrl', description: 'URL', generate: () => `https://${domainWord()}.com/${pick(WORDS)}` },
  { name: '$randomProtocol', description: '"http" or "https"', generate: () => pick(['http', 'https'] as const) },
  { name: '$randomPort', description: 'Port number', generate: () => String(randomInt(1024, 65535)) },
  { name: '$randomPassword', description: 'Password', generate: () => Array.from({ length: 15 }, alphaNumericChar).join('') },
  { name: '$randomColor', description: 'Colour name', generate: () => pick(COLORS) },
  { name: '$randomHexColor', description: 'Hex colour', generate: () => `#${hex(6)}` },
  { name: '$randomCity', description: 'City', generate: () => pick(CITIES) },
  { name: '$randomCountry', description: 'Country', generate: () => pick(COUNTRIES) },
  { name: '$randomCountryCode', description: 'ISO country code', generate: () => pick(COUNTRY_CODES) },
  { name: '$randomStreetAddress', description: 'Street address', generate: () => `${randomInt(1, 999)} ${pick(STREETS)}` },
  { name: '$randomLatitude', description: 'Latitude', generate: () => (Math.random() * 180 - 90).toFixed(6) },
  { name: '$randomLongitude', description: 'Longitude', generate: () => (Math.random() * 360 - 180).toFixed(6) },
  { name: '$randomCompanyName', description: 'Company name', generate: () => `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)}` },
  { name: '$randomJobTitle', description: 'Job title', generate: () => pick(JOB_TITLES) },
  { name: '$randomWord', description: 'Single word', generate: () => pick(WORDS) },
  { name: '$randomWords', description: 'Several words', generate: () => Array.from({ length: randomInt(2, 5) }, () => pick(WORDS)).join(' ') },
  { name: '$randomLoremSentence', description: 'Sentence', generate: sentence },
  { name: '$randomLoremParagraph', description: 'Paragraph', generate: () => Array.from({ length: randomInt(3, 5) }, sentence).join(' ') },
  { name: '$randomDatePast', description: 'ISO date in the past year', generate: () => offsetDate(-randomInt(1, 365) * 86_400_000) },
  { name: '$randomDateFuture', description: 'ISO date in the next year', generate: () => offsetDate(randomInt(1, 365) * 86_400_000) },
  { name: '$randomDateRecent', description: 'ISO date in the last week', generate: () => offsetDate(-randomInt(1, 7) * 86_400_000) },
  { name: '$randomBankAccount', description: 'Bank account number', generate: () => String(randomInt(10_000_000, 99_999_999)) },
  { name: '$randomCreditCardMask', description: 'Masked card digits', generate: () => String(randomInt(1000, 9999)) },
  { name: '$randomCurrencyCode', description: 'Currency code', generate: () => pick(CURRENCY_CODES) },
  { name: '$randomCurrencyName', description: 'Currency name', generate: () => pick(CURRENCY_NAMES) },
  { name: '$randomCurrencySymbol', description: 'Currency symbol', generate: () => pick(CURRENCY_SYMBOLS) },
  { name: '$randomPrice', description: 'Price', generate: () => `${randomInt(1, 999)}.${String(randomInt(0, 99)).padStart(2, '0')}` },
  { name: '$randomMimeType', description: 'MIME type', generate: () => pick(MIME_TYPES) },
  { name: '$randomFileExt', description: 'File extension', generate: () => pick(FILE_EXTENSIONS) },
  { name: '$randomFileName', description: 'File name', generate: () => `${pick(WORDS)}_${pick(WORDS)}.${pick(FILE_EXTENSIONS)}` },
  { name: '$randomSemver', description: 'Semantic version', generate: () => `${randomInt(0, 9)}.${randomInt(0, 20)}.${randomInt(0, 20)}` },
  { name: '$randomUserAgent', description: 'Browser User-Agent', generate: () => pick(USER_AGENTS) },
];

const BY_NAME = new Map(DEFINITIONS.map(definition => [definition.name, definition]));

export const DYNAMIC_VARIABLES: readonly DynamicVariable[] = DEFINITIONS;

export function isDynamicVariableName(name: string): boolean {
  return BY_NAME.has(name.trim());
}

/** Returns a freshly generated value, or null when the name isn't a known dynamic variable. */
export function resolveDynamicVariable(name: string): string | null {
  const definition = BY_NAME.get(name.trim());
  return definition ? definition.generate() : null;
}

/**
 * True when the value still contains a `{{$…}}` that Relay doesn't implement.
 * Used to explain the failure instead of sending "{{$notAThing}}" to the server.
 */
export function unknownDynamicVariables(value: string): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(/\{\{\s*(\$[A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!isDynamicVariableName(match[1])) found.add(match[1]);
  }
  return [...found];
}
