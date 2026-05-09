import type { FastifyInstance } from "fastify"
import { and, eq } from "drizzle-orm"
import { saves } from "../db/schema.js"
import { SavePutBody } from "@shared/dto.js"
import { Errors } from "../errors.js"

export async function savesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/saves", async (req) => {
    const user = await app.requireAuth(req)
    const rows = await app.db
      .select({
        slotKey: saves.slotKey,
        meta: saves.meta,
        updatedAt: saves.updatedAt,
      })
      .from(saves)
      .where(eq(saves.userId, user.id))
    return rows.map((r) => ({
      slotKey: r.slotKey,
      meta: r.meta,
      updatedAt: r.updatedAt.toISOString(),
    }))
  })

  app.get<{ Params: { slotKey: string } }>("/saves/:slotKey", async (req) => {
    const user = await app.requireAuth(req)
    const rows = await app.db
      .select()
      .from(saves)
      .where(and(eq(saves.userId, user.id), eq(saves.slotKey, req.params.slotKey)))
      .limit(1)
    const row = rows[0]
    if (!row) throw Errors.saveNotFound()
    return { data: row.data, meta: row.meta, updatedAt: row.updatedAt.toISOString() }
  })

  app.put<{ Params: { slotKey: string } }>("/saves/:slotKey", async (req) => {
    const user = await app.requireAuth(req)
    const parsed = SavePutBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")

    const now = new Date()
    const result = await app.db
      .insert(saves)
      .values({
        userId: user.id,
        slotKey: req.params.slotKey,
        data: parsed.data.data,
        meta: parsed.data.meta,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [saves.userId, saves.slotKey],
        set: { data: parsed.data.data, meta: parsed.data.meta, updatedAt: now },
      })
      .returning({ updatedAt: saves.updatedAt })
    const row = result[0]
    if (!row) throw new Error("Upsert returned no row")
    return { updatedAt: row.updatedAt.toISOString() }
  })

  app.delete<{ Params: { slotKey: string } }>("/saves/:slotKey", async (req, reply) => {
    const user = await app.requireAuth(req)
    await app.db
      .delete(saves)
      .where(and(eq(saves.userId, user.id), eq(saves.slotKey, req.params.slotKey)))
    return reply.status(204).send()
  })
}
