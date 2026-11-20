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
      initial={{ opacity: 0.7, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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
      // 16px and 44px below lg (iOS zooms on less), the 13px row size on a desktop.
      className={`control h-11 min-w-0 rounded-md px-2.5 text-base text-text-primary lg:text-[13px] lg:pointer-fine:h-9 ${className}`}
    />
  );
}
