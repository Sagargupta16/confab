import { AnimatePresence, motion } from "motion/react";
import type { LevelPreset } from "../wire";

type Props = {
  /** Unique per mounted copy (the room aside and the room sheet), so the two pills never share a layoutId. */
  id: string;
  levels: LevelPreset[];
  /** The level every seat's model matches, or null when the models are your own mix. */
  active: string | null;
  onPick: (id: string) => void;
  disabled?: boolean;
};

const PILL = { type: "spring", stiffness: 500, damping: 28 } as const;

/**
 * Cheap | Medium | Intense: one pick that sets every seat's model by cost. It stores nothing; which level is lit is
 * worked out from the models the seats have, so a single model change elsewhere turns it to "custom".
 */
export function LevelControl({ id, levels, active, onPick, disabled = false }: Props) {
  if (levels.length === 0) return null;
  return (
    <div className="shell shrink-0 border-b border-[var(--hairline-2)] px-3 pb-3 pt-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="meta">Cost level</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={active ?? "custom"}
            initial={{ opacity: 0.7, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="figure text-[10px] text-text-quaternary"
          >
            {active ? "every seat" : "custom"}
          </motion.span>
        </AnimatePresence>
      </div>
      <div role="radiogroup" aria-label="Cost level" className="control flex gap-1 rounded-lg p-1">
        {levels.map((level) => {
          const on = level.id === active;
          return (
            <motion.button
              key={level.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onPick(level.id)}
              whileTap={{ scale: 0.97 }}
              title={level.description}
              className={`relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors disabled:opacity-50 lg:pointer-fine:min-h-8 ${
                on ? "text-app-blue" : "text-text-tertiary hover-fine:text-text-primary"
              }`}
            >
              {on && (
                <motion.span
                  layoutId={`${id}-level-pill`}
                  transition={PILL}
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-[var(--overlay-4)]"
                />
              )}
              <span className="relative truncate">{level.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
