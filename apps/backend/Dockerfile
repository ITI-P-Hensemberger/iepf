# syntax=docker/dockerfile:1

FROM node:20-bookworm AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
RUN pnpm build

FROM base AS runner
RUN useradd -m -u 10001 appuser
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
USER appuser
EXPOSE 9999
CMD ["node", "dist/src/index.js"]
