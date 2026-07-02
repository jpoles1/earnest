FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4106

COPY --from=build /app/build ./build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle.config.ts ./
COPY src ./src

EXPOSE 4106
CMD ["sh", "-c", "bun run db:push && bun build/index.js"]
