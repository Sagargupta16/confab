import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  side: "left" | "right";
  onClose: () => void;
  label: string;
  /** Breakpoint classes that hide it where the layout has room for the real column (md:hidden, lg:hidden). */
  hideAt: string;
  /** Width classes for the sliding panel. */
  width: string;
  children: ReactNode;
};

const DRAWER = { type: "spring", stiffness: 300, damping: 30 } as const;

/** A panel that slides in from one edge over a dimmed page; a tap on the page or Escape closes it. */
export function Panel({ open, side, onClose, label, hideAt, width, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const off = side === "left" ? "-100%" : "100%";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
            className={`fixed inset-0 z-30 bg-[var(--modal-backdrop)] ${hideAt}`}
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ x: off }}
            animate={{ x: 0 }}
            exit={{ x: off }}
            transition={DRAWER}
            className={`shell fixed inset-y-0 z-40 flex flex-col overflow-hidden border-[var(--hairline-2)] bg-background text-text-primary shadow-[var(--shadow-float)] ${
              side === "left" ? "left-0 border-r" : "right-0 border-l"
            } ${width} ${hideAt}`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
