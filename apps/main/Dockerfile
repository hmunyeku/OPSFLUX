# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Cache-buster: change BUILD_ID in docker-compose.yml to force a fresh build
# (invalidates the COPY layer cache so Vite always recompiles from latest source)
ARG BUILD_ID=1

# Copy source and build
COPY . .
ARG VITE_API_URL=https://api.opsflux.io
ARG VITE_DRAWIO_URL=https://drawio.opsflux.io
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_DRAWIO_URL=${VITE_DRAWIO_URL}
RUN npm run build

# ── Stage 2: Serve with nginx ────────────────────────────────
FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
