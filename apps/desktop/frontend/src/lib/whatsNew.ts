// "What's new" on the first launch after an update.
//
// The notes come from CHANGELOG.md, embedded at build time (see WhatsNewModal),
// so the screen works offline and always describes the build that is actually
// running — unlike the updater's notes, which describe a release being fetched.

export type ChangelogSection = {
  version: string;
  date: string;
  body: string;
};

const VERSION_HEADING = /^##\s+\[?([^\]\s]+)\]?(?:\s*[-–]\s*(.+))?\s*$/;

/** Splits a Keep-a-Changelog document into per-version sections, newest first. */
export function parseChangelog(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;

  for (const line of String(markdown || '').replace(/\r\n?/g, '\n').split('\n')) {
    const heading = line.match(VERSION_HEADING);
    if (heading) {
      if (current) sections.push(finishSection(current));
      current = { version: heading[1].trim(), date: (heading[2] ?? '').trim(), body: '' };
      continue;
    }
    // A "---" rule separates releases in this changelog; it isn't content.
    if (current && line.trim() === '---') continue;
    if (current) current.body += line + '\n';
  }
  if (current) sections.push(finishSection(current));
  return sections;
}

function finishSection(section: ChangelogSection): ChangelogSection {
  return { ...section, body: section.body.trim() };
}

export function normalizeVersion(version: string): string {
  return String(version || '').trim().replace(/^v/i, '');
}

/**
 * Compares dotted numeric versions. Returns >0 when `a` is newer, <0 when
 * older, 0 when equal. Non-numeric suffixes are ignored, which is enough for
 * the release scheme Relay uses.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    normalizeVersion(value)
      .split('.')
      .map(part => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True for builds that have no published notes (dev builds, empty version). */
export function isReleaseVersion(version: string): boolean {
  const normalized = normalizeVersion(version);
  return normalized !== '' && normalized !== 'dev' && /^\d/.test(normalized);
}

export function releaseNotesFor(markdown: string, version: string): ChangelogSection | null {
  const wanted = normalizeVersion(version);
  if (!wanted) return null;
  return parseChangelog(markdown).find(section => normalizeVersion(section.version) === wanted) ?? null;
}

/**
 * The newest released section, skipping an "Unreleased" heading. Used when the
 * running build has no matching entry — a dev build, or a release whose notes
 * were not recorded — so opening the notes from Settings still shows something.
 */
export function latestReleaseNotes(markdown: string): ChangelogSection | null {
  return parseChangelog(markdown).find(section => /^\d/.test(normalizeVersion(section.version))) ?? null;
}

/**
 * Decides whether the "What's new" screen should open on this launch.
 *
 * A fresh install shows nothing — there is no previous version to have been
 * surprised by, and greeting a first-time user with a changelog is noise. A
 * downgrade shows nothing either, so a rollback doesn't re-announce features
 * the user just moved away from.
 */
export function shouldShowWhatsNew(current: string, lastSeen: string | null, hasNotes: boolean): boolean {
  if (!isReleaseVersion(current)) return false;
  if (!hasNotes) return false;
  if (!lastSeen) return false;
  return compareVersions(current, lastSeen) > 0;
}

export type WhatsNewItem = { text: string; children: string[] };
export type WhatsNewBlock = { heading: string; items: WhatsNewItem[] };

/**
 * Turns a section body into headed bullet groups for rendering. Nested list
 * items stay nested: changelog entries like `relay run` carry several
 * sub-bullets, and folding them into the parent produces a wall of text.
 */
export function formatSectionBlocks(body: string): WhatsNewBlock[] {
  const blocks: WhatsNewBlock[] = [];
  let current: WhatsNewBlock | null = null;

  const lastItem = () => (current && current.items.length ? current.items[current.items.length - 1] : null);

  for (const raw of String(body || '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      current = { heading: heading[1], items: [] };
      blocks.push(current);
      continue;
    }

    const bullet = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bullet) {
      if (!current) {
        current = { heading: '', items: [] };
        blocks.push(current);
      }
      const text = bullet[2].trim();
      const parent = lastItem();
      if (bullet[1].length > 0 && parent) {
        parent.children.push(text);
      } else {
        current.items.push({ text, children: [] });
      }
      continue;
    }

    // A wrapped continuation line belongs to the bullet above it.
    const parent = lastItem();
    if (parent) {
      if (parent.children.length > 0) {
        parent.children[parent.children.length - 1] += ` ${line.trim()}`;
      } else {
        parent.text += ` ${line.trim()}`;
      }
    }
  }

  return blocks.filter(block => block.items.length > 0);
}

/** Strips inline markdown emphasis and code ticks for plain-text rendering. */
export function stripInlineMarkdown(text: string): string {
  return String(text || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
