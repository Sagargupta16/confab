import { motion, useMotionValue } from "motion/react";
import { useLayoutEffect, useRef } from "react";

type Parsed = { prefix: string; suffix: string; amount: number; decimals: number; grouped: boolean };

/** "$0.0042" -> $, 0.0042, 4 decimals; "12.3K tokens" -> 12.3 and the suffix "K tokens". */
function parse(text: string): Parsed | null {
  const match = /^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text);
  if (!match) return null;
  const amount = Number.parseFloat(match[2].replaceAll(",", ""));
  if (!Number.isFinite(amount)) return null;
  const dot = match[2].indexOf(".");
  return {
    prefix: match[1],
    suffix: match[3],
    amount,
    decimals: dot === -1 ? 0 : match[2].length - dot - 1,
    grouped: match[2].includes(","),
  };
}

function format(amount: number, like: Parsed): string {
  const fixed = Math.max(0, amount).toFixed(like.decimals);
  const [whole, part] = fixed.split(".");
  const digits = like.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${like.prefix}${digits}${part === undefined ? "" : `.${part}`}${like.suffix}`;
}

const DURATION = 240;

/**
 * A formatted figure that counts from the one on screen to the new one over 240 ms (ease-out cubic). Frames go
 * into a MotionValue that motion writes straight to the text node, so nothing re-renders per frame, and the last
 * frame is always the exact string given.
 */
export function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const display = useMotionValue(value);
  const shown = useRef<{ amount: number; unit: string }>({ amount: 0, unit: "" });

  useLayoutEffect(() => {
    display.set(value);
    const target = parse(value);
    if (!target) return;
    const unit = `${target.prefix}|${target.suffix}`;
    // A change of unit (tokens to dollars) counts from zero rather than across units.
    const from = shown.current.unit === unit ? shown.current.amount : 0;
    if (target.amount === from || target.amount === 0) {
      shown.current = { amount: target.amount, unit };
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(Math.max(now - start, 0) / DURATION, 1);
      if (progress >= 1) {
        shown.current = { amount: target.amount, unit };
        display.set(value);
        return;
      }
      const amount = from + (target.amount - from) * (1 - (1 - progress) ** 3);
      shown.current = { amount, unit };
      display.set(format(amount, target));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, display]);

  return <motion.span className={`figure ${className}`}>{display}</motion.span>;
}
