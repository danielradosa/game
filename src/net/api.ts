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
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
