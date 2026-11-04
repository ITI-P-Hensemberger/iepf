# syntax=docker/dockerfile:1
# Build context is the repository root:
#   docker build -f apps/frontend/Dockerfile .

FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install --global pnpm@10.28.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile --filter iepf-frontend

FROM deps AS builder
COPY apps/frontend apps/frontend
WORKDIR /app/apps/frontend
RUN pnpm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output mirrors the workspace, so server.js sits in apps/frontend.
COPY --from=builder /app/apps/frontend/.next/standalone /app
COPY --from=builder /app/apps/frontend/public /app/apps/frontend/public
COPY --from=builder /app/apps/frontend/.next/static /app/apps/frontend/.next/static

# Next writes optimized images here at runtime, as the unprivileged user.
RUN mkdir -p /app/apps/frontend/.next/cache && chown -R nextjs:nodejs /app/apps/frontend/.next/cache

WORKDIR /app/apps/frontend
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
