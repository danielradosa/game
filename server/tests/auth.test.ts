import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

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

describe("POST /auth/login", () => {
  it("signs in with correct credentials", async () => {
    await signupUser("carol")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "carol", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(200)
    expect(String(res.headers["set-cookie"])).toContain("drift_session=")
  })

  it("rejects wrong password", async () => {
    await signupUser("dave")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "dave", password: "wrong-password" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_CREDENTIALS")
  })

  it("rejects unknown username with the same error code (no enumeration)", async () => {
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "ghost", password: "anything" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_CREDENTIALS")
  })
})

describe("POST /auth/logout", () => {
  it("revokes the session and clears the cookie", async () => {
    const { cookie } = await signupUser("eve")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie },
    })
    expect(res.statusCode).toBe(204)
    const me = await getApp().inject({ method: "GET", url: "/me", headers: { cookie } })
    expect(me.statusCode).toBe(401)
  })
})
