import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

const sampleSettings = { volume: 50, muted: true, fullscreen: false, keys: { jump: " " }, showTutorialNextStart: false }

describe("settings GET / PUT", () => {
  it("GET /settings returns 404 before first PUT (opt-in)", async () => {
    const { cookie } = await signupUser("nora")
    const res = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe("SETTINGS_NOT_FOUND")
  })

  it("PUT then GET round-trip", async () => {
    const { cookie } = await signupUser("oscar")
    const put = await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleSettings },
    })
    expect(put.statusCode).toBe(200)
    const get = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie } })
    expect(get.statusCode).toBe(200)
    expect(JSON.parse(get.body).data).toEqual(sampleSettings)
  })

  it("PUT upserts (second PUT overwrites)", async () => {
    const { cookie } = await signupUser("paul")
    await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleSettings },
    })
    const updated = { ...sampleSettings, volume: 99 }
    await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: updated },
    })
    const get = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie } })
    expect(JSON.parse(get.body).data.volume).toBe(99)
  })

  it("user isolation — separate accounts don't see each other's settings", async () => {
    const { cookie: aCookie } = await signupUser("quinn")
    const { cookie: bCookie } = await signupUser("rita")
    await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie: aCookie, "content-type": "application/json" },
      payload: { data: sampleSettings },
    })
    const res = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie: bCookie } })
    expect(res.statusCode).toBe(404)
  })

  it("401 without cookie", async () => {
    const res = await getApp().inject({ method: "GET", url: "/settings" })
    expect(res.statusCode).toBe(401)
  })
})
