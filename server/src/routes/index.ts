import type { FastifyInstance } from "fastify"
import { meRoutes } from "./me.js"

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(meRoutes)
  // auth, saves, settings registered in later tasks
}
