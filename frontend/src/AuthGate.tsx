import { motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { API_BASE, ApiError, clearTokens, finishSignIn, hasTokens, isCallbackPath, onSignedOut, signOut } from "./auth";
import { getHealth, getMe } from "./client";
import { GateCard, SignIn } from "./components/SignIn";
import type { Me, ServerMode } from "./wire";

export type Session = { mode: ServerMode; version: string; user: Me | null; signOut: (() => void) | null };

type State =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "signin"; error: string | null }
  | { kind: "ready"; session: Session };

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const set = (next: State) => {
      if (live) setState(next);
    };

    async function boot() {
      let health;
      try {
        health = await getHealth();
      } catch {
        set({ kind: "unreachable" });
        return;
      }
      if (health.mode === "local") {
        set({ kind: "ready", session: { mode: "local", version: health.version, user: null, signOut: null } });
        return;
      }

      if (isCallbackPath()) {
        try {
          await finishSignIn();
        } catch (caught) {
          set({ kind: "signin", error: caught instanceof Error ? caught.message : "Sign-in failed. Start again." });
          return;
        }
      }
      if (!hasTokens()) {
        set({ kind: "signin", error: null });
        return;
      }
      try {
        const user = await getMe();
        set({
          kind: "ready",
          session: {
            mode: "hosted",
            version: health.version,
            user,
            signOut: () => {
              void signOut();
            },
          },
        });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 403) {
          clearTokens();
          set({ kind: "signin", error: caught.detail });
        } else if (caught instanceof ApiError && caught.status === 401) {
          set({ kind: "signin", error: null });
        } else {
          set({ kind: "unreachable" });
        }
      }
    }

    void boot();
    const off = onSignedOut(() => set({ kind: "signin", error: null }));
    return () => {
      live = false;
      off();
    };
  }, [attempt]);

  if (state.kind === "ready") return <>{children(state.session)}</>;
  if (state.kind === "signin") return <SignIn error={state.error} />;
  if (state.kind === "unreachable") {
    return (
      <GateCard>
        <h1 className="text-xl font-semibold text-ink">Could not reach the API.</h1>
        {API_BASE === "" && (
          <p className="mt-2 text-sm text-muted">
            Start it with <code className="font-mono text-ink">pnpm run dev</code> from the repo root.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setState({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
          className="mt-6 min-h-11 w-full rounded-lg border border-line bg-raised px-4 text-base font-medium text-ink transition-colors hover:border-accent"
        >
          Try again
        </button>
      </GateCard>
    );
  }
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas">
      <motion.div
        className="size-3 rounded-full bg-accent"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
    </div>
  );
}
