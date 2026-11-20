import type { ApiMessage, LevelPreset, MessageStatus, ModePreset } from "./wire";

export type Kind = "text" | "image";
/** USD. Text: per million tokens. Image: per image. */
export type Price = { in: number; out: number } | { image: number };
export type ModelOption = { id: string; name: string; price: Price | null };
export type Seat = { handle: string; provider: string; kind: Kind; color: string; joined: boolean; default: string; models: ModelOption[] };
export type Role = { id: string; label: string; brief: string };
export type PriceSource = { checked: string; source: string; currency: "USD" };
export type Roster = { seats: Seat[]; roles: Role[]; prices: PriceSource; modes: ModePreset[]; levels: LevelPreset[] };
export type SeatChoice = { model: string; role: string | null; brief: string };
/** A seat with its chosen model and role applied: what components render. */
export type Member = { handle: string; name: string; provider: string; color: string; joined: boolean; kind: Kind; model: ModelOption; role: string | null };
export type Usage = { in: number; out: number };
export type ImageReply = { url: string; prompt: string };
export type ChatMessage = { id: string; seq: number; status: MessageStatus; author: string; text: string;
  askedBy?: string | null; streaming?: boolean; usage?: Usage; seconds?: number; stop?: string; error?: string;
  notice?: boolean; model?: string; role?: string | null; cost?: number | null; image?: ImageReply };
export const HUMAN = "you";

/** A saved message as the page renders it: nulls become absent fields. */
export function toMessage(message: ApiMessage): ChatMessage {
  return {
    id: message.id,
    seq: message.seq,
    status: message.status,
    author: message.author,
    text: message.text,
    askedBy: message.askedBy ?? undefined,
    streaming: message.status === "streaming",
    usage: message.usage ?? undefined,
    seconds: message.seconds ?? undefined,
    stop: message.stop ?? undefined,
    error: message.error ?? undefined,
    notice: message.notice || undefined,
    model: message.model ?? undefined,
    role: message.role ?? undefined,
    cost: message.cost ?? undefined,
    image: message.image ?? undefined,
  };
}
