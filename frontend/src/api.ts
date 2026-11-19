import { apiFetch, errorFrom } from "./auth";
import { createChat } from "./client";
import type { Roster } from "./types";
import type { ChatSettings, ImportMessage, SeatSetting } from "./wire";

export async function fetchRoster(): Promise<Roster> {
  const response = await apiFetch("/api/roster");
  if (!response.ok) throw await errorFrom(response);
  return response.json();
}

const IMPORTED = "confab.imported";

function readOld(key: string): unknown {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? null : JSON.parse(saved);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One message stored by the page before 0.3, in the shape the import route takes, or null to skip it. */
function oldMessage(value: unknown): ImportMessage | null {
  if (!isRecord(value) || typeof value.author !== "string" || typeof value.text !== "string") return null;
  const usage = value.usage;
  const image = value.image;
  const message: ImportMessage = { author: value.author, text: value.text };
  if (typeof value.askedBy === "string") message.askedBy = value.askedBy;
  if (typeof value.model === "string") message.model = value.model;
  if (typeof value.role === "string") message.role = value.role;
  if (isRecord(usage) && typeof usage.in === "number" && typeof usage.out === "number") {
    message.usage = { in: usage.in, out: usage.out };
  }
  if (typeof value.seconds === "number") message.seconds = value.seconds;
  if (typeof value.stop === "string") message.stop = value.stop;
  if (typeof value.error === "string") message.error = value.error;
  if (value.notice === true) message.notice = true;
  if (typeof value.cost === "number") message.cost = value.cost;
  if (isRecord(image) && typeof image.url === "string" && typeof image.prompt === "string") {
    message.image = { url: image.url, prompt: image.prompt };
  }
  // A reply that never got a word, a picture, an error or a bill out (a reload mid-round) was an empty bubble.
  const said = message.notice || message.text || message.image || message.error || message.usage;
  return said ? message : null;
}

/**
 * Local mode only, once: the chat the page kept in localStorage before chats moved to the server becomes a chat
 * called "Earlier chat", with the room it was set up with. The old keys stay where they are.
 */
export async function importEarlierChat(roster: Roster): Promise<void> {
  if (localStorage.getItem(IMPORTED) !== null) return;
  const stored = readOld("confab.messages");
  if (!Array.isArray(stored)) return;
  const messages = stored.map(oldMessage).filter((message) => message !== null).slice(-2000);
  if (messages.length === 0) return;

  // The server refuses unknown handles, models and roles, so only what the roster still offers goes across.
  const joined = readOld("confab.joined");
  const choices = readOld("confab.seats");
  const preferred = readOld("confab.default");
  const hops = readOld("confab.maxHops");
  const roleIds = new Set(roster.roles.map((role) => role.id));
  const members = roster.seats
    .filter((seat) => (Array.isArray(joined) ? joined.includes(seat.handle) : seat.joined))
    .map((seat) => seat.handle);
  const seats: Record<string, SeatSetting> = {};
  for (const seat of roster.seats) {
    const saved = isRecord(choices) ? choices[seat.handle] : undefined;
    if (!isRecord(saved)) continue;
    const model = seat.models.some((option) => option.id === saved.model) ? String(saved.model) : seat.default;
    const role =
      seat.kind === "text" && typeof saved.role === "string" && (saved.role === "custom" || roleIds.has(saved.role))
        ? saved.role
        : null;
    seats[seat.handle] = { model, role, brief: typeof saved.brief === "string" ? saved.brief.slice(0, 200) : "" };
  }
  const settings: ChatSettings = {
    members,
    seats,
    default: typeof preferred === "string" && members.includes(preferred) ? preferred : null,
    max_hops: typeof hops === "number" && Number.isInteger(hops) ? Math.min(Math.max(hops, 0), 20) : 6,
    mode: null,
  };

  const chat = await createChat({ title: "Earlier chat", settings, messages });
  localStorage.setItem(IMPORTED, chat.id);
}
