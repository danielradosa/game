import { describe, expect, it } from "vitest"
import { getApp } from "./helpers.js"

describe("POST /auth/signup", () => {
  it("creates a user, returns a recovery code, sets a session cookie", async () => {
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "alice", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.recoveryCode).toMatch(/^[A-Z2-7]{24}$/)
    const setCookie = res.headers["set-cookie"]
    expect(setCookie).toBeTruthy()
    expect(String(setCookie)).toContain("drift_session=")
    expect(String(setCookie)).toContain("HttpOnly")
  })

  it("rejects duplicate usernames", async () => {
    await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "bob", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "bob", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe("USERNAME_TAKEN")
  })

  it("rejects malformed bodies (short username)", async () => {
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "ab", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY")
  })
})
