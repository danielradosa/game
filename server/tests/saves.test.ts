import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

const sampleData = { version: 1, hud: { level: 4 }, pos: { x: 100, y: 200 } }
const sampleMeta = { id: "slot-a", level: 4, name: "Test Save" }

describe("saves CRUD", () => {
  it("PUT /saves/:slotKey upserts and returns updatedAt", async () => {
    const { cookie } = await signupUser("ivan")
    const res = await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).updatedAt).toMatch(/T/)
  })

  it("GET /saves returns the manifest for the signed-in user only", async () => {
    const { cookie: ivanCookie } = await signupUser("judy")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie: ivanCookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const res = await getApp().inject({
      method: "GET",
      url: "/saves",
      headers: { cookie: ivanCookie },
    })
    expect(res.statusCode).toBe(200)
    const list = JSON.parse(res.body)
    expect(list).toHaveLength(1)
    expect(list[0].slotKey).toBe("slot-a")
    expect(list[0].meta).toEqual(sampleMeta)
  })

  it("GET /saves/:slotKey returns the full save", async () => {
    const { cookie } = await signupUser("kate")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const res = await getApp().inject({
      method: "GET",
      url: "/saves/slot-a",
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toEqual(sampleData)
    expect(body.meta).toEqual(sampleMeta)
  })

  it("PUT /saves/:slotKey upserts (overwrites existing data)", async () => {
    const { cookie } = await signupUser("liam")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const newData = { ...sampleData, hud: { level: 99 } }
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: newData, meta: sampleMeta },
    })
    const get = await getApp().inject({ method: "GET", url: "/saves/slot-a", headers: { cookie } })
    expect(JSON.parse(get.body).data.hud.level).toBe(99)
  })

  it("DELETE /saves/:slotKey removes the save", async () => {
    const { cookie } = await signupUser("mia")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const del = await getApp().inject({ method: "DELETE", url: "/saves/slot-a", headers: { cookie } })
    expect(del.statusCode).toBe(204)
    const get = await getApp().inject({ method: "GET", url: "/saves/slot-a", headers: { cookie } })
    expect(get.statusCode).toBe(404)
  })

  it("user isolation — Alice cannot see Bob's saves", async () => {
    const { cookie: aliceCookie } = await signupUser("alice2")
    const { cookie: bobCookie } = await signupUser("bob2")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie: aliceCookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const bobList = await getApp().inject({ method: "GET", url: "/saves", headers: { cookie: bobCookie } })
    expect(JSON.parse(bobList.body)).toEqual([])

    const bobGet = await getApp().inject({ method: "GET", url: "/saves/slot-a", headers: { cookie: bobCookie } })
    expect(bobGet.statusCode).toBe(404)
  })

  it("401 without cookie", async () => {
    const res = await getApp().inject({ method: "GET", url: "/saves" })
    expect(res.statusCode).toBe(401)
  })
})
