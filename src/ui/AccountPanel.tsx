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
