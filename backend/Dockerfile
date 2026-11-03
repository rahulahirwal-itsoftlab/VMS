FROM public.ecr.aws/docker/library/node:22-alpine

RUN apk add --no-cache openssl curl

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma/

RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=30s \
    --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:5000/api/health > /dev/null || exit 1


CMD ["npm", "start"]