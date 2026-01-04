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

# Environment variables passed as build args (for Cloud Build)
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=""
ARG NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID=""
ARG NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=""
ARG NEXT_PUBLIC_API_SERVICE_URL=""
ARG NEXT_PUBLIC_PIPELINE_SERVICE_URL=""
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_DEFAULT_TRIAL_DAYS="14"

# Copy the appropriate environment file based on TARGET_ENV
# OR use build args if passed (Cloud Build passes these)
RUN ENV_FILE=".env.local" && \
    case "${TARGET_ENV}" in \
      test) ENV_FILE=".env.test" ;; \
      stage) ENV_FILE=".env.stage" ;; \
      prod) ENV_FILE=".env.production" ;; \
      local) ENV_FILE=".env.local" ;; \
    esac && \
    echo "Building with environment: ${TARGET_ENV}" && \
    if [ -n "${NEXT_PUBLIC_SUPABASE_URL}" ]; then \
      echo "Using build args for environment variables" && \
      echo "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}" > .env.local && \
      echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}" >> .env.local && \
      echo "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}" >> .env.local && \
      echo "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=${NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID}" >> .env.local && \
      echo "NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID=${NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID}" >> .env.local && \
      echo "NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=${NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID}" >> .env.local && \
      echo "NEXT_PUBLIC_API_SERVICE_URL=${NEXT_PUBLIC_API_SERVICE_URL}" >> .env.local && \
      echo "NEXT_PUBLIC_PIPELINE_SERVICE_URL=${NEXT_PUBLIC_PIPELINE_SERVICE_URL}" >> .env.local && \
      echo "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" >> .env.local && \
      echo "NEXT_PUBLIC_DEFAULT_TRIAL_DAYS=${NEXT_PUBLIC_DEFAULT_TRIAL_DAYS}" >> .env.local && \
      echo "Environment variables (NEXT_PUBLIC_*):" && \
      cat .env.local; \
    elif [ -f "${ENV_FILE}" ]; then \
      cp "${ENV_FILE}" .env.local && \
      echo "Using ${ENV_FILE}" && \
      grep -E "^NEXT_PUBLIC_" .env.local || true; \
    else \
      echo "Warning: ${ENV_FILE} not found, using existing .env.local"; \
    fi

# Set version info for build
ENV NEXT_PUBLIC_RELEASE_VERSION=${VERSION}
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}
ENV NEXT_PUBLIC_GIT_COMMIT=${GIT_COMMIT}

# CRITICAL: Set env vars for Next.js pre-rendering (ARGs don't persist as ENV)
# These are required for Server Components that create Supabase clients at build time
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=${NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID}
ENV NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID=${NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID}
ENV NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=${NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID}
ENV NEXT_PUBLIC_API_SERVICE_URL=${NEXT_PUBLIC_API_SERVICE_URL}
ENV NEXT_PUBLIC_PIPELINE_SERVICE_URL=${NEXT_PUBLIC_PIPELINE_SERVICE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_DEFAULT_TRIAL_DAYS=${NEXT_PUBLIC_DEFAULT_TRIAL_DAYS}

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
