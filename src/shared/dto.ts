import { z } from "zod"

// Auth
export const SignupBody = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "letters, digits, _ or - only"),
  password: z.string().min(8).max(128),
})
export type SignupBody = z.infer<typeof SignupBody>

export const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
})
export type LoginBody = z.infer<typeof LoginBody>

export const RecoverBody = z.object({
  username: z.string().min(1).max(64),
  recoveryCode: z.string().min(1).max(64),
  newPassword: z.string().min(8).max(128),
})
export type RecoverBody = z.infer<typeof RecoverBody>

export const SignupResponse = z.object({ recoveryCode: z.string() })
export const RecoverResponse = z.object({ recoveryCode: z.string() })
export const MeResponse = z.object({
  username: z.string(),
  signedInAt: z.string(),
  saveCount: z.number().int().nonnegative(),
})

export const SavePutBody = z.object({
  data: z.record(z.string(), z.unknown()),
  meta: z.record(z.string(), z.unknown()),
})
export type SavePutBody = z.infer<typeof SavePutBody>

export const SaveManifestEntry = z.object({
  slotKey: z.string(),
  meta: z.record(z.string(), z.unknown()),
  updatedAt: z.string(),
})
export const SaveManifestResponse = z.array(SaveManifestEntry)

export const SaveGetResponse = z.object({
  data: z.record(z.string(), z.unknown()),
  meta: z.record(z.string(), z.unknown()),
  updatedAt: z.string(),
})

export const SavePutResponse = z.object({ updatedAt: z.string() })

export const SettingsPutBody = z.object({ data: z.record(z.string(), z.unknown()) })
export type SettingsPutBody = z.infer<typeof SettingsPutBody>

export const SettingsGetResponse = z.object({
  data: z.record(z.string(), z.unknown()),
  updatedAt: z.string(),
})
