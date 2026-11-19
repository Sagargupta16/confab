import { ChevronDown, Menu, Receipt, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode, type SelectHTMLAttributes } from "react";
import type { Member } from "../types";
import type { ModePreset } from "../wire";
import { Avatar } from "./Avatar";
import { Ticker } from "./Sidebar";
import { TitleInput } from "./TitleInput";

/** "bar" sits in the md-and-up header; "sheet" fills a row of the phone's room overlay (16px, 44px tall). */
export type Size = "bar" | "sheet";

const BOX: Record<Size, string> = {
  bar: "h-9 text-sm",
  sheet: "h-11 w-full text-base",
};

type PickProps = { fit: Size; label: ReactNode; className?: string } & Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
>;

/**
 * A native select (a phone gets the OS picker) laid transparent over a label we control, so the closed control
 * never shows a clipped option.
 */
function Pick({ fit, label, className = "", children, ...select }: PickProps) {
  return (
    <span
      className={`relative flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-panel pl-2.5 pr-2 text-ink transition-colors focus-within:border-accent/70 hover:border-accent/40 ${BOX[fit]} ${className}`}
    >
      {/* In the bar the control sizes to its label, so nothing in it is ever cut; in the sheet it fills the row. */}
      <span
        aria-hidden
        className={`relative flex items-center overflow-hidden ${fit === "bar" ? "shrink-0" : "min-w-0 flex-1"}`}
      >
        {label}
      </span>
      <ChevronDown aria-hidden size={14} className="shrink-0 text-muted" />
      <select
        {...select}
        className="absolute inset-0 h-full w-full cursor-pointer bg-panel text-base text-ink opacity-0 [color-scheme:dark] md:text-sm"
      >
        {children}
      </select>
    </span>
  );
}

/** A label that slides when its value changes. `whole` keeps it uncut: the control grows to fit it instead. */
function Swap({ id, whole = false, children }: { id: string; whole?: boolean; children: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -10, opacity: 0 }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        className={`block whitespace-nowrap ${whole ? "shrink-0" : "min-w-0 truncate"}`}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

export function modeLabel(modes: ModePreset[], mode: string | null): string {
  return modes.find((preset) => preset.id === mode)?.label ?? "Custom";
}

type ModeProps = { size: Size; modes: ModePreset[]; mode: string | null; onMode: (id: string | null) => void; disabled?: boolean };

export function ModeSelect({ size, modes, mode, onMode, disabled }: ModeProps) {
  const preset = modes.find((item) => item.id === mode);
  return (
    <Pick
      fit={size}
      value={preset?.id ?? ""}
      disabled={disabled}
      onChange={(event) => onMode(event.target.value || null)}
      name="mode"
      aria-label="Mode"
      title={preset?.description ?? "Your own room: the members, roles and hop cap you set"}
      className={size === "bar" ? "min-w-32 shrink-0 justify-between" : ""}
      label={
        <>
          <SlidersHorizontal size={13} className="mr-1.5 shrink-0 text-muted" />
          <Swap id={preset?.id ?? "custom"} whole={size === "bar"}>
            <span className={preset ? "text-ink" : "text-muted"}>{preset?.label ?? "Custom"}</span>
          </Swap>
        </>
      }
    >
      <option value="">Custom</option>
      {modes.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </Pick>
  );
}

const HOPS = [0, 2, 4, 6, 8, 12, 20];

type HopsProps = { size: Size; value: number; onChange: (hops: number) => void; disabled?: boolean };

export function HopsSelect({ size, value, onChange, disabled }: HopsProps) {
  const options = HOPS.includes(value) ? HOPS : [...HOPS, value].sort((a, b) => a - b);
  return (
    <Pick
      fit={size}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      name="hops"
      aria-label="Hop cap"
      title="How many replies the models may trigger among themselves after each message of yours"
      className={size === "bar" ? "shrink-0" : ""}
      label={
        <>
          <span className="mr-1.5 shrink-0 text-muted">Hops</span>
          {/* Two digits wide whatever the value, so the control does not jump between 6 and 12. */}
          <span className="relative inline-flex min-w-[2ch] shrink-0 justify-end">
            <Swap id={String(value)} whole>
              <span className="tabular-nums">{value}</span>
            </Swap>
          </span>
        </>
      }
    >
      {options.map((count) => (
        <option key={count} value={count}>
          {count}
        </option>
      ))}
    </Pick>
  );
}

type NameProps = { size: Size; value: string; onChange: (name: string) => void };

export function NameField({ size, value, onChange }: NameProps) {
  return (
    <label
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-panel pl-2.5 transition-colors focus-within:border-accent/70 ${BOX[size]} ${
        size === "bar" ? "shrink-0" : ""
      }`}
      title="Your name, as the models see it. Kept on this device."
    >
      <span className="shrink-0 text-muted">Name</span>
      <input
        name="name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={40}
        placeholder="You"
        autoComplete="nickname"
        // In the bar the field is as wide as the name (a little spare, capped), so it never hides part of it.
        size={size === "bar" ? Math.min(Math.max(value.length, 3), 16) + 1 : undefined}
        className={`h-full bg-transparent pr-2 text-ink outline-none placeholder:text-muted ${
          size === "bar" ? "flex-none" : "min-w-0 flex-1"
        }`}
      />
    </label>
  );
}

type ClearProps = { size: Size; onClear: () => void; disabled: boolean };

export function ClearButton({ size, onClear, disabled }: ClearProps) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={disabled}
      title="Clear the chat"
      aria-label="Clear the chat"
      className={`flex shrink-0 items-center justify-center gap-2 rounded-lg border border-line text-muted transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted ${
        size === "bar" ? "size-9" : "h-11 w-full text-base"
      }`}
    >
      <Trash2 size={16} />
      {size === "sheet" && "Clear the chat"}
    </button>
  );
}

/** Who is in the room, overlapping, each ringed while it is speaking. */
function Faces({ present, speaking, onClick }: { present: Member[]; speaking: Set<string>; onClick: () => void }) {
  const shown = present.slice(0, 4);
  const extra = present.length - shown.length;
  return (
    <button
      type="button"
      onClick={onClick}
      title={present.map((member) => `@${member.handle}`).join(", ") || "Nobody is in this chat"}
      aria-label="Members"
      className="hidden h-9 shrink-0 items-center rounded-lg px-1.5 transition-colors hover:bg-raised lg:flex"
    >
      <span className="flex items-center -space-x-2">
        <AnimatePresence initial={false}>
          {shown.map((member) => (
            <motion.span
              key={member.handle}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 30 }}
              className="relative rounded-full bg-canvas ring-2 ring-canvas"
            >
              <Avatar label={member.handle} color={member.color} size={26} />
              {speaking.has(member.handle) && (
                <motion.span
                  className="absolute -inset-0.5 rounded-full border"
                  style={{ borderColor: member.color }}
                  animate={{ scale: [1, 1.3, 1], opacity: [0.9, 0, 0.9] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </motion.span>
          ))}
        </AnimatePresence>
        {extra > 0 && (
          <motion.span
            layout
            className="relative flex size-[26px] items-center justify-center rounded-full border border-line bg-raised text-[0.65rem] font-semibold tabular-nums text-muted ring-2 ring-canvas"
          >
            +{extra}
          </motion.span>
        )}
        {present.length === 0 && <span className="pl-2 text-xs text-muted">Nobody yet</span>}
      </span>
    </button>
  );
}

type Props = {
  /** Null while the chat is still loading. */
  title: string | null;
  onRename: (title: string) => void;
  modes: ModePreset[];
  mode: string | null;
  onMode: (id: string | null) => void;
  present: Member[];
  speaking: Set<string>;
  costLabel: string;
  costActive: boolean;
  onCost: () => void;
  onMembers: () => void;
  humanName: string;
  onName: (name: string) => void;
  maxHops: number;
  onHops: (hops: number) => void;
  canClear: boolean;
  onClear: () => void;
  roomOpen: boolean;
  onRoom: () => void;
  onMenu: () => void;
  ready: boolean;
};

export function ChatHeader(props: Props) {
  const { title, onRename, modes, mode, onMode, present, speaking, costLabel, costActive, onCost, onMembers } = props;
  const [editing, setEditing] = useState(false);
  const label = modeLabel(modes, mode);

  const heading = editing && title !== null ? (
    <TitleInput
      value={title}
      className="w-full max-w-md"
      onDone={(next) => {
        setEditing(false);
        if (next) onRename(next);
      }}
    />
  ) : title === null ? (
    <span className="flex min-h-11 items-center md:min-h-0">
      <motion.span
        className="block h-4 w-32 rounded bg-raised"
        animate={{ opacity: [0.35, 0.8, 0.35] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
    </span>
  ) : (
    // On a phone the title and the line under it are one 44px target, because tapping the title is how a chat
    // gets renamed there; the mode and cost on that line are labels (the Users button opens both).
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename this chat"
      className="group flex min-h-11 w-full min-w-0 flex-col justify-center rounded-md text-left md:block md:min-h-0 md:w-auto md:max-w-full"
    >
      <span className="relative block overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={title}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="block truncate text-[0.95rem] font-semibold tracking-tight group-hover:text-accent md:text-base"
          >
            {title}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.7rem] text-muted md:hidden">
        <span className="relative shrink-0 overflow-hidden rounded-full border border-line px-2 leading-5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={label}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 460, damping: 34 }}
              className={`block ${mode ? "text-accent" : ""}`}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="flex min-w-0 items-center gap-1 leading-5">
          <Receipt size={11} className="shrink-0" />
          <Ticker value={costLabel} />
        </span>
      </span>
    </button>
  );

  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 md:gap-2 md:px-4 md:py-2.5">
      <button
        type="button"
        onClick={props.onMenu}
        title="Chats"
        aria-label="Open the chat list"
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink md:hidden"
      >
        <Menu size={20} />
      </button>

      <div className="min-w-0 flex-1">{heading}</div>

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <ModeSelect size="bar" modes={modes} mode={mode} onMode={onMode} disabled={!props.ready} />
        <Faces present={present} speaking={speaking} onClick={onMembers} />
        <motion.button
          type="button"
          onClick={onCost}
          whileTap={{ scale: 0.94 }}
          title="What this chat has cost so far"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
            costActive ? "border-accent/60 text-accent" : "border-line text-muted hover:text-ink"
          }`}
        >
          <Receipt size={15} />
          <Ticker value={costLabel} />
        </motion.button>
        <div className="hidden items-center gap-2 lg:flex">
          <NameField size="bar" value={props.humanName} onChange={props.onName} />
          <HopsSelect size="bar" value={props.maxHops} onChange={props.onHops} disabled={!props.ready} />
        </div>
        <ClearButton size="bar" onClear={props.onClear} disabled={!props.canClear} />
      </div>

      <button
        type="button"
        onClick={props.onRoom}
        title="Members and cost"
        aria-label="Members and cost"
        aria-expanded={props.roomOpen}
        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 transition-colors md:h-9 lg:hidden ${
          props.roomOpen ? "border-accent text-accent" : "border-line text-muted hover:text-ink"
        }`}
      >
        <Users size={16} />
        <span className="text-sm tabular-nums">
          <Ticker value={String(present.length)} />
        </span>
      </button>
    </header>
  );
}
