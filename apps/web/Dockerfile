# Build context is the repository root (paths are apps/web/...).
# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web/ ./
# Guard against a stale .next sneaking in via the build context (belt-and-braces
# with the root .dockerignore) — always compile from a clean slate.
RUN rm -rf .next

# NEXT_PUBLIC_* vars are inlined at build time, so the API URL must be provided
# here (the browser calls it directly — use the public API URL in production).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output: a minimal self-contained server.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
