# Phase E — Backend, Accounts, and Progress Sync

**Status:** Design draft. Pending user review + Q&A pass before implementation.
**Date:** 2026-05-09
**Predecessor phases:** A–D shipped. Local-only browser game with localStorage persistence.

> **For the next conversation:** this doc is a *starting position*, not a fait accompli. Every "Recommendation" line is a default I'd take if no preference is expressed. Every "Open question" is a real choice that affects the rest of the build. Walk the doc top-to-bottom; agree / disagree / refine. Once approved we'll write the implementation plan and start dispatching subagents.

---

## Goal

Pivot from a local-only single-player game to a service-backed game where:
- Players have **accounts** (saves and progression travel between devices/browsers)
- The **server is canonical** for saves; the local game still works offline as a cache
- The infrastructure is **reproducible via Docker** for dev and one-command deployable to Railway
- Future features (leaderboards, shared world state, asset CDN) have a foundation already in place

The local-first behavior must keep working — if a player never creates an account, the game continues to work via localStorage exactly as it does today.

## Non-goals

- Real-time multiplayer / co-op (would need WebSockets + game state sync — separate phase)
- Leaderboards (data model supports them, but no endpoint shipped)
- Asset hosting / CDN (current bundled assets are fine for now — defer to Phase F)
- Email delivery infra (magic links use a 3rd-party service — see §Auth)
- Admin tooling (bring up via raw SQL queries for now)
- Anti-cheat / save validation (clients are trusted; tampering is a future concern)

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ React app (current Vite build)                        │  │
│  │  - localStorage-first save layer (existing)           │  │
│  │  - new sync layer: pulls / pushes saves when logged in│  │
│  │  - "Sign in" UI in main menu + Settings               │  │
│  └────────────────────┬─────────────────────────────────┘  │
└────────────────────────┼─────────────────────────────────────┘
                         │ HTTPS REST
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ API server (Node / TS, in repo at /server)                   │
│  - Auth: magic-link (email) + JWT in HTTP-only cookie        │
│  - Endpoints: /auth, /saves, /manifest, /settings            │
│  - Drizzle ORM + Postgres                                    │
│  - Helmet, rate limit, CORS to frontend origin               │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Postgres (Railway-managed in prod, docker-compose locally)   │
│  - users (id, email, created_at, last_login_at)              │
│  - saves (id, user_id, slot_key, data jsonb, version, mtime) │
│  - email_links (token, user_id, expires_at) — short-lived    │
└─────────────────────────────────────────────────────────────┘
```

The frontend Vite build still ships the same way. The new server is in a sibling folder (`/server`) inside the same repo (monorepo-lite), built by its own `package.json`, deployed independently.

---

## Open questions (read these carefully — most are real choices)

### Q1 — Server stack: Node + Fastify, Hono, or stay with Express?

The CLAUDE.md project notes mention "Express v5, ESM" for Node backends. That's fine, but Fastify is faster, has better TS support out of the box (schema-driven validation, type inference into route handlers), and has clearer plugin ergonomics.

| Option | Pros | Cons |
|---|---|---|
| **Fastify** (recommendation) | TS-native, schema validation, faster, modern docs | Less "default" than Express |
| Express v5 | Familiar, matches existing project conventions | Manual validation, no schema-typed handlers |
| Hono | Smallest, edge-deployable, great DX | Newest of the three, Railway-on-Node is fine without it |

**Recommendation: Fastify.** If you'd rather match existing convention, Express v5 is OK — the rest of the design stays the same.

---

### Q2 — Auth: magic-link, OAuth, password, or guest+upgrade?

| Option | Pros | Cons |
|---|---|---|
| **Email + magic link** (rec) | No password reset flows, no password storage, simple UX | Requires email send (Resend/Postmark/SES) |
| OAuth (GitHub/Google) | No password, no email send, faster signup | Requires OAuth app setup per provider; locks players who lack those accounts |
| Email + password | Classic, no email-send dependency for login | Bcrypt + reset tokens + rate limit on /login + bot-defense complexity |
| **Guest-first + upgrade** (rec layer) | Keeps current local-first UX intact; upgrade lets you sync later | Adds a "claim local saves" migration step on first sign-in |

**Recommendation: combine the two recommendations.** Default play = guest (localStorage only, like today). "Sign in" button in main menu + Settings → enter email → receive a magic link → on click, account created + cookie set + localStorage saves migrated to server. Subsequent visits to the same browser auto-sign-in via cookie.

**Email sender**: Resend (100 emails/day free) — simplest API. Alternative: Postmark, AWS SES.

---

### Q3 — Save sync semantics

Two devices, last-write-wins or per-slot reconciliation?

| Option | Pros | Cons |
|---|---|---|
| **Last-write-wins per save slot** (rec) | Simple, matches "you used Browser A more recently" expectation | Lost work if a player makes progress on B without syncing first |
| Server canonical, client read-only | Strongest consistency | No offline play if network is out |
| 3-way merge per save | "No data loss" | Requires conflict UI; saves are blobs not diffs |

**Recommendation: LWW per slot, with a "Pull" button.** When the client comes online (or on app start while logged in), it pulls the manifest. If a server save's `mtime` is newer than the local one's `mtime`, prompt: "Cloud save is newer (Mar 5, 14:32). Use cloud or keep local?" — let the player decide for that slot. Default: take cloud. This avoids silent overwrites.

---

### Q4 — Database: Postgres column shape

Two ways to store a save:

```sql
-- Option A — wide row, queryable
CREATE TABLE saves (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  slot_key    text NOT NULL,
  name        text NOT NULL,
  level       int NOT NULL,
  rebirths    int NOT NULL,
  ...10+ more queryable columns...
  data        jsonb NOT NULL,  -- the rest of the blob
  ...
);

-- Option B — narrow row, blob-only (recommendation)
CREATE TABLE saves (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  slot_key    text NOT NULL,
  data        jsonb NOT NULL,  -- the entire SaveData object
  version     int NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_key)
);
```

**Recommendation: Option B.** Saves are read/written wholesale; we never query "all saves where level > 5" — the client reads the full row, parses the blob, runs the game. Option A would let leaderboards exist as a SQL query, but leaderboards aren't shipping in E. When they do, we add a `derived_stats` table populated by triggers or a periodic job.

**ORM choice**: Drizzle (TS-first, generates types, simple migrations) vs Prisma (more popular but heavier client + an extra runtime engine).

**Recommendation: Drizzle.** Fits a 4-table schema cleanly, no codegen step in the build pipeline.

---

### Q5 — Settings sync — included or local-only?

Settings are personal (volume, key bindings). Should they sync across devices?

**Recommendation: yes, opt-in.** Default = local-only. After first sign-in, the SettingsMenu gets a "Sync settings to account" toggle. If on, settings push/pull alongside saves. Off-by-default keeps device-specific bindings (e.g. you bind differently on a laptop vs a desktop with a real keyboard) sane.

---

### Q6 — Account-optional UI flow

The current main menu shows: Continue · New Journey · Load Game · Settings · About · Sound.

After Phase E:
- **Anonymous (default)**: same UI, behavior unchanged
- **Signed in**: same UI + a small badge "Signed in as user@x.com" near the bottom; "Sign out" lives in Settings; saves auto-sync after each save action

When a guest signs in for the first time, prompt: "You have N local saves. Upload them to your account?" — Yes/No/"Discard local."

---

### Q7 — Hosting + secrets

| Component | Where |
|---|---|
| Frontend (Vite build) | Railway static site OR existing static host (Vercel / Cloudflare Pages) |
| API server | Railway service |
| Postgres | Railway-managed Postgres |
| Email sending | Resend (3rd-party) |
| Secrets | Railway env vars (DATABASE_URL, JWT_SECRET, RESEND_API_KEY) |

**Single-environment to start**: one prod Railway project. Local dev uses docker-compose with Postgres in a container; the email service is mocked (logs the magic link to stdout instead of sending).

---

### Q8 — JWT vs session cookie

| Option | Pros | Cons |
|---|---|---|
| **JWT in HTTP-only cookie** (rec) | Stateless server, easy to scale | Revocation requires denylist or short TTL |
| Database session | Easy revocation | Extra query per authed request |

**Recommendation: short-lived (1 day) JWT in an HTTP-only, SameSite=Lax cookie + a refresh token (30 days) in a separate cookie.** Logout clears both. Renewal is automatic if refresh is valid. Stateless enough, no DB hit per request.

---

### Q9 — Versioning the save format

Today, saves migrate forward via `?? default` patterns. With server-stored saves, a server-side schema migration could break old clients OR a new client could write a save the server doesn't recognize.

**Recommendation:** include `version: number` in the SaveData blob (already exists implicitly — bump on schema-breaking changes). The server stores it and the client reads it. Migrations live entirely on the client (the server treats `data` as opaque). Version mismatch on load → run client-side migration → save back.

---

### Q10 — Backend repo layout

| Option | Pros | Cons |
|---|---|---|
| **Monorepo** (rec) — `/` for frontend, `/server` for API | Single repo, single PR per cross-cutting change, one CI | Mixing concerns in one root |
| Separate repo | Clean boundaries | Two PRs for any cross-cutting feature |

**Recommendation: monorepo-lite.** New folder `/server` with its own `package.json`, `tsconfig.json`, `Dockerfile`. Root-level `docker-compose.yml` orchestrates Postgres + server for local dev. Frontend scripts unchanged.

---

## Provisional schema (Drizzle)

```ts
// server/src/db/schema.ts

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
})

export const emailLinks = pgTable("email_links", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
})

export const saves = pgTable("saves", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  slotKey: text("slot_key").notNull(),  // matches the SaveMeta.id format
  data: jsonb("data").$type<SaveData>().notNull(),
  meta: jsonb("meta").$type<SaveMeta>().notNull(),  // for cheap manifest queries
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userSlotUnique: unique().on(t.userId, t.slotKey),
}))

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  data: jsonb("data").$type<Settings>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
```

---

## Provisional API surface

REST, JSON. All authed endpoints require the JWT cookie.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/request-link` | none | Body: `{ email }`. Generates token, sends magic link email. |
| `GET` | `/auth/consume-link?token=...` | none | Sets JWT + refresh cookies, redirects to frontend home |
| `POST` | `/auth/refresh` | refresh-cookie | Issues a new JWT |
| `POST` | `/auth/logout` | jwt | Clears both cookies |
| `GET` | `/me` | jwt | Returns `{ email, signedInAt, saveCount }` |
| `GET` | `/saves` | jwt | Returns the manifest (array of SaveMeta + updatedAt) |
| `GET` | `/saves/:slotKey` | jwt | Returns full SaveData |
| `PUT` | `/saves/:slotKey` | jwt | Body: SaveData. Upserts. Returns updatedAt. |
| `DELETE` | `/saves/:slotKey` | jwt | Removes the save. |
| `GET` | `/settings` | jwt | Returns Settings (or 404 if not opted in to sync) |
| `PUT` | `/settings` | jwt | Upserts Settings |

Total: 11 endpoints, ~80 lines of route code.

---

## Build sequence (rough — to be refined into the plan)

| # | Subject | Output |
|---|---|---|
| 1 | Server scaffold + Docker | `/server` with Fastify boot, Drizzle setup, docker-compose.yml; `npm run dev` starts API + Postgres locally |
| 2 | Schema + migrations + seed | drizzle migrations for users / email_links / saves / user_settings; `seed.sql` with one fake user for testing |
| 3 | Magic-link auth | `/auth/request-link`, `/auth/consume-link`, `/auth/refresh`, `/auth/logout`, `/me`. Mock email-send to stdout for dev. |
| 4 | Save sync endpoints | `/saves`, `/saves/:k` GET/PUT/DELETE |
| 5 | Settings sync endpoint | `/settings` GET/PUT (opt-in) |
| 6 | Frontend sync layer | `src/net/api.ts` (typed fetch wrapper); `useSync()` hook that pulls manifest on sign-in, pushes on save |
| 7 | Frontend auth UI | "Sign in" button in MainMenu + SettingsMenu; magic-link consume page; "Signed in as" badge; "Sign out" |
| 8 | Local→server migration on first sign-in | "Upload N local saves?" prompt + bulk PUT |
| 9 | Conflict resolution UI | Per-slot "cloud is newer" prompt on app start when authed |
| 10 | Production deploy | Railway service config; Resend wired; smoke-test from a cold browser |

Each step ships behind a feature flag so partial deploys don't break local play. Steps 1-6 are server-only; the frontend keeps working unchanged through the first half of the phase.

---

## Risks / gotchas to flag in the next conversation

- **Email deliverability**: free Resend tier is 100 emails / day. If you ever spike, signup gets rate-limited. Mitigation: cache magic-link sends per email per minute, fail-soft.
- **CSRF**: SameSite=Lax + cookie-based auth is generally CSRF-safe for our workload (no cross-origin form posts), but PUT /saves needs a CSRF token if you ever embed the game on another origin. Mitigation: include a `X-CSRF-Token` header derived from the JWT.
- **Cookie domain in dev**: localhost vs 127.0.0.1 cookie scoping is a known pain point — dev URLs must be consistent (recommend `http://localhost:5173` for frontend, `http://localhost:8080` for API, same parent domain).
- **JWT in localStorage vs cookie**: cookies are the right call (XSS can't read HTTP-only cookies; localStorage is fully accessible to any script). Don't accept "use localStorage" suggestions.
- **Save migration race**: if the user is logged in on two devices and clicks Save at the same time, the later PUT wins silently. We chose LWW for simplicity — flag this, plan a "save history" table for Phase F if data loss becomes a real concern.
- **Postgres bloat**: jsonb saves at ~5KB each, 1000 users × 4 saves = 20MB. Won't matter at this scale. If users hit 100+ saves we should add archival.
- **Backup strategy**: Railway has automated daily backups for managed Postgres. Verify you're on a tier that includes them.
- **Local dev with no email**: the magic-link send is mocked (logs the URL to stdout). Document this clearly so a fresh contributor doesn't burn 30 minutes wondering why no email arrives.

---

## Out of scope (future phases)

- **Real-time multiplayer** (Phase F or later): requires WebSockets, server-side game state, anti-cheat. The current design has zero affordances for it — that's intentional.
- **Leaderboards**: data model supports them via `meta` jsonb querying or a derived stats table. Pick the implementation when first needed.
- **Asset CDN**: bundled assets are 250KB total; CDN unnecessary at current scale. When asset count grows (sprite/audio pass), Cloudflare R2 or Railway static is the natural target.
- **Admin tooling**: visit Postgres directly via Railway's console for now.
- **Email change flow**: users can have one email forever in v1. Email change → support ticket.
- **Account deletion**: GDPR-required eventually. Implement when needed: delete user cascades to saves + settings via FK ON DELETE CASCADE.
- **Multi-account on one device**: each browser is one account. Switching = sign out + sign in.

---

## Recommendations summary (TL;DR for the next conversation)

If you want to skip the question-by-question pass and just take the recommendations:

- Stack: **Fastify + Drizzle + Postgres**
- Auth: **Magic link via Resend, guest-first with optional sign-in**
- Sync: **LWW per save slot, with a "cloud is newer" prompt**
- Schema: **One blob column per save, four-table schema**
- Hosting: **Railway for API + Postgres, frontend as static**
- Repo: **Monorepo-lite under `/server`**
- Cookie auth: **JWT (1d) + refresh token (30d), HTTP-only**

If you have any preferences I haven't captured (different stack, different auth, hosted DB outside Railway, etc.), state them in the next conversation and I'll revise.

---

## Notes for the next conversation's context

- Current HEAD: `9c2bf0c` on `main` (origin in sync)
- Phases A-D shipped on origin/main with two follow-up commits (post-D fixes + combat rebalance + health-bar fix)
- The frontend is a single-canvas React 18 + Vite app under `src/`
- localStorage is the only persistence today; Phase E adds the server side without removing the local one
- All current tests are typecheck + build + manual smoke; no test runner. Phase E is the right time to add one for the server (Vitest) — flag that as Q11 if needed.
- This doc is the design draft. The implementation plan (`docs/superpowers/plans/...`) follows once the design is reviewed.
