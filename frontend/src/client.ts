// The chats API. Every call goes through apiFetch (base URL, bearer token, one shared refresh)
// and throws ApiError{status, detail} on a non-2xx answer.

import { API_BASE, ApiError, apiFetch, errorFrom } from "./auth";
import type {
  ApiMessage, ChatFull, ChatHead, ChatSettings, ChatSummary, Health, ImportMessage, Me, RoundEvent,
} from "./wire";

export { ApiError };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Public: no token, and a 401 here is never a reason to refresh. */
export async function getHealth(): Promise<Health> {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as Health;
}

export function getMe(): Promise<Me> {
  return request<Me>("/api/auth/me");
}

export async function listChats(): Promise<ChatSummary[]> {
  return (await request<{ chats: ChatSummary[] }>("/api/chats")).chats;
}

export function createChat(
  body: { title?: string; settings?: ChatSettings; messages?: ImportMessage[] } = {},
): Promise<ChatFull> {
  return request<ChatFull>("/api/chats", jsonInit("POST", body));
}

export function getChat(id: string): Promise<ChatFull> {
  return request<ChatFull>(`/api/chats/${encodeURIComponent(id)}`);
}

export function patchChat(id: string, body: { title?: string; settings?: ChatSettings }): Promise<ChatHead> {
  return request<ChatHead>(`/api/chats/${encodeURIComponent(id)}`, jsonInit("PATCH", body));
}

export function deleteChat(id: string): Promise<void> {
  return request<void>(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function clearChat(id: string): Promise<void> {
  return request<void>(`/api/chats/${encodeURIComponent(id)}/messages`, { method: "DELETE" });
}

export function getMessages(id: string, fromSeq: number): Promise<{ messages: ApiMessage[]; running: boolean }> {
  return request(`/api/chats/${encodeURIComponent(id)}/messages?from_seq=${fromSeq}`);
}

export function stopRound(id: string): Promise<{ stopping: boolean }> {
  return request(`/api/chats/${encodeURIComponent(id)}/stop`, { method: "POST" });
}

/** Run one round. Calls onEvent for every server-sent event until the stream ends. */
export async function streamRound(
  body: { chat_id: string; text: string; human_name: string },
  onEvent: (event: RoundEvent) => void,
  signal: AbortSignal,
  onPing?: () => void,
): Promise<void> {
  const response = await apiFetch("/api/chat", { ...jsonInit("POST", body), signal });
  if (!response.ok) throw await errorFrom(response);
  if (!response.body) throw new ApiError(response.status, "The server sent no stream.");

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
      // A frame starting with ":" is the server's ping.
      if (frame.startsWith("data: ")) onEvent(JSON.parse(frame.slice(6)) as RoundEvent);
      else if (frame.startsWith(":")) onPing?.();
      cut = buffer.indexOf("\n\n");
    }
  }
}
