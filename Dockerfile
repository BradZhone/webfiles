# WebFiles - Web-based File Manager
# Multi-stage build for smaller image

FROM node:20-alpine AS builder

# Install build dependencies for node-pty
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production image
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    tmux \
    bash \
    coreutils

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create data directory for persistent files
RUN mkdir -p /data

# Set environment variables
ENV NODE_ENV=production
ENV WEBFILES_PORT=8765
ENV WEBFILES_HOME=/data

# Expose port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8765/login || exit 1

# Run the application
CMD ["node", "server.js"]
