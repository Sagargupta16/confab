// The JSON the API speaks, mirrored from .scratch/hosted-design.md. Chat objects and settings
// are snake_case; messages and server-sent events keep the page's names (askedBy).

export type ServerMode = "local" | "hosted";
export type Health = { status: string; version: string; mode: ServerMode };
export type Me = { id: number; github_id: number; login: string; name: string | null };
export type Tokens = { access_token: string; refresh_token: string; token_type?: string };

export type SeatSetting = { model: string; role: string | null; brief: string };
export type ChatSettings = {
  members: string[];
  seats: Record<string, SeatSetting>;
  default: string | null;
  max_hops: number;
  mode: string | null;
};

export type ChatSummary = {
  id: string;
  title: string;
  mode: string | null;
  running: boolean;
  created_at: string;
  updated_at: string;
};
export type ChatHead = ChatSummary & { settings: ChatSettings };

export type MessageStatus = "streaming" | "done" | "error" | "stopped";
export type ApiMessage = {
  id: string;
  seq: number;
  author: string;
  text: string;
  status: MessageStatus;
  notice: boolean;
  askedBy: string | null;
  model: string | null;
  role: string | null;
  usage: { in: number; out: number } | null;
  seconds: number | null;
  stop: string | null;
  cost: number | null;
  error: string | null;
  image: { url: string; prompt: string } | null;
};
export type ChatFull = ChatHead & { messages: ApiMessage[] };

export type ImportMessage = {
  author: string;
  text: string;
  askedBy?: string | null;
  model?: string;
  role?: string | null;
  usage?: { in: number; out: number };
  seconds?: number;
  stop?: string;
  error?: string;
  notice?: boolean;
  cost?: number | null;
  image?: { url: string; prompt: string };
};

export type ModePreset = {
  id: string;
  label: string;
  description: string;
  members: string[];
  roles: Record<string, string>;
  default: string | null;
  max_hops: number;
};

/** A cost level: one pick that sets every seat's model by price. Nothing is stored for it; see App's pickLevel. */
export type LevelPreset = {
  id: "cheap" | "medium" | "intense";
  label: string;
  description: string;
  /** The model id it picks, for every seat in the roster. */
  models: Record<string, string>;
};

export type RoundReason = "complete" | "hops" | "time" | "stopped" | "failed";
export type RoundEvent =
  | { type: "accepted"; round_id: string; title: string; message: ApiMessage }
  | { type: "start"; id: string; seq: number; handle: string; askedBy: string | null; model: string; role: string | null }
  | { type: "delta"; id: string; handle: string; text: string }
  | { type: "end"; id: string; handle: string; usage: { in: number; out: number }; stop: string; seconds: number; cost: number | null }
  | { type: "image"; id: string; handle: string; url: string; prompt: string; seconds: number; cost: number | null }
  | { type: "error"; id: string; handle: string; message: string }
  | { type: "stopped"; id: string; handle: string; kept: boolean }
  | { type: "notice"; message: ApiMessage }
  | { type: "done"; hops: number; capped: string[]; reason: RoundReason };
