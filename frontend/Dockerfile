
# ==========================================
# Stage 1: Dependencies
# ==========================================
FROM public.ecr.aws/docker/library/node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci

# ==========================================
# Stage 2: Build Vite Application
# ==========================================
FROM public.ecr.aws/docker/library/node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_API_URL
ARG VITE_API_BASE_URL

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ==========================================
# Stage 3: Production Nginx
# ==========================================
FROM public.ecr.aws/docker/library/nginx:alpine AS runner

RUN apk add --no-cache curl

# Remove default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Add custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy Vite production build
COPY --from=builder /app/dist /usr/share/nginx/html

# Permissions for non-root Nginx
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD curl -f http://127.0.0.1:80/api/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
