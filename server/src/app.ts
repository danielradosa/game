import Fastify, { type FastifyInstance } from "fastify"
import { AppError } from "./errors.js"
import type { Env } from "./env.js"

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : true,
    disableRequestLogging: env.NODE_ENV === "test",
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } })
    }
    app.log.error(err)
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } })
  })

  app.get("/health", async () => ({ ok: true }))

  return app
}
