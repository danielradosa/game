import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { userSettings } from "../db/schema.js"
import { SettingsPutBody } from "@shared/dto.js"
import { Errors } from "../errors.js"

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", async (req) => {
    const user = await app.requireAuth(req)
    const rows = await app.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1)
    const row = rows[0]
    if (!row) throw Errors.settingsNotFound()
    return { data: row.data, updatedAt: row.updatedAt.toISOString() }
  })

  app.put("/settings", async (req) => {
    const user = await app.requireAuth(req)
    const parsed = SettingsPutBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")

    const now = new Date()
    const result = await app.db
      .insert(userSettings)
      .values({ userId: user.id, data: parsed.data.data, updatedAt: now })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { data: parsed.data.data, updatedAt: now },
      })
      .returning({ updatedAt: userSettings.updatedAt })
    const row = result[0]
    if (!row) throw new Error("Upsert returned no row")
    return { updatedAt: row.updatedAt.toISOString() }
  })
}
