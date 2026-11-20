import type { ChatMessage, Member, Usage } from "./types";

const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const cents = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const small = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });

/** 12345 -> "12.3K". */
export function compact(count: number): string {
  return compactFormat.format(count);
}

/** A dollar figure sized to its magnitude: "$1.23", "$0.12", "$0.0042", "$0". */
export function money(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd >= 0.01) return `$${cents.format(usd)}`;
  return `$${small.format(usd)}`;
}

export type CostRow = {
  /** The model id, or "@handle" for replies stored before 0.2 that carry no model. */
  key: string;
  handle: string;
  name: string;
  color: string;
  replies: number;
  images: number;
  /** Replies stopped before the model reported tokens: billed by Bedrock, but no figure reached us. */
  stopped: number;
  tokens: Usage;
  /** Null when none of this row's replies has a known cost. */
  cost: number | null;
};

export type CostSummary = { rows: CostRow[]; total: number; tokens: Usage; unpriced: boolean; stopped: number };

/** Add up what each model has cost in this chat. The figures come from the server; no price math here. */
export function costRows(
  messages: ChatMessage[],
  members: Record<string, Member>,
  modelNames: Record<string, string>,
): CostSummary {
  const rows = new Map<string, CostRow>();
  const tokens: Usage = { in: 0, out: 0 };
  let unpriced = false;
  let stopped = 0;
  for (const message of messages) {
    // Counted apart, never as a free reply: the figures below leave it out and the table says so.
    const cut = message.status === "stopped" && !message.usage && !message.image && typeof message.cost !== "number";
    if (!message.usage && !message.image && !cut) continue;
    const key = message.model ?? `@${message.author}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        handle: message.author,
        name: message.model ? (modelNames[message.model] ?? message.model) : `@${message.author} (earlier)`,
        color: members[message.author]?.color ?? "var(--color-text-tertiary)",
        replies: 0,
        images: 0,
        stopped: 0,
        tokens: { in: 0, out: 0 },
        cost: null,
      };
      rows.set(key, row);
    }
    if (cut) {
      row.stopped += 1;
      stopped += 1;
      continue;
    }
    if (message.image) row.images += 1;
    else row.replies += 1;
    if (message.usage) {
      row.tokens.in += message.usage.in;
      row.tokens.out += message.usage.out;
      tokens.in += message.usage.in;
      tokens.out += message.usage.out;
    }
    if (typeof message.cost === "number") row.cost = (row.cost ?? 0) + message.cost;
    else unpriced = true;
  }
  const sorted = [...rows.values()].sort(
    (a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokens.in + b.tokens.out - (a.tokens.in + a.tokens.out),
  );
  const total = sorted.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  return { rows: sorted, total, tokens, unpriced, stopped };
}

/** The one-line total: money once anything is priced, otherwise the token count. */
export function totalLabel(summary: CostSummary): string {
  if (summary.rows.some((row) => row.cost !== null)) return money(summary.total);
  const count = summary.tokens.in + summary.tokens.out;
  return count > 0 ? `${compact(count)} tokens` : "$0";
}
