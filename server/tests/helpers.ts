import { afterEach, beforeAll, beforeEach } from "vitest"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"
import { buildApp } from "../src/app.js"
import { loadEnv } from "../src/env.js"
import * as schema from "../src/db/schema.js"
import type { FastifyInstance } from "fastify"

let _app: FastifyInstance | null = null
let _client: ReturnType<typeof postgres> | null = null

export function getApp(): FastifyInstance {
  if (!_app) throw new Error("App not initialized — make sure beforeAll ran")
  return _app
}

export function getDb() {
  if (!_client) throw new Error("DB not initialized")
  return drizzle(_client, { schema })
}

beforeAll(async () => {
  const env = loadEnv()
  _client = postgres(env.DATABASE_URL, { max: 5 })
  _app = await buildApp(env)
  await _app.ready()
})

beforeEach(async () => {
  if (!_client) return
  const db = drizzle(_client, { schema })
  await db.execute(
    sql`TRUNCATE TABLE saves, sessions, user_settings, users RESTART IDENTITY CASCADE`,
  )
})

afterEach(() => {})

export async function signupUser(
  username: string,
  password = "test-password-123",
): Promise<{ cookie: string; recoveryCode: string }> {
  const app = getApp()
  const res = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { username, password },
    headers: { "content-type": "application/json" },
  })
  if (res.statusCode !== 200) {
    throw new Error(`signupUser failed: ${res.statusCode} ${res.body}`)
  }
  const setCookie = res.headers["set-cookie"]
  const cookieHeader = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie
  if (!cookieHeader) throw new Error("signup did not return a cookie")
  const sessionCookie = String(cookieHeader).split(";")[0]
  return {
    cookie: sessionCookie ?? "",
    recoveryCode: (JSON.parse(res.body) as { recoveryCode: string }).recoveryCode,
  }
}
