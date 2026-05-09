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
        // Server unreachable - treat as anonymous so the app still works.
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
