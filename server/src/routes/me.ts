import type { FastifyInstance } from "fastify"
import { count, eq } from "drizzle-orm"
import { saves } from "../db/schema.js"

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (req) => {
    const user = await app.requireAuth(req)
    const result = await app.db.select({ value: count() }).from(saves).where(eq(saves.userId, user.id))
    const saveCount = result[0]?.value ?? 0
    return {
      username: user.username,
      signedInAt: user.signedInAt.toISOString(),
      saveCount: Number(saveCount),
    }
  })
}
