import { hash, verify, Algorithm } from "@node-rs/argon2"

const PEPPER = process.env.ARGON2_PEPPER ?? ""

if (!PEPPER) {
  throw new Error("ARGON2_PEPPER must be set before importing auth/argon")
}

const PEPPER_BUF = Buffer.from(PEPPER, "base64")

const ARGON_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MiB - OWASP 2024 minimum for argon2id
  timeCost: 2,
  parallelism: 1,
  secret: PEPPER_BUF,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return await hash(plain, ARGON_OPTS)
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain, { secret: PEPPER_BUF })
  } catch {
    return false
  }
}
