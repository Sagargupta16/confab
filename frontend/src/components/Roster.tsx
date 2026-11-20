import { ChevronDown, Image as ImageIcon, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { compact, money } from "../cost";
import type { Member, Role, Seat, SeatChoice, Usage } from "../types";
import type { LevelPreset } from "../wire";
import { Avatar } from "./Avatar";
import { ModelMenu } from "./ModelMenu";

type Props = {
  seats: Seat[];
  /** Each seat with its chosen model and role applied. */
  members: Record<string, Member>;
  choices: Record<string, SeatChoice>;
  roles: Role[];
  /** The cost levels, for the tags in each seat's model menu. */
  levels: LevelPreset[];
  joined: Set<string>;
  defaultHandle: string | null;
  totals: Record<string, Usage>;
  /** What each handle has cost so far, only for handles with at least one reply whose cost is known. */
  costs: Record<string, number>;
  speaking: Set<string>;
  onToggle: (handle: string) => void;
  onDefault: (handle: string) => void;
  onMention: (handle: string) => void;
  onChoose: (handle: string, patch: Partial<SeatChoice>) => void;
};

const OPEN = { height: "auto", opacity: 1 };
const SHUT = { height: 0, opacity: 0 };
const CINEMATIC = [0.16, 1, 0.3, 1] as const;
const EASE = { duration: 0.25, ease: CINEMATIC } as const;
const KNOB = { type: "spring", stiffness: 500, damping: 28 } as const;
const PILL = { type: "spring", stiffness: 500, damping: 40 } as const;

/** Each row rises in on its turn: 0.08 s lead, 0.05 s apart, never later than 0.3 s. */
const reveal = (index: number) => ({
  duration: 0.35,
  ease: CINEMATIC,
  delay: Math.min(0.08 + index * 0.05, 0.3),
  layout: PILL,
});

// 16px below lg: iOS Safari zooms the page into any focused field set smaller than that.
const FIELD = "control min-h-11 min-w-0 rounded-md text-base lg:pointer-fine:min-h-9 lg:text-xs";

type PickerProps = { label: ReactNode; className: string } & SelectHTMLAttributes<HTMLSelectElement>;

/**
 * A native select (so a phone gets the OS picker) laid transparent over a label we control, so the closed control
 * shows a short label and never the whole option text cut off in a narrow row.
 */
function Picker({ label, className, children, ...select }: PickerProps) {
  return (
    <span className={`${FIELD} relative flex items-center gap-1 pl-2 pr-1.5 ${className}`}>
      <span aria-hidden className="flex min-w-0 flex-1 items-center overflow-hidden">
        {label}
      </span>
      <ChevronDown aria-hidden size={14} className="shrink-0 text-text-tertiary" />
      <select
        {...select}
        className="absolute inset-0 h-full w-full cursor-pointer bg-surface-3 text-base text-text-primary opacity-0 [color-scheme:dark] lg:text-xs"
      >
        {children}
      </select>
    </span>
  );
}

/** A closed-picker label that slides when its value changes. */
function Swap({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        className="flex min-w-0 items-baseline gap-1 whitespace-nowrap"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

/** For one seat: which levels pick each of its models, as lowercase tags ("cheap", "medium", "intense"). */
function levelTags(levels: LevelPreset[], handle: string): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  for (const level of levels) {
    const model = level.models[handle];
    if (model) (tags[model] ??= []).push(level.label.toLowerCase());
  }
  return tags;
}

export function Roster({
  seats,
  members,
  choices,
  roles,
  levels,
  joined,
  defaultHandle,
  totals,
  costs,
  speaking,
  onToggle,
  onDefault,
  onMention,
  onChoose,
}: Props) {
  return (
    <ul className="shell min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 pt-2">
      {seats.map((seat, index) => {
        const member = members[seat.handle];
        const choice = choices[seat.handle];
        if (!member || !choice) return null;
        const isIn = joined.has(seat.handle);
        const usage = totals[seat.handle];
        const cost = costs[seat.handle];
        const isDefault = defaultHandle === seat.handle;
        const pickModel = isIn && seat.models.length > 1;
        const pickRole = seat.kind === "text";
        const custom = choice.role === "custom";
        const preset = roles.find((role) => role.id === choice.role);
        // One figure after the handle: the cost once known, else the tokens. The Cost tab has both in full.
        const spent =
          cost !== undefined ? money(cost) : usage ? `${compact(usage.in + usage.out)} tokens` : null;
        const name = (
          <span className="relative block overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={member.name}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                className={`block truncate text-sm font-medium ${isIn ? "text-text-primary" : "text-text-quaternary"}`}
              >
                {member.name}
              </motion.span>
            </AnimatePresence>
          </span>
        );

        return (
          <motion.li
            key={seat.handle}
            layout="position"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reveal(index)}
            className="rounded-md px-2 py-1 transition-colors duration-[var(--duration-fast)] hover-fine:bg-[var(--overlay-2)] lg:py-1.5"
          >
            {/* Line 1: the avatar mentions; the model's name is the model picker (or plain text with one model). */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => isIn && onMention(seat.handle)}
                disabled={!isIn}
                title={isIn ? `Mention @${seat.handle}` : "Not in the chat"}
                aria-label={isIn ? `Mention @${seat.handle}` : `@${seat.handle} is not in the chat`}
                className="relative flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full disabled:cursor-default lg:pointer-fine:size-8"
              >
                <Avatar label={seat.handle} color={seat.color} dim={!isIn} />
                {speaking.has(seat.handle) && (
                  <motion.span
                    className="absolute inset-0 rounded-full border lg:pointer-fine:-inset-1"
                    style={{ borderColor: seat.color }}
                    animate={{ scale: [1, 1.25, 1], opacity: [0.9, 0, 0.9] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                )}
              </button>
              <span className="flex min-w-0 flex-1">
                {pickModel ? (
                  <ModelMenu
                    handle={seat.handle}
                    models={seat.models}
                    value={choice.model}
                    onChange={(model) => onChoose(seat.handle, { model })}
                    tags={levelTags(levels, seat.handle)}
                    label={name}
                  />
                ) : (
                  <span className="min-w-0 flex-1">{name}</span>
                )}
              </span>
              {isIn && (
                <button
                  type="button"
                  onClick={() => onDefault(seat.handle)}
                  title={
                    isDefault
                      ? "Answers when you mention nobody"
                      : "Make this the one who answers when you mention nobody"
                  }
                  className={`lift flex h-11 w-9 shrink-0 items-center justify-center rounded-md lg:pointer-fine:h-8 ${
                    isDefault
                      ? "text-app-blue"
                      : "text-text-tertiary opacity-50 hover-fine:bg-[var(--overlay-3)] hover-fine:opacity-100"
                  }`}
                >
                  <Star size={15} fill={isDefault ? "currentColor" : "none"} />
                </button>
              )}
              <motion.button
                type="button"
                role="switch"
                aria-checked={isIn}
                aria-label={`${member.name} in the chat`}
                onClick={() => onToggle(seat.handle)}
                whileTap={{ scale: 0.97 }}
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-md lg:pointer-fine:h-8"
              >
                <span
                  className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-[var(--duration-fast)] ${
                    isIn ? "bg-app-blue" : "bg-[var(--overlay-6)]"
                  }`}
                >
                  <motion.span
                    animate={{ x: isIn ? 20 : 0 }}
                    transition={KNOB}
                    className="size-5 rounded-full bg-text-primary"
                  />
                </span>
              </motion.button>
            </div>

            {/* Line 2, under the name: the @handle (it mentions too) with what the seat has spent, and its role. */}
            <div className="flex min-w-0 items-center gap-1.5 pl-[3.25rem] lg:pointer-fine:pl-10">
              <button
                type="button"
                onClick={() => isIn && onMention(seat.handle)}
                disabled={!isIn}
                title={isIn ? `Mention @${seat.handle}` : "Not in the chat"}
                className={`flex shrink-0 touch-manipulation items-center gap-1 text-left text-[11px] text-text-tertiary transition-colors duration-[var(--duration-fast)] disabled:cursor-default ${
                  isIn ? "h-11 hover-fine:text-text-primary lg:pointer-fine:h-8" : "h-5"
                }`}
              >
                {seat.kind === "image" && <ImageIcon aria-label="image model" size={12} className="shrink-0" />}
                <span className="whitespace-nowrap">
                  @{seat.handle}
                  {spent && (
                    <>
                      {" · "}
                      <span className="figure">{spent}</span>
                    </>
                  )}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isIn && pickRole && (
                  <motion.span
                    key="role"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={EASE}
                    className="flex min-w-0 flex-1 justify-end"
                  >
                    <Picker
                      value={choice.role ?? ""}
                      onChange={(event) => onChoose(seat.handle, { role: event.target.value || null })}
                      name={`role-${seat.handle}`}
                      aria-label={`Role for @${seat.handle}`}
                      title={preset?.brief ?? (custom ? "Your own role, described below" : "No role")}
                      className={`w-full max-w-[11rem] ${choice.role ? "text-text-primary" : "text-text-tertiary"}`}
                      label={
                        <Swap id={choice.role ?? "none"}>
                          <span className="truncate">{preset?.label ?? (custom ? "Custom" : "No role")}</span>
                        </Swap>
                      }
                    >
                      <option value="">No role</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.label}
                        </option>
                      ))}
                      <option value="custom">Custom...</option>
                    </Picker>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence initial={false}>
              {isIn && custom && (
                <motion.div
                  key="brief"
                  initial={SHUT}
                  animate={OPEN}
                  exit={SHUT}
                  transition={EASE}
                  className="overflow-hidden"
                >
                  <div className="pb-1 pl-[3.25rem] pt-1 lg:pointer-fine:pl-10">
                    <input
                      name={`brief-${seat.handle}`}
                      value={choice.brief}
                      onChange={(event) => onChoose(seat.handle, { brief: event.target.value })}
                      maxLength={200}
                      placeholder="Describe the role in a sentence"
                      aria-label={`Custom role for @${seat.handle}`}
                      className={`${FIELD} w-full px-2 text-text-primary placeholder:text-text-quaternary`}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
