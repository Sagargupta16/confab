import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  /** Called once with the trimmed title when Enter or a tap elsewhere ends the edit; not called on Escape. */
  onDone: (title: string | null) => void;
  className?: string;
};

/** An inline rename field: Enter or blur keeps it, Escape puts the old title back. */
export function TitleInput({ value, onDone, className = "" }: Props) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLInputElement>(null);
  const ended = useRef(false);

  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);

  function end(keep: boolean) {
    if (ended.current) return;
    ended.current = true;
    const title = text.trim().replace(/\s+/g, " ");
    onDone(keep && title && title !== value ? title : null);
  }

  return (
    <motion.input
      ref={box}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      name="title"
      value={text}
      maxLength={120}
      autoComplete="off"
      aria-label="Chat title"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => end(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          end(true);
        } else if (event.key === "Escape") {
          // Only the edit ends, not the drawer around it.
          event.preventDefault();
          event.stopPropagation();
          end(false);
        }
      }}
      className={`h-10 min-w-0 rounded-lg border border-accent/70 bg-canvas px-2.5 text-base text-ink outline-none md:h-9 md:text-sm ${className}`}
    />
  );
}
