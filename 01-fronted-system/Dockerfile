# Multi-stage build for Next.js 16 application
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build args
ARG TARGET_ENV=local
ARG VERSION=unknown
ARG BUILD_DATE=unknown
ARG GIT_COMMIT=unknown

# Copy the appropriate environment file based on TARGET_ENV
# Mapping: local -> .env.local, test -> .env.test, stage -> .env.stage, prod -> .env.production
RUN ENV_FILE=".env.local" && \
    case "${TARGET_ENV}" in \
      test) ENV_FILE=".env.test" ;; \
      stage) ENV_FILE=".env.stage" ;; \
      prod) ENV_FILE=".env.production" ;; \
      local) ENV_FILE=".env.local" ;; \
    esac && \
    echo "Building with environment: ${TARGET_ENV} using ${ENV_FILE}" && \
    if [ -f "${ENV_FILE}" ]; then \
      cp "${ENV_FILE}" .env.local && \
      echo "Environment variables (NEXT_PUBLIC_*):" && \
      grep -E "^NEXT_PUBLIC_" .env.local || true; \
    else \
      echo "Warning: ${ENV_FILE} not found, using existing .env.local"; \
    fi

# Set version info for build
ENV NEXT_PUBLIC_RELEASE_VERSION=${VERSION}
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}
ENV NEXT_PUBLIC_GIT_COMMIT=${GIT_COMMIT}

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Ensure all static assets are readable (fixes permission issues from local development)
RUN chmod -R a+r ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy data directory for seed files
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check using node
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
