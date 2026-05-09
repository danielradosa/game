# Phase E Frontend Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the React frontend to the Phase E backend API so signed-in players' saves and (opt-in) settings sync between devices, while anonymous local-first play continues unchanged.

**Architecture:** New `/src/net/` directory holds the typed fetch wrapper (`api.ts`) — every server call goes through it. New `/src/auth/` directory holds the React state hook for the current user (`useAccount`). New `/src/sync/` directory holds the sync orchestrator hook (`useSync`) that pulls manifest on app start, pushes after every local save, and surfaces conflict prompts. New `AccountPanel` UI lives inside `SettingsMenu` as a new "Account" section. Main menu gains a tiny signed-in badge.

**Tech Stack:** Existing React 18 + Vite + TypeScript stack. No new runtime deps — `fetch` for HTTP, the shared zod DTOs already live at `/src/shared/dto.ts`.

**Scope boundary:** This plan covers spec build steps 8–10 (frontend integration, no deploy). Plan 3 (Railway deploy) lands separately after this one is verified locally.

**Spec reference:** `docs/superpowers/specs/2026-05-09-phase-e-design.md`. Plan 1 (backend) at `docs/superpowers/plans/2026-05-09-phase-e-backend.md`.

---

## File structure

```
src/
├── net/                          [CREATE]
│   ├── api.ts                    typed fetch wrapper, normalized errors
│   └── api.types.ts              re-exports from @/shared/dto for client convenience
├── auth/                         [CREATE]
│   ├── account-context.tsx       AccountProvider + useAccount() — current user state
│   └── account-types.ts          AccountState union: anonymous | loading | signed-in | error
├── sync/                         [CREATE]
│   ├── use-sync.ts               hook: pull-on-mount, push-on-save, conflict detection
│   ├── conflict.ts               pure: detect stale slots, classify resolution actions
│   └── upload-local.ts           one-shot: bulk-PUT local saves to server (first sign-in)
├── ui/
│   ├── AccountPanel.tsx          [CREATE] signup / login / recover / logout / signed-in info
│   ├── ConflictModal.tsx         [CREATE] per-slot "cloud is newer" picker
│   ├── UploadLocalPrompt.tsx     [CREATE] "Upload N saves to your account?" modal
│   ├── SettingsMenu.tsx          [MODIFY] add Account tab + Sync-settings toggle
│   └── screens.tsx               [MODIFY] MainMenu signed-in badge
└── App.tsx                       [MODIFY] mount AccountProvider, useSync, render new modals
```

After this plan completes:
- `npm run dev` plus `cd server && npm run dev` lets you sign up in the running game, save progress, sign in on a different browser, and see the same saves appear.
- `npm run typecheck` and `npm run build` are clean.

---

## Task 1: API client (`/src/net/api.ts`)

**Goal:** A typed `api` object with one method per server endpoint. All fetches use `credentials: "include"` to carry the session cookie. Errors normalized to a typed shape.

**Files:**
- Create: `/src/net/api.ts`
- Create: `/src/net/api.types.ts`

- [ ] **Step 1: Create `/src/net/api.types.ts` re-exporting shared DTOs for ergonomic imports**

```typescript
export type {
  SignupBody,
  LoginBody,
  RecoverBody,
  SavePutBody,
  SettingsPutBody,
} from "@/shared/dto"
```

- [ ] **Step 2: Create `/src/net/api.ts`**

```typescript
import type {
  LoginBody,
  RecoverBody,
  SavePutBody,
  SettingsPutBody,
  SignupBody,
} from "@/net/api.types"
import type { SaveData, SaveMeta } from "@/shared/save"

const API_BASE = (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "http://localhost:8080"

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "USERNAME_TAKEN"
  | "SAVE_NOT_FOUND"
  | "SETTINGS_NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_BODY"
  | "INTERNAL"
  | "NETWORK"

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly statusCode: number
  constructor(code: ApiErrorCode, message: string, statusCode: number) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError("NETWORK", "Network error", 0)
  }
  if (res.status === 204) return undefined as T
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // body wasn't JSON
  }
  if (!res.ok) {
    const err = (parsed as { error?: { code?: ApiErrorCode; message?: string } } | null)?.error
    throw new ApiError(
      err?.code ?? "INTERNAL",
      err?.message ?? `HTTP ${res.status}`,
      res.status,
    )
  }
  return parsed as T
}

export interface MeResponse {
  username: string
  signedInAt: string
  saveCount: number
}

export interface SaveManifestEntry {
  slotKey: string
  meta: SaveMeta
  updatedAt: string
}

export interface SaveGetResponse {
  data: SaveData
  meta: SaveMeta
  updatedAt: string
}

export const api = {
  signup: (body: SignupBody) => request<{ recoveryCode: string }>("POST", "/auth/signup", body),
  login: (body: LoginBody) => request<{ ok: true }>("POST", "/auth/login", body),
  recover: (body: RecoverBody) => request<{ recoveryCode: string }>("POST", "/auth/recover", body),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<MeResponse>("GET", "/me"),

  savesList: () => request<SaveManifestEntry[]>("GET", "/saves"),
  saveGet: (slotKey: string) => request<SaveGetResponse>("GET", `/saves/${encodeURIComponent(slotKey)}`),
  savePut: (slotKey: string, body: SavePutBody) =>
    request<{ updatedAt: string }>("PUT", `/saves/${encodeURIComponent(slotKey)}`, body),
  saveDelete: (slotKey: string) =>
    request<void>("DELETE", `/saves/${encodeURIComponent(slotKey)}`),

  settingsGet: () => request<{ data: unknown; updatedAt: string }>("GET", "/settings"),
  settingsPut: (body: SettingsPutBody) =>
    request<{ updatedAt: string }>("PUT", "/settings", body),
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/daniel/personal/game && npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/net/
git commit -m "feat: typed API client for Phase E backend

src/net/api.ts wraps every endpoint with one method, credentials:'include'
for session cookie, and normalized ApiError class. VITE_API_BASE env var
overrides the dev default of http://localhost:8080."
```

---

## Task 2: Account state context (`useAccount`)

**Goal:** A React context that holds the current user's state (`anonymous | loading | signed-in { username } | error`) and exposes signup / login / recover / logout actions. Mounting the provider hits `/me` once to determine initial state.

**Files:**
- Create: `/src/auth/account-types.ts`
- Create: `/src/auth/account-context.tsx`

- [ ] **Step 1: Create `/src/auth/account-types.ts`**

```typescript
export type AccountState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "signed-in"; username: string; signedInAt: string; saveCount: number }
  | { status: "error"; message: string }
```

- [ ] **Step 2: Create `/src/auth/account-context.tsx`**

```typescript
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { api, ApiError } from "@/net/api"
import type { AccountState } from "./account-types"

interface AccountActions {
  signup: (username: string, password: string) => Promise<{ recoveryCode: string }>
  login: (username: string, password: string) => Promise<void>
  recover: (username: string, recoveryCode: string, newPassword: string) => Promise<{ recoveryCode: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

interface AccountContextValue {
  state: AccountState
  actions: AccountActions
}

const AccountContext = createContext<AccountContextValue | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({ status: "loading" })

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const me = await api.me()
      setState({
        status: "signed-in",
        username: me.username,
        signedInAt: me.signedInAt,
        saveCount: me.saveCount,
      })
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
        setState({ status: "anonymous" })
      } else if (err instanceof ApiError && err.code === "NETWORK") {
        // Server unreachable — treat as anonymous so the app still works.
        setState({ status: "anonymous" })
      } else {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" })
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const actions = useMemo<AccountActions>(
    () => ({
      signup: async (username, password) => {
        const r = await api.signup({ username, password })
        await refresh()
        return r
      },
      login: async (username, password) => {
        await api.login({ username, password })
        await refresh()
      },
      recover: async (username, recoveryCode, newPassword) => {
        const r = await api.recover({ username, recoveryCode, newPassword })
        await refresh()
        return r
      },
      logout: async () => {
        await api.logout()
        setState({ status: "anonymous" })
      },
      refresh,
    }),
    [refresh],
  )

  return <AccountContext.Provider value={{ state, actions }}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>")
  return ctx
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/daniel/personal/game && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/
git commit -m "feat: useAccount context for session state

AccountProvider hits /me once on mount to decide anonymous vs signed-in.
Exposes signup/login/recover/logout actions that re-refresh on success.
Network errors fall back to anonymous so the app still works offline."
```

---

## Task 3: AccountPanel UI

**Goal:** A self-contained component that renders one of: signed-in summary, signup form, login form, recovery form. State machine: signed-in ⇄ {signup | login | recover}. After signup or recover success, show the recovery code in a one-time dialog (must be confirmed before continuing).

**Files:**
- Create: `/src/ui/AccountPanel.tsx`

- [ ] **Step 1: Create `/src/ui/AccountPanel.tsx`**

```tsx
import { useState } from "react"
import { useAccount } from "@/auth/account-context"
import { ApiError } from "@/net/api"

type View = "signed-in" | "signup" | "login" | "recover"

export function AccountPanel() {
  const { state, actions } = useAccount()
  const [view, setView] = useState<View>("login")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)

  const errorFor = (e: unknown): string => {
    if (e instanceof ApiError) {
      switch (e.code) {
        case "USERNAME_TAKEN": return "That username is already taken."
        case "INVALID_CREDENTIALS": return "Wrong username, password, or recovery code."
        case "INVALID_BODY": return e.message
        case "RATE_LIMITED": return "Too many attempts. Wait a moment and try again."
        case "NETWORK": return "Cannot reach server. Check your connection."
        default: return e.message
      }
    }
    return e instanceof Error ? e.message : "Unknown error"
  }

  const submit = async (action: () => Promise<void | { recoveryCode: string }>) => {
    setBusy(true); setError(null)
    try {
      const result = await action()
      if (result && "recoveryCode" in result) setRecoveryCode(result.recoveryCode)
    } catch (e) {
      setError(errorFor(e))
    } finally {
      setBusy(false)
    }
  }

  if (state.status === "loading") {
    return <div className="text-sm text-zinc-400">Checking account…</div>
  }

  // One-time recovery code dialog blocks the panel until acknowledged.
  if (recoveryCode) {
    return (
      <div className="rounded border border-amber-600/40 bg-amber-900/20 p-4 space-y-3">
        <div className="text-amber-300 font-semibold">Save your recovery code</div>
        <div className="text-sm text-zinc-300">
          This is the only way to recover your account if you forget your password.
          It will not be shown again.
        </div>
        <div className="rounded bg-zinc-900 p-2 font-mono text-center text-amber-200 tracking-widest break-all">
          {recoveryCode}
        </div>
        <button
          onClick={() => { setRecoveryCode(null); setView("signed-in") }}
          className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-zinc-900 font-semibold"
        >
          I&apos;ve saved my code
        </button>
      </div>
    )
  }

  if (state.status === "signed-in") {
    return (
      <div className="space-y-3">
        <div className="text-sm">
          Signed in as <span className="font-mono text-emerald-400">{state.username}</span>
        </div>
        <div className="text-xs text-zinc-500">
          {state.saveCount} save{state.saveCount === 1 ? "" : "s"} on this account
        </div>
        <button
          onClick={() => void submit(() => actions.logout())}
          disabled={busy}
          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
        >
          Sign out
        </button>
        {error && <div className="text-sm text-rose-400">{error}</div>}
      </div>
    )
  }

  // anonymous / error → forms
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        <TabBtn active={view === "login"} onClick={() => setView("login")}>Sign in</TabBtn>
        <TabBtn active={view === "signup"} onClick={() => setView("signup")}>Create account</TabBtn>
        <TabBtn active={view === "recover"} onClick={() => setView("recover")}>Forgot password</TabBtn>
      </div>

      {view === "signup" && (
        <CredsForm
          fields={["username", "password"]}
          submitLabel="Create account"
          busy={busy}
          onSubmit={(v) => submit(() => actions.signup(v.username, v.password))}
        />
      )}
      {view === "login" && (
        <CredsForm
          fields={["username", "password"]}
          submitLabel="Sign in"
          busy={busy}
          onSubmit={(v) => submit(() => actions.login(v.username, v.password))}
        />
      )}
      {view === "recover" && (
        <CredsForm
          fields={["username", "recoveryCode", "newPassword"]}
          submitLabel="Reset password"
          busy={busy}
          onSubmit={(v) =>
            submit(() => actions.recover(v.username, v.recoveryCode, v.newPassword))
          }
        />
      )}

      {error && <div className="text-sm text-rose-400">{error}</div>}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs ${
        active ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  )
}

type CredsField = "username" | "password" | "newPassword" | "recoveryCode"
const FIELD_LABELS: Record<CredsField, string> = {
  username: "Username",
  password: "Password",
  newPassword: "New password",
  recoveryCode: "Recovery code",
}

function CredsForm({
  fields,
  submitLabel,
  busy,
  onSubmit,
}: {
  fields: CredsField[]
  submitLabel: string
  busy: boolean
  onSubmit: (values: Record<CredsField, string>) => void
}) {
  const [vals, setVals] = useState<Record<CredsField, string>>({
    username: "", password: "", newPassword: "", recoveryCode: "",
  })
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(vals) }}
      className="space-y-2"
    >
      {fields.map((f) => (
        <label key={f} className="block text-xs text-zinc-400">
          {FIELD_LABELS[f]}
          <input
            type={f.toLowerCase().includes("password") ? "password" : "text"}
            value={vals[f]}
            onChange={(e) => setVals({ ...vals, [f]: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={busy}
        className="w-full px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-sm font-semibold"
      >
        {busy ? "…" : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/daniel/personal/game && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/AccountPanel.tsx
git commit -m "feat(ui): AccountPanel with signup / login / recover / logout

State-machine view for the in-Settings account section. Recovery code
shown once in a dismissible dialog after signup/recover. Error mapping
turns ApiError codes into human-readable messages."
```

---

## Task 4: Wire AccountPanel into SettingsMenu + Sync settings toggle

**Goal:** SettingsMenu gains an "Account" tab/section showing the AccountPanel. When signed in, also show a "Sync settings to account" toggle.

**Files:**
- Modify: `/src/ui/SettingsMenu.tsx`

- [ ] **Step 1: Read existing SettingsMenu structure to understand its layout**

```bash
cat /Users/daniel/personal/game/src/ui/SettingsMenu.tsx
```

The component uses a tabbed structure (Audio, Controls, etc.). Identify the tab pattern.

- [ ] **Step 2: Add an "Account" tab**

Use the Edit tool to add Account as a new tab option. The exact code depends on the existing tab structure — find where tabs are rendered (likely an array or switch on a `view` state) and add `"account"` as a new option. The Account view's body renders `<AccountPanel />`.

Add the import at the top:
```typescript
import { AccountPanel } from "@/ui/AccountPanel"
```

- [ ] **Step 3: Add a "Sync settings to account" checkbox in the Account view, only when signed in**

Below the AccountPanel render, add:
```tsx
{useAccountStateForToggle() && (
  <label className="mt-4 flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={settings.syncToAccount ?? false}
      onChange={(e) => updateSetting("syncToAccount", e.target.checked)}
    />
    Sync settings to account
  </label>
)}
```

This requires:
- Adding `syncToAccount?: boolean` to the Settings type in `/src/shared/settings.ts`
- Adding a default `syncToAccount: false` in `/src/game/settings.ts` defaults
- Threading the change through the SettingsMenu's `updateSetting` (or whatever its setter pattern is)

The toggle's *effect* (actually pushing settings to the server) lands in Task 6's useSync hook.

- [ ] **Step 4: Verify typecheck + build**

```bash
cd /Users/daniel/personal/game && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/SettingsMenu.tsx src/shared/settings.ts src/game/settings.ts
git commit -m "feat(ui): Account tab in Settings + sync-settings toggle

Adds 'Account' as a new SettingsMenu tab rendering AccountPanel. When
signed in, surfaces a 'Sync settings to account' checkbox that drives
the settings opt-in. Push behavior wires through useSync next."
```

---

## Task 5: Main-menu signed-in badge

**Goal:** When signed in, render "👤 username" in the top-right of the MainMenu. Clicking it navigates to Settings → Account.

**Files:**
- Modify: `/src/ui/screens.tsx` (MainMenu function)
- Modify: `/src/App.tsx` (mount AccountProvider, route badge click to settings)

- [ ] **Step 1: Wrap App's render tree in `<AccountProvider>`**

In `/src/App.tsx`, find the top-level return and wrap the existing JSX in `<AccountProvider>...</AccountProvider>`. Add the import:
```typescript
import { AccountProvider } from "@/auth/account-context"
```

The wrap looks like:
```tsx
return (
  <AccountProvider>
    {/* existing top-level JSX */}
  </AccountProvider>
)
```

- [ ] **Step 2: Add badge to MainMenu in `/src/ui/screens.tsx`**

In `MainMenu`, import `useAccount` and conditionally render a small badge in the top-right:
```typescript
import { useAccount } from "@/auth/account-context"

// inside MainMenu:
const { state } = useAccount()
// ...
{state.status === "signed-in" && (
  <button
    onClick={onOpenSettingsAccount}
    className="absolute top-3 right-3 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-300 font-mono"
  >
    👤 {state.username}
  </button>
)}
```

Add `onOpenSettingsAccount: () => void` to MainMenuProps. In App.tsx pass a callback that does both `setScene("settings")` and stores a "open Account tab" hint somewhere (use a ref or a small piece of state in App). The simplest pattern: introduce a `settingsInitialTab` ref that App writes before navigating; SettingsMenu reads it once on mount.

- [ ] **Step 3: Verify typecheck + build**

```bash
cd /Users/daniel/personal/game && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/ui/screens.tsx
git commit -m "feat(ui): main-menu signed-in badge → opens Settings → Account

AccountProvider mounts at App root. MainMenu shows a tiny username badge
top-right when signed in; clicking it navigates to Settings with the
Account tab pre-selected."
```

---

## Task 6: useSync hook — pull on mount, push on save, conflict detection

**Goal:** Single hook centralizing all sync behavior. On sign-in or app start while signed in, pull the manifest. For each slot where the server is newer, surface a conflict to the UI. After every local save, push to the server (best-effort; failure logs but doesn't block local play).

**Files:**
- Create: `/src/sync/conflict.ts`
- Create: `/src/sync/use-sync.ts`

- [ ] **Step 1: Create `/src/sync/conflict.ts` — pure logic**

```typescript
import type { SaveManifestEntry } from "@/net/api"
import type { SaveMeta } from "@/shared/save"

export interface SyncConflict {
  slotKey: string
  serverMeta: SaveMeta
  serverUpdatedAt: string
  localMeta: SaveMeta
  localUpdatedAt: string
}

// Returns slots where server is strictly newer than local.
// Uses ISO string comparison — server timestamps are canonical.
export function findConflicts(
  serverList: SaveManifestEntry[],
  localManifest: ReadonlyArray<SaveMeta & { updatedAt?: string }>,
): SyncConflict[] {
  const out: SyncConflict[] = []
  for (const s of serverList) {
    const local = localManifest.find((m) => m.id === s.slotKey)
    if (!local) continue
    const localTs = local.updatedAt ?? local.date
    if (s.updatedAt > localTs) {
      out.push({
        slotKey: s.slotKey,
        serverMeta: s.meta,
        serverUpdatedAt: s.updatedAt,
        localMeta: local,
        localUpdatedAt: localTs,
      })
    }
  }
  return out
}
```

- [ ] **Step 2: Create `/src/sync/use-sync.ts` — orchestrator hook**

```typescript
import { useCallback, useEffect, useState } from "react"
import { useAccount } from "@/auth/account-context"
import { api, ApiError } from "@/net/api"
import { fetchManifest, getSave, persistManifest, setSave, deleteSave } from "@/game/save"
import { findConflicts, type SyncConflict } from "./conflict"
import type { SaveData, SaveMeta, SaveManifest } from "@/shared/save"

export interface SyncState {
  conflicts: SyncConflict[]
  /** server slots not present locally — pulled on next manifest sync */
  newRemoteSlots: string[]
  pulling: boolean
  pushing: boolean
  lastPullAt: string | null
  lastError: string | null
}

export interface SyncActions {
  pullManifest: () => Promise<void>
  resolveConflict: (slotKey: string, choice: "cloud" | "local") => Promise<void>
  pushSave: (slotKey: string, data: SaveData, meta: SaveMeta) => Promise<void>
  deleteRemote: (slotKey: string) => Promise<void>
}

export function useSync(): { state: SyncState; actions: SyncActions } {
  const { state: account } = useAccount()
  const [state, setState] = useState<SyncState>({
    conflicts: [],
    newRemoteSlots: [],
    pulling: false,
    pushing: false,
    lastPullAt: null,
    lastError: null,
  })

  const pullManifest = useCallback(async () => {
    if (account.status !== "signed-in") return
    setState((s) => ({ ...s, pulling: true, lastError: null }))
    try {
      const serverList = await api.savesList()
      const localManifest = fetchManifest()
      const conflicts = findConflicts(serverList, localManifest as ReadonlyArray<SaveMeta & { updatedAt?: string }>)
      const localIds = new Set(localManifest.map((m) => m.id))
      const newRemote = serverList.filter((s) => !localIds.has(s.slotKey)).map((s) => s.slotKey)

      // Pull any new remote slots wholesale into local (no conflict — local doesn't have them).
      for (const slotKey of newRemote) {
        try {
          const got = await api.saveGet(slotKey)
          setSave(slotKey, got.data)
          // Append meta to manifest if not present.
          const fresh = fetchManifest()
          if (!fresh.find((m) => m.id === slotKey)) {
            persistManifest([...(fresh), got.meta])
          }
        } catch {
          // best-effort; if a single slot fails just leave it for next pull
        }
      }

      setState((s) => ({
        ...s,
        pulling: false,
        conflicts,
        newRemoteSlots: newRemote,
        lastPullAt: new Date().toISOString(),
      }))
    } catch (e) {
      setState((s) => ({
        ...s,
        pulling: false,
        lastError: e instanceof ApiError ? e.message : "Pull failed",
      }))
    }
  }, [account.status])

  const resolveConflict = useCallback(async (slotKey: string, choice: "cloud" | "local") => {
    if (account.status !== "signed-in") return
    if (choice === "cloud") {
      try {
        const got = await api.saveGet(slotKey)
        setSave(slotKey, got.data)
        const m = fetchManifest()
        const next = m.filter((x) => x.id !== slotKey).concat(got.meta)
        persistManifest(next)
      } catch (e) {
        setState((s) => ({ ...s, lastError: e instanceof ApiError ? e.message : "Pull failed" }))
        return
      }
    } else {
      // push local to server
      const data = getSave(slotKey)
      const meta = fetchManifest().find((m) => m.id === slotKey)
      if (data && meta) {
        try {
          await api.savePut(slotKey, { data, meta })
        } catch (e) {
          setState((s) => ({ ...s, lastError: e instanceof ApiError ? e.message : "Push failed" }))
          return
        }
      }
    }
    setState((s) => ({ ...s, conflicts: s.conflicts.filter((c) => c.slotKey !== slotKey) }))
  }, [account.status])

  const pushSave = useCallback(
    async (slotKey: string, data: SaveData, meta: SaveMeta) => {
      if (account.status !== "signed-in") return
      setState((s) => ({ ...s, pushing: true }))
      try {
        await api.savePut(slotKey, { data, meta })
        setState((s) => ({ ...s, pushing: false }))
      } catch (e) {
        setState((s) => ({
          ...s,
          pushing: false,
          lastError: e instanceof ApiError ? e.message : "Push failed",
        }))
      }
    },
    [account.status],
  )

  const deleteRemote = useCallback(async (slotKey: string) => {
    if (account.status !== "signed-in") return
    try {
      await api.saveDelete(slotKey)
    } catch {
      // best-effort
    }
  }, [account.status])

  // Pull manifest on transition to signed-in.
  useEffect(() => {
    if (account.status === "signed-in") {
      void pullManifest()
    }
  }, [account.status, pullManifest])

  return { state, actions: { pullManifest, resolveConflict, pushSave, deleteRemote } }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/daniel/personal/game && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/sync/
git commit -m "feat(sync): useSync hook + conflict detection

Pull manifest on transition to signed-in. New remote slots pulled
wholesale. Conflicts (server newer than local) surfaced via state.
pushSave + deleteRemote called from save.ts wrappers (next task).
All errors are best-effort — local play never blocks on a server hiccup."
```

---

## Task 7: Wire useSync into App.tsx — push on every save, render conflict modal

**Goal:** App.tsx mounts useSync. After every local `setSave()` call, also call `actions.pushSave()`. After every local `deleteSave()`, also call `actions.deleteRemote()`. Conflicts are rendered as a modal.

**Files:**
- Modify: `/src/App.tsx`
- Create: `/src/ui/ConflictModal.tsx`

- [ ] **Step 1: Create `/src/ui/ConflictModal.tsx`**

```tsx
import type { SyncConflict } from "@/sync/conflict"

interface Props {
  conflict: SyncConflict
  onResolve: (choice: "cloud" | "local") => void
}

export function ConflictModal({ conflict, onResolve }: Props) {
  const fmt = (iso: string) => new Date(iso).toLocaleString()
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="max-w-md w-full rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="text-lg font-semibold">Save conflict</div>
        <div className="text-sm text-zinc-400">
          The cloud copy of <span className="font-mono text-zinc-200">{conflict.serverMeta.name}</span> is newer
          than your local copy. Which do you want to keep?
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded border border-zinc-700 p-3 space-y-1">
            <div className="text-emerald-400 font-semibold">Cloud</div>
            <div>Level {conflict.serverMeta.level}</div>
            <div className="text-zinc-500">{fmt(conflict.serverUpdatedAt)}</div>
          </div>
          <div className="rounded border border-zinc-700 p-3 space-y-1">
            <div className="text-amber-400 font-semibold">Local</div>
            <div>Level {conflict.localMeta.level}</div>
            <div className="text-zinc-500">{fmt(conflict.localUpdatedAt)}</div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onResolve("local")}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          >
            Keep local
          </button>
          <button
            onClick={() => onResolve("cloud")}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-sm"
          >
            Use cloud
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: In App.tsx, mount useSync inside the AccountProvider**

The `useSync()` hook MUST be called inside a component that's inside `<AccountProvider>`. The simplest pattern: introduce a thin `<AppContents />` component for the existing App body, mount `<AccountProvider><AppContents /></AccountProvider>` from the exported App, and inside AppContents call `useSync()`.

```typescript
// in App.tsx, refactor:
export default function App() {
  return (
    <AccountProvider>
      <AppContents />
    </AccountProvider>
  )
}

function AppContents() {
  const sync = useSync()
  // ... existing App body, with `sync.actions.pushSave(...)` called wherever
  // setSave(...) is called today.
}
```

- [ ] **Step 3: Add pushSave calls alongside every setSave call in App.tsx**

Find both `setSave(id, data)` call sites (autosave at ~line 591, manual save at ~line 541). After each, add:
```typescript
void sync.actions.pushSave(id, data, meta)
```

Where `meta` is the SaveMeta object built locally for the manifest. (Both call sites build a meta object — pass that in.)

- [ ] **Step 4: Add deleteRemote calls alongside deleteSave**

Find every `deleteSave(id)` call in App.tsx (likely in the LoadMenu's onDelete callback). After each, add:
```typescript
void sync.actions.deleteRemote(id)
```

- [ ] **Step 5: Render the ConflictModal when conflicts exist**

In AppContents' returned JSX, near the other modals, add:
```tsx
{sync.state.conflicts[0] && (
  <ConflictModal
    conflict={sync.state.conflicts[0]}
    onResolve={(choice) => void sync.actions.resolveConflict(sync.state.conflicts[0]!.slotKey, choice)}
  />
)}
```

This shows one conflict at a time, in arrival order. Resolving removes it from the list so the next one surfaces.

- [ ] **Step 6: When the conflict resolves to "cloud", refresh the manifest in App's React state**

After `resolveConflict("cloud", ...)` returns, the local manifest changes on disk but App.tsx holds it in `manifest` state. Add an effect or a callback to re-read it:

```typescript
useEffect(() => {
  // When conflicts change (a resolution just happened), re-read the manifest.
  setManifest(fetchManifest())
}, [sync.state.conflicts.length])
```

(Acceptable rough trigger — fires on push/pull cycles too, which is fine because fetchManifest is cheap.)

- [ ] **Step 7: Verify typecheck + build**

```bash
cd /Users/daniel/personal/game && npm run typecheck && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/ui/ConflictModal.tsx
git commit -m "feat: push-on-save + delete propagation + conflict modal

Every setSave is mirrored as a pushSave to the server (best-effort).
Every deleteSave triggers deleteRemote. Conflict modal renders when
the server has a newer copy of any local slot — user picks cloud or
local; choice executes and removes the conflict from the queue."
```

---

## Task 8: Upload-local-saves prompt on first sign-in

**Goal:** When transitioning from anonymous to signed-in, if local saves exist AND no server saves exist for this account, show a one-time modal: "You have N local saves. Upload to your account?" with Yes / No / Discard local.

**Files:**
- Create: `/src/sync/upload-local.ts`
- Create: `/src/ui/UploadLocalPrompt.tsx`
- Modify: `/src/App.tsx` (or AppContents) to render the prompt when conditions match

- [ ] **Step 1: Create `/src/sync/upload-local.ts`**

```typescript
import { api } from "@/net/api"
import { fetchManifest, getSave, deleteSave, persistManifest } from "@/game/save"

export async function uploadAllLocalSaves(): Promise<{ uploaded: number; failed: string[] }> {
  const manifest = fetchManifest()
  const failed: string[] = []
  let uploaded = 0
  for (const meta of manifest) {
    const data = getSave(meta.id)
    if (!data) continue
    try {
      await api.savePut(meta.id, { data, meta })
      uploaded += 1
    } catch {
      failed.push(meta.id)
    }
  }
  return { uploaded, failed }
}

export function discardAllLocalSaves(): void {
  const manifest = fetchManifest()
  for (const m of manifest) deleteSave(m.id)
  persistManifest([])
}
```

- [ ] **Step 2: Create `/src/ui/UploadLocalPrompt.tsx`**

```tsx
interface Props {
  count: number
  onUpload: () => void
  onKeepLocalOnly: () => void
  onDiscardLocal: () => void
  busy: boolean
}

export function UploadLocalPrompt({ count, onUpload, onKeepLocalOnly, onDiscardLocal, busy }: Props) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="max-w-md w-full rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="text-lg font-semibold">Upload local saves?</div>
        <div className="text-sm text-zinc-400">
          You have <span className="text-zinc-200 font-semibold">{count}</span> save
          {count === 1 ? "" : "s"} on this device. Upload them to your account so they sync across devices?
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onUpload}
            disabled={busy}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-sm font-semibold"
          >
            {busy ? "Uploading…" : "Upload to account"}
          </button>
          <button
            onClick={onKeepLocalOnly}
            disabled={busy}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-sm"
          >
            Keep local-only (don&apos;t upload)
          </button>
          <button
            onClick={onDiscardLocal}
            disabled={busy}
            className="px-3 py-2 bg-rose-900 hover:bg-rose-800 disabled:opacity-50 rounded text-sm"
          >
            Discard local saves
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount the prompt logic in AppContents**

Track when we've already prompted (`localStorage["aw:upload-prompt-shown:<username>"]`) so it shows once per account-on-this-device.

```typescript
const [uploadPrompt, setUploadPrompt] = useState<{ count: number; busy: boolean } | null>(null)

useEffect(() => {
  if (account.state.status !== "signed-in") return
  const key = `aw:upload-prompt-shown:${account.state.username}`
  if (localStorage.getItem(key)) return
  // Only prompt if local has saves AND server has zero saves.
  if (account.state.saveCount > 0) {
    localStorage.setItem(key, "1") // server already has saves; never prompt again
    return
  }
  const localCount = fetchManifest().length
  if (localCount === 0) return
  setUploadPrompt({ count: localCount, busy: false })
}, [account.state])

// Render the prompt if active:
{uploadPrompt && (
  <UploadLocalPrompt
    count={uploadPrompt.count}
    busy={uploadPrompt.busy}
    onUpload={async () => {
      setUploadPrompt({ ...uploadPrompt, busy: true })
      const r = await uploadAllLocalSaves()
      // mark prompt-as-shown for this account
      if (account.state.status === "signed-in") {
        localStorage.setItem(`aw:upload-prompt-shown:${account.state.username}`, "1")
      }
      setUploadPrompt(null)
      pushNotif(`Uploaded ${r.uploaded} save${r.uploaded === 1 ? "" : "s"}`, "discovery")
      void account.actions.refresh() // updates saveCount in /me state
    }}
    onKeepLocalOnly={() => {
      if (account.state.status === "signed-in") {
        localStorage.setItem(`aw:upload-prompt-shown:${account.state.username}`, "1")
      }
      setUploadPrompt(null)
    }}
    onDiscardLocal={() => {
      discardAllLocalSaves()
      if (account.state.status === "signed-in") {
        localStorage.setItem(`aw:upload-prompt-shown:${account.state.username}`, "1")
      }
      setUploadPrompt(null)
      setManifest([])
      pushNotif("Local saves discarded", "xp")
    }}
  />
)}
```

- [ ] **Step 4: Verify typecheck + build**

```bash
cd /Users/daniel/personal/game && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/sync/upload-local.ts src/ui/UploadLocalPrompt.tsx src/App.tsx
git commit -m "feat: upload-local prompt on first sign-in per account

If local saves exist AND server has zero saves for this account, show
a 3-button prompt: upload / keep-local / discard. Choice persists per
(account × this browser) so it never re-prompts."
```

---

## Task 9: Settings sync push/pull wired through useSync

**Goal:** When `settings.syncToAccount === true`, settings changes push to the server. On sign-in, if server has settings, pull them and apply.

**Files:**
- Modify: `/src/sync/use-sync.ts` (add settings sync methods)
- Modify: `/src/App.tsx` (call settings push on settings change; pull on sign-in)

- [ ] **Step 1: Add `pushSettings` and `pullSettings` to useSync**

In `/src/sync/use-sync.ts`, expose:

```typescript
import { saveSettings, loadSettings } from "@/game/settings"
import type { Settings } from "@/shared/settings"

// inside useSync:
const pushSettings = useCallback(async (data: Settings) => {
  if (account.status !== "signed-in") return
  if (!data.syncToAccount) return
  try {
    await api.settingsPut({ data: data as unknown as Record<string, unknown> })
  } catch {
    // best-effort
  }
}, [account.status])

const pullSettings = useCallback(async (): Promise<Settings | null> => {
  if (account.status !== "signed-in") return null
  try {
    const r = await api.settingsGet()
    return r.data as Settings
  } catch (e) {
    if (e instanceof ApiError && e.code === "SETTINGS_NOT_FOUND") return null
    return null
  }
}, [account.status])

// Add to returned actions object:
return { state, actions: { pullManifest, resolveConflict, pushSave, deleteRemote, pushSettings, pullSettings } }
```

- [ ] **Step 2: In App.tsx, push settings whenever they change AND opt-in is on**

Find the settings update path (the SettingsMenu's onApply callback, or wherever `setSettings` + `saveSettings(next)` happens). After saving locally, also call:

```typescript
void sync.actions.pushSettings(next)
```

- [ ] **Step 3: On sign-in, optionally pull settings**

In an effect keyed on `account.state.status === "signed-in"`:

```typescript
useEffect(() => {
  if (account.state.status !== "signed-in") return
  if (!settings.syncToAccount) return
  void (async () => {
    const remote = await sync.actions.pullSettings()
    if (remote) {
      setSettings(remote)
      saveSettings(remote)
    }
  })()
}, [account.state.status])
```

- [ ] **Step 4: Verify typecheck + build**

```bash
cd /Users/daniel/personal/game && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/sync/use-sync.ts src/App.tsx
git commit -m "feat(sync): settings push/pull when syncToAccount is on

Settings changes push to /settings whenever the toggle is on. On
sign-in, if server has settings, pull them and replace local. Opt-in
gate keeps the default device-specific behavior intact."
```

---

## Task 10: End-to-end browser smoke test (manual + scripted)

**Goal:** Validate the full flow in a real browser. No code changes unless something surfaces.

**Files:** none (manual verification)

- [ ] **Step 1: Boot backend + frontend**

In one terminal:
```bash
cd /Users/daniel/personal/game/server && npm run dev
```

In another:
```bash
cd /Users/daniel/personal/game && npm run dev
```

Open the Vite URL (usually http://localhost:5173).

- [ ] **Step 2: Walk the happy path manually**

1. Game loads as anonymous. MainMenu shows no badge.
2. Settings → Account → Create account → username "smoke", password "test-password-123" → recovery code dialog shown → "I've saved my code" → signed in.
3. Tiny "👤 smoke" badge appears top-right of MainMenu.
4. Start a New Journey → play a few seconds → Esc → return to menu (autosave-on-exit fires).
5. Open DevTools → Application → Local Storage → confirm a `drift:save:autosave` row exists with `"version":1`.
6. Open DevTools → Network → filter for `/saves` → confirm a `PUT /saves/autosave` happened with 200.
7. Settings → Account → Sign out. Badge disappears.
8. Refresh the page. App boots as anonymous. The local autosave is still in the LoadMenu (local-first).
9. Settings → Account → Sign in (smoke / test-password-123). Cloud-pulled saves appear; if local diverged, a conflict modal shows.
10. Sign out, switch to a different browser (Chrome → Firefox or vice versa), sign in to "smoke" — saves appear after the sync pull.

- [ ] **Step 3: Verify recovery flow**

1. Settings → Account → Forgot password → enter username + the recovery code from step 2 + new password → new recovery code dialog appears → confirm.
2. Sign out → sign in with the NEW password → succeeds.
3. Try the OLD recovery code → fails ("Wrong username, password, or recovery code").

- [ ] **Step 4: Clean up smoke users**

```bash
docker exec drift-postgres psql -U drift -d drift -c "DELETE FROM users WHERE username='smoke';"
```

- [ ] **Step 5: Final typecheck + lint**

```bash
cd /Users/daniel/personal/game && npm run typecheck && npm run lint
cd /Users/daniel/personal/game/server && npm run typecheck && npm test
```

All green expected.

- [ ] **Step 6: Commit (only if any small fixes were needed)**

If steps 1–5 surfaced fixes, commit them; otherwise this task closes without a commit.

---

## Done criteria

- [ ] `cd server && npm run dev` + `npm run dev` (root) lets a guest play unchanged
- [ ] Sign up via Settings → Account → see badge → save in-game → DevTools shows `PUT /saves/<id>` with 200
- [ ] Sign in on a second browser → saves appear after pull
- [ ] Conflict modal shows when local and server diverge; both choices work
- [ ] First sign-in upload prompt shows once per account-on-this-browser
- [ ] Recovery flow: invalidates old code, returns new code, lets user back in
- [ ] Settings sync toggle: when on, settings pushed and pulled; when off, settings stay local
- [ ] `npm run typecheck` clean (root + server); `npm run lint` clean; server tests still 33 green; `npm run build` clean

When all done: Plan 3 (Railway deploy) is the next thing to write.
