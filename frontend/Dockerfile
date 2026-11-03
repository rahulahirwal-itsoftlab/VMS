
# Stage 1: Dependencies
FROM public.ecr.aws/docker/library/node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Stage 2: Build
FROM public.ecr.aws/docker/library/node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_API_URL
ARG VITE_API_BASE_URL

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# Stage 3: Production
FROM public.ecr.aws/docker/library/node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0

RUN npm install --global serve

COPY --from=builder /app/dist ./dist

EXPOSE 80

# HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
#     CMD curl --fail --silent http://127.0.0.1:80/api/health || exit 1

CMD ["serve", "-s", "dist", "-l", "80"]
