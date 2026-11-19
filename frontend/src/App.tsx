import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "./AuthGate";
import { fetchRoster, importEarlierChat } from "./api";
import {
  ApiError,
  clearChat,
  createChat,
  deleteChat,
  getChat,
  getMessages,
  listChats,
  patchChat,
  stopRound,
  streamRound,
} from "./client";
import { ChatHeader, ClearButton, HopsSelect, ModeSelect, NameField } from "./components/ChatHeader";
import { ChatList } from "./components/ChatList";
import { Composer } from "./components/Composer";
import { CostTable } from "./components/CostTable";
import { MessageList } from "./components/MessageList";
import { Panel } from "./components/Panel";
import { Roster } from "./components/Roster";
import { Sidebar, type Tab } from "./components/Sidebar";
import { costRows, totalLabel } from "./cost";
import {
  HUMAN,
  toMessage,
  type ChatMessage,
  type Member,
  type Roster as RosterData,
  type Role,
  type SeatChoice,
  type Usage,
} from "./types";
import type { ChatFull, ChatSettings, ChatSummary, RoundEvent, SeatSetting } from "./wire";

/** State that survives a reload, kept in localStorage under one key. */
function useStored<T>(key: string, initial: T): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : (JSON.parse(saved) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}

/** The label a role shows as: the preset's name, or a custom brief cut to 40 characters at a word. */
function roleLabel(choice: SeatChoice, roles: Role[]): string | null {
  if (choice.role !== "custom") return roles.find((role) => role.id === choice.role)?.label ?? null;
  const brief = choice.brief.trim().replace(/\s+/g, " ");
  if (brief.length <= 40) return brief || null;
  const cut = brief.lastIndexOf(" ", 40);
  return `${brief.slice(0, cut > 0 ? cut : 40)}...`;
}

/** Tailwind's lg breakpoint: below it the room is an overlay (and below md the chat list is a drawer). */
const LG_AND_UP = "(min-width: 64rem)";
const LAST_CHAT = "confab.chat";
const POLL_MS = 2000;
/** After the page comes back, a stream that has said nothing for this long hands over to polling. */
const QUIET_MS = 20_000;
/**
 * The server pings every 15 s, so a stream with neither a frame nor a ping for this long is dead.
 * Read the saved round instead: polling loses nothing, it only updates every 2 s.
 */
const SILENT_MS = 45_000;
const FAILED = "The round failed. The API log has the details.";

/** The one page-side stream reader: at most one, always for the open chat. */
type Reader = {
  chatId: string;
  controller: AbortController;
  text: string;
  tempId: string;
  lastFrame: number;
  accepted: boolean;
  finished: boolean;
  stopAsked: boolean;
};

/** Rows only this page has: the human message before the server saves it, and lines the server never stored. */
const isLocal = (message: ChatMessage) => message.id.startsWith("tmp-") || message.id.startsWith("local-");

function lastSeq(messages: ChatMessage[]): number {
  return messages.reduce((top, message) => (isLocal(message) ? top : Math.max(top, message.seq)), 0);
}

/** Where a catch-up read starts: the oldest reply still streaming, else just past the newest saved row. */
function resumeFrom(messages: ChatMessage[]): number {
  const open = messages.filter((message) => message.streaming && !isLocal(message)).map((message) => message.seq);
  return open.length > 0 ? Math.min(...open) : lastSeq(messages) + 1;
}

const bySeq = (a: ChatMessage, b: ChatMessage) => a.seq - b.seq;

/** Fold a page of saved rows (seq >= fromSeq) into what the page shows. */
function merge(local: ChatMessage[], fresh: ChatMessage[], fromSeq: number): ChatMessage[] {
  const waiting = new Map(fresh.map((message) => [message.id, message]));
  const kept = local.flatMap((message) => {
    const saved = waiting.get(message.id);
    if (saved) {
      waiting.delete(message.id);
      // The server flushes a reply at most once a second, so its copy can lag what the stream already showed.
      if (saved.streaming && message.text.length > saved.text.length && message.text.startsWith(saved.text)) {
        return [{ ...saved, text: message.text }];
      }
      return [saved];
    }
    if (message.id.startsWith("local-")) return [message];
    // Not returned although in range: the server deleted it (a stopped reply with no words) or never saved it.
    return message.seq >= fromSeq ? [] : [message];
  });
  return [...kept, ...waiting.values()].sort(bySeq);
}

/** Nothing streams once a round is over; a reply that never said a word is dropped rather than left empty. */
function settle(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => !(message.streaming && !message.text && !message.image))
    .map((message) =>
      message.streaming ? { ...message, streaming: false, status: message.status === "streaming" ? "stopped" : message.status } : message,
    );
}

function notice(messages: ChatMessage[], text: string): ChatMessage {
  const top = messages.reduce((max, message) => Math.max(max, message.seq), 0);
  return { id: `local-${crypto.randomUUID()}`, seq: top + 0.5, status: "done", author: HUMAN, notice: true, text };
}

function newestFirst(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function summaryOf(chat: ChatFull): ChatSummary {
  const { id, title, mode, running, created_at, updated_at } = chat;
  return { id, title, mode, running, created_at, updated_at };
}

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : "Could not reach the server. Check the connection and try again.";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function App({ session }: { session: Session }) {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [opening, setOpening] = useState(true);
  const [openError, setOpenError] = useState("");
  /** The server has a round running in the open chat, started here or on another device. */
  const [running, setRunning] = useState(false);
  /** This page posted a message and the server has not accepted it yet. */
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [humanName, setHumanName] = useStored<string>("confab.name", "You");
  const [draft, setDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("members");
  const [focusToken, setFocusToken] = useState(0);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);

  const openRef = useRef<string | null>(null);
  const latest = useRef(messages);
  latest.current = messages;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const settingsRef = useRef<ChatSettings | null>(null);
  const reader = useRef<Reader | null>(null);
  const poller = useRef<{ chatId: string; cancelled: boolean } | null>(null);
  const patches = useRef<{ timer: number | null; pending: { id: string; settings: ChatSettings } | null; chain: Promise<void> }>(
    { timer: null, pending: null, chain: Promise.resolve() },
  );
  /** When a round on this page last ended, so a list read that lags the lock release does not restart a tail. */
  const lastDone = useRef(0);
  const booted = useRef(false);

  const say = useCallback((text: string) => setToast({ key: Date.now(), text }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  function putSettings(next: ChatSettings | null) {
    settingsRef.current = next;
    setSettings(next);
  }

  const seats = useMemo(() => roster?.seats ?? [], [roster]);
  const roles = useMemo(() => roster?.roles ?? [], [roster]);
  const modes = useMemo(() => roster?.modes ?? [], [roster]);

  // A saved model that a seat no longer offers falls back to its default; an unknown role becomes no role.
  const choices = useMemo(() => {
    const roleIds = new Set(roles.map((role) => role.id));
    const saved = settings?.seats ?? {};
    const clean: Record<string, SeatChoice> = {};
    for (const seat of seats) {
      const choice = saved[seat.handle];
      const model = choice && seat.models.some((option) => option.id === choice.model) ? choice.model : seat.default;
      const role =
        seat.kind === "text" && choice?.role && (choice.role === "custom" || roleIds.has(choice.role)) ? choice.role : null;
      clean[seat.handle] = { model, role, brief: typeof choice?.brief === "string" ? choice.brief : "" };
    }
    return clean;
  }, [seats, roles, settings]);

  const members = useMemo(() => {
    const built: Record<string, Member> = {};
    for (const seat of seats) {
      const choice = choices[seat.handle];
      const model = seat.models.find((option) => option.id === choice.model) ?? seat.models[0];
      built[seat.handle] = {
        handle: seat.handle,
        name: model.name,
        provider: seat.provider,
        color: seat.color,
        joined: seat.joined,
        kind: seat.kind,
        model,
        role: roleLabel(choice, roles),
      };
    }
    return built;
  }, [seats, choices, roles]);

  const modelNames = useMemo(
    () => Object.fromEntries(seats.flatMap((seat) => seat.models.map((model) => [model.id, model.name]))),
    [seats],
  );

  const joined = useMemo(() => new Set(settings?.members ?? []), [settings]);
  const present = useMemo(
    () => seats.filter((seat) => joined.has(seat.handle)).map((seat) => members[seat.handle]),
    [seats, joined, members],
  );
  const preferred = settings?.default ?? null;
  const answersByDefault = preferred && joined.has(preferred) ? preferred : (present[0]?.handle ?? null);

  const { totals, costs } = useMemo(() => {
    const tokens: Record<string, Usage> = {};
    const spent: Record<string, number> = {};
    for (const message of messages) {
      if (message.usage) {
        const entry = (tokens[message.author] ??= { in: 0, out: 0 });
        entry.in += message.usage.in;
        entry.out += message.usage.out;
      }
      if (typeof message.cost === "number") spent[message.author] = (spent[message.author] ?? 0) + message.cost;
    }
    return { totals: tokens, costs: spent };
  }, [messages]);
  const summary = useMemo(() => costRows(messages, members, modelNames), [messages, members, modelNames]);
  const total = totalLabel(summary);
  const speaking = useMemo(
    () => new Set(messages.filter((message) => message.streaming).map((message) => message.author)),
    [messages],
  );

  const busy = sending || running;
  const current = chats?.find((chat) => chat.id === chatId) ?? null;
  // The open chat's dot follows this page's own view of the round, which is fresher than the last list read.
  const listed = useMemo(
    () => chats?.map((chat) => (chat.id === chatId ? { ...chat, running: busy } : chat)) ?? null,
    [chats, chatId, busy],
  );

  // ---- settings: optimistic here, saved with one PATCH per pause; a round waits for the pending one ----

  function flushPatch(): Promise<void> {
    const queue = patches.current;
    if (queue.timer !== null) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }
    const job = queue.pending;
    if (job) {
      queue.pending = null;
      queue.chain = queue.chain.then(async () => {
        try {
          const head = await patchChat(job.id, { settings: job.settings });
          setChats(
            (all) =>
              all &&
              newestFirst(
                all.map((chat) => (chat.id === head.id ? { ...chat, mode: head.mode, updated_at: head.updated_at } : chat)),
              ),
          );
        } catch (error) {
          say(errorText(error));
          // Show the room the server will actually use.
          if (openRef.current === job.id && !queue.pending) {
            getChat(job.id)
              .then((full) => openRef.current === job.id && !queue.pending && putSettings(full.settings))
              .catch(() => undefined);
          }
        }
      });
    }
    return queue.chain;
  }

  function updateSettings(change: (now: ChatSettings) => ChatSettings) {
    const id = openRef.current;
    const now = settingsRef.current;
    if (!id || !now) return;
    const next = change(now);
    putSettings(next);
    setChats((all) => all && all.map((chat) => (chat.id === id ? { ...chat, mode: next.mode } : chat)));
    const queue = patches.current;
    queue.pending = { id, settings: next };
    if (queue.timer !== null) clearTimeout(queue.timer);
    queue.timer = window.setTimeout(() => void flushPatch(), 400);
  }

  function toggle(handle: string) {
    updateSettings((now) => {
      const next = new Set(now.members);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return { ...now, members: seats.filter((seat) => next.has(seat.handle)).map((seat) => seat.handle), mode: null };
    });
  }

  function choose(handle: string, patch: Partial<SeatChoice>) {
    // A different model keeps the mode; a different role or brief makes the room your own.
    const custom = "role" in patch || "brief" in patch;
    updateSettings((now) => ({
      ...now,
      seats: { ...now.seats, [handle]: { ...choices[handle], ...patch } },
      mode: custom ? null : now.mode,
    }));
  }

  function pickMode(id: string | null) {
    if (id === null) {
      updateSettings((now) => ({ ...now, mode: null }));
      return;
    }
    const preset = modes.find((mode) => mode.id === id);
    if (!preset) return;
    updateSettings((now) => {
      const seated: Record<string, SeatSetting> = {};
      for (const seat of seats) {
        const role = preset.roles[seat.handle] ?? null;
        // Each seat keeps its model and any brief you wrote; the roles are the preset's.
        if (now.seats[seat.handle] || role) seated[seat.handle] = { ...choices[seat.handle], role };
      }
      return {
        members: seats.filter((seat) => preset.members.includes(seat.handle)).map((seat) => seat.handle),
        seats: seated,
        default: preset.default,
        max_hops: preset.max_hops,
        mode: preset.id,
      };
    });
  }

  // ---- rounds ----

  function endRound() {
    lastDone.current = Date.now();
    setRunning(false);
    setSending(false);
    setStopping(false);
    void refreshChats();
  }

  /** Read the saved round every 2 s until the server says it is over. */
  async function catchUp(id: string, lost?: string) {
    if (poller.current?.chatId === id) return;
    if (poller.current) poller.current.cancelled = true;
    const tail = { chatId: id, cancelled: false };
    poller.current = tail;
    let first = true;
    try {
      for (;;) {
        const fromSeq = resumeFrom(latest.current);
        let page: Awaited<ReturnType<typeof getMessages>>;
        try {
          page = await getMessages(id, fromSeq);
        } catch (error) {
          if (tail.cancelled) return;
          if (error instanceof ApiError && error.status === 404) {
            endRound();
            return;
          }
          // Offline or a flaky network: try again shortly. A quiet line is never an error.
          await wait(POLL_MS);
          if (tail.cancelled) return;
          continue;
        }
        if (tail.cancelled) return;
        const fresh = page.messages.map(toMessage);
        setMessages((all) => merge(all, fresh, fromSeq));
        if (first && lost !== undefined && !fresh.some((message) => message.author === HUMAN && !message.notice)) {
          // The message never reached the server: give it back.
          setDraft((text) => text || lost);
          setMessages((all) => [...all, notice(all, "That message did not go through. It is back in the box.")]);
        }
        first = false;
        if (!page.running) {
          setMessages(settle);
          endRound();
          return;
        }
        setRunning(true);
        await wait(POLL_MS);
        if (tail.cancelled) return;
      }
    } finally {
      if (poller.current === tail) poller.current = null;
    }
  }

  async function refreshChats() {
    try {
      const list = newestFirst(await listChats());
      setChats(list);
      const open = openRef.current;
      const mine = list.find((chat) => chat.id === open);
      // Another device started a round here: follow it, and the composer waits for it.
      if (open && mine?.running && !reader.current && !poller.current && Date.now() - lastDone.current > 5000) {
        void catchUp(open);
      }
    } catch {
      // The next refresh tries again.
    }
  }

  const apply = (event: RoundEvent, r: Reader) => {
    switch (event.type) {
      case "accepted": {
        const saved = toMessage(event.message);
        setSending(false);
        setMessages((all) => [...all.filter((message) => message.id !== r.tempId && message.id !== saved.id), saved].sort(bySeq));
        const stamp = new Date().toISOString();
        setChats(
          (all) =>
            all &&
            newestFirst(all.map((chat) => (chat.id === r.chatId ? { ...chat, title: event.title, updated_at: stamp } : chat))),
        );
        if (r.stopAsked) void stopRound(r.chatId).catch(() => undefined);
        return;
      }
      case "start": {
        const reply: ChatMessage = {
          id: event.id,
          seq: event.seq,
          status: "streaming",
          author: event.handle,
          text: "",
          askedBy: event.askedBy,
          streaming: true,
          model: event.model,
          role: event.role,
        };
        setMessages((all) => (all.some((message) => message.id === reply.id) ? all : [...all, reply].sort(bySeq)));
        return;
      }
      case "notice": {
        const line = toMessage(event.message);
        setMessages((all) => (all.some((message) => message.id === line.id) ? all : [...all, line].sort(bySeq)));
        return;
      }
      case "done":
        r.finished = true;
        setMessages((all) => {
          const done = settle(all);
          return event.reason === "failed" ? [...done, notice(done, FAILED)] : done;
        });
        endRound();
        return;
      default:
        setMessages((all) => {
          const index = all.findIndex((message) => message.id === event.id);
          if (index === -1) return all;
          const now = all[index];
          if (event.type === "delta") return all.with(index, { ...now, text: now.text + event.text });
          if (event.type === "end") {
            return all.with(index, {
              ...now,
              status: "done",
              streaming: false,
              usage: event.usage,
              seconds: event.seconds,
              stop: event.stop,
              cost: event.cost,
            });
          }
          if (event.type === "image") {
            return all.with(index, {
              ...now,
              status: "done",
              streaming: false,
              image: { url: event.url, prompt: event.prompt },
              seconds: event.seconds,
              cost: event.cost,
            });
          }
          if (event.type === "error") {
            return all.with(index, { ...now, status: "error", streaming: false, error: event.message });
          }
          // Stopped: the kept part stays; a reply that had said nothing was deleted on the server too.
          return event.kept ? all.with(index, { ...now, status: "stopped", streaming: false }) : all.toSpliced(index, 1);
        });
    }
  };

  async function send(text: string) {
    const id = openRef.current;
    if (!id || busy) return;
    if (present.length === 0) {
      say("Add a member to this chat first.");
      return;
    }
    setSending(true);
    setStopping(false);
    setDraft("");
    await flushPatch();
    if (openRef.current !== id) {
      setSending(false);
      setDraft((now) => now || text);
      return;
    }
    const tempId = `tmp-${crypto.randomUUID()}`;
    setMessages((all) => [...all, { id: tempId, seq: lastSeq(all) + 1, status: "done", author: HUMAN, text }]);
    setRunning(true);
    const r: Reader = {
      chatId: id,
      controller: new AbortController(),
      text,
      tempId,
      lastFrame: Date.now(),
      accepted: false,
      finished: false,
      stopAsked: false,
    };
    reader.current = r;
    try {
      await streamRound(
        { chat_id: id, text, human_name: humanName.trim() || "You" },
        (event) => {
          if (reader.current !== r) return;
          r.lastFrame = Date.now();
          if (event.type === "accepted") r.accepted = true;
          apply(event, r);
        },
        r.controller.signal,
        () => {
          // The server's ping every 15 s: quiet but alive, so it is not handed to polling.
          if (reader.current === r) r.lastFrame = Date.now();
        },
      );
      if (reader.current !== r) return;
      reader.current = null;
      // The stream closed without a done: the round may still be going on the server.
      if (!r.finished) void catchUp(id, r.accepted ? undefined : text);
    } catch (error) {
      // Aborted for a chat switch or handed to polling: whoever did that owns the round now.
      if (reader.current !== r) return;
      reader.current = null;
      if (!r.accepted && error instanceof ApiError && error.status < 500) {
        // Refused before the round began, so nothing was saved: the message goes back in the box.
        setMessages((all) => {
          const rest = all.filter((message) => message.id !== tempId);
          return [...rest, notice(rest, error.detail)];
        });
        setDraft((now) => now || text);
        setSending(false);
        setRunning(false);
        // Already running here, from another device: follow that round.
        if (error.status === 409) void catchUp(id);
        return;
      }
      void catchUp(id, r.accepted ? undefined : text);
    }
  }

  async function stop() {
    const id = openRef.current;
    if (!id) return;
    setStopping(true);
    if (reader.current && !reader.current.accepted) reader.current.stopAsked = true;
    try {
      await stopRound(id);
    } catch (error) {
      setStopping(false);
      say(errorText(error));
      return;
    }
    // Keep reading: the stream (or the catch-up) carries the stopped reply and the done.
    if (!reader.current && !poller.current) void catchUp(id);
  }

  // ---- chats ----

  /** Leave the open chat: its round, if any, keeps going on the server. */
  function detach() {
    const r = reader.current;
    reader.current = null;
    r?.controller.abort();
    if (poller.current) poller.current.cancelled = true;
    poller.current = null;
  }

  function enter(id: string) {
    void flushPatch();
    detach();
    openRef.current = id;
    setChatId(id);
    try {
      localStorage.setItem(LAST_CHAT, id);
    } catch {
      // storage unavailable: the newest chat opens next time
    }
    setDrawerOpen(false);
    setOpenError("");
    setRunning(false);
    setSending(false);
    setStopping(false);
  }

  function show(full: ChatFull) {
    putSettings(full.settings);
    setMessages(full.messages.map(toMessage));
    setRunning(full.running);
    setOpening(false);
    setChats((all) => {
      const others = (all ?? []).filter((chat) => chat.id !== full.id);
      return newestFirst([...others, summaryOf(full)]);
    });
    if (full.running) void catchUp(full.id);
  }

  async function openChat(id: string) {
    if (id === openRef.current && !openError) {
      setDrawerOpen(false);
      return;
    }
    enter(id);
    setOpening(true);
    setMessages([]);
    putSettings(null);
    try {
      const full = await getChat(id);
      if (openRef.current === id) show(full);
    } catch (error) {
      if (openRef.current !== id) return;
      if (error instanceof ApiError && error.status === 404) {
        // Deleted on another device.
        const rest = (chatsRef.current ?? []).filter((chat) => chat.id !== id);
        setChats(rest);
        openRef.current = null;
        if (rest[0]) void openChat(rest[0].id);
        else void create(null);
        return;
      }
      setOpening(false);
      setOpenError(errorText(error));
    }
  }

  async function create(base: ChatSettings | null) {
    try {
      const made = await createChat(base ? { settings: { ...base } } : {});
      enter(made.id);
      show(made);
      setFocusToken((token) => token + 1);
    } catch (error) {
      setOpening(false);
      say(errorText(error));
    }
  }

  async function newChat() {
    // The open chat is still empty: use it rather than pile up blank chats.
    if (current && current.title === "New chat" && latest.current.length === 0 && !busy) {
      setDrawerOpen(false);
      setFocusToken((token) => token + 1);
      return;
    }
    await flushPatch();
    // A new chat starts with the room you have set up here.
    await create(settingsRef.current);
  }

  async function rename(id: string, title: string) {
    const before = chatsRef.current?.find((chat) => chat.id === id)?.title;
    setChats((all) => all && all.map((chat) => (chat.id === id ? { ...chat, title } : chat)));
    try {
      const head = await patchChat(id, { title });
      setChats((all) => all && all.map((chat) => (chat.id === id ? { ...chat, title: head.title } : chat)));
    } catch (error) {
      if (before !== undefined) setChats((all) => all && all.map((chat) => (chat.id === id ? { ...chat, title: before } : chat)));
      say(errorText(error));
    }
  }

  async function remove(id: string) {
    const chat = chatsRef.current?.find((item) => item.id === id);
    if (!chat || !confirm(`Delete "${chat.title}"? Its messages and pictures go too.`)) return;
    try {
      await deleteChat(id);
    } catch (error) {
      say(errorText(error));
      return;
    }
    const all = chatsRef.current ?? [];
    const at = all.findIndex((item) => item.id === id);
    const rest = all.filter((item) => item.id !== id);
    setChats(rest);
    if (openRef.current !== id) return;
    detach();
    openRef.current = null;
    const next = rest[Math.min(Math.max(at, 0), rest.length - 1)];
    if (next) void openChat(next.id);
    else void create(settingsRef.current);
  }

  async function clear() {
    const id = openRef.current;
    if (!id || busy || latest.current.length === 0 || !confirm("Clear the whole chat?")) return;
    try {
      await clearChat(id);
      if (openRef.current === id) setMessages([]);
      setRoomOpen(false);
    } catch (error) {
      say(errorText(error));
    }
  }

  // ---- boot, and the phone coming back ----

  // Kept current on a ref so the listeners set up once always call this render's functions.
  const live = useRef({ refreshChats, catchUp });
  live.current = { refreshChats, catchUp };

  useEffect(() => {
    // StrictMode runs effects twice; the import and the first chat must happen once.
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        const loaded = await fetchRoster();
        setRoster(loaded);
        if (session.mode === "local") {
          try {
            await importEarlierChat(loaded);
          } catch {
            // left in place: the next load tries again
          }
        }
        const list = newestFirst(await listChats());
        setChats(list);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(LAST_CHAT);
        } catch {
          // storage unavailable
        }
        const pick = list.find((chat) => chat.id === saved) ?? list[0];
        if (pick) await openChat(pick.id);
        else await create(null);
      } catch (error) {
        setLoadError(errorText(error));
        setOpening(false);
      }
    })();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    function handOff(r: Reader) {
      reader.current = null;
      r.controller.abort();
      void live.current.catchUp(r.chatId, r.accepted ? undefined : r.text);
    }
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void live.current.refreshChats();
      const r = reader.current;
      if (!r) return;
      const since = Date.now();
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        // The phone locked mid-round and the stream has said nothing since: read the saved round instead.
        if (reader.current === r && r.lastFrame < since) handOff(r);
      }, QUIET_MS);
    }
    const watchdog = setInterval(() => {
      const r = reader.current;
      if (r && Date.now() - r.lastFrame > SILENT_MS) handOff(r);
    }, 10_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
      clearInterval(watchdog);
    };
  }, []);

  // While a round runs in another chat, its dot is kept honest.
  const elsewhere = Boolean(chats?.some((chat) => chat.id !== chatId && chat.running));
  useEffect(() => {
    if (!elsewhere) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void live.current.refreshChats();
    }, 5000);
    return () => clearInterval(timer);
  }, [elsewhere]);

  useEffect(
    () => () => {
      reader.current?.controller.abort();
      if (poller.current) poller.current.cancelled = true;
    },
    [],
  );

  // ---- layout ----

  function mention(handle: string) {
    setDraft((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}@${handle} `);
    setFocusToken((token) => token + 1);
    setRoomOpen(false);
  }

  function showRoom(next: Tab) {
    setTab(next);
    if (!window.matchMedia(LG_AND_UP).matches) setRoomOpen(true);
  }

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeRoom = useCallback(() => setRoomOpen(false), []);
  const ready = settings !== null && roster !== null;
  const maxHops = settings?.max_hops ?? 6;
  const canClear = ready && !busy && messages.length > 0;

  const panel = (id: string) => (
    <Sidebar
      id={id}
      tab={tab}
      onTab={setTab}
      memberCount={`${joined.size}/${seats.length}`}
      costLabel={total}
      members={
        <Roster
          seats={seats}
          members={members}
          choices={choices}
          roles={roles}
          joined={joined}
          defaultHandle={answersByDefault}
          totals={totals}
          costs={costs}
          speaking={speaking}
          onToggle={toggle}
          onDefault={(handle) => updateSettings((now) => ({ ...now, default: handle }))}
          onMention={mention}
          onChoose={choose}
        />
      }
      cost={<CostTable summary={summary} prices={roster?.prices ?? null} />}
    />
  );

  const list = (id: string, onClose?: () => void) => (
    <ChatList
      id={id}
      chats={listed}
      activeId={chatId}
      modes={modes}
      session={session}
      onOpen={(next) => void openChat(next)}
      onNew={() => void newChat()}
      onRename={(target, title) => void rename(target, title)}
      onDelete={(target) => void remove(target)}
      onClose={onClose}
    />
  );

  const preset = modes.find((mode) => mode.id === settings?.mode);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-panel/40 md:block">{list("aside")}</aside>
      <Panel
        open={drawerOpen}
        side="left"
        onClose={closeDrawer}
        label="Chats"
        hideAt="md:hidden"
        width="w-[min(19rem,86vw)]"
      >
        {list("drawer", closeDrawer)}
      </Panel>

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          title={current?.title ?? null}
          onRename={(title) => chatId && void rename(chatId, title)}
          modes={modes}
          mode={settings?.mode ?? null}
          onMode={pickMode}
          present={present}
          speaking={speaking}
          costLabel={total}
          costActive={tab === "cost"}
          onCost={() => showRoom("cost")}
          onMembers={() => showRoom("members")}
          humanName={humanName}
          onName={setHumanName}
          maxHops={maxHops}
          onHops={(hops) => updateSettings((now) => ({ ...now, max_hops: hops }))}
          canClear={canClear}
          onClear={() => void clear()}
          roomOpen={roomOpen}
          onRoom={() => setRoomOpen((open) => !open)}
          onMenu={() => setDrawerOpen(true)}
          ready={ready}
        />

        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-w-0 flex-1 flex-col">
            {loadError ? (
              <div className="m-auto max-w-md px-6 text-center" role="alert">
                <p className="text-sm text-danger">Could not load confab: {loadError}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 h-10 rounded-lg border border-line px-4 text-sm text-ink transition-colors hover:border-accent"
                >
                  Try again
                </button>
              </div>
            ) : openError ? (
              <div className="m-auto max-w-md px-6 text-center" role="alert">
                <p className="text-sm text-danger">{openError}</p>
                <button
                  type="button"
                  onClick={() => chatId && void openChat(chatId)}
                  className="mt-4 h-10 rounded-lg border border-line px-4 text-sm text-ink transition-colors hover:border-accent"
                >
                  Try again
                </button>
              </div>
            ) : opening ? (
              <div className="m-auto flex items-center gap-1.5" aria-label="Opening the chat">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-2 rounded-full bg-accent"
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
                  />
                ))}
              </div>
            ) : (
              <MessageList
                key={chatId ?? "none"}
                messages={messages}
                members={members}
                modelNames={modelNames}
                humanName={humanName.trim() || "You"}
                imageInRoom={present.some((member) => member.kind === "image")}
                onSuggest={(text) => {
                  setDraft(text);
                  setFocusToken((token) => token + 1);
                }}
              />
            )}
            <Composer
              draft={draft}
              onDraft={setDraft}
              members={present}
              busy={busy}
              stopping={stopping}
              focusToken={focusToken}
              onSend={(text) => void send(text)}
              onStop={() => void stop()}
            />
            <AnimatePresence>
              {toast && (
                <motion.p
                  key={toast.key}
                  role="status"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-x-3 bottom-24 z-20 mx-auto w-fit max-w-[min(28rem,calc(100%-1.5rem))] rounded-lg border border-line bg-raised px-4 py-2 text-center text-sm text-ink"
                >
                  {toast.text}
                </motion.p>
              )}
            </AnimatePresence>
          </main>
          <aside className="hidden w-72 shrink-0 flex-col border-l border-line lg:flex">{panel("aside")}</aside>
        </div>
      </div>

      <Panel open={roomOpen} side="right" onClose={closeRoom} label="Room" hideAt="lg:hidden" width="w-full sm:w-80">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <h2 className="flex-1 text-base font-semibold tracking-tight">Room</h2>
          <button
            type="button"
            onClick={closeRoom}
            title="Close"
            aria-label="Close the room"
            className="flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {/* What the header has no room for at this width. */}
        <div className="shrink-0 space-y-2 border-b border-line px-3 py-3 lg:hidden">
          <div className="md:hidden">
            <ModeSelect size="sheet" modes={modes} mode={settings?.mode ?? null} onMode={pickMode} disabled={!ready} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={preset?.id ?? "custom"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="px-1 pt-1.5 text-xs leading-snug text-muted"
              >
                {preset?.description ?? "Your own room: the members, roles and hop cap you set."}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
            <NameField size="sheet" value={humanName} onChange={setHumanName} />
            <HopsSelect
              size="sheet"
              value={maxHops}
              onChange={(hops) => updateSettings((now) => ({ ...now, max_hops: hops }))}
              disabled={!ready}
            />
          </div>
          <div className="md:hidden">
            <ClearButton size="sheet" onClear={() => void clear()} disabled={!canClear} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{panel("overlay")}</div>
      </Panel>
    </div>
  );
}
