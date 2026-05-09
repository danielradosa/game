import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "../src/auth/argon.js"

describe("argon password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple")
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true)
  })

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("password1")
    expect(await verifyPassword(hash, "password2")).toBe(false)
  })

  it("produces different hashes for the same input (salt)", async () => {
    const a = await hashPassword("same input")
    const b = await hashPassword("same input")
    expect(a).not.toBe(b)
  })
})
