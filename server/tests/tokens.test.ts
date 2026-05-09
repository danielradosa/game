import { describe, expect, it } from "vitest"
import {
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  generateSessionToken,
  hashSessionToken,
} from "../src/auth/tokens.js"

describe("recovery code", () => {
  it("generates a 24-char base32 string", () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[A-Z2-7]{24}$/)
  })

  it("verifies the right code against its hash", async () => {
    const code = generateRecoveryCode()
    const hashed = await hashRecoveryCode(code)
    expect(await verifyRecoveryCode(hashed, code)).toBe(true)
  })

  it("rejects a wrong code", async () => {
    const code = generateRecoveryCode()
    const hashed = await hashRecoveryCode(code)
    expect(await verifyRecoveryCode(hashed, generateRecoveryCode())).toBe(false)
  })
})

describe("session token", () => {
  it("generates a base64url string", () => {
    const t = generateSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(32)
  })

  it("hashes deterministically (sha-256)", () => {
    const t = generateSessionToken()
    expect(hashSessionToken(t)).toBe(hashSessionToken(t))
  })

  it("hashes differently for different tokens", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken()),
    )
  })
})
