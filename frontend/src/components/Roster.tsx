import { ChevronDown, Image as ImageIcon, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { compact, money, priceLabel, priceParts } from "../cost";
import type { Member, Role, Seat, SeatChoice, Usage } from "../types";
import { Avatar } from "./Avatar";

type Props = {
  seats: Seat[];
  /** Each seat with its chosen model and role applied. */
  members: Record<string, Member>;
  choices: Record<string, SeatChoice>;
  roles: Role[];
  joined: Set<string>;
  defaultHandle: string | null;
  totals: Record<string, Usage>;
  /** What each handle has cost so far, only for handles with at least one priced reply. */
  costs: Record<string, number>;
  speaking: Set<string>;
  onToggle: (handle: string) => void;
  onDefault: (handle: string) => void;
  onMention: (handle: string) => void;
  onChoose: (handle: string, patch: Partial<SeatChoice>) => void;
};

const OPEN = { height: "auto", opacity: 1 };
const SHUT = { height: 0, opacity: 0 };
const EASE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

// 16px below md: iOS Safari zooms the page into any focused field set smaller than that.
const FIELD = "h-10 min-w-0 rounded-lg border bg-canvas text-base transition-colors md:h-8 md:text-xs";

type PickerProps = { label: ReactNode; className: string } & SelectHTMLAttributes<HTMLSelectElement>;

/**
 * A native select (so a phone gets the OS picker) laid transparent over a label we control, because the closed
 * native control shows the whole option text and clips it mid-price in a narrow row.
 */
function Picker({ label, className, children, ...select }: PickerProps) {
  return (
    <span className={`${FIELD} relative flex items-center gap-1 pl-2 pr-1.5 focus-within:border-accent/70 ${className}`}>
      <span aria-hidden className="flex min-w-0 flex-1 items-center overflow-hidden">
        {label}
      </span>
      <ChevronDown aria-hidden size={14} className="shrink-0 text-muted" />
      <select
        {...select}
        className="absolute inset-0 h-full w-full cursor-pointer bg-panel text-base text-ink opacity-0 [color-scheme:dark] md:text-xs"
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

export function Roster({
  seats,
  members,
  choices,
  roles,
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
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3 pt-2">
      {seats.map((seat) => {
        const member = members[seat.handle];
        const choice = choices[seat.handle];
        if (!member || !choice) return null;
        const isIn = joined.has(seat.handle);
        const usage = totals[seat.handle];
        const cost = costs[seat.handle];
        const isDefault = defaultHandle === seat.handle;
        const pickModel = seat.models.length > 1;
        const pickRole = seat.kind === "text";
        const custom = choice.role === "custom";
        const preset = roles.find((role) => role.id === choice.role);
        const price = member.model.price ? priceParts(member.model.price) : null;
        // One figure after the handle, so the line fits the 288px aside: the cost once known, else the tokens.
        // The Cost tab has both in full.
        const spent =
          cost !== undefined ? money(cost) : usage ? `${compact(usage.in + usage.out)} tokens` : null;

        return (
          <motion.li
            key={seat.handle}
            layout="position"
            className="rounded-lg border border-transparent px-2 py-1 hover:border-line hover:bg-raised md:py-2"
          >
            <motion.div whileHover={{ x: 2 }} className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => isIn && onMention(seat.handle)}
                disabled={!isIn}
                title={isIn ? `Mention @${seat.handle}` : "Not in the chat"}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default md:min-h-0"
              >
                <span className="relative">
                  <Avatar label={seat.handle} color={seat.color} dim={!isIn} />
                  {speaking.has(seat.handle) && (
                    <motion.span
                      className="absolute -inset-1 rounded-full border"
                      style={{ borderColor: seat.color }}
                      animate={{ scale: [1, 1.25, 1], opacity: [0.9, 0, 0.9] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="relative block overflow-hidden">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={member.name}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -10, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 460, damping: 34 }}
                        className={`block truncate text-sm font-medium ${isIn ? "text-ink" : "text-muted"}`}
                      >
                        {member.name}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
                    {seat.kind === "image" && <ImageIcon aria-label="image model" size={12} className="shrink-0" />}
                    <span className="truncate">
                      @{seat.handle}
                      {spent && ` · ${spent}`}
                    </span>
                  </span>
                </span>
              </button>
              {isIn && (
                <button
                  type="button"
                  onClick={() => onDefault(seat.handle)}
                  title={
                    isDefault
                      ? "Answers when you mention nobody"
                      : "Make this the one who answers when you mention nobody"
                  }
                  className={`flex h-10 w-8 items-center justify-center rounded md:h-7 md:w-7 ${
                    isDefault ? "text-accent" : "text-muted opacity-40 hover:opacity-100"
                  }`}
                >
                  <Star size={15} fill={isDefault ? "currentColor" : "none"} />
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={isIn}
                aria-label={`${member.name} in the chat`}
                onClick={() => onToggle(seat.handle)}
                className="flex h-10 shrink-0 items-center md:h-7"
              >
                <span
                  className={`relative h-5 w-9 rounded-full border transition-colors ${
                    isIn ? "border-accent bg-accent/25" : "border-line bg-panel"
                  }`}
                >
                  <motion.span
                    layout
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full ${isIn ? "right-0.5 bg-accent" : "left-0.5 bg-muted"}`}
                  />
                </span>
              </button>
            </motion.div>

            <AnimatePresence initial={false}>
              {isIn && (pickModel || pickRole) && (
                <motion.div
                  key="settings"
                  initial={SHUT}
                  animate={OPEN}
                  exit={SHUT}
                  transition={EASE}
                  className="overflow-hidden"
                >
                  <div className="flex gap-1.5 pb-1 pl-[2.625rem] pt-1.5">
                    {pickModel && (
                      // Line 1 already names the model, so the closed picker shows what it costs. The unit only
                      // fits in the phone overlay; the 288px aside shows the figure alone (the list has the rest).
                      <Picker
                        value={choice.model}
                        onChange={(event) => onChoose(seat.handle, { model: event.target.value })}
                        aria-label={`Model for @${seat.handle}`}
                        title={
                          member.model.price ? `${member.name} · ${priceLabel(member.model.price)}` : member.name
                        }
                        className="flex-[3] border-line text-ink"
                        label={
                          <Swap id={member.model.id}>
                            {price ? (
                              <>
                                <span className="shrink-0 tabular-nums">{price.figure}</span>
                                <span className="truncate text-muted md:hidden">{price.unit}</span>
                              </>
                            ) : (
                              <span className="truncate">{member.name}</span>
                            )}
                          </Swap>
                        }
                      >
                        {seat.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.price ? `${model.name} · ${priceLabel(model.price)}` : model.name}
                          </option>
                        ))}
                      </Picker>
                    )}
                    {pickRole && (
                      <Picker
                        value={choice.role ?? ""}
                        onChange={(event) => onChoose(seat.handle, { role: event.target.value || null })}
                        aria-label={`Role for @${seat.handle}`}
                        title={preset?.brief ?? (custom ? "Your own role, described below" : "No role")}
                        className={`flex-[2] ${choice.role ? "border-accent/45 text-ink" : "border-line text-muted"}`}
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
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {custom && (
                      <motion.div
                        key="brief"
                        initial={SHUT}
                        animate={OPEN}
                        exit={SHUT}
                        transition={EASE}
                        className="overflow-hidden"
                      >
                        <div className="pb-1 pl-[2.625rem] pt-0.5">
                          <input
                            value={choice.brief}
                            onChange={(event) => onChoose(seat.handle, { brief: event.target.value })}
                            maxLength={200}
                            placeholder="Describe the role in a sentence"
                            aria-label={`Custom role for @${seat.handle}`}
                            className={`${FIELD} w-full border-line px-2 text-ink outline-none placeholder:text-muted focus:border-accent/70`}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
