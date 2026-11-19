import { Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRoster, streamChat } from "./api";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { Roster } from "./components/Roster";
import { HUMAN, type ChatEvent, type ChatMessage, type Member, type Usage } from "./types";

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

export function App() {
  const [roster, setRoster] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState("");
  const [messages, setMessages] = useStored<ChatMessage[]>("confab.messages", []);
  const [joinedList, setJoinedList] = useStored<string[] | null>("confab.joined", null);
  const [defaultHandle, setDefaultHandle] = useStored<string | null>("confab.default", null);
  const [maxHops, setMaxHops] = useStored<number>("confab.maxHops", 6);
  const [humanName, setHumanName] = useStored<string>("confab.name", "You");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(messages);
  latest.current = messages;

  useEffect(() => {
    fetchRoster()
      .then(setRoster)
      .catch((error: Error) => setLoadError(error.message));
    // A reload mid-round leaves replies marked as streaming; nothing is streaming now.
    setMessages((all) => all.map((message) => (message.streaming ? { ...message, streaming: false } : message)));
  }, [setMessages]);

  const joined = useMemo(
    () => new Set(joinedList ?? roster.filter((member) => member.joined).map((member) => member.handle)),
    [joinedList, roster],
  );
  const members = useMemo(() => Object.fromEntries(roster.map((member) => [member.handle, member])), [roster]);
  const present = useMemo(() => roster.filter((member) => joined.has(member.handle)), [roster, joined]);
  const answersByDefault = defaultHandle && joined.has(defaultHandle) ? defaultHandle : (present[0]?.handle ?? null);

  const totals = useMemo(() => {
    const sum: Record<string, Usage> = {};
    for (const message of messages) {
      if (!message.usage) continue;
      const entry = (sum[message.author] ??= { in: 0, out: 0 });
      entry.in += message.usage.in;
      entry.out += message.usage.out;
    }
    return sum;
  }, [messages]);
  const speaking = useMemo(
    () => new Set(messages.filter((message) => message.streaming).map((message) => message.author)),
    [messages],
  );

  const apply = useCallback(
    (event: ChatEvent) => {
      setMessages((all) => {
        if (event.type === "start") {
          return [
            ...all,
            { id: crypto.randomUUID(), author: event.handle, text: "", askedBy: event.askedBy, streaming: true },
          ];
        }
        if (event.type === "done") {
          if (event.capped.length === 0) return all;
          const waiting = event.capped.map((handle) => `@${handle}`).join(", ");
          return [
            ...all,
            {
              id: crypto.randomUUID(),
              author: HUMAN,
              notice: true,
              text: `Stopped at the hop cap (${event.hops}). Not answered: ${waiting}. Mention them to carry on.`,
            },
          ];
        }
        const index = all.findLastIndex((message) => message.author === event.handle && message.streaming);
        if (index === -1) return all;
        const current = all[index];
        const next =
          event.type === "delta"
            ? { ...current, text: current.text + event.text }
            : event.type === "end"
              ? { ...current, streaming: false, usage: event.usage, seconds: event.seconds, stop: event.stop }
              : { ...current, streaming: false, error: event.message };
        return all.with(index, next);
      });
    },
    [setMessages],
  );

  async function send(text: string) {
    if (present.length === 0) return;
    const history = [...latest.current, { id: crypto.randomUUID(), author: HUMAN, text }];
    setMessages(history);
    setDraft("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await streamChat(
        {
          messages: history
            .filter((message) => !message.notice && !message.error && message.text.trim())
            .map(({ author, text: body }) => ({ author, text: body })),
          members: present.map((member) => member.handle),
          default: answersByDefault,
          max_hops: maxHops,
          human_name: humanName.trim() || "You",
        },
        apply,
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        const reason = error instanceof Error ? error.message : String(error);
        setMessages((all) => [
          ...all,
          { id: crypto.randomUUID(), author: HUMAN, notice: true, text: `The round failed: ${reason}` },
        ]);
      }
    } finally {
      setBusy(false);
      // Stopped mid-round: keep what a model had already said, drop a reply that never started.
      setMessages((all) =>
        all
          .filter((message) => !(message.streaming && !message.text))
          .map((message) => (message.streaming ? { ...message, streaming: false } : message)),
      );
    }
  }

  function toggle(handle: string) {
    const next = new Set(joined);
    if (next.has(handle)) next.delete(handle);
    else next.add(handle);
    setJoinedList(roster.filter((member) => next.has(member.handle)).map((member) => member.handle));
  }

  function mention(handle: string) {
    setDraft((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}@${handle} `);
    setFocusToken((token) => token + 1);
    setRosterOpen(false);
  }

  const rosterPanel = (
    <Roster
      roster={roster}
      joined={joined}
      defaultHandle={answersByDefault}
      totals={totals}
      speaking={speaking}
      onToggle={toggle}
      onDefault={setDefaultHandle}
      onMention={mention}
    />
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
        <h1 className="text-lg font-semibold tracking-tight">
          confab<span className="text-accent">.</span>
        </h1>
        <p className="hidden text-sm text-muted lg:block">One room, every top Bedrock model.</p>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-muted" title="Your name, as the models see it">
            <span className="hidden sm:inline">Name</span>
            <input
              value={humanName}
              onChange={(event) => setHumanName(event.target.value)}
              maxLength={40}
              className="w-20 rounded-lg border border-line bg-panel px-2 py-1 text-ink outline-none focus:border-accent/70 sm:w-24"
            />
          </label>
          <label
            className="flex items-center gap-1.5 text-muted"
            title="How many replies the models may trigger among themselves after each message of yours"
          >
            <span>Hops</span>
            <select
              value={maxHops}
              onChange={(event) => setMaxHops(Number(event.target.value))}
              className="rounded-lg border border-line bg-panel px-1.5 py-1 text-ink outline-none focus:border-accent/70"
            >
              {[0, 2, 4, 6, 8, 12, 20].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => messages.length > 0 && confirm("Clear the whole chat?") && setMessages([])}
            disabled={busy || messages.length === 0}
            title="Clear the chat"
            className="rounded-lg border border-line p-1.5 text-muted hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setRosterOpen((open) => !open)}
            title="Members"
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 md:hidden ${
              rosterOpen ? "border-accent text-accent" : "border-line text-muted"
            }`}
          >
            <Users size={16} />
            <span className="tabular-nums">{joined.size}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-line md:block">{rosterPanel}</aside>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <AnimatePresence>
            {rosterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-x-0 top-0 z-20 max-h-[70%] overflow-hidden border-b border-line bg-panel md:hidden"
              >
                {rosterPanel}
              </motion.div>
            )}
          </AnimatePresence>
          {loadError ? (
            <p className="m-auto max-w-md px-6 text-center text-sm text-danger" role="alert">
              Could not reach the API ({loadError}). Start it with <code>pnpm run dev</code>.
            </p>
          ) : (
            <MessageList
              messages={messages}
              members={members}
              humanName={humanName.trim() || "You"}
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
            focusToken={focusToken}
            onSend={send}
            onStop={() => abort.current?.abort()}
          />
        </main>
      </div>
    </div>
  );
}
