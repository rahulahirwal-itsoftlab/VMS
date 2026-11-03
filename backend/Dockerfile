
FROM public.ecr.aws/docker/library/node:22-alpine

RUN apk add --no-cache openssl curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema BEFORE npm install
COPY prisma ./prisma/

# Install production dependencies
RUN npm ci --omit=dev

# Generate Prisma Client explicitly
RUN npx prisma generate

# Copy remaining backend source
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
