import type { FastifyInstance, FastifyReply } from "fastify"
import { eq, and, isNull } from "drizzle-orm"
import { users, sessions } from "../db/schema.js"
import { hashPassword, verifyPassword } from "../auth/argon.js"
import {
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  generateSessionToken,
  hashSessionToken,
} from "../auth/tokens.js"
import { SignupBody, LoginBody, RecoverBody } from "@shared/dto.js"
import { Errors } from "../errors.js"

function setSessionCookie(reply: FastifyReply, token: string): void {
  const env = reply.server.env
  // SameSite policy:
  //   - prod (COOKIE_SECURE=true): "none" so the cookie travels on
  //     cross-site fetch/XHR from the frontend origin to the API origin.
  //     Required because up.railway.app is on the Public Suffix List —
  //     each *.up.railway.app subdomain is a separate site, so SameSite=Lax
  //     would block the cookie on the frontend's fetch() to the API.
  //   - dev (COOKIE_SECURE=false): "lax" — same-origin in dev so we don't
  //     need None, and browsers reject SameSite=None without Secure.
  const sameSite = env.COOKIE_SECURE ? ("none" as const) : ("lax" as const)
  const opts = {
    httpOnly: true,
    sameSite,
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  }
  reply.setCookie(env.SESSION_COOKIE_NAME, token, opts)
}

async function createSession(app: FastifyInstance, userId: string): Promise<string> {
  const token = generateSessionToken()
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + app.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await app.db.insert(sessions).values({ tokenHash, userId, expiresAt })
  return token
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", { config: { rateLimit: {} } }, async (req, reply) => {
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

  app.post("/auth/login", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")
    const { username, password } = parsed.data

    const rows = await app.db.select().from(users).where(eq(users.username, username)).limit(1)
    const user = rows[0]
    // Constant-ish work whether user exists or not, to avoid trivial timing
    // enumeration. argon verify on a junk hash takes ~ same time as a real one.
    const hashToCheck = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$00000000000000000000000000000000$0000000000000000000000000000000000000000000"
    const ok = await verifyPassword(hashToCheck, password)
    if (!user || !ok) throw Errors.invalidCredentials()

    await app.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    const token = await createSession(app, user.id)
    setSessionCookie(reply, token)
    return { ok: true }
  })

  app.post("/auth/logout", { config: { rateLimit: {} } }, async (req, reply) => {
    const raw = req.cookies[app.env.SESSION_COOKIE_NAME]
    if (raw) {
      const tokenHash = hashSessionToken(raw)
      await app.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    }
    reply.clearCookie(app.env.SESSION_COOKIE_NAME, { path: "/" })
    return reply.status(204).send()
  })

  app.post("/auth/recover", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = RecoverBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")
    const { username, recoveryCode, newPassword } = parsed.data

    const rows = await app.db.select().from(users).where(eq(users.username, username)).limit(1)
    const user = rows[0]
    const hashToCheck = user?.recoveryCodeHash ?? "$argon2id$v=19$m=19456,t=2,p=1$00000000000000000000000000000000$0000000000000000000000000000000000000000000"
    const ok = await verifyRecoveryCode(hashToCheck, recoveryCode)
    if (!user || !ok) throw Errors.invalidCredentials()

    const newPasswordHash = await hashPassword(newPassword)
    const newRecoveryCode = generateRecoveryCode()
    const newRecoveryHash = await hashRecoveryCode(newRecoveryCode)

    await app.db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        recoveryCodeHash: newRecoveryHash,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id))

    // Revoke ALL existing sessions for this user — recovery means trust is
    // potentially compromised. Force a fresh sign-in everywhere.
    await app.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))

    const token = await createSession(app, user.id)
    setSessionCookie(reply, token)
    return { recoveryCode: newRecoveryCode }
  })
}
