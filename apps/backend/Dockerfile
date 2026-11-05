# syntax=docker/dockerfile:1
# Build context is the repository root:
#   docker build -f apps/backend/Dockerfile .

FROM node:25-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@10.28.2

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile --filter iepf-backend

FROM deps AS build
COPY apps/backend apps/backend
WORKDIR /app/apps/backend
RUN pnpm run build

FROM build AS migrate
CMD ["npm", "run", "db:migrate"]

FROM build AS cron-generate-lessons
CMD ["npm", "run", "generate:lessons"]

FROM build AS cron-remind-feedback
CMD ["npm", "run", "remind:feedback"]

FROM build AS cron-remind-lessons
CMD ["npm", "run", "remind:lessons"]

FROM deps AS prod-deps
RUN rm -rf node_modules apps/backend/node_modules \
  && CI=true pnpm install --frozen-lockfile --offline --prod --filter iepf-backend

FROM base AS runner
ENV NODE_ENV=production
RUN useradd -m -u 10001 appuser
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/backend/node_modules /app/apps/backend/node_modules
COPY --from=build /app/apps/backend/dist /app/apps/backend/dist
COPY --from=build /app/apps/backend/package.json /app/apps/backend/package.json
COPY --from=build /app/apps/backend/assets /app/apps/backend/assets
WORKDIR /app/apps/backend
USER appuser
EXPOSE 9999
CMD ["node", "dist/src/index.js"]
