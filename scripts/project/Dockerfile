# syntax=docker/dockerfile:1
# Multi-stage production Dockerfile with pinned base image versions.

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci

# Copy source code and build.
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:22-alpine AS production

ENV NODE_ENV=production

# Create a non-root user for security.
RUN addgroup -g 1001 -S nodejs && \
    adduser -S app -u 1001 -G nodejs

WORKDIR /app

# Copy production artifacts from the builder stage.
COPY --from=builder --chown=app:nodejs /app/dist ./dist
COPY --from=builder --chown=app:nodejs /app/config ./config
COPY --from=builder --chown=app:nodejs /app/package*.json ./

# Install only production dependencies.
RUN npm ci --omit=dev && \
    npm cache clean --force

USER app

EXPOSE 80

# Health check against the application's own health endpoint.
COPY --from=builder --chown=app:nodejs /app/scripts/project/healthcheck.js ./healthcheck.js
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD node healthcheck.js

CMD ["node", "dist/server.js"]
