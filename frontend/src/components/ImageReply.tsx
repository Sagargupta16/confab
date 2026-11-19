import { Download, ExternalLink, Image as ImageIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageReply as Picture } from "../types";

type Props = { image?: Picture; streaming: boolean; color: string };

/** Seconds since the component mounted, ticking while the image model draws. */
function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

/** The placeholder and the picture share one square box, so nothing below it moves when the image lands. */
export function ImageReply({ image, streaming, color }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const elapsed = useElapsed(streaming);

  if (!image && !streaming) return null;

  if (failed) {
    return (
      <div className="w-[22rem] max-w-full rounded-xl border border-line px-4 py-6 text-center text-xs text-muted">
        Image no longer on disk
      </div>
    );
  }

  const drawing = !image || !loaded;

  return (
    <div className="w-[22rem] max-w-full">
      <button
        type="button"
        onClick={() => image && loaded && setOpen(true)}
        disabled={!image || !loaded}
        aria-label="Open the image full size"
        className="relative block aspect-square w-full overflow-hidden rounded-xl border border-line bg-raised disabled:cursor-default"
      >
        <AnimatePresence>
          {drawing && (
            <motion.span
              key="drawing"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5"
            >
              <motion.span
                animate={{ rotate: [-9, 9, -9], y: [0, -3, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ImageIcon size={30} style={{ color }} />
              </motion.span>
              <span className="text-xs tabular-nums text-muted">
                {streaming || elapsed > 0 ? `Drawing... ${elapsed}s` : "Loading..."}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
        {image && (
          <motion.img
            src={image.url}
            alt={image.prompt}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
            whileHover={loaded ? { scale: 1.015 } : undefined}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </button>
      {image && (
        <p className="line-clamp-2 px-1.5 pb-0.5 pt-2 text-xs leading-snug text-muted" title={image.prompt}>
          {image.prompt}
        </p>
      )}
      {image && <Lightbox image={image} open={open} onClose={() => setOpen(false)} />}
    </div>
  );
}

const TOOL =
  "flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel text-muted transition-colors hover:border-accent/60 hover:text-ink";

function Lightbox({ image, open, onClose }: { image: Picture; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A portal, because a transformed ancestor (the message's entry motion) would trap position: fixed.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Image"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-canvas/95 p-3 sm:p-6"
        >
          <div className="flex w-full max-w-[95vw] justify-end gap-2" onClick={(event) => event.stopPropagation()}>
            <a href={image.url} download title="Download" aria-label="Download" className={TOOL}>
              <Download size={17} />
            </a>
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              title="Open in a new tab"
              aria-label="Open in a new tab"
              className={TOOL}
            >
              <ExternalLink size={17} />
            </a>
            <button type="button" onClick={onClose} title="Close" aria-label="Close" className={TOOL}>
              <X size={18} />
            </button>
          </div>
          <motion.img
            src={image.url}
            alt={image.prompt}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
            className="min-h-0 max-h-[78dvh] max-w-[95vw] rounded-xl border border-line object-contain"
          />
          <p
            className="line-clamp-3 max-w-2xl text-center text-sm leading-relaxed text-muted"
            onClick={(event) => event.stopPropagation()}
          >
            {image.prompt}
          </p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
