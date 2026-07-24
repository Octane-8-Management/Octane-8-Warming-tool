// Pure helpers for the recipient master list. No Sheets, no browser APIs —
// everything here is deliberately testable in isolation.

// Deliberately loose. The goal is catching paste accidents (stray words,
// missing @), not enforcing RFC 5322.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

// Emails are normalised to lowercase and trimmed everywhere.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Accepts whatever the user pasted — newline-separated, comma-separated,
// semicolon-separated, or a mix — and normalises to lowercase.
export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.length > 0);
}

export function mergeEmails(
  existing: string[],
  incoming: string[]
): { merged: string[]; added: string[]; invalid: string[] } {
  const seen = new Set(existing);
  const merged = [...existing];
  const added: string[] = [];
  const invalid: string[] = [];

  for (const email of incoming) {
    if (!isValidEmail(email)) {
      invalid.push(email);
      continue;
    }
    if (seen.has(email)) continue;

    seen.add(email);
    merged.push(email);
    added.push(email);
  }

  return { merged, added, invalid };
}
