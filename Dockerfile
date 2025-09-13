# Multi-stage build for Whirlcrypt
FROM node:18-alpine AS base

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci --only=production

# Build stage for backend
FROM base AS backend-builder
WORKDIR /app
COPY . .
RUN npm run build:backend

# Build stage for frontend
FROM base AS frontend-builder
WORKDIR /app
COPY . .
RUN npm run build:frontend

# Production stage
FROM node:18-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S whirlcrypt -u 1001

# Install PostgreSQL client for health checks
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy built backend
COPY --from=backend-builder --chown=whirlcrypt:nodejs /app/backend/dist ./backend/dist
COPY --from=backend-builder --chown=whirlcrypt:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=whirlcrypt:nodejs /app/backend/package.json ./backend/package.json

# Copy built frontend
COPY --from=frontend-builder --chown=whirlcrypt:nodejs /app/frontend/dist ./frontend/dist

# Copy database schema
COPY --chown=whirlcrypt:nodejs ./backend/database ./backend/database

# Copy docs for API
COPY --chown=whirlcrypt:nodejs ./docs ./docs

# Create uploads directory
RUN mkdir -p /app/uploads && chown whirlcrypt:nodejs /app/uploads

# Health check script
COPY --chown=whirlcrypt:nodejs <<EOF /app/healthcheck.sh
#!/bin/sh
# Health check script
curl -f http://localhost:\${PORT:-3001}/api/health || exit 1
EOF

RUN chmod +x /app/healthcheck.sh

# Switch to non-root user
USER whirlcrypt

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /app/healthcheck.sh

# Start the application
CMD ["node", "backend/dist/index.js"]