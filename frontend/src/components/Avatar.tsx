type Props = { label: string; color: string; size?: number; dim?: boolean };

/** A flat coloured disc with the first letter; the colour is the member's identity in the chat. */
export function Avatar({ label, color, size = 32, dim = false }: Props) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full border font-mono font-semibold uppercase leading-none transition-opacity duration-[var(--duration-normal)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        color,
        borderColor: `${color}66`,
        background: `${color}1a`,
        opacity: dim ? 0.35 : 1,
      }}
    >
      {label.slice(0, 1)}
    </span>
  );
}
