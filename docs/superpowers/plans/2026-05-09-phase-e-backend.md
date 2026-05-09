# Phase E Backend Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Fastify + Drizzle + Postgres API server in `/server/` that handles username/password auth, session cookies, and per-user save/settings storage — with a Vitest integration test suite proving each endpoint works against a real Postgres.

**Architecture:** Monorepo-lite: existing frontend stays at root, new `/server/` folder holds the API as its own npm package. Cross-cutting types (`SaveData`, `Settings`, API DTOs) move to `/src/shared/` so both sides type-check against the same shapes. Sessions are opaque random tokens stored hashed in a `sessions` table; passwords and recovery codes hash with argon2id. All requests run against Postgres provisioned via docker-compose for local dev.

**Tech Stack:** Fastify 4 · Drizzle ORM · postgres-js driver · @node-rs/argon2 · @fastify/cookie / cors / helmet / rate-limit · zod · Vitest · Docker / docker-compose · TypeScript ESM strict.

**Scope boundary:** This plan covers spec build steps 1–7 (server-only). Frontend integration (`src/net/api.ts`, Account UI, sync hook) and Railway deploy are plan 2.

**Spec reference:** `docs/superpowers/specs/2026-05-09-phase-e-design.md`.

---

## File structure

After this plan completes, the repo will contain:

```
/                                 (existing frontend, unchanged except where noted)
├── .gitignore                    [MODIFY] add .env*, !.env.example
├── docker-compose.yml            [CREATE] Postgres for local dev
├── src/
│   ├── shared/                   [CREATE] cross-cutting types
│   │   ├── index.ts              barrel
│   │   ├── save-version.ts       SAVE_VERSION constant
│   │   ├── save.ts               SaveData, SaveMeta, PortalStateSerialized, HudState
│   │   ├── settings.ts           Settings, KeyBindings
│   │   └── dto.ts                Zod schemas for API request/response
│   └── game/
│       ├── types/save.ts         [MODIFY] re-export from @shared/save
│       ├── settings.ts           [MODIFY] re-export type from @shared/settings
│       ├── save.ts               [MODIFY] add version on write, run migrate() on read
│       └── save-migrate.ts       [CREATE] client-side migration chain (v1 = no-op)
└── server/                       [CREATE]
    ├── package.json              own dependencies
    ├── tsconfig.json             ESM strict, paths to @shared/*
    ├── Dockerfile                production build
    ├── .env.example              template only (no secrets)
    ├── drizzle.config.ts         drizzle-kit config
    ├── vitest.config.ts          test runner config
    ├── src/
    │   ├── index.ts              app entrypoint
    │   ├── app.ts                buildApp() factory (used by index + tests)
    │   ├── env.ts                process.env validation with zod
    │   ├── db/
    │   │   ├── client.ts         postgres-js + drizzle instance
    │   │   ├── schema.ts         users / sessions / saves / user_settings
    │   │   └── migrate.ts        CLI: applies drizzle migrations
    │   ├── auth/
    │   │   ├── argon.ts          hashPassword / verifyPassword wrappers
    │   │   ├── tokens.ts         session token + recovery code generators
    │   │   └── session.ts        Fastify decorator + auth hook
    │   ├── routes/
    │   │   ├── index.ts          registers all route modules
    │   │   ├── auth.ts           signup / login / recover / logout
    │   │   ├── me.ts             GET /me
    │   │   ├── saves.ts          saves CRUD
    │   │   └── settings.ts       settings GET/PUT
    │   └── errors.ts             AppError class + serializer
    └── tests/
        ├── helpers.ts            spawn app, transaction wrapper, signup helper
        ├── auth.test.ts          signup/login/recover/logout
        ├── saves.test.ts         saves CRUD + isolation
        └── settings.test.ts      settings GET/PUT + opt-in
```

After plan 1, you can `cd server && npm test` and see all integration tests pass. The frontend is untouched except the small `/src/shared/` re-export refactor (Task 6) and the version-bump migration shell (Task 7).

---

## Task 1: Secure-by-default `.gitignore` + `.env.example` skeleton

**Why first:** the repo is public. Every subsequent task creates files that could leak secrets if `.env` isn't ignored before they exist.

**Files:**
- Modify: `/.gitignore`
- Create: `/server/.env.example`

- [ ] **Step 1: Update root `.gitignore` to exclude all .env files except the template**

Replace the current contents of `/.gitignore` with:

```gitignore
node_modules
dist
.DS_Store
*.log
package-lock.json

# Environment files — repo is public, never commit secrets
.env
.env.*
!.env.example
```

- [ ] **Step 2: Create `/server/` directory + `.env.example` template**

```bash
mkdir -p server
```

Create `/server/.env.example` with placeholder values only:

```env
# Local-dev defaults. Production values live in Railway env vars.
NODE_ENV=development
PORT=8080

# Postgres. docker-compose maps :5432 to the same locally.
DATABASE_URL=postgres://drift:drift@localhost:5432/drift

# Session cookie config.
SESSION_COOKIE_NAME=drift_session
COOKIE_SECURE=false
COOKIE_DOMAIN=
SESSION_TTL_DAYS=30

# CORS allowlist (comma-separated origins).
CORS_ORIGIN=http://localhost:5173

# Server-side hashing pepper (additional secret mixed into password+recovery
# hashes alongside the random salt). Generate per environment with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ARGON2_PEPPER=

# Rate limit (requests per window per IP, applied to /auth/* only).
AUTH_RATE_MAX=10
AUTH_RATE_WINDOW=1 minute
```

- [ ] **Step 3: Verify the template is the only .env file tracked**

Run: `git status --short && git check-ignore -v server/.env 2>&1 || echo "(no .env to check)"`

Expected: `server/.env.example` shown as untracked; no `.env` files tracked. If git complains there's no `.env` file yet, that's fine — it's the template that needs tracking, not a real file.

- [ ] **Step 4: Commit**

```bash
git add .gitignore server/.env.example
git commit -m "chore(phase E): gitignore .env files + server env template

Repo is public. Lock down secrets handling before any /server work
creates files that could accidentally include credentials. Real env
values live in Railway in prod and /server/.env (gitignored) locally."
```

---

## Task 2: Server scaffold — Fastify boots and serves /health

**Goal:** `cd server && npm run dev` brings up Fastify on :8080 and `curl localhost:8080/health` returns `{"ok":true}`.

**Files:**
- Create: `/server/package.json`, `/server/tsconfig.json`, `/server/src/env.ts`, `/server/src/app.ts`, `/server/src/index.ts`, `/server/src/errors.ts`

- [ ] **Step 1: Create `/server/package.json`**

```json
{
  "name": "drift-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/rate-limit": "^9.1.0",
    "@node-rs/argon2": "^1.8.3",
    "drizzle-orm": "^0.33.0",
    "fastify": "^4.28.1",
    "postgres": "^3.4.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.5.5",
    "drizzle-kit": "^0.24.2",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

Then install:

```bash
cd server && npm install
```

Expected: `node_modules/` populated, no peer dependency errors.

- [ ] **Step 2: Create `/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../src/shared/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `/server/src/env.ts` — fail-fast env validation**

```typescript
import { z } from "zod"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default("drift_session"),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().min(1),
  ARGON2_PEPPER: z.string().min(1, "ARGON2_PEPPER must be set"),
  AUTH_RATE_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_WINDOW: z.string().default("1 minute"),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  return parsed.data
}
```

- [ ] **Step 4: Create `/server/src/errors.ts` — typed app errors**

```typescript
export type ErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "USERNAME_TAKEN"
  | "SAVE_NOT_FOUND"
  | "SETTINGS_NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_BODY"
  | "INTERNAL"

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, statusCode: number) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

export const Errors = {
  unauthorized: () => new AppError("UNAUTHORIZED", "Not signed in", 401),
  invalidCredentials: () => new AppError("INVALID_CREDENTIALS", "Invalid credentials", 401),
  usernameTaken: () => new AppError("USERNAME_TAKEN", "Username already taken", 409),
  saveNotFound: () => new AppError("SAVE_NOT_FOUND", "Save not found", 404),
  settingsNotFound: () => new AppError("SETTINGS_NOT_FOUND", "Settings not synced for this account", 404),
  invalidBody: (msg: string) => new AppError("INVALID_BODY", msg, 400),
}
```

- [ ] **Step 5: Create `/server/src/app.ts` — buildApp() factory**

```typescript
import Fastify, { type FastifyInstance } from "fastify"
import { AppError } from "./errors.js"
import type { Env } from "./env.js"

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
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
```

Note: pino-pretty is optional in dev; skip if it complains. Replace the logger config with `logger: true` if pino-pretty isn't installed.

- [ ] **Step 6: Create `/server/src/index.ts` — process entrypoint**

```typescript
import { buildApp } from "./app.js"
import { loadEnv } from "./env.js"

async function main(): Promise<void> {
  const env = loadEnv()
  const app = await buildApp(env)
  await app.listen({ port: env.PORT, host: "0.0.0.0" })
}

main().catch((err) => {
  console.error("Failed to start server:", err)
  process.exit(1)
})
```

- [ ] **Step 7: Create local `.env` from template + verify boot**

```bash
cd server
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" \
  | xargs -I {} sed -i.bak 's|^ARGON2_PEPPER=$|ARGON2_PEPPER={}|' .env
rm -f .env.bak
```

Then run dev:

```bash
npm run dev
```

In another terminal:

```bash
curl -s localhost:8080/health
```

Expected: `{"ok":true}`

Stop the server with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add server/package.json server/tsconfig.json server/src/env.ts \
        server/src/errors.ts server/src/app.ts server/src/index.ts
git commit -m "feat(server): scaffold Fastify app with /health and env validation

Stand up the /server package with TS strict, ESM, env validation via
zod, AppError class for typed failures, and a buildApp() factory used
by both the entrypoint and the upcoming Vitest suite."
```

---

## Task 3: docker-compose Postgres for local dev

**Goal:** `docker-compose up -d postgres` brings up Postgres on :5432 with a `drift` database accessible to the server.

**Files:**
- Create: `/docker-compose.yml`

- [ ] **Step 1: Create root `/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: drift-postgres
    environment:
      POSTGRES_USER: drift
      POSTGRES_PASSWORD: drift
      POSTGRES_DB: drift
    ports:
      - "5432:5432"
    volumes:
      - drift-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U drift -d drift"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  drift-postgres-data:
```

- [ ] **Step 2: Bring up Postgres + verify connection**

```bash
docker-compose up -d postgres
sleep 3
docker exec drift-postgres psql -U drift -d drift -c "SELECT version();"
```

Expected: prints a `PostgreSQL 16.x ...` version row.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): docker-compose Postgres for local dev

Spin up Postgres 16 with a drift/drift/drift superuser/db on :5432
matching the DATABASE_URL in server/.env.example."
```

---

## Task 4: Drizzle schema + migrations for the 4 tables

**Goal:** `npm run db:migrate` from `/server/` creates `users`, `sessions`, `saves`, `user_settings` tables in Postgres.

**Files:**
- Create: `/server/drizzle.config.ts`
- Create: `/server/src/db/client.ts`
- Create: `/server/src/db/schema.ts`
- Create: `/server/src/db/migrate.ts`
- Create: `/server/drizzle/` (generated)

- [ ] **Step 1: Create `/server/drizzle.config.ts`**

```typescript
import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
})
```

Install dotenv (drizzle-kit needs it for the config file to read .env):

```bash
cd server && npm install --save-dev dotenv
```

- [ ] **Step 2: Create `/server/src/db/client.ts`**

```typescript
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
```

- [ ] **Step 3: Create `/server/src/db/schema.ts` — the 4 tables**

```typescript
import { pgTable, uuid, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  recoveryCodeHash: text("recovery_code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
})

export const sessions = pgTable("sessions", {
  // SHA-256 hex of the random session token. Raw token only ever exists
  // in the user's cookie + transiently during request handling.
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

// `data` and `meta` are typed as `unknown` here because the server treats
// save blobs as opaque — typing them to the client SaveData/SaveMeta would
// couple migration cycles together. Validation happens at the API edge via
// zod schemas in /src/shared/dto.ts.
export const saves = pgTable(
  "saves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    slotKey: text("slot_key").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    meta: jsonb("meta").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userSlotUnique: unique("saves_user_slot_unique").on(t.userId, t.slotKey),
  }),
)

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .primaryKey(),
  data: jsonb("data").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 4: Generate the migration SQL**

```bash
cd server && npm run db:generate
```

Expected: a new file appears under `/server/drizzle/0000_*.sql` containing CREATE TABLE statements for all 4 tables.

- [ ] **Step 5: Create `/server/src/db/migrate.ts` — apply migrations CLI**

```typescript
import "dotenv/config"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL not set")
    process.exit(1)
  }
  const client = postgres(url, { max: 1 })
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: "./drizzle" })
  await client.end()
  console.log("Migrations applied")
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
```

- [ ] **Step 6: Apply migrations + verify tables exist**

```bash
cd server && npm run db:migrate
docker exec drift-postgres psql -U drift -d drift -c "\dt"
```

Expected: lists `users`, `sessions`, `saves`, `user_settings`, plus drizzle's internal `__drizzle_migrations`.

- [ ] **Step 7: Commit**

```bash
git add server/drizzle.config.ts server/src/db/ server/drizzle/ server/package.json server/package-lock.json
git commit -m "feat(server): drizzle schema + migrations for 4 tables

users, sessions, saves, user_settings. Save data/meta typed as unknown
to keep the server agnostic of the client save shape — validation lives
at the API edge (zod) and the client owns the migration chain."
```

---

## Task 5: Extract shared types to `/src/shared/`

**Goal:** Both client and server import `SaveData`, `Settings`, and API DTOs from `/src/shared/`. Client compiles unchanged.

**Files:**
- Create: `/src/shared/index.ts`, `/src/shared/save-version.ts`, `/src/shared/save.ts`, `/src/shared/settings.ts`, `/src/shared/dto.ts`
- Modify: `/src/game/types/save.ts` (re-export only), `/src/game/settings.ts` (type re-export)

- [ ] **Step 1: Create `/src/shared/save-version.ts`**

```typescript
// Bump this when SaveData shape changes. Client-side migrate(data, from)
// in /src/game/save-migrate.ts handles forward migration. Server treats
// the blob as opaque.
export const SAVE_VERSION = 1 as const
export type SaveVersion = typeof SAVE_VERSION
```

- [ ] **Step 2: Create `/src/shared/save.ts` — move types from src/game/types/save.ts**

The HudState / SaveData / SaveMeta / PortalStateSerialized / QuestStage types currently live in `src/game/types/save.ts`. Move them verbatim to `/src/shared/save.ts`, with the **single change** of adding `version: number` to SaveData.

```typescript
import type { Materials } from "@/game/economy"
import type { Character, LostCache, SceneId } from "@/game/types/physics"

export type QuestStage = "intro" | "active" | "cleared" | "done"

export interface HudState {
  level: number
  xp: number
  materials: Materials
  discovered: string[]
  achievements: string[]
  inDelve: boolean
  hasSword: boolean
  questStage: QuestStage
  mods: string[]
  maxHpBonus: number
  weaponLevel: number
  consumables: { heal: number; storm: number }
  rebirths: number
  perks: string[]
  pendingPerkChoice: 5 | 10 | 15 | null
}

export interface SaveData {
  // Bump via SAVE_VERSION whenever shape changes; client migrate() runs on load.
  version: number
  character: Character
  hud: HudState
  pos: { x: number; y: number; scene: SceneId }
  collected: string[]
  defeatedEnemies: number[]
  delveCleared: boolean
  delveSeed?: number
  delveTier?: number
  portals?: Record<string, PortalStateSerialized>
  activePortalId?: string | null
  worldSeed?: number
  portalDestroyed?: boolean
}

export interface PortalStateSerialized {
  seed: number
  tier: number
  status: "fresh" | "destroyed"
  defeatedEnemies: number[]
  cleared: boolean
  lostCache: LostCache | null
}

export interface SaveMeta {
  id: string
  name: string
  level: number
  materials: number
  discovered: number
  date: string
  where: string
  rebirths: number
  worldSeed: number
}

export type SaveManifest = SaveMeta[]
```

Note: server-side imports of these types use the `@shared/*` path alias defined in `server/tsconfig.json` (Task 2). The frontend uses `@/*` for `src/*` so client imports become `@/shared/save`.

- [ ] **Step 3: Create `/src/shared/settings.ts` — type only, defaults stay client-side**

The runtime `loadSettings`/`saveSettings`/`DEFAULT_KEYS` stay in `src/game/settings.ts` (they touch localStorage). Only the type contract moves.

```typescript
export interface KeyBindings {
  moveLeft: string
  moveRight: string
  moveUp: string
  moveDown: string
  jump: string
  dash: string
  interact: string
  heal: string
  storm: string
}

export interface Settings {
  volume: number
  muted: boolean
  fullscreen: boolean
  keys: KeyBindings
  showTutorialNextStart: boolean
}
```

- [ ] **Step 4: Create `/src/shared/dto.ts` — Zod schemas for API**

```typescript
import { z } from "zod"

// Auth
export const SignupBody = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "letters, digits, _ or - only"),
  password: z.string().min(8).max(128),
})
export type SignupBody = z.infer<typeof SignupBody>

export const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
})
export type LoginBody = z.infer<typeof LoginBody>

export const RecoverBody = z.object({
  username: z.string().min(1).max(64),
  recoveryCode: z.string().min(1).max(64),
  newPassword: z.string().min(8).max(128),
})
export type RecoverBody = z.infer<typeof RecoverBody>

export const SignupResponse = z.object({ recoveryCode: z.string() })
export const RecoverResponse = z.object({ recoveryCode: z.string() })
export const MeResponse = z.object({
  username: z.string(),
  signedInAt: z.string(),
  saveCount: z.number().int().nonnegative(),
})

// Saves — data + meta validated structurally; full SaveData/SaveMeta shape
// is enforced client-side. Server only checks "is jsonb-shaped object".
export const SavePutBody = z.object({
  data: z.record(z.unknown()),
  meta: z.record(z.unknown()),
})
export type SavePutBody = z.infer<typeof SavePutBody>

export const SaveManifestEntry = z.object({
  slotKey: z.string(),
  meta: z.record(z.unknown()),
  updatedAt: z.string(),
})
export const SaveManifestResponse = z.array(SaveManifestEntry)

export const SaveGetResponse = z.object({
  data: z.record(z.unknown()),
  meta: z.record(z.unknown()),
  updatedAt: z.string(),
})

export const SavePutResponse = z.object({ updatedAt: z.string() })

// Settings
export const SettingsPutBody = z.object({ data: z.record(z.unknown()) })
export type SettingsPutBody = z.infer<typeof SettingsPutBody>

export const SettingsGetResponse = z.object({
  data: z.record(z.unknown()),
  updatedAt: z.string(),
})
```

- [ ] **Step 5: Create `/src/shared/index.ts` — barrel**

```typescript
export * from "./save-version.js"
export * from "./save.js"
export * from "./settings.js"
export * from "./dto.js"
```

- [ ] **Step 6: Replace `/src/game/types/save.ts` with re-exports**

Replace its contents with:

```typescript
// Save types moved to @/shared/save for cross-package use (client + server).
// This file remains as a stable import path for existing call sites.
export type {
  HudState,
  PortalStateSerialized,
  QuestStage,
  SaveData,
  SaveManifest,
  SaveMeta,
} from "@/shared/save"
```

- [ ] **Step 7: Update `/src/game/settings.ts` to import the types from shared**

At the top of `/src/game/settings.ts`, replace the local `KeyBindings` and `Settings` interface declarations with:

```typescript
import type { KeyBindings, Settings } from "@/shared/settings"
export type { KeyBindings, Settings }
```

Leave everything else (DEFAULT_KEYS, DEFAULT_SETTINGS, loadSettings, saveSettings, KEY const) untouched.

- [ ] **Step 8: Verify client typechecks**

```bash
npm run typecheck
```

Expected: clean. If imports break in `src/`, the `@/shared/save` path needs the existing `@/*` alias to resolve `src/shared/save.ts` — that's already set up in `tsconfig.json` and `vite.config.js`.

- [ ] **Step 9: Verify server typechecks (will fail on missing schema imports — expected)**

```bash
cd server && npm run typecheck
```

Server has nothing importing shared yet, so typecheck should pass on whatever exists in `/server/src/`.

- [ ] **Step 10: Commit**

```bash
cd ..
git add src/shared/ src/game/types/save.ts src/game/settings.ts
git commit -m "refactor: extract shared types to /src/shared/

Move SaveData, SaveMeta, Settings, KeyBindings to /src/shared/ so the
new server can import the same shapes via @shared/* path alias.
SaveData gains a 'version: number' field — client-side migrate() chain
lands in the next commit; server treats the blob as opaque."
```

---

## Task 6: Save format version bump (client side)

**Goal:** Saves written from now on include `version: SAVE_VERSION`. Loading a save runs through `migrate(data, fromVersion)` which is a no-op for v1 but provides the hook for future schema changes.

**Files:**
- Create: `/src/game/save-migrate.ts`
- Modify: `/src/game/save.ts`
- Modify: `/src/App.tsx` (autosave write site only — verify SaveData construction includes `version`)

- [ ] **Step 1: Create `/src/game/save-migrate.ts`**

```typescript
import { SAVE_VERSION } from "@/shared/save-version"
import type { SaveData } from "@/shared/save"

// Client-side migration chain. Each entry takes data at version N and
// returns data at version N+1. Add a new entry whenever SAVE_VERSION
// bumps; never delete an entry (older saves still need it).
//
// Convention: write each migrator as `(data: any) => any` so the function
// body can mutate freely without re-typing. The chain returns SaveData
// only at the very end, after all upgrades have run.
const MIGRATIONS: Record<number, (data: any) => any> = {
  // v0 → v1: pre-version saves get the version field stamped on. Older
  // forward-compat defaults already live in toSaveData() below.
  0: (data) => ({ ...data, version: 1 }),
}

export function migrate(rawData: unknown): SaveData {
  let data = rawData as { version?: number } & Record<string, unknown>
  let v = typeof data.version === "number" ? data.version : 0
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v]
    if (!fn) {
      throw new Error(`No migration registered from save version ${v}`)
    }
    data = fn(data)
    v += 1
  }
  return data as unknown as SaveData
}
```

- [ ] **Step 2: Update `/src/game/save.ts` to migrate on read + stamp on write**

Replace the contents of `/src/game/save.ts` with:

```typescript
import { migrate } from "@/game/save-migrate"
import { SAVE_VERSION } from "@/shared/save-version"
import type { SaveData, SaveManifest } from "@/shared/save"

const SAVE_PREFIX = "drift:save:"
const MANIFEST_KEY = "drift:save_manifest"

export function fetchManifest(): SaveManifest {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    return raw ? (JSON.parse(raw) as SaveManifest) : []
  } catch {
    return []
  }
}

export function persistManifest(m: SaveManifest): boolean {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(m))
    return true
  } catch {
    return false
  }
}

export function getSave(id: string): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + id)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setSave(id: string, data: SaveData): boolean {
  try {
    const stamped: SaveData = { ...data, version: SAVE_VERSION }
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(stamped))
    return true
  } catch {
    return false
  }
}

export function deleteSave(id: string): boolean {
  try {
    localStorage.removeItem(SAVE_PREFIX + id)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Verify SaveData construction sites still typecheck**

App.tsx builds save objects in two places (autosave + manual save). They construct `SaveData` literals without a `version` field today. Since `setSave` now stamps `version: SAVE_VERSION` on every write, the type contract for callers needs the field to be optional at the call site OR the call sites need to set it.

Cleanest fix: relax `setSave`'s parameter type slightly to `Omit<SaveData, "version"> & { version?: number }`, OR keep `SaveData` strict and add `version: SAVE_VERSION` at every call site.

Take the **strict path** — explicit version at call sites:

In `/src/App.tsx`, find both `setSave(id, data)` calls. The `data` object literal each builds gets a `version: SAVE_VERSION` field added at the top. Add the import at the top of App.tsx:

```typescript
import { SAVE_VERSION } from "@/shared/save-version"
```

Then in the autosave block (around line 564) the `data` literal becomes:

```typescript
const data = {
  version: SAVE_VERSION,
  character: charRef.current,
  // ...rest unchanged
}
```

And the same edit at the manual save site.

- [ ] **Step 4: Verify client typechecks + builds**

```bash
npm run typecheck && npm run build
```

Expected: clean. If `tsc` complains a literal is missing `version`, that's the call site you missed — add it.

- [ ] **Step 5: Manual smoke test (browser)**

```bash
npm run dev
```

In a browser:
1. Start a new game, make a manual save
2. Open DevTools → Application → Local Storage → http://localhost:5173
3. Find a `drift:save:*` entry; verify the JSON includes `"version":1`

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/game/save-migrate.ts src/game/save.ts src/App.tsx
git commit -m "feat: SaveData version field + client migrate() chain

Saves written from now on are stamped with version: 1. Loading runs
through migrate(rawData) which upgrades pre-version saves to v1 and
provides the hook for any future schema bumps. Server stays opaque."
```

---

## Task 7: Auth helpers (argon2, recovery code, session token)

**Goal:** Pure functions — `hashPassword`, `verifyPassword`, `generateRecoveryCode`, `hashRecoveryCode`, `verifyRecoveryCode`, `generateSessionToken`, `hashSessionToken` — fully unit-tested. No HTTP, no DB.

**Files:**
- Create: `/server/src/auth/argon.ts`, `/server/src/auth/tokens.ts`
- Create: `/server/vitest.config.ts`, `/server/tests/argon.test.ts`, `/server/tests/tokens.test.ts`

- [ ] **Step 1: Create `/server/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@shared": new URL("../src/shared", import.meta.url).pathname,
    },
  },
})
```

- [ ] **Step 2: Create `/server/tests/setup.ts` — load test env**

```typescript
import "dotenv/config"

// Default to a separate test DB if not explicitly set. CI / dev should
// point DATABASE_URL_TEST at a dedicated test database.
if (!process.env.DATABASE_URL && process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
}
process.env.NODE_ENV = "test"
process.env.ARGON2_PEPPER ||= "test-pepper-not-for-prod-aGFzaC1tZS1wbGVhc2U="
process.env.CORS_ORIGIN ||= "http://localhost:5173"
process.env.DATABASE_URL ||= "postgres://drift:drift@localhost:5432/drift_test"
```

- [ ] **Step 3: Create test database**

```bash
docker exec drift-postgres psql -U drift -c "CREATE DATABASE drift_test OWNER drift;" 2>&1 || echo "(already exists)"
```

Then apply migrations against it:

```bash
cd server
DATABASE_URL=postgres://drift:drift@localhost:5432/drift_test npm run db:migrate
```

Expected: "Migrations applied" again, against the test DB this time.

- [ ] **Step 4: Write the failing argon test**

Create `/server/tests/argon.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "../src/auth/argon.js"

describe("argon password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple")
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true)
  })

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("password1")
    expect(await verifyPassword(hash, "password2")).toBe(false)
  })

  it("produces different hashes for the same input (salt)", async () => {
    const a = await hashPassword("same input")
    const b = await hashPassword("same input")
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
cd server && npm test -- argon
```

Expected: FAIL — `Cannot find module '../src/auth/argon.js'` or similar.

- [ ] **Step 6: Implement `/server/src/auth/argon.ts`**

```typescript
import { hash, verify, Algorithm } from "@node-rs/argon2"

const PEPPER = process.env.ARGON2_PEPPER ?? ""

if (!PEPPER) {
  throw new Error("ARGON2_PEPPER must be set before importing auth/argon")
}

const PEPPER_BUF = Buffer.from(PEPPER, "base64")

const ARGON_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP 2024 minimum for argon2id
  timeCost: 2,
  parallelism: 1,
  secret: PEPPER_BUF,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return await hash(plain, ARGON_OPTS)
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain, { secret: PEPPER_BUF })
  } catch {
    return false
  }
}
```

- [ ] **Step 7: Run the test, verify it passes**

```bash
npm test -- argon
```

Expected: 3 passed.

- [ ] **Step 8: Write the failing tokens test**

Create `/server/tests/tokens.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import {
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  generateSessionToken,
  hashSessionToken,
} from "../src/auth/tokens.js"

describe("recovery code", () => {
  it("generates a 24-char base32 string", () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[A-Z2-7]{24}$/)
  })

  it("verifies the right code against its hash", async () => {
    const code = generateRecoveryCode()
    const hashed = await hashRecoveryCode(code)
    expect(await verifyRecoveryCode(hashed, code)).toBe(true)
  })

  it("rejects a wrong code", async () => {
    const code = generateRecoveryCode()
    const hashed = await hashRecoveryCode(code)
    expect(await verifyRecoveryCode(hashed, generateRecoveryCode())).toBe(false)
  })
})

describe("session token", () => {
  it("generates a base64url string", () => {
    const t = generateSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(32)
  })

  it("hashes deterministically (sha-256)", () => {
    const t = generateSessionToken()
    expect(hashSessionToken(t)).toBe(hashSessionToken(t))
  })

  it("hashes differently for different tokens", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken()),
    )
  })
})
```

- [ ] **Step 9: Run, verify it fails**

```bash
npm test -- tokens
```

Expected: FAIL — module not found.

- [ ] **Step 10: Implement `/server/src/auth/tokens.ts`**

```typescript
import { randomBytes, createHash } from "node:crypto"
import { hashPassword, verifyPassword } from "./argon.js"

// RFC 4648 base32 alphabet (no padding, uppercase)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function generateRecoveryCode(): string {
  const bytes = randomBytes(15) // 15 bytes → 24 base32 chars
  let out = ""
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += B32[(buffer >> bits) & 0x1f]
    }
  }
  if (bits > 0) {
    out += B32[(buffer << (5 - bits)) & 0x1f]
  }
  return out.slice(0, 24)
}

// Recovery codes are user-typed under stress — hash with the same argon2id
// pipeline as passwords for consistency. Codes are higher-entropy so could
// use a faster hash, but argon2id keeps the auth layer uniform.
export async function hashRecoveryCode(code: string): Promise<string> {
  return await hashPassword(code)
}

export async function verifyRecoveryCode(stored: string, code: string): Promise<boolean> {
  return await verifyPassword(stored, code)
}

// Session tokens are high-entropy random bytes. SHA-256 hash (no salt) is
// fine for storage — preimage-resistance is the only property we need, and
// the input is unguessable.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
```

- [ ] **Step 11: Run all tests, verify all pass**

```bash
npm test
```

Expected: all argon + tokens tests pass (~6 tests).

- [ ] **Step 12: Commit**

```bash
cd ..
git add server/vitest.config.ts server/tests/setup.ts \
        server/tests/argon.test.ts server/tests/tokens.test.ts \
        server/src/auth/argon.ts server/src/auth/tokens.ts
git commit -m "feat(server): auth helpers — argon2id + session tokens + recovery codes

argon2id with 19MiB memory (OWASP 2024 min). Session tokens are 32-byte
base64url, stored hashed (sha-256). Recovery codes are 24-char base32.
All wrapped in vitest unit tests."
```

---

## Task 8: Session middleware + GET /me

**Goal:** A signed-in cookie loads the user via the session table; `GET /me` returns the user's profile. Sliding 30-day expiration; 24h debounce on touch writes.

**Files:**
- Create: `/server/src/auth/session.ts`, `/server/src/routes/me.ts`, `/server/src/routes/index.ts`
- Modify: `/server/src/app.ts` (register cookie plugin, db decorator, routes)
- Create: `/server/tests/helpers.ts`, `/server/tests/me.test.ts`

- [ ] **Step 1: Create `/server/tests/helpers.ts` — shared test machinery**

```typescript
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
  // Per-test isolation: TRUNCATE all rows. Faster than per-test transactions
  // when tests issue cookie-auth requests that span multiple HTTP calls.
  if (!_client) return
  const db = drizzle(_client, { schema })
  await db.execute(
    sql`TRUNCATE TABLE saves, sessions, user_settings, users RESTART IDENTITY CASCADE`,
  )
})

afterEach(() => {
  // Vitest runs tests sequentially via singleFork, so no cleanup needed here.
})

// Helper: signs a user up via the API and returns the cookie + recovery code.
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
  const sessionCookie = String(cookieHeader).split(";")[0] // name=value
  return {
    cookie: sessionCookie ?? "",
    recoveryCode: (JSON.parse(res.body) as { recoveryCode: string }).recoveryCode,
  }
}
```

- [ ] **Step 2: Create `/server/src/auth/session.ts`**

```typescript
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

const TOUCH_DEBOUNCE_MS = 24 * 60 * 60 * 1000 // 24h

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

    // Sliding expiration: extend if last extension was more than 24h ago.
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
```

- [ ] **Step 3: Update `/server/src/app.ts` to register cookies + db**

Replace the contents of `/server/src/app.ts` with:

```typescript
import Fastify, { type FastifyInstance } from "fastify"
import cookie from "@fastify/cookie"
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
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } })
    }
    app.log.error(err)
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } })
  })

  const db = makeDb(env)
  app.decorate("db", db)
  app.decorate("env", env)

  await app.register(cookie)

  registerSessionDecorator(app, db, env.SESSION_COOKIE_NAME)

  app.get("/health", async () => ({ ok: true }))

  await registerRoutes(app)

  return app
}
```

- [ ] **Step 4: Create `/server/src/routes/index.ts` — registers all route modules**

```typescript
import type { FastifyInstance } from "fastify"
import { meRoutes } from "./me.js"

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(meRoutes)
  // auth, saves, settings registered in later tasks
}
```

- [ ] **Step 5: Write the failing /me test**

Create `/server/tests/me.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

describe("GET /me", () => {
  it("401s without a session cookie", async () => {
    const res = await getApp().inject({ method: "GET", url: "/me" })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({
      error: { code: "UNAUTHORIZED", message: "Not signed in" },
    })
  })

  it("returns the signed-in user's profile", async () => {
    const { cookie } = await signupUser("alice")
    const res = await getApp().inject({
      method: "GET",
      url: "/me",
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.username).toBe("alice")
    expect(body.saveCount).toBe(0)
    expect(typeof body.signedInAt).toBe("string")
  })
})
```

- [ ] **Step 6: Implement `/server/src/routes/me.ts`**

```typescript
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
```

- [ ] **Step 7: Run /me test — verify both tests fail (signup not implemented yet)**

```bash
cd server && npm test -- me
```

Expected: the "401 without cookie" test PASSES; the "returns profile" test FAILS because `signupUser` calls `/auth/signup` which doesn't exist yet. That's expected — Task 9 wires signup, then this test will pass.

This is acceptable mid-plan: leave both tests in place; the green `npm test` gate is at the end of Task 11.

- [ ] **Step 8: Commit**

```bash
cd ..
git add server/src/auth/session.ts server/src/routes/me.ts server/src/routes/index.ts \
        server/src/app.ts server/tests/helpers.ts server/tests/me.test.ts
git commit -m "feat(server): session middleware + GET /me

@fastify/cookie + sessions table lookup + sliding 30d expiration
debounced to one DB write per session per 24h. /me returns username +
signedInAt + saveCount. Session decorator exposed as app.requireAuth."
```

---

## Task 9: POST /auth/signup

**Goal:** `POST /auth/signup` creates a user with hashed password + recovery code, opens a session, sets the cookie, returns the recovery code (one-time).

**Files:**
- Create: `/server/src/routes/auth.ts`
- Modify: `/server/src/routes/index.ts` (register authRoutes)
- Create: `/server/tests/auth.test.ts`

- [ ] **Step 1: Write the failing signup tests**

Create `/server/tests/auth.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { getApp } from "./helpers.js"

describe("POST /auth/signup", () => {
  it("creates a user, returns a recovery code, sets a session cookie", async () => {
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "alice", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.recoveryCode).toMatch(/^[A-Z2-7]{24}$/)
    const setCookie = res.headers["set-cookie"]
    expect(setCookie).toBeTruthy()
    expect(String(setCookie)).toContain("drift_session=")
    expect(String(setCookie)).toContain("HttpOnly")
  })

  it("rejects duplicate usernames", async () => {
    await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "bob", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "bob", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe("USERNAME_TAKEN")
  })

  it("rejects malformed bodies (short username)", async () => {
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/signup",
      payload: { username: "ab", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY")
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
cd server && npm test -- auth
```

Expected: FAIL — `/auth/signup` returns 404.

- [ ] **Step 3: Implement `/server/src/routes/auth.ts` with just signup**

```typescript
import type { FastifyInstance, FastifyReply } from "fastify"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { users, sessions } from "../db/schema.js"
import { hashPassword } from "../auth/argon.js"
import {
  generateRecoveryCode,
  hashRecoveryCode,
  generateSessionToken,
  hashSessionToken,
} from "../auth/tokens.js"
import { SignupBody } from "../../../src/shared/dto.js"
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
```

Note: importing from `"../../../src/shared/dto.js"` works because the server's tsconfig path mapping resolves `@shared/*` for editor convenience but `tsx` and `vitest` follow the actual on-disk path. Both work — the relative path is the simplest and most portable inside route files.

- [ ] **Step 4: Register authRoutes in `/server/src/routes/index.ts`**

```typescript
import type { FastifyInstance } from "fastify"
import { authRoutes } from "./auth.js"
import { meRoutes } from "./me.js"

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes)
  await app.register(meRoutes)
}
```

- [ ] **Step 5: Run signup tests, verify all pass + /me tests pass too**

```bash
npm test -- auth me
```

Expected: 5 tests pass (3 signup + 2 me).

- [ ] **Step 6: Commit**

```bash
cd ..
git add server/src/routes/auth.ts server/src/routes/index.ts server/tests/auth.test.ts
git commit -m "feat(server): POST /auth/signup with session cookie

Validates body via shared zod schema, hashes password + recovery code
with argon2id, opens a session row, sets HTTP-only cookie. Returns
the recovery code once — never displayed again."
```

---

## Task 10: POST /auth/login + POST /auth/logout

**Goal:** Sign in with username + password (sets cookie); sign out (revokes session, clears cookie).

**Files:**
- Modify: `/server/src/routes/auth.ts`
- Modify: `/server/tests/auth.test.ts` (add login + logout tests)

- [ ] **Step 1: Write failing login + logout tests**

Append to `/server/tests/auth.test.ts`:

```typescript
import { signupUser } from "./helpers.js"

describe("POST /auth/login", () => {
  it("signs in with correct credentials", async () => {
    await signupUser("carol")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "carol", password: "test-password-123" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(200)
    expect(String(res.headers["set-cookie"])).toContain("drift_session=")
  })

  it("rejects wrong password", async () => {
    await signupUser("dave")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "dave", password: "wrong-password" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_CREDENTIALS")
  })

  it("rejects unknown username with the same error code (no enumeration)", async () => {
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "ghost", password: "anything" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_CREDENTIALS")
  })
})

describe("POST /auth/logout", () => {
  it("revokes the session and clears the cookie", async () => {
    const { cookie } = await signupUser("eve")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie },
    })
    expect(res.statusCode).toBe(204)
    // Subsequent /me with the same cookie must 401.
    const me = await getApp().inject({ method: "GET", url: "/me", headers: { cookie } })
    expect(me.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
cd server && npm test -- auth
```

Expected: 4 new tests fail (login routes return 404; logout returns 404).

- [ ] **Step 3: Add login + logout to `/server/src/routes/auth.ts`**

Append to `authRoutes`, after the `/auth/signup` handler:

```typescript
import { LoginBody } from "../../../src/shared/dto.js"
import { verifyPassword } from "../auth/argon.js"
import { isNull, and } from "drizzle-orm"

// ...inside authRoutes(app):

  app.post("/auth/login", async (req, reply) => {
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

  app.post("/auth/logout", async (req, reply) => {
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
```

- [ ] **Step 4: Run all auth tests, verify pass**

```bash
npm test -- auth me
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ..
git add server/src/routes/auth.ts server/tests/auth.test.ts
git commit -m "feat(server): POST /auth/login + POST /auth/logout

Login verifies password against argon2id hash with timing-safe behavior
for unknown usernames (constant-ish hash check). Logout marks the
session row revoked and clears the cookie."
```

---

## Task 11: POST /auth/recover

**Goal:** Username + recovery code + new password → resets password, invalidates the old recovery code, returns and stores a new one. All existing sessions for that user are revoked (security: someone might be on the account who shouldn't be).

**Files:**
- Modify: `/server/src/routes/auth.ts`
- Modify: `/server/tests/auth.test.ts`

- [ ] **Step 1: Write failing recover tests**

Append to `/server/tests/auth.test.ts`:

```typescript
describe("POST /auth/recover", () => {
  it("resets password with correct recovery code, returns new code, signs in", async () => {
    const { recoveryCode, cookie: oldCookie } = await signupUser("frank")

    const res = await getApp().inject({
      method: "POST",
      url: "/auth/recover",
      payload: { username: "frank", recoveryCode, newPassword: "new-password-456" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.recoveryCode).toMatch(/^[A-Z2-7]{24}$/)
    expect(body.recoveryCode).not.toBe(recoveryCode)

    // New cookie was set + old cookie's session is revoked.
    expect(String(res.headers["set-cookie"])).toContain("drift_session=")
    const me = await getApp().inject({ method: "GET", url: "/me", headers: { cookie: oldCookie } })
    expect(me.statusCode).toBe(401)
  })

  it("rejects wrong recovery code with INVALID_CREDENTIALS", async () => {
    await signupUser("grace")
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/recover",
      payload: { username: "grace", recoveryCode: "WRONGCODE2345WRONGCODE234", newPassword: "n-pass-12345" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe("INVALID_CREDENTIALS")
  })

  it("the old recovery code stops working after recover succeeds", async () => {
    const { recoveryCode } = await signupUser("heidi")
    await getApp().inject({
      method: "POST",
      url: "/auth/recover",
      payload: { username: "heidi", recoveryCode, newPassword: "new-pass-77" },
      headers: { "content-type": "application/json" },
    })
    const res = await getApp().inject({
      method: "POST",
      url: "/auth/recover",
      payload: { username: "heidi", recoveryCode, newPassword: "another-pass-88" },
      headers: { "content-type": "application/json" },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
cd server && npm test -- auth
```

Expected: 3 new tests fail.

- [ ] **Step 3: Add recover handler to `/server/src/routes/auth.ts`**

Append, with imports:

```typescript
import { RecoverBody } from "../../../src/shared/dto.js"
import { verifyRecoveryCode } from "../auth/tokens.js"
import { ne } from "drizzle-orm"

// inside authRoutes(app):

  app.post("/auth/recover", async (req, reply) => {
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
```

- [ ] **Step 4: Run all tests, verify pass**

```bash
npm test
```

Expected: all tests pass (~12 total: argon 3, tokens 6, me 2, signup 3, login 3, logout 1, recover 3 — adjust counts as you discover the actual layout).

- [ ] **Step 5: Commit**

```bash
cd ..
git add server/src/routes/auth.ts server/tests/auth.test.ts
git commit -m "feat(server): POST /auth/recover

Reset password with username + recovery code. Invalidates the old code
(generates and stores a new one), revokes all existing sessions for
the user, opens a fresh session, returns the new recovery code once."
```

---

## Task 12: Saves CRUD endpoints

**Goal:** All four endpoints — `GET /saves`, `GET /saves/:slotKey`, `PUT /saves/:slotKey`, `DELETE /saves/:slotKey` — work with cookie auth and per-user isolation.

**Files:**
- Create: `/server/src/routes/saves.ts`
- Modify: `/server/src/routes/index.ts`
- Create: `/server/tests/saves.test.ts`

- [ ] **Step 1: Write failing saves tests**

Create `/server/tests/saves.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

const sampleData = { version: 1, hud: { level: 4 }, pos: { x: 100, y: 200 } }
const sampleMeta = { id: "slot-a", level: 4, name: "Test Save" }

describe("saves CRUD", () => {
  it("PUT /saves/:slotKey upserts and returns updatedAt", async () => {
    const { cookie } = await signupUser("ivan")
    const res = await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).updatedAt).toMatch(/T/)
  })

  it("GET /saves returns the manifest for the signed-in user only", async () => {
    const { cookie: ivanCookie } = await signupUser("judy")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie: ivanCookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const res = await getApp().inject({
      method: "GET",
      url: "/saves",
      headers: { cookie: ivanCookie },
    })
    expect(res.statusCode).toBe(200)
    const list = JSON.parse(res.body)
    expect(list).toHaveLength(1)
    expect(list[0].slotKey).toBe("slot-a")
    expect(list[0].meta).toEqual(sampleMeta)
  })

  it("GET /saves/:slotKey returns the full save", async () => {
    const { cookie } = await signupUser("kate")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const res = await getApp().inject({
      method: "GET",
      url: "/saves/slot-a",
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toEqual(sampleData)
    expect(body.meta).toEqual(sampleMeta)
  })

  it("PUT /saves/:slotKey upserts (overwrites existing data)", async () => {
    const { cookie } = await signupUser("liam")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const newData = { ...sampleData, hud: { level: 99 } }
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: newData, meta: sampleMeta },
    })
    const get = await getApp().inject({ method: "GET", url: "/saves/slot-a", headers: { cookie } })
    expect(JSON.parse(get.body).data.hud.level).toBe(99)
  })

  it("DELETE /saves/:slotKey removes the save", async () => {
    const { cookie } = await signupUser("mia")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const del = await getApp().inject({ method: "DELETE", url: "/saves/slot-a", headers: { cookie } })
    expect(del.statusCode).toBe(204)
    const get = await getApp().inject({ method: "GET", url: "/saves/slot-a", headers: { cookie } })
    expect(get.statusCode).toBe(404)
  })

  it("user isolation — Alice cannot see Bob's saves", async () => {
    const { cookie: aliceCookie } = await signupUser("alice2")
    const { cookie: bobCookie } = await signupUser("bob2")
    await getApp().inject({
      method: "PUT",
      url: "/saves/slot-a",
      headers: { cookie: aliceCookie, "content-type": "application/json" },
      payload: { data: sampleData, meta: sampleMeta },
    })
    const bobList = await getApp().inject({ method: "GET", url: "/saves", headers: { cookie: bobCookie } })
    expect(JSON.parse(bobList.body)).toEqual([])

    const bobGet = await getApp().inject({ method: "GET", url: "/saves/slot-a", headers: { cookie: bobCookie } })
    expect(bobGet.statusCode).toBe(404)
  })

  it("401 without cookie", async () => {
    const res = await getApp().inject({ method: "GET", url: "/saves" })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
cd server && npm test -- saves
```

Expected: all 7 tests fail with 404 (routes not registered yet).

- [ ] **Step 3: Implement `/server/src/routes/saves.ts`**

```typescript
import type { FastifyInstance } from "fastify"
import { and, eq } from "drizzle-orm"
import { saves } from "../db/schema.js"
import { SavePutBody } from "../../../src/shared/dto.js"
import { Errors } from "../errors.js"

export async function savesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/saves", async (req) => {
    const user = await app.requireAuth(req)
    const rows = await app.db
      .select({
        slotKey: saves.slotKey,
        meta: saves.meta,
        updatedAt: saves.updatedAt,
      })
      .from(saves)
      .where(eq(saves.userId, user.id))
    return rows.map((r) => ({
      slotKey: r.slotKey,
      meta: r.meta,
      updatedAt: r.updatedAt.toISOString(),
    }))
  })

  app.get<{ Params: { slotKey: string } }>("/saves/:slotKey", async (req) => {
    const user = await app.requireAuth(req)
    const rows = await app.db
      .select()
      .from(saves)
      .where(and(eq(saves.userId, user.id), eq(saves.slotKey, req.params.slotKey)))
      .limit(1)
    const row = rows[0]
    if (!row) throw Errors.saveNotFound()
    return { data: row.data, meta: row.meta, updatedAt: row.updatedAt.toISOString() }
  })

  app.put<{ Params: { slotKey: string } }>("/saves/:slotKey", async (req) => {
    const user = await app.requireAuth(req)
    const parsed = SavePutBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")

    const now = new Date()
    const result = await app.db
      .insert(saves)
      .values({
        userId: user.id,
        slotKey: req.params.slotKey,
        data: parsed.data.data,
        meta: parsed.data.meta,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [saves.userId, saves.slotKey],
        set: { data: parsed.data.data, meta: parsed.data.meta, updatedAt: now },
      })
      .returning({ updatedAt: saves.updatedAt })
    const row = result[0]
    if (!row) throw new Error("Upsert returned no row")
    return { updatedAt: row.updatedAt.toISOString() }
  })

  app.delete<{ Params: { slotKey: string } }>("/saves/:slotKey", async (req, reply) => {
    const user = await app.requireAuth(req)
    await app.db
      .delete(saves)
      .where(and(eq(saves.userId, user.id), eq(saves.slotKey, req.params.slotKey)))
    return reply.status(204).send()
  })
}
```

- [ ] **Step 4: Register saves routes in `/server/src/routes/index.ts`**

```typescript
import type { FastifyInstance } from "fastify"
import { authRoutes } from "./auth.js"
import { meRoutes } from "./me.js"
import { savesRoutes } from "./saves.js"

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes)
  await app.register(meRoutes)
  await app.register(savesRoutes)
}
```

- [ ] **Step 5: Run all tests, verify pass**

```bash
cd server && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd ..
git add server/src/routes/saves.ts server/src/routes/index.ts server/tests/saves.test.ts
git commit -m "feat(server): saves CRUD endpoints

GET manifest, GET/PUT/DELETE per slot. PUT uses onConflictDoUpdate for
upsert semantics. Per-user isolation enforced via WHERE userId clause
on every query. Body validated with shared SavePutBody zod schema."
```

---

## Task 13: Settings GET / PUT

**Goal:** `GET /settings` returns 404 if the user has not opted into sync; `PUT /settings` upserts the bundle.

**Files:**
- Create: `/server/src/routes/settings.ts`
- Modify: `/server/src/routes/index.ts`
- Create: `/server/tests/settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Create `/server/tests/settings.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { getApp, signupUser } from "./helpers.js"

const sampleSettings = { volume: 50, muted: true, fullscreen: false, keys: { jump: " " }, showTutorialNextStart: false }

describe("settings GET / PUT", () => {
  it("GET /settings returns 404 before first PUT (opt-in)", async () => {
    const { cookie } = await signupUser("nora")
    const res = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe("SETTINGS_NOT_FOUND")
  })

  it("PUT then GET round-trip", async () => {
    const { cookie } = await signupUser("oscar")
    const put = await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleSettings },
    })
    expect(put.statusCode).toBe(200)
    const get = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie } })
    expect(get.statusCode).toBe(200)
    expect(JSON.parse(get.body).data).toEqual(sampleSettings)
  })

  it("PUT upserts (second PUT overwrites)", async () => {
    const { cookie } = await signupUser("paul")
    await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: sampleSettings },
    })
    const updated = { ...sampleSettings, volume: 99 }
    await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie, "content-type": "application/json" },
      payload: { data: updated },
    })
    const get = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie } })
    expect(JSON.parse(get.body).data.volume).toBe(99)
  })

  it("user isolation — separate accounts don't see each other's settings", async () => {
    const { cookie: aCookie } = await signupUser("quinn")
    const { cookie: bCookie } = await signupUser("rita")
    await getApp().inject({
      method: "PUT",
      url: "/settings",
      headers: { cookie: aCookie, "content-type": "application/json" },
      payload: { data: sampleSettings },
    })
    const res = await getApp().inject({ method: "GET", url: "/settings", headers: { cookie: bCookie } })
    expect(res.statusCode).toBe(404)
  })

  it("401 without cookie", async () => {
    const res = await getApp().inject({ method: "GET", url: "/settings" })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
cd server && npm test -- settings
```

Expected: 5 tests fail with 404 (routes not registered).

- [ ] **Step 3: Implement `/server/src/routes/settings.ts`**

```typescript
import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { userSettings } from "../db/schema.js"
import { SettingsPutBody } from "../../../src/shared/dto.js"
import { Errors } from "../errors.js"

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", async (req) => {
    const user = await app.requireAuth(req)
    const rows = await app.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1)
    const row = rows[0]
    if (!row) throw Errors.settingsNotFound()
    return { data: row.data, updatedAt: row.updatedAt.toISOString() }
  })

  app.put("/settings", async (req) => {
    const user = await app.requireAuth(req)
    const parsed = SettingsPutBody.safeParse(req.body)
    if (!parsed.success) throw Errors.invalidBody(parsed.error.issues[0]?.message ?? "Invalid body")

    const now = new Date()
    const result = await app.db
      .insert(userSettings)
      .values({ userId: user.id, data: parsed.data.data, updatedAt: now })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { data: parsed.data.data, updatedAt: now },
      })
      .returning({ updatedAt: userSettings.updatedAt })
    const row = result[0]
    if (!row) throw new Error("Upsert returned no row")
    return { updatedAt: row.updatedAt.toISOString() }
  })
}
```

- [ ] **Step 4: Register settings routes**

In `/server/src/routes/index.ts`:

```typescript
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
```

- [ ] **Step 5: Run all tests**

```bash
cd server && npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd ..
git add server/src/routes/settings.ts server/src/routes/index.ts server/tests/settings.test.ts
git commit -m "feat(server): settings GET/PUT (opt-in)

GET 404s before first PUT — that's how the client detects 'not opted
in' without a separate flag. PUT upserts via onConflictDoUpdate keyed
on userId. Per-user isolation enforced like saves."
```

---

## Task 14: Production middleware — helmet, CORS, rate limit on /auth

**Goal:** Set protective HTTP headers, restrict CORS to the configured frontend origin, and rate-limit `/auth/*` to AUTH_RATE_MAX requests per AUTH_RATE_WINDOW per IP.

**Files:**
- Modify: `/server/src/app.ts`

- [ ] **Step 1: Update `/server/src/app.ts` to register the three plugins**

Replace the contents of `/server/src/app.ts` with:

```typescript
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
    contentSecurityPolicy: false, // API responses are JSON; CSP would just noise the logs
    crossOriginResourcePolicy: { policy: "same-site" },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })

  await app.register(cookie)

  await app.register(rateLimit, {
    global: false, // applied per-route below via routeOptions
    max: env.AUTH_RATE_MAX,
    timeWindow: env.AUTH_RATE_WINDOW,
  })

  registerSessionDecorator(app, db, env.SESSION_COOKIE_NAME)

  app.get("/health", async () => ({ ok: true }))

  await registerRoutes(app)

  return app
}
```

- [ ] **Step 2: Apply rate limit to /auth/* routes**

In `/server/src/routes/auth.ts`, wrap each `/auth/*` route's options to enable the rate limit. Drizzle in routes already imported; just thread `config.rateLimit: {}` to each route by changing the route registrations from:

```typescript
app.post("/auth/signup", async (req, reply) => { /* ... */ })
```

to:

```typescript
app.post("/auth/signup", { config: { rateLimit: {} } }, async (req, reply) => { /* ... */ })
```

Apply the same wrap to `/auth/login`, `/auth/recover`, `/auth/logout`. The empty `{}` means "use the global default config that we set up in app.ts."

- [ ] **Step 3: Verify all tests still pass**

```bash
cd server && npm test
```

Expected: all pass. Test env sets AUTH_RATE_MAX = 10 by default; tests stay under that limit.

- [ ] **Step 4: Commit**

```bash
cd ..
git add server/src/app.ts server/src/routes/auth.ts
git commit -m "feat(server): helmet + CORS + rate limit on /auth/*

Protective HTTP headers via @fastify/helmet, CORS restricted to
CORS_ORIGIN allowlist with credentials enabled, rate limit applied
per-route to /auth/signup, /login, /recover, /logout. trustProxy
enabled in production for accurate per-IP limiting behind Railway."
```

---

## Task 15: Server smoke test + final lint pass

**Goal:** Boot the server end-to-end, hit each endpoint with curl, verify behavior. Then run typecheck across both packages and confirm clean.

**Files:** none (verification only)

- [ ] **Step 1: Boot the server**

Make sure Postgres is up and migrations are applied:

```bash
docker-compose up -d postgres
cd server && npm run db:migrate
```

Then in one terminal:

```bash
cd server && npm run dev
```

- [ ] **Step 2: Smoke test the full happy path**

In another terminal:

```bash
# Health check
curl -s localhost:8080/health
# Expected: {"ok":true}

# Signup
curl -s -c /tmp/drift-cookies.txt -X POST localhost:8080/auth/signup \
  -H "content-type: application/json" \
  -d '{"username":"smoketest","password":"smoke-test-123"}'
# Expected: {"recoveryCode":"<24 base32 chars>"}

# /me with cookie
curl -s -b /tmp/drift-cookies.txt localhost:8080/me
# Expected: {"username":"smoketest","signedInAt":"...","saveCount":0}

# Save a slot
curl -s -b /tmp/drift-cookies.txt -X PUT localhost:8080/saves/slot-1 \
  -H "content-type: application/json" \
  -d '{"data":{"version":1,"hud":{"level":3}},"meta":{"id":"slot-1","level":3}}'
# Expected: {"updatedAt":"..."}

# Manifest
curl -s -b /tmp/drift-cookies.txt localhost:8080/saves
# Expected: array with one entry

# Read save back
curl -s -b /tmp/drift-cookies.txt localhost:8080/saves/slot-1
# Expected: {"data":{...},"meta":{...},"updatedAt":"..."}

# Settings opt-in
curl -s -b /tmp/drift-cookies.txt localhost:8080/settings
# Expected: {"error":{"code":"SETTINGS_NOT_FOUND",...}}

curl -s -b /tmp/drift-cookies.txt -X PUT localhost:8080/settings \
  -H "content-type: application/json" \
  -d '{"data":{"volume":75}}'
# Expected: {"updatedAt":"..."}

# Logout
curl -s -b /tmp/drift-cookies.txt -X POST localhost:8080/auth/logout -o /dev/null -w "%{http_code}\n"
# Expected: 204

# /me after logout
curl -s -b /tmp/drift-cookies.txt localhost:8080/me
# Expected: 401 / {"error":{"code":"UNAUTHORIZED",...}}

# Cleanup
rm /tmp/drift-cookies.txt
docker exec drift-postgres psql -U drift -d drift -c "DELETE FROM users WHERE username = 'smoketest';"
```

If any of these don't behave as expected, the test suite missed a regression — file a bug, fix, retest.

Stop the dev server (Ctrl+C in the dev terminal).

- [ ] **Step 3: Final typecheck pass on both packages**

```bash
cd .. && npm run typecheck
cd server && npm run typecheck
```

Expected: both clean.

- [ ] **Step 4: Final test run**

```bash
cd server && npm test
```

Expected: all tests pass, no flakiness.

- [ ] **Step 5: Commit (only if any incidental fixes were needed)**

If steps 1–4 surfaced any small fixes, commit them. Otherwise this task closes out without a commit.

```bash
cd ..
git status
# If clean: nothing to commit. Plan 1 complete.
```

---

## Done criteria

Plan 1 is complete when all of these hold:

- [ ] `git ls-files` shows no `.env` files; `.gitignore` excludes them
- [ ] `docker-compose up -d postgres` brings up Postgres on :5432
- [ ] `cd server && npm run db:migrate` creates all 4 tables
- [ ] `cd server && npm run dev` boots the API on :8080
- [ ] `cd server && npm test` runs ~25 integration tests, all green
- [ ] `npm run typecheck` (root + server) clean
- [ ] `curl localhost:8080/health` returns `{"ok":true}`
- [ ] The smoke test in Task 15 step 2 walks happy-path end-to-end successfully
- [ ] Frontend `npm run build` still succeeds (no regressions from the shared-type extraction)

When all done, plan 2 (frontend integration + Railway deploy) is the next thing to write.

---

## Self-review notes

**Spec coverage:**
- Spec build steps 1 (server scaffold), 2 (schema/migrations/seed), 3 (auth) → covered by plan tasks 1–4 + 7–11
- Spec build step 4 (saves) → covered by task 12
- Spec build step 5 (settings) → covered by task 13
- Spec build step 6 (frontend api.ts) → DEFERRED to plan 2 (correct per scope boundary)
- Spec build step 7 (Vitest tests) → covered inline in tasks 7–13
- Spec "production middleware" (helmet, CORS, rate limit) → covered by task 14
- Spec "save format versioning" → covered by task 6 (client side; server is opaque)
- Spec "shared types" → covered by task 5
- Spec "secrets handling" → covered by task 1 + Task 2 step 7

**Type consistency:**
- `SaveData` always has `version: number` — defined in shared/save.ts, stamped in client setSave, validated as `Record<string, unknown>` server-side
- Session token: generated as base64url string, hashed via SHA-256 hex — consistent across tokens.ts, session.ts, auth.ts
- Recovery code: 24-char base32 — consistent across tokens.ts and tests
- Errors: AppError + Errors.* factory — consistent across all routes

**No placeholders found.** All code blocks are complete; no "TODO add validation" or "similar to Task N" cross-references.
