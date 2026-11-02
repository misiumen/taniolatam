# Gdzie Polecę web (Next.js standalone). Build from the repo root:
#   docker build -t gdziepolece .
#   docker run -p 3000:3000 --env-file .env -v gdziepolece-cache:/app/.cache gdziepolece
# No build args: every setting (incl. MAP_STYLE_URL for the map) is read at runtime, so the same
# image works on Render, locally and anywhere else.

# ---- deps: install the whole workspace from the lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
# Toolchain only for the optional better-sqlite3 native build when no prebuilt binary matches.
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci

# ---- build ----
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @gdziepolece/web

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GDZIEPOLECE_DATA_DIR=/app/data \
    CACHE_PATH=/app/.cache/gdziepolece.sqlite
# Standalone output is rooted at the repo root (outputFileTracingRoot), so server.js lives in apps/web.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Reference data: airports.json, regions.json, place-groups.json.
COPY data ./data
RUN mkdir -p /app/.cache && chown -R node:node /app/.cache
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
