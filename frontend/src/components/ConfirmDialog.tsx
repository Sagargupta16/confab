import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../client";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Rejects to keep the dialog open with the reason; resolves to close it. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** The house confirm: a native modal dialog opened with showModal, in place of the browser's own prompt. */
export function ConfirmDialog({ open, ...props }: Props) {
  return <AnimatePresence>{open && <Content {...props} />}</AnimatePresence>;
}

type Phase = { kind: "idle" } | { kind: "pending" } | { kind: "failed"; message: string };

function Content({ title, description, confirmLabel, onConfirm, onClose }: Omit<Props, "open">) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Set at once, so a second click in the same tick (or during the exit) does nothing.
  const busy = useRef(false);

  // Mounted only while open: open on mount, give focus back to the opener on unmount.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
      opener?.focus();
    };
  }, []);

  function dismiss() {
    if (!busy.current) onClose();
  }

  async function accept() {
    if (busy.current) return;
    busy.current = true;
    setPhase({ kind: "pending" });
    try {
      await onConfirm();
    } catch (error) {
      busy.current = false;
      setPhase({
        kind: "failed",
        message: error instanceof ApiError ? error.detail : "Could not reach the server. Check the connection and try again.",
      });
      return;
    }
    busy.current = false;
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={phase.kind === "pending" || undefined}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onKeyDown={(event) => {
        // Escape ends the dialog only, not a drawer open behind it.
        if (event.key === "Escape") event.stopPropagation();
      }}
      className="confirm-dialog shell fixed inset-0 z-50 m-0 size-full max-h-none max-w-none items-center justify-center border-0 bg-transparent p-4 text-text-primary open:flex"
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.25, ease: EASE }}
        onClick={dismiss}
        className="absolute inset-0 bg-[var(--modal-backdrop)]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.15, ease: EASE } }}
        transition={{ duration: 0.25, ease: EASE }}
        className="relative w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-6 shadow-[var(--shadow-float)]"
      >
        <h3 id={titleId} className="mb-2 text-lg font-semibold text-text-primary">
          {title}
        </h3>
        <p id={descriptionId} className="mb-6 text-sm leading-relaxed break-words text-text-tertiary">
          {description}
        </p>
        <AnimatePresence initial={false}>
          {phase.kind === "failed" && (
            <motion.p
              key="error"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="-mt-3 mb-6 text-sm text-app-red"
            >
              {phase.message}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={dismiss} disabled={phase.kind === "pending"} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void accept()} pending={phase.kind === "pending"}>
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </dialog>
  );
}
