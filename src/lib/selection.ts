// Which recipients are ticked. Lives in localStorage rather than the sheet
// because it is a per-person choice that changes on every run — and because
// the dashboard (which fires the trigger) and the Accounts page (which edits
// the list) are separate routes that both need to see it.

export const SELECTION_KEY = "octane8:selected-recipients";

export function readSelection(): string[] {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // Storage disabled or corrupt value — behave as if nothing is selected.
    return [];
  }
}

export function writeSelection(emails: string[]): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(emails));
  } catch {
    // Private mode / storage full. In-memory state still drives this session.
  }
}
