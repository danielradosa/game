# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the Drift API server.
# Build context is REPO ROOT (so we can pull /src/shared/ into the image).
# Railway service config: rootDirectory=null, dockerfilePath=server/Dockerfile.

# ---- builder ---------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Cache dependencies.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Sources needed for the build.
COPY server ./server
COPY src/shared ./src/shared

# Bundle entrypoint + migration runner via esbuild.
RUN cd server && npm run build && npm run build:migrate

# ---- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app/server
ENV NODE_ENV=production

# Production-only deps. Native modules (@node-rs/argon2) compile here for
# the runtime arch. Done as root so npm can write to /app/server.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Bundled output + drizzle migration SQL.
COPY --from=builder /app/server/dist ./dist
COPY server/drizzle ./drizzle

# Drop privileges. node:alpine ships a non-root `node` user (uid 1000) by
# default — use it so a process compromise doesn't have root in the
# container. chown the runtime tree so node can read everything it needs.
RUN chown -R node:node /app/server
USER node

EXPOSE 8080
CMD ["node", "dist/index.js"]
