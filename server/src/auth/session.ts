import { hashSessionToken } from "./tokens.js"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { sessions, users } from "../db/schema.js"
import { eq, and, gt, isNull } from "drizzle-orm"
import { Errors } from "../errors.js"
import type { Db } from "../db/client.js"

export interface SessionUser {
  id: string
  username: string
  signedInAt: Date
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<SessionUser>
  }
}

const TOUCH_DEBOUNCE_MS = 24 * 60 * 60 * 1000

export function registerSessionDecorator(app: FastifyInstance, db: Db, cookieName: string): void {
  app.decorate("requireAuth", async (req: FastifyRequest): Promise<SessionUser> => {
    const raw = req.cookies[cookieName]
    if (!raw) throw Errors.unauthorized()
    const tokenHash = hashSessionToken(raw)
    const now = new Date()
    const rows = await db
      .select({
        userId: users.id,
        username: users.username,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row) throw Errors.unauthorized()

    const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? 30)
    const newExpires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
    const remainingMs = row.expiresAt.getTime() - now.getTime()
    const fullTtlMs = ttlDays * 24 * 60 * 60 * 1000
    if (fullTtlMs - remainingMs > TOUCH_DEBOUNCE_MS) {
      await db
        .update(sessions)
        .set({ expiresAt: newExpires })
        .where(eq(sessions.tokenHash, tokenHash))
    }

    req.user = {
      id: row.userId,
      username: row.username,
      signedInAt: row.createdAt,
    }
    return req.user
  })
}
