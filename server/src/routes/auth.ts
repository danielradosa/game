import type { FastifyInstance, FastifyReply } from "fastify"
import { eq } from "drizzle-orm"
import { users, sessions } from "../db/schema.js"
import { hashPassword } from "../auth/argon.js"
import {
  generateRecoveryCode,
  hashRecoveryCode,
  generateSessionToken,
  hashSessionToken,
} from "../auth/tokens.js"
import { SignupBody } from "@shared/dto.js"
import { Errors } from "../errors.js"

function setSessionCookie(reply: FastifyReply, token: string): void {
  const env = reply.server.env
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  })
}

async function createSession(app: FastifyInstance, userId: string): Promise<string> {
  const token = generateSessionToken()
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + app.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await app.db.insert(sessions).values({ tokenHash, userId, expiresAt })
  return token
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", async (req, reply) => {
    const parsed = SignupBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")

    const { username, password } = parsed.data

    const existing = await app.db.select().from(users).where(eq(users.username, username)).limit(1)
    if (existing.length > 0) throw Errors.usernameTaken()

    const passwordHash = await hashPassword(password)
    const recoveryCode = generateRecoveryCode()
    const recoveryCodeHash = await hashRecoveryCode(recoveryCode)

    const inserted = await app.db
      .insert(users)
      .values({ username, passwordHash, recoveryCodeHash, lastLoginAt: new Date() })
      .returning({ id: users.id })

    const userId = inserted[0]?.id
    if (!userId) throw new Error("Insert returned no row")

    const token = await createSession(app, userId)
    setSessionCookie(reply, token)
    return { recoveryCode }
  })
}
