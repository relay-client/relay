export function cleanReleaseNotes(notes: string): string {
  const cleaned = String(notes || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => !line.trim().startsWith('**Full Changelog**'))
    .join('\n')
    .trim();

  if (!cleaned) return '';

  const lines = cleaned.split('\n');
  if (/^what'?s new in v?\d+(?:\.\d+){0,2}/i.test(lines[0]?.trim() ?? '') && lines.length > 1) {
    return cleanReleaseNotes(lines.slice(1).join('\n'));
  }
  if (/^release v?\d+(?:\.\d+){0,2}$/i.test(lines[0]?.trim() ?? '') && lines.length > 1) {
    return cleanReleaseNotes(lines.slice(1).join('\n'));
  }

  if (!cleaned.includes('\n') && /\s+\+\s+/.test(cleaned)) {
    return cleaned
      .split(/\s+\+\s+/)
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => `- ${item}`)
      .join('\n');
  }

  return cleaned;
}
