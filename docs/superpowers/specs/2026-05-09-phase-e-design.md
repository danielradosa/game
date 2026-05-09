# Phase E — Backend, Accounts, and Progress Sync

**Status:** Design approved 2026-05-09. Ready for implementation plan.
**Date:** 2026-05-09 (rewrite of original draft after Q&A pass)
**Predecessor phases:** A–D shipped. Local-only browser game with localStorage persistence.
**Repo visibility:** Public (github). All secrets management must reflect this.

---

## Goal

Pivot from a local-only single-player game to a service-backed game where:

- Players have **accounts** (saves and progression travel between devices/browsers)
- The **server is canonical** for saves once signed in; the local game still works offline as a cache
- The infrastructure is **reproducible via Docker** for local dev and one-command deployable to Railway
- Future features (leaderboards, shared world state, asset CDN) have a foundation already in place

The local-first behavior must keep working — if a player never creates an account, the game continues to work via localStorage exactly as it does today.

## Motivation (locked)

Phase E serves three needs simultaneously: **personal cross-device sync** (Daniel's saves follow him between machines), **shared play with friends** (link out, friends play, their progress persists), and **foundation for future features** (DB + accounts + server) — emphasizing all three rather than optimizing for one.

## Non-goals

- Real-time multiplayer / co-op (would need WebSockets + game state sync — separate phase)
- Leaderboards (data model supports them via `meta jsonb` queries; no endpoint shipped in E)
- Asset hosting / CDN (current bundled assets are fine for now — defer to Phase F)
- Email infrastructure (auth uses username + password + one-time recovery code; no email channel anywhere)
- Admin tooling (use Railway Postgres console for now)
- Anti-cheat / save validation (clients are trusted; tampering is a future concern)
- Multi-account on one device (each browser is one signed-in account; switch = sign out + sign in)
- Email change flow (no emails stored; usernames are immutable in v1)

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ React app (current Vite build)                        │  │
│  │  - localStorage-first save layer (existing)           │  │
│  │  - new sync layer: pulls / pushes when signed in      │  │
│  │  - Account UI in Settings → Account                   │  │
│  │  - Tiny "👤 username" badge on main menu when signed in│  │
│  └────────────────────┬─────────────────────────────────┘  │
└────────────────────────┼─────────────────────────────────────┘
                         │ HTTPS REST + cookie session
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ API server (/server, Fastify + TS, ESM)                      │
│  - Auth: username + password (argon2id) + opaque session     │
│    cookie (HTTP-only, SameSite=Lax)                          │
│  - Endpoints: /auth, /me, /saves, /settings                  │
│  - Drizzle ORM + node-postgres driver                        │
│  - helmet, rate limit (auth endpoints), CORS to frontend     │
│  - Vitest integration tests (~10) against docker test DB     │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Postgres (Railway-managed in prod, docker-compose locally)   │
│  - users (id, username, password_hash, recovery_code_hash,…) │
│  - sessions (token_hash, user_id, expires_at, revoked_at,…)  │
│  - saves (id, user_id, slot_key, data jsonb, meta jsonb,…)   │
│  - user_settings (user_id, data jsonb, updated_at)           │
└─────────────────────────────────────────────────────────────┘
```

Frontend Vite build still ships the same way. The new server is a sibling folder (`/server`) inside the same repo (monorepo-lite), built by its own `package.json`, deployed independently as a Railway service.

---

## Locked decisions

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| API framework | **Fastify** | TS-native ergonomics, schema validation, faster than Express |
| ORM | **Drizzle** | TS-first, no codegen step, simple migrations, fits a 4-table schema cleanly |
| Database | **Postgres** | Railway-managed in prod; same image in docker-compose locally |
| Hashing | **argon2id** (`@node-rs/argon2`) | Modern default, GPU-resistant, beats bcrypt |
| Sessions | **DB-backed opaque token** in HTTP-only cookie | Clean revocation, no JWT secret rotation, negligible DB cost at our scale |
| Tests (server) | **Vitest** + integration tests against docker Postgres | Auth + save endpoints are exactly where regressions silently lose user data |
| Hosting | **Railway** for API + Postgres + frontend static | Single dashboard, paid plan, provisioning via the Railway plugin |
| Environments | **Single prod env** | docker-compose for local dev; risky migrations tested locally first |

### Auth

- **Username + password.** No email. Usernames are immutable in v1.
- **Hashing:** argon2id (memory-hard, GPU-resistant). Time/memory params at `@node-rs/argon2` defaults.
- **Recovery code:** at signup, generate a 24-char base32 string, show it once to the user. Hash with argon2id and store. Never displayed again.
- **Forgot password flow:** username + recovery code + new password → resets password, invalidates old recovery code, generates and shows a new one.
- **Sessions:** opaque random 32-byte base64url token in `HTTP-only`, `SameSite=Lax`, `Secure` (in prod) cookie. Server stores **SHA-256 hash of the token** in `sessions(token_hash, ...)` so the raw token never appears in the DB. Sliding 30-day expiration: each successful authenticated request extends `expires_at` to `now() + 30d`, debounced to at most one DB write per session per 24h to avoid hot writes on busy clients.
- **Logout:** `UPDATE sessions SET revoked_at = now() WHERE token_hash = ...`. Cookie cleared.
- **Account loss:** if both password and recovery code are lost, the account is unrecoverable. The local browser's localStorage saves remain intact — restart sync from scratch.

### Save sync semantics

- **Last-write-wins per save slot**, with a conflict prompt when local and server have diverged.
- **Auto-push** on every save (existing autosave + manual save).
- **Auto-pull manifest** on app start while signed in + immediately after sign-in.
- **Conflict prompt:** for any slot where `server.updatedAt > local.updatedAt`, modal: "Cloud save is newer ({timestamp}). Use cloud or keep local?" Default: cloud.
- **Deletes propagate.** Hard delete on server. On next sync, "missing from manifest" → remove locally.
- **Settings sync:** opt-in. Toggle in Settings ("Sync settings to account"). Off by default. On = whole bundle pushed/pulled alongside saves.
- **Save format versioning:** `version: number` field added to `SaveData` blob (start at `1`). Client-side `migrate(data, fromVersion)` chain runs on load. Server stores `data` opaquely as `jsonb`.

### UI flow

- **Anonymous (default):** main menu and behavior unchanged from today.
- **Signed in:** main menu shows tiny "👤 username" badge top-right (clickable → Settings → Account).
- **Account UI:** entirely inside Settings → Account — sign in, create account, recover, sign out, settings-sync toggle.
- **First sign-in migration:** if local saves exist, prompt "You have N local saves. Upload to your account?" with **Yes / No / Discard local**.

### Repo layout

| Path | Purpose |
|---|---|
| `/` | Frontend (Vite + React + canvas), unchanged |
| `/src/shared/` | NEW. Cross-cutting types both sides import: `SaveData`, `Settings`, `MigrationVersion`, API DTOs, `SAVE_VERSION` const |
| `/server/` | NEW. Fastify API. Own `package.json`, `tsconfig.json`, `Dockerfile`, `.env.example` |
| `/docker-compose.yml` | NEW. Orchestrates Postgres + API for local dev |

Server `tsconfig.json` adds `paths` mapping for `@shared/*` → `../src/shared/*`. Same pattern as the existing frontend `@/*` alias.

### Secrets & env management (CRITICAL — repo is public)

- **`.env` files are NEVER committed.** Update root `.gitignore` to add `.env` and `.env.*` (with an explicit `!.env.example` exception).
- **`.env.example` template** at `/server/.env.example` documents required vars with placeholder values:
  ```
  DATABASE_URL=postgresql://drift:drift@localhost:5432/drift
  SESSION_COOKIE_NAME=drift_session
  COOKIE_SECURE=false   # true in prod
  CORS_ORIGIN=http://localhost:5173
  PORT=8080
  NODE_ENV=development
  ARGON2_PEPPER=          # 32+ random bytes, base64. Generated per env.
  ```
- **Local dev:** `/server/.env` (gitignored) loaded by Fastify via `@fastify/env` or `dotenv`. docker-compose may inject overlapping vars via `env_file`.
- **Production:** all env vars set directly on Railway via dashboard or the Railway plugin. **Never** via committed config. The Railway-managed Postgres exposes `DATABASE_URL` automatically — wire it through the service's env reference.
- **Pre-flight check:** before pushing the first Phase E commit, verify `git status` shows no `.env` files and `.gitignore` is updated.

---

## Database schema (Drizzle)

```ts
// src/shared/save-version.ts
export const SAVE_VERSION = 1 as const

// src/shared/types.ts
export type SaveData = { version: number; /* existing fields */ }

// server/src/db/schema.ts
import {
  pgTable, uuid, text, timestamp, jsonb, unique
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  recoveryCodeHash: text("recovery_code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
})

export const sessions = pgTable("sessions", {
  // SHA-256 hash of the random session token. The raw token only ever
  // exists in the user's cookie + briefly in memory during request handling.
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

export const saves = pgTable("saves", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  slotKey: text("slot_key").notNull(),     // matches SaveMeta.id format
  data: jsonb("data").$type<SaveData>().notNull(),
  meta: jsonb("meta").$type<SaveMeta>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userSlotUnique: unique().on(t.userId, t.slotKey),
}))

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  data: jsonb("data").$type<Settings>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

---

## API surface

REST + JSON. All authed endpoints require the session cookie. Rate limits applied to `/auth/*` (e.g. 10/min per IP).

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `POST` | `/auth/signup` | none | `{ username, password }` | `{ recoveryCode }` (one-time) + sets cookie |
| `POST` | `/auth/login` | none | `{ username, password }` | `{ ok: true }` + sets cookie |
| `POST` | `/auth/recover` | none | `{ username, recoveryCode, newPassword }` | `{ recoveryCode }` (new one) + sets cookie |
| `POST` | `/auth/logout` | session | — | clears cookie, revokes session |
| `GET` | `/me` | session | — | `{ username, signedInAt, saveCount }` |
| `GET` | `/saves` | session | — | `[{ slotKey, meta, updatedAt }]` |
| `GET` | `/saves/:slotKey` | session | — | `{ data, updatedAt }` |
| `PUT` | `/saves/:slotKey` | session | `{ data, meta }` | `{ updatedAt }` |
| `DELETE` | `/saves/:slotKey` | session | — | `204` |
| `GET` | `/settings` | session | — | `{ data, updatedAt }` (404 if not opted in) |
| `PUT` | `/settings` | session | `{ data }` | `{ updatedAt }` |

Total: 11 endpoints. ~80 lines of route code.

**Validation:** request bodies validated with Zod schemas declared in `/src/shared/dto.ts`, reused server-side and client-side.

**Error shape:** consistent `{ error: { code: string, message: string } }`. Codes: `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `USERNAME_TAKEN`, `SAVE_NOT_FOUND`, `RATE_LIMITED`, `INVALID_BODY`, `INTERNAL`.

---

## Build sequence (11 steps)

Each step ships behind the implicit "client falls back to localStorage if API unreachable" guarantee. Steps 1–7 are server-only; the existing frontend keeps working unchanged through that half of the phase.

| # | Step | Output |
|---|---|---|
| 1 | Repo prep + `.gitignore` + `/server` scaffold | Update `.gitignore` to exclude `.env*` (with `!.env.example`). Create `/server` with Fastify boot, Drizzle setup, `package.json`, `tsconfig.json`, `Dockerfile`, `.env.example`. Root `docker-compose.yml`. |
| 2 | Schema + Drizzle migrations + seed | Migrations for `users`, `sessions`, `saves`, `user_settings`. `seed.sql` with one fake user for manual smoke testing. |
| 3 | Shared types + save versioning | Move `SaveData` / `Settings` / API DTOs to `/src/shared/`. Add `version: 1` to SaveData. Add client-side `migrate(data, from)` shell with no-op for v1. |
| 4 | Auth endpoints + session middleware | `/auth/signup`, `/auth/login`, `/auth/recover`, `/auth/logout`, `/me`. argon2id hashing. Random 32-byte tokens. Session middleware validates cookie → loads user. Sliding expiration. |
| 5 | Save endpoints | `/saves` GET/PUT/DELETE. Upserts via Drizzle's `onConflictDoUpdate`. |
| 6 | Settings endpoint | `/settings` GET/PUT. Opt-in: only created on first PUT. |
| 7 | Vitest integration tests | ~10 tests. Per-test transaction rollback. Cover: signup happy/duplicate, login wrong password, recovery happy/wrong code, save round-trip, save upsert, save delete, manifest, settings opt-in. |
| 8 | Frontend `src/net/api.ts` | Typed fetch wrapper using shared DTOs. Cookie-credentials handling. Error normalization. |
| 9 | Frontend Account UI | New screen `src/ui/AccountPanel.tsx`. Signup / login / recover / logout flows. Settings → Account entry. Main-menu badge. First-sign-in upload prompt. |
| 10 | Sync hook + conflict prompt | `useSync()` pulls manifest on app start (when authed), pushes after every save. Conflict modal per stale slot. Settings opt-in toggle wired through. |
| 11 | Railway deploy | Provision via Railway plugin: API service, Postgres add-on, frontend static service. Env vars set in Railway dashboard. Smoke test from clean browser (signup → save → switch browser → sign in → load). |

Step 11 is the deployment dress rehearsal — nothing in steps 1–10 should depend on a deployed environment.

---

## Risks / gotchas

- **Public repo + secrets:** the `.gitignore` change in step 1 is the single highest-risk item. Verify with `git ls-files | grep -i env` before any commit. Mitigation: also add a pre-commit hook (or rely on Railway Drizzle migration runner failing safely if pointed at the wrong env).
- **Account loss is unrecoverable:** if both password and recovery code are lost, no remediation. Document this prominently in the signup flow. Mitigation: localStorage saves remain a fallback.
- **Cookie domain in dev:** localhost vs 127.0.0.1 cookie scoping is a known pain point. Local dev URLs must be consistent (`http://localhost:5173` for frontend, `http://localhost:8080` for API).
- **CSRF:** SameSite=Lax + cookie auth is generally CSRF-safe for our same-origin workload. If Drift is ever embedded on a third-party origin, add CSRF token derived from the session.
- **Argon2 CPU cost:** signup/login costs ~50–100ms of CPU. Fine at low traffic; if it ever matters, move to a worker thread or lower memory params.
- **Rate-limiting bypass:** simple per-IP limit can be evaded with proxies. For friends-grade scale this is acceptable; tighten with Cloudflare Turnstile if abuse appears.
- **Save migration race:** signed in on two devices, both press Save simultaneously → later PUT wins silently. We chose LWW for simplicity. If this becomes a real problem, add a `save_history` table in Phase F.
- **Postgres bloat:** jsonb saves at ~5KB each, 100 users × 4 saves = 2MB. Won't matter at this scale. Add archival policy when users hit 100+ saves.
- **Backup strategy:** Railway managed Postgres includes automated daily backups on the paid plan (already in use). Verify retention window matches expectation.
- **Local dev DB reset:** `docker-compose down -v` drops the volume. Document this clearly so a fresh contributor doesn't lose seed data unintentionally.

---

## Out of scope (future phases)

- **Real-time multiplayer / co-op** (Phase F or later): WebSockets, server-side game state, anti-cheat
- **Leaderboards:** schema supports them via `meta jsonb` querying or a derived stats table — implement when needed
- **Asset CDN:** bundled assets are 250KB total; CDN unnecessary at current scale
- **Admin tooling:** Railway Postgres console for now
- **Email change / username change:** account is tied to immutable username
- **Multi-account on one device:** sign out + sign in = the only way to switch
- **Account deletion (GDPR):** implement when needed; FK `ON DELETE CASCADE` already covers data wipe

---

## Done criteria

Phase E is complete when:

1. A new player can sign up on Device A, create saves, sign in on Device B, see those saves, continue play, and have the latest progress reflected back on Device A after a refresh.
2. A guest player who never signs in continues to play exactly as today, with no UI surprises.
3. A player who deletes a save on Device A no longer sees that save on Device B after the next sync.
4. A player who forgets their password can recover with their recovery code and continue playing.
5. The repo's `git ls-files` output contains no `.env` files; the production deploy reads all secrets from Railway env vars.
6. `npm test` in `/server` runs the Vitest integration suite green against a fresh docker test DB.
7. `npm run typecheck` and `npm run lint` are clean across both `/` and `/server`.
