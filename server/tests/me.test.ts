import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

describe("GET /me", () => {
  it("401s without a session cookie", async () => {
    const res = await getApp().inject({ method: "GET", url: "/me" })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({
      error: { code: "UNAUTHORIZED", message: "Not signed in" },
    })
  })

  it("returns the signed-in user's profile", async () => {
    const { cookie } = await signupUser("alice")
    const res = await getApp().inject({
      method: "GET",
      url: "/me",
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.username).toBe("alice")
    expect(body.saveCount).toBe(0)
    expect(typeof body.signedInAt).toBe("string")
  })
})
