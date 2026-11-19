// Hosted sign-in: GitHub through the API (PKCE), tokens in localStorage, and one shared
// refresh when a request comes back 401. Structure follows ledger-sync's auth client.

import type { Tokens } from "./wire";

export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

const AUTH_KEY = "confab.auth";
const ATTEMPT_KEY = "confab.oauth-attempt";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const CALLBACK_PATH = `${import.meta.env.BASE_URL}auth/callback/github`;

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** The server's fixed `detail` line, or a generic one when the body has none. */
export async function errorFrom(response: Response): Promise<ApiError> {
  let detail = `The request failed (${response.status}).`;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string") {
      detail = body.detail;
    }
  } catch {
    // not JSON: keep the generic line
  }
  return new ApiError(response.status, detail);
}

// ---- tokens ----

function isTokens(value: unknown): value is Tokens {
  return typeof value === "object" && value !== null
    && "access_token" in value && typeof value.access_token === "string" && value.access_token !== ""
    && "refresh_token" in value && typeof value.refresh_token === "string" && value.refresh_token !== "";
}

function readTokens(): Tokens | null {
  try {
    const stored = globalThis.localStorage.getItem(AUTH_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isTokens(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens): void {
  try {
    globalThis.localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }),
    );
  } catch {
    throw new Error("Sign-in needs browser storage. Enable it and try again.");
  }
}

/** Forget the stored pair. Does not tell the server. */
export function clearTokens(): void {
  try {
    globalThis.localStorage.removeItem(AUTH_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

export function hasTokens(): boolean {
  return readTokens() !== null;
}

const signedOutListeners = new Set<() => void>();

/** Called when the session ends (refresh rejected, or signOut). Returns an unsubscribe. */
export function onSignedOut(fn: () => void): () => void {
  signedOutListeners.add(fn);
  return () => {
    signedOutListeners.delete(fn);
  };
}

// While signOut runs its own refresh and retry, those paths must not announce the end of the
// session; signOut announces it once at the end.
let quietEnd = false;

function endSession(): void {
  clearTokens();
  if (quietEnd) return;
  for (const fn of [...signedOutListeners]) fn();
}

// ---- apiFetch and the shared refresh ----

let pendingRefresh: Promise<string> | null = null;

/** One refresh for every caller. Returns the new access token. */
function refreshTokens(staleAccess: string | null): Promise<string> {
  if (pendingRefresh) return pendingRefresh;
  // Refresh tokens are single use: another tab may already have rotated the pair.
  const stored = readTokens();
  if (!stored) {
    endSession();
    return Promise.reject(new ApiError(401, "Your session has expired. Sign in again."));
  }
  if (staleAccess !== null && stored.access_token !== staleAccess) return Promise.resolve(stored.access_token);

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: stored.refresh_token }),
      });
    } catch {
      // The pair may have been rotated server side before the answer was lost.
      endSession();
      throw new ApiError(401, "Your session has expired. Sign in again.");
    }
    if (!response.ok) {
      const error = await errorFrom(response);
      // Only a 429 proves the stored token is still unused.
      if (response.status !== 429) endSession();
      throw error;
    }
    const data: unknown = await response.json().catch(() => null);
    if (!isTokens(data)) {
      endSession();
      throw new ApiError(401, "Your session has expired. Sign in again.");
    }
    writeTokens(data);
    return data.access_token;
  })().finally(() => {
    pendingRefresh = null;
  });
  pendingRefresh = promise;
  return promise;
}

function send(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

/** fetch against the API: base URL, bearer token, and on a 401 one shared refresh and one retry. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = readTokens()?.access_token ?? null;
  const response = await send(path, init, token);
  if (response.status !== 401 || token === null) return response;

  const fresh = await refreshTokens(token);
  const retry = await send(path, init, fresh);
  if (retry.status === 401) endSession();
  return retry;
}

// ---- PKCE sign-in ----

type Attempt = { state: string; verifier: string; expiresAt: number };

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function isAttempt(value: unknown): value is Attempt {
  return typeof value === "object" && value !== null
    && "state" in value && typeof value.state === "string"
    && "verifier" in value && typeof value.verifier === "string"
    && /^[A-Za-z0-9._~-]{43,128}$/.test(value.verifier)
    && "expiresAt" in value && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt);
}

function readAttempt(): Attempt | null {
  try {
    const stored = globalThis.localStorage.getItem(ATTEMPT_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clearAttempt(): void {
  try {
    globalThis.localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

const INVALID_ATTEMPT = "The sign-in service returned an invalid attempt. Try again.";

/** Ask the API for a sign-in attempt, remember it, and send the browser to GitHub. */
export async function startSignIn(): Promise<void> {
  if (!globalThis.crypto?.subtle) throw new Error("Sign-in needs a secure connection. Open confab over HTTPS.");
  const verifier = base64Url(globalThis.crypto.getRandomValues(new Uint8Array(64)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));

  const response = await fetch(`${API_BASE}/api/auth/oauth/github/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code_challenge: challenge }),
  });
  if (!response.ok) throw await errorFrom(response);
  const a = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  const redirect = new URL(CALLBACK_PATH, globalThis.location.origin).href;
  if (
    a === null
    || a.provider !== "github"
    || a.authorize_url !== AUTHORIZE_URL
    || a.redirect_uri !== redirect
    || a.code_challenge !== challenge
    || a.code_challenge_method !== "S256"
    || typeof a.state !== "string" || a.state === ""
    || typeof a.client_id !== "string" || typeof a.scope !== "string"
    || typeof a.expires_in !== "number" || !(a.expires_in > 0 && a.expires_in <= 600)
  ) {
    throw new Error(INVALID_ATTEMPT);
  }

  const attempt: Attempt = { state: a.state, verifier, expiresAt: Date.now() + a.expires_in * 1000 };
  try {
    globalThis.localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    throw new Error("Sign-in needs browser storage. Enable it and try again.");
  }

  const params = new URLSearchParams({
    client_id: a.client_id,
    redirect_uri: a.redirect_uri,
    scope: a.scope,
    response_type: "code",
    state: a.state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  globalThis.location.assign(`${AUTHORIZE_URL}?${params.toString()}&allow_signup=false`);
}

export function isCallbackPath(): boolean {
  return globalThis.location.pathname.replace(/\/+$/, "") === CALLBACK_PATH;
}

let finishing: Promise<void> | null = null;

async function exchangeCode(): Promise<void> {
  const params = new URLSearchParams(globalThis.location.search);
  const attempt = readAttempt();
  clearAttempt();
  // Whatever happens next, a reload must not replay this code.
  globalThis.history.replaceState(null, "", import.meta.env.BASE_URL);

  if (params.get("error")) throw new Error("GitHub did not complete the sign-in. Start again.");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !attempt || attempt.state !== state || Date.now() >= attempt.expiresAt) {
    throw new Error("This sign-in link has expired. Start again.");
  }

  const response = await fetch(`${API_BASE}/api/auth/oauth/github/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state, code_verifier: attempt.verifier }),
  });
  if (!response.ok) throw await errorFrom(response);
  const tokens: unknown = await response.json().catch(() => null);
  if (!isTokens(tokens)) throw new Error(INVALID_ATTEMPT);
  writeTokens(tokens);
}

/** Trade the code in the callback URL for tokens. Memoised: StrictMode runs the effect twice. */
export function finishSignIn(): Promise<void> {
  finishing ??= exchangeCode();
  return finishing;
}

/** End the session on the server (best effort) and here. */
export async function signOut(): Promise<void> {
  quietEnd = true;
  try {
    if (readTokens()) {
      // Through apiFetch, so an expired access token is refreshed once before the server is told.
      await apiFetch("/api/auth/logout", { method: "POST" });
    }
  } catch {
    // offline or the refresh was rejected: the local tokens still go
  } finally {
    quietEnd = false;
  }
  endSession();
}
