import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "border border-app-blue bg-app-blue text-on-blue shadow-[var(--control-edge)] hover-fine:border-app-blue-vibrant hover-fine:bg-app-blue-vibrant",
  secondary: "control text-text-primary",
  ghost: "text-text-tertiary hover-fine:bg-[var(--overlay-2)] hover-fine:text-text-primary",
  danger: "border border-app-red bg-app-red text-on-blue hover-fine:opacity-90",
};

// 44px on touch; a fine pointer at lg and up gets the 32 or 36px desktop size.
const SIZE: Record<Size, string> = {
  sm: "min-h-11 min-w-11 gap-1.5 px-2.5 text-xs lg:pointer-fine:min-h-8 lg:pointer-fine:min-w-8",
  md: "min-h-11 min-w-11 gap-2 px-3.5 text-sm lg:pointer-fine:min-h-9 lg:pointer-fine:min-w-9",
};

type Props = ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: ReactNode; pending?: boolean };

/** The shell's button: lifts 1px under a fine pointer, presses to 0.97, spins while its action runs. */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  pending = false,
  type = "button",
  disabled,
  className = "",
  children,
  ...button
}: Props) {
  return (
    <button
      {...button}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`lift inline-flex shrink-0 items-center justify-center rounded-md font-medium leading-5 tabular-nums disabled:pointer-events-none disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {pending ? <LoaderCircle aria-hidden size={15} className="shrink-0 animate-spin" /> : icon}
      {children}
    </button>
  );
}
