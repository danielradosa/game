import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"
import type { Env } from "../env.js"

export type Db = ReturnType<typeof makeDb>

export function makeDb(env: Env) {
  const client = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "test" ? 5 : 10,
  })
  return drizzle(client, { schema })
}
