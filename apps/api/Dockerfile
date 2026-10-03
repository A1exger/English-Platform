# Build context is the repository root (so paths are apps/api/...).
# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

# Prisma needs OpenSSL even at build time to fetch the right engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

COPY apps/api/ ./

# Production runs on PostgreSQL: switch the Prisma datasource provider for the
# image (the repo keeps sqlite as the dev/test default). DATABASE_URL still
# drives the actual connection string at runtime.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
  && npx prisma generate \
  && npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
# tsconfig.json lets `prisma db seed` (ts-node prisma/seed.ts) run in this image.
COPY --from=build /app/tsconfig.json ./

EXPOSE 3001

# Apply committed migrations, seed the provisioned accounts + demo data (the
# seed is idempotent, so it is safe on every start), then start the API. The
# seed is non-fatal: a failure logs and the server still boots.
CMD ["sh", "-c", "npx prisma migrate deploy && (npx prisma db seed || echo 'seed step skipped') && node dist/main.js"]
