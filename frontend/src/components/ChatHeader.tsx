import { ChevronDown, Menu, MessagesSquare, Receipt, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode, type SelectHTMLAttributes } from "react";
import type { Member } from "../types";
import type { ModePreset } from "../wire";
import { Avatar } from "./Avatar";
import { CountUp } from "./CountUp";
import { TitleInput } from "./TitleInput";

/**
 * "bar" sits in the md-and-up top bar, in the house system (inset controls, mono figures). "sheet" fills a row of
 * the room overlay below lg, with the same inset controls at full width.
 */
export type Size = "bar" | "sheet";

// 44px and 16px on touch and below lg (iOS zooms on smaller text); a fine pointer at lg and up gets 36px and 14px.
const BAR = "control h-11 rounded-md text-base text-text-primary lg:text-sm lg:pointer-fine:h-9";
const SHEET = "control h-11 w-full rounded-md text-base text-text-primary";
const SOFT: Record<Size, string> = { bar: "text-text-tertiary", sheet: "text-text-tertiary" };
const EASE = [0.16, 1, 0.3, 1] as const;

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
      className={`relative flex min-w-0 items-center gap-1.5 pl-2.5 pr-2 transition-colors ${
        fit === "bar" ? BAR : SHEET
      } ${className}`}
    >
      {/* In the bar the control sizes to its label, so nothing in it is ever cut; in the sheet it fills the row. */}
      <span
        aria-hidden
        className={`relative flex items-center overflow-hidden ${fit === "bar" ? "shrink-0" : "min-w-0 flex-1"}`}
      >
        {label}
      </span>
      <ChevronDown aria-hidden size={14} className={`shrink-0 ${SOFT[fit]}`} />
      <select
        {...select}
        className="absolute inset-0 h-full w-full cursor-pointer bg-surface-dropdown text-base text-text-primary opacity-0 [color-scheme:dark] lg:text-sm"
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
  const strong = "text-text-primary";
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
          <SlidersHorizontal size={13} className={`mr-1.5 shrink-0 ${SOFT[size]}`} />
          <Swap id={preset?.id ?? "custom"} whole={size === "bar"}>
            <span className={preset ? strong : SOFT[size]}>{preset?.label ?? "Custom"}</span>
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

/** `max_hops` with no cap: the round ends when a reply mentions nobody, or on Stop (NO_HOP_LIMIT in chat.py). */
const NO_LIMIT = -1;
const HOPS = [0, 2, 4, 6, 8, 12, 20];

type HopsProps = { size: Size; value: number; onChange: (hops: number) => void; disabled?: boolean };

export function HopsSelect({ size, value, onChange, disabled }: HopsProps) {
  const counts = HOPS.includes(value) || value === NO_LIMIT ? HOPS : [...HOPS, value].sort((a, b) => a - b);
  const options = [...counts, NO_LIMIT];
  return (
    <Pick
      fit={size}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      name="hops"
      aria-label="Hop cap"
      title={
        value === NO_LIMIT
          ? "No limit: the models keep answering each other until they reach a conclusion (or you press Stop)"
          : "How many replies the models may trigger among themselves after each message of yours"
      }
      className={size === "bar" ? "shrink-0" : ""}
      label={
        <>
          <span className={`mr-1.5 shrink-0 ${SOFT[size]}`}>Hops</span>
          {/* Two digits wide whatever the value, so the control does not jump between 6 and 12. */}
          <span className="relative inline-flex min-w-[2ch] shrink-0 justify-end">
            <Swap id={String(value)} whole>
              <span className={size === "bar" ? "figure" : "tabular-nums"}>{value === NO_LIMIT ? "∞" : value}</span>
            </Swap>
          </span>
        </>
      }
    >
      {options.map((count) => (
        <option key={count} value={count}>
          {count === NO_LIMIT ? "No limit (until they conclude)" : count}
        </option>
      ))}
    </Pick>
  );
}

type NameProps = { size: Size; value: string; onChange: (name: string) => void };

export function NameField({ size, value, onChange }: NameProps) {
  return (
    <label
      className={`flex min-w-0 items-center gap-1.5 pl-2.5 transition-colors ${
        size === "bar" ? `${BAR} shrink-0` : SHEET
      }`}
      title="Your name, as the models see it. Kept on this device."
    >
      <span className={`shrink-0 ${SOFT[size]}`}>Name</span>
      <input
        name="name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={40}
        placeholder="You"
        autoComplete="nickname"
        // In the bar the field is as wide as the name (a little spare, capped), so it never hides part of it.
        size={size === "bar" ? Math.min(Math.max(value.length, 3), 16) + 1 : undefined}
        className={`h-full bg-transparent pr-2 outline-none ${
          size === "bar"
            ? "flex-none text-text-primary placeholder:text-text-quaternary"
            : "min-w-0 flex-1 text-text-primary placeholder:text-text-quaternary"
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
      className={
        size === "bar"
          ? "control lift flex size-11 shrink-0 items-center justify-center rounded-md text-text-tertiary hover-fine:border-app-red/40 hover-fine:text-app-red disabled:pointer-events-none disabled:opacity-30 lg:pointer-fine:size-9"
          : "control lift flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md text-base text-text-tertiary hover-fine:border-app-red/40 hover-fine:text-app-red disabled:pointer-events-none disabled:opacity-30"
      }
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
      className="lift hidden h-9 shrink-0 items-center rounded-md px-1.5 hover-fine:bg-[var(--overlay-2)] lg:flex"
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
              className="relative rounded-full bg-background ring-2 ring-background"
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
            className="relative flex size-[26px] items-center justify-center rounded-full border border-[var(--hairline-2)] bg-surface-3 text-[0.65rem] font-semibold tabular-nums text-text-tertiary ring-2 ring-background"
          >
            +{extra}
          </motion.span>
        )}
        {present.length === 0 && <span className="pl-2 text-xs text-text-tertiary">Nobody yet</span>}
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
  /** A round is running in the open chat: the loading bar runs along the bottom edge. */
  running: boolean;
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
        className="block h-3.5 w-32 rounded bg-white/[0.03]"
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  ) : (
    // On a phone the title and the line under it are one 44px target, because tapping the title is how a chat
    // gets renamed there; the mode and cost on that line are labels (the Users button opens both).
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename this chat"
      className="flex min-h-11 w-full min-w-0 flex-col justify-center rounded-md text-left text-text-secondary transition-colors hover-fine:text-text-primary md:block md:min-h-0 md:w-auto md:max-w-full"
    >
      <motion.span
        key={title}
        initial={{ opacity: 0.7, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="block truncate text-sm font-medium text-text-primary md:text-inherit"
      >
        {title}
      </motion.span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-text-tertiary md:hidden">
        <span className="relative shrink-0 overflow-hidden rounded-full border border-[var(--hairline-3)] bg-[var(--overlay-2)] px-1.5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={label}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className={`figure block ${mode ? "text-app-blue" : ""}`}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="flex min-w-0 items-center gap-1">
          <Receipt size={11} className="shrink-0" />
          <CountUp value={costLabel} />
        </span>
      </span>
    </button>
  );

  return (
    <header className="shell relative z-10 flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-1.5 border-b border-[var(--hairline-2)] px-2 pt-[env(safe-area-inset-top)] sm:px-3 lg:px-4">
      <button
        type="button"
        onClick={props.onMenu}
        title="Chats"
        aria-label="Open the chat list"
        className="lift flex size-11 shrink-0 items-center justify-center rounded-md text-text-secondary md:hidden"
      >
        <Menu size={20} />
      </button>
      <span
        aria-hidden
        className="hidden size-7 shrink-0 items-center justify-center rounded-md border border-[var(--hairline-2)] bg-[var(--overlay-2)] text-text-secondary md:flex"
      >
        <MessagesSquare size={14} />
      </span>

      <div className="min-w-0 flex-1 md:pl-1">{heading}</div>

      <div className="hidden min-w-0 items-center gap-1.5 md:flex">
        <ModeSelect size="bar" modes={modes} mode={mode} onMode={onMode} disabled={!props.ready} />
        <Faces present={present} speaking={speaking} onClick={onMembers} />
        <button
          type="button"
          onClick={onCost}
          title="What this chat has cost so far"
          className={`control lift flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs lg:pointer-fine:h-9 ${
            costActive ? "text-app-blue" : "text-text-secondary hover-fine:text-text-primary"
          }`}
        >
          <Receipt size={14} className="shrink-0" />
          <CountUp value={costLabel} />
        </button>
        <div className="hidden items-center gap-1.5 lg:flex">
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
        className={`control lift flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 lg:hidden ${
          props.roomOpen ? "text-app-blue" : "text-text-secondary"
        }`}
      >
        <Users size={16} />
        <CountUp value={String(present.length)} className="text-sm" />
      </button>

      {/* The 2px loading bar: a third-width segment sliding along the bottom edge while a round runs. */}
      <span role="status" className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
        <span className="sr-only">{props.running ? "A round is running" : ""}</span>
        <AnimatePresence>
          {props.running && (
            <motion.span
              key="bar"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 bg-app-blue/10"
            >
              <span className="loading-segment absolute inset-y-0 left-0 w-1/3 rounded-full bg-app-blue/70" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </header>
  );
}
