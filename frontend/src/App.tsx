import { Receipt, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRoster, streamChat } from "./api";
import { Composer } from "./components/Composer";
import { CostTable } from "./components/CostTable";
import { MessageList } from "./components/MessageList";
import { Roster } from "./components/Roster";
import { Sidebar, Ticker, type Tab } from "./components/Sidebar";
import { costRows, totalLabel } from "./cost";
import {
  HUMAN,
  type ChatEvent,
  type ChatMessage,
  type Member,
  type Roster as RosterData,
  type Role,
  type SeatChoice,
  type Usage,
} from "./types";

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

/** Tailwind's md breakpoint: below it the panel is the overlay, at and above it the aside. */
const MD_AND_UP = "(min-width: 48rem)";

export function App() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [messages, setMessages] = useStored<ChatMessage[]>("confab.messages", []);
  const [joinedList, setJoinedList] = useStored<string[] | null>("confab.joined", null);
  const [defaultHandle, setDefaultHandle] = useStored<string | null>("confab.default", null);
  const [maxHops, setMaxHops] = useStored<number>("confab.maxHops", 6);
  const [humanName, setHumanName] = useStored<string>("confab.name", "You");
  const [storedChoices, setStoredChoices] = useStored<Record<string, SeatChoice>>("confab.seats", {});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("members");
  const [focusToken, setFocusToken] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(messages);
  latest.current = messages;

  useEffect(() => {
    fetchRoster()
      .then(setRoster)
      .catch((error: Error) => setLoadError(error.message));
    // A reload mid-round leaves replies marked as streaming; nothing is streaming now. A reply that never got
    // a word, a picture or an error out (an image still drawing at reload) would be an empty bubble, so drop it.
    // One that came back empty but was billed (a reasoning model that spent its cap thinking) stays for the cost.
    setMessages((all) =>
      all
        .filter((message) => message.notice || message.text || message.image || message.error || message.usage)
        .map((message) => (message.streaming ? { ...message, streaming: false } : message)),
    );
  }, [setMessages]);

  const seats = useMemo(() => roster?.seats ?? [], [roster]);
  const roles = useMemo(() => roster?.roles ?? [], [roster]);

  // A stored model that a seat no longer offers falls back to its default; an unknown role becomes no role.
  const choices = useMemo(() => {
    const roleIds = new Set(roles.map((role) => role.id));
    const clean: Record<string, SeatChoice> = {};
    for (const seat of seats) {
      const saved = storedChoices[seat.handle];
      const model = saved && seat.models.some((option) => option.id === saved.model) ? saved.model : seat.default;
      const role =
        seat.kind === "text" && saved?.role && (saved.role === "custom" || roleIds.has(saved.role)) ? saved.role : null;
      clean[seat.handle] = { model, role, brief: typeof saved?.brief === "string" ? saved.brief : "" };
    }
    return clean;
  }, [seats, roles, storedChoices]);

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

  const joined = useMemo(
    () => new Set(joinedList ?? seats.filter((seat) => seat.joined).map((seat) => seat.handle)),
    [joinedList, seats],
  );
  const present = useMemo(
    () => seats.filter((seat) => joined.has(seat.handle)).map((seat) => members[seat.handle]),
    [seats, joined, members],
  );
  const answersByDefault = defaultHandle && joined.has(defaultHandle) ? defaultHandle : (present[0]?.handle ?? null);

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

  const apply = useCallback(
    (event: ChatEvent) => {
      setMessages((all) => {
        if (event.type === "start") {
          return [
            ...all,
            {
              id: crypto.randomUUID(),
              author: event.handle,
              text: "",
              askedBy: event.askedBy,
              streaming: true,
              model: event.model,
              role: event.role,
            },
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
        let next: ChatMessage;
        if (event.type === "delta") next = { ...current, text: current.text + event.text };
        else if (event.type === "end")
          next = {
            ...current,
            streaming: false,
            usage: event.usage,
            seconds: event.seconds,
            stop: event.stop,
            cost: event.cost,
          };
        else if (event.type === "image")
          next = {
            ...current,
            streaming: false,
            image: { url: event.url, prompt: event.prompt },
            seconds: event.seconds,
            cost: event.cost,
          };
        else next = { ...current, streaming: false, error: event.message };
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
            .filter((message) => !message.notice && !message.error && (message.text.trim() || message.image))
            .map(({ author, text: body, image }) =>
              image ? { author, text: "", image_prompt: image.prompt } : { author, text: body },
            ),
          members: present.map((member) => member.handle),
          default: answersByDefault,
          max_hops: maxHops,
          human_name: humanName.trim() || "You",
          seats: Object.fromEntries(
            present.map((member) => {
              const choice = choices[member.handle];
              const brief = choice.role === "custom" ? choice.brief.trim() : "";
              // A custom role with nothing written in it is no role at all.
              const role = choice.role === "custom" && !brief ? null : choice.role;
              return [member.handle, { model: choice.model, role, brief }];
            }),
          ),
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
    setJoinedList(seats.filter((seat) => next.has(seat.handle)).map((seat) => seat.handle));
  }

  function choose(handle: string, patch: Partial<SeatChoice>) {
    setStoredChoices((saved) => ({ ...saved, [handle]: { ...choices[handle], ...patch } }));
  }

  function mention(handle: string) {
    setDraft((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}@${handle} `);
    setFocusToken((token) => token + 1);
    setRosterOpen(false);
  }

  function showCost() {
    setTab("cost");
    if (!window.matchMedia(MD_AND_UP).matches) setRosterOpen(true);
  }

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
          onDefault={setDefaultHandle}
          onMention={mention}
          onChoose={choose}
        />
      }
      cost={<CostTable summary={summary} prices={roster?.prices ?? null} />}
    />
  );

  const control = "h-10 rounded-lg border border-line bg-panel text-ink outline-none focus:border-accent/70 md:h-auto";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 sm:gap-3 sm:px-5 md:py-2.5">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight">
          confab<span className="text-accent">.</span>
        </h1>
        <p className="hidden text-sm text-muted lg:block">One room, every top Bedrock model.</p>
        <div className="ml-auto flex min-w-0 items-center gap-1.5 text-sm sm:gap-2">
          <motion.button
            type="button"
            onClick={showCost}
            whileTap={{ scale: 0.94 }}
            title="What this chat has cost so far"
            className={`hidden h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:flex md:h-8 ${
              tab === "cost" ? "border-accent/60 text-accent" : "border-line text-muted hover:text-ink"
            }`}
          >
            <Receipt size={15} />
            <Ticker value={total} />
          </motion.button>
          <label className="flex items-center gap-1.5 text-muted" title="Your name, as the models see it">
            <span className="hidden sm:inline">Name</span>
            <input
              value={humanName}
              onChange={(event) => setHumanName(event.target.value)}
              maxLength={40}
              className={`${control} w-20 px-2 py-1 sm:w-24`}
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
              className={`${control} px-1.5 py-1`}
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
            className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:text-danger disabled:opacity-30 md:h-auto md:w-auto md:p-1.5"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setRosterOpen((open) => !open)}
            title="Members and cost"
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2 md:hidden ${
              rosterOpen ? "border-accent text-accent" : "border-line text-muted"
            }`}
          >
            <Users size={16} />
            <span className="tabular-nums">{joined.size}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-line md:block">{panel("aside")}</aside>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <AnimatePresence>
            {rosterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-x-0 top-0 z-20 flex max-h-[78%] flex-col overflow-hidden border-b border-line bg-panel md:hidden"
              >
                {panel("overlay")}
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
            focusToken={focusToken}
            onSend={send}
            onStop={() => abort.current?.abort()}
          />
        </main>
      </div>
    </div>
  );
}
