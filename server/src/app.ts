import Fastify, { type FastifyInstance } from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import { AppError } from "./errors.js"
import { makeDb, type Db } from "./db/client.js"
import { registerSessionDecorator } from "./auth/session.js"
import { registerRoutes } from "./routes/index.js"
import type { Env } from "./env.js"

declare module "fastify" {
  interface FastifyInstance {
    db: Db
    env: Env
  }
}

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : true,
    disableRequestLogging: env.NODE_ENV === "test",
    trustProxy: env.NODE_ENV === "production",
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } })
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests" } })
    }
    app.log.error(err)
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } })
  })

  const db = makeDb(env)
  app.decorate("db", db)
  app.decorate("env", env)

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })

  await app.register(cookie)

  await app.register(rateLimit, {
    global: false,
    max: env.AUTH_RATE_MAX,
    timeWindow: env.AUTH_RATE_WINDOW,
  })

  registerSessionDecorator(app, db, env.SESSION_COOKIE_NAME)

  app.get("/health", async () => ({ ok: true }))

  await registerRoutes(app)

  return app
}
