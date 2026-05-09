import { randomBytes, createHash } from "node:crypto"
import { hashPassword, verifyPassword } from "./argon.js"

// RFC 4648 base32 alphabet (no padding, uppercase)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function generateRecoveryCode(): string {
  const bytes = randomBytes(15) // 15 bytes -> 24 base32 chars
  let out = ""
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += B32[(buffer >> bits) & 0x1f]
    }
  }
  if (bits > 0) {
    out += B32[(buffer << (5 - bits)) & 0x1f]
  }
  return out.slice(0, 24)
}

// Recovery codes are user-typed under stress - hash with the same argon2id
// pipeline as passwords for consistency.
export async function hashRecoveryCode(code: string): Promise<string> {
  return await hashPassword(code)
}

export async function verifyRecoveryCode(stored: string, code: string): Promise<boolean> {
  return await verifyPassword(stored, code)
}

// Session tokens are high-entropy random bytes. SHA-256 hash (no salt) is
// fine for storage - preimage-resistance is the only property we need, and
// the input is unguessable.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
