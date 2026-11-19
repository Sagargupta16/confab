export type Kind = "text" | "image";
/** USD. Text: per million tokens. Image: per image. */
export type Price = { in: number; out: number } | { image: number };
export type ModelOption = { id: string; name: string; price: Price | null };
export type Seat = { handle: string; provider: string; kind: Kind; color: string; joined: boolean; default: string; models: ModelOption[] };
export type Role = { id: string; label: string; brief: string };
export type PriceSource = { checked: string; source: string; currency: "USD" };
export type Roster = { seats: Seat[]; roles: Role[]; prices: PriceSource };
export type SeatChoice = { model: string; role: string | null; brief: string };
/** A seat with its chosen model and role applied: what components render. */
export type Member = { handle: string; name: string; provider: string; color: string; joined: boolean; kind: Kind; model: ModelOption; role: string | null };
export type Usage = { in: number; out: number };
export type ImageReply = { url: string; prompt: string };
export type ChatMessage = { id: string; author: string; text: string; askedBy?: string | null; streaming?: boolean;
  usage?: Usage; seconds?: number; stop?: string; error?: string; notice?: boolean;
  model?: string; role?: string | null; cost?: number | null; image?: ImageReply };
export type ChatEvent =
  | { type: "start"; handle: string; askedBy: string | null; model: string; role: string | null }
  | { type: "delta"; handle: string; text: string }
  | { type: "end"; handle: string; usage: Usage; stop: string; seconds: number; cost: number | null }
  | { type: "image"; handle: string; url: string; prompt: string; seconds: number; cost: number | null }
  | { type: "error"; handle: string; message: string }
  | { type: "done"; hops: number; capped: string[] };
export const HUMAN = "you";
