# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# Stage 2: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables (VITE_ prefix)
ARG VITE_API_URL
ARG VITE_APP_NAME

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

RUN npm run build


# Stage 3: Serve with Nginx
FROM nginx:alpine AS runner

WORKDIR /usr/share/nginx/html

# Remove default nginx static files
RUN rm -rf ./*

# Copy built static files from builder stage
COPY --from=builder /app/dist .

# Custom nginx config (handles React Router / SPA routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]