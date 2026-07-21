function readErrorText(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    for (const key of ['message', 'error', 'reason']) {
      if (typeof record[key] === 'string') return record[key];
    }
    try {
      return JSON.stringify(raw);
    } catch {
      return '';
    }
  }
  return raw == null ? '' : String(raw);
}

function containsAny(source: string, values: string[]): boolean {
  return values.some(value => source.includes(value));
}

export function friendlyUpdateError(raw: unknown, action: string): string {
  const base = `Could not ${action}.`;
  const fallback = `${base} Please try again in a moment.`;
  const text = readErrorText(raw).trim();
  if (!text) return `${base} Please check your internet connection and try again.`;
  if (text.startsWith(base)) return text;

  const lower = text.toLowerCase();
  if (containsAny(lower, ['timeout', 'timed out', 'deadline exceeded', 'i/o timeout'])) {
    return `${base} The request timed out. Check your internet connection and try again.`;
  }
  if (containsAny(lower, ['tls', 'ssl', 'certificate', 'x509'])) {
    return `${base} A secure connection could not be established. Check your network settings and try again.`;
  }
  if (containsAny(lower, [
    'no such host',
    'dns',
    'network is unreachable',
    'no route to host',
    'connection refused',
    'connection reset',
    'connection aborted',
    'temporary failure',
    'dial tcp',
    'econnrefused',
    'econnreset',
    'enotfound',
  ])) {
    return `${base} Relay could not reach the update service. Check your internet connection and try again.`;
  }
  if (containsAny(lower, ['permission', 'access denied', 'operation not permitted'])) {
    return `${base} Relay does not have permission to replace the app. Try again after restarting the app.`;
  }
  if (lower.includes('no release asset')) {
    return `${base} No compatible update package is available for this device yet.`;
  }
  if (containsAny(lower, ['rate limit', 'too many requests', 'update metadata returned', 'download returned'])) {
    return `${base} The update service is temporarily unavailable. Please try again later.`;
  }
  if (lower.includes('checksum')) {
    return `${base} The downloaded update could not be verified. Please try again later.`;
  }
  return fallback;
}
