import type { ChatEvent, Member } from "./types";

export async function fetchRoster(): Promise<Member[]> {
  const response = await fetch("/api/roster");
  if (!response.ok) throw new Error(`roster: HTTP ${response.status}`);
  return response.json();
}

export type ChatBody = {
  messages: { author: string; text: string }[];
  members: string[];
  default: string | null;
  max_hops: number;
  human_name: string;
};

/** Run one round. Calls onEvent for every server-sent event until the stream ends. */
export async function streamChat(
  body: ChatBody,
  onEvent: (event: ChatEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`chat: HTTP ${response.status} ${detail.slice(0, 200)}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      if (frame.startsWith("data: ")) onEvent(JSON.parse(frame.slice(6)) as ChatEvent);
      cut = buffer.indexOf("\n\n");
    }
  }
}
