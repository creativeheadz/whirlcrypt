# Multi-stage build for Whirlcrypt
#
# Layout notes (npm workspaces hoist most packages to the ROOT node_modules,
# so every stage installs at /app and the backend resolves deps upward):
#   deps              full install (dev deps needed to compile)
#   backend-builder   tsc -> backend/dist
#   frontend-builder  vite -> frontend/dist
#   production        prod-only install + build outputs, non-root user
FROM node:22-alpine AS deps

# Build dependencies for native modules (bcrypt)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/

# Install all dependencies (builders need devDependencies)
RUN npm ci

# Build stage for backend
FROM deps AS backend-builder
WORKDIR /app
COPY . .
RUN npm run build:backend

# Build stage for frontend
FROM deps AS frontend-builder
# Commit hash for the footer (no .git in the build context, so pass it in:
# --build-arg COMMIT_HASH=$(git rev-parse --short HEAD))
ARG COMMIT_HASH=unknown
ENV COMMIT_HASH=${COMMIT_HASH}
WORKDIR /app
COPY . .
RUN npm run build:frontend

# Production stage
FROM node:22-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S whirlcrypt -u 1001

# curl for the container health check
RUN apk add --no-cache curl

WORKDIR /app

# Production-only install at the workspace root (hoisted tree the backend
# resolves at runtime)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/
RUN npm ci --omit=dev && npm cache clean --force

# Copy built backend
COPY --from=backend-builder --chown=whirlcrypt:nodejs /app/backend/dist ./backend/dist
COPY --from=backend-builder --chown=whirlcrypt:nodejs /app/backend/package.json ./backend/package.json

# Copy built frontend (served statically by the backend in production)
COPY --from=frontend-builder --chown=whirlcrypt:nodejs /app/frontend/dist ./frontend/dist

# Copy database schema
COPY --chown=whirlcrypt:nodejs ./backend/database ./backend/database

# Copy docs for API
COPY --chown=whirlcrypt:nodejs ./docs ./docs

# Create uploads directory
RUN mkdir -p /app/uploads && chown whirlcrypt:nodejs /app/uploads

# Health check script (liveness: passes when the app answers, even in its
# designed no-database fallback mode, so the container is not restarted
# while serving fine without PostgreSQL)
COPY --chown=whirlcrypt:nodejs <<EOF /app/healthcheck.sh
#!/bin/sh
# Health check script
curl -s -o /dev/null http://localhost:\${PORT:-3001}/api/health || exit 1
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
