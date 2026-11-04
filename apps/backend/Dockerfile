# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@10.28.2

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
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
RUN pnpm prune --prod

FROM base AS runner
ENV NODE_ENV=production
RUN useradd -m -u 10001 appuser
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/assets /app/assets
COPY --from=prod-deps /app/node_modules /app/node_modules
USER appuser
EXPOSE 9999
CMD ["node", "dist/src/index.js"]
