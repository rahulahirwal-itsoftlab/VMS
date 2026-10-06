# Stage 1: Dependencies
FROM node:22-slim AS deps

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci


# Stage 2: Runner
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs expressjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

COPY --chown=expressjs:nodejs . .

USER expressjs

EXPOSE 5000

CMD ["node", "src/server.js"]