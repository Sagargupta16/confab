// Same rule as the backend (chat.py): an @ that does not follow a word character,
// another @ or a dot, then a handle. Keeps mail addresses out.
export const MENTION = /(?<![\w@.])@([a-z][a-z0-9-]*)/gi;

/** Turn known @handles into Markdown links (#m-handle) so the renderer can style them. */
export function linkMentions(text: string, handles: Set<string>): string {
  return text.replace(MENTION, (whole, handle: string) => {
    const key = handle.toLowerCase();
    return key === "all" || handles.has(key) ? `[@${key}](#m-${key})` : whole;
  });
}

/** The handle being typed right before the caret, or null when the caret is not in one. */
export function mentionAtCaret(text: string, caret: number): { start: number; prefix: string } | null {
  const match = /(^|\s)@([a-z0-9-]*)$/i.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[2].length - 1, prefix: match[2].toLowerCase() };
}
