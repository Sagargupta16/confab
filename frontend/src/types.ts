export type Member = {
  handle: string;
  name: string;
  provider: string;
  color: string;
  joined: boolean;
};

export type Usage = { in: number; out: number };

export type ChatMessage = {
  id: string;
  /** "you" for the human, otherwise a member handle. */
  author: string;
  text: string;
  /** The model whose mention triggered this reply; null when you asked. */
  askedBy?: string | null;
  streaming?: boolean;
  usage?: Usage;
  seconds?: number;
  stop?: string;
  error?: string;
  /** A line from the app itself, such as "stopped at the hop cap". */
  notice?: boolean;
};

export type ChatEvent =
  | { type: "start"; handle: string; askedBy: string | null }
  | { type: "delta"; handle: string; text: string }
  | { type: "end"; handle: string; usage: Usage; stop: string; seconds: number }
  | { type: "error"; handle: string; message: string }
  | { type: "done"; hops: number; capped: string[] };

export const HUMAN = "you";
