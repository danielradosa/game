import type { FastifyInstance } from "fastify"
import { authRoutes } from "./auth.js"
import { meRoutes } from "./me.js"
import { savesRoutes } from "./saves.js"
import { settingsRoutes } from "./settings.js"

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes)
  await app.register(meRoutes)
  await app.register(savesRoutes)
  await app.register(settingsRoutes)
}
