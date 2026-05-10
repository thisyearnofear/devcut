FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies at the workspace root level
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/bff/package.json ./apps/bff/
COPY apps/mcp/package.json ./apps/mcp/
# Install only frontend workspace deps (skip agent postinstall which needs uv)
RUN npm install --workspace frontend --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY apps/frontend ./apps/frontend
COPY .env.example .env
# Build args become env vars at build time for Next.js static analysis
ARG BFF_URL=http://bff:4010
ENV BFF_URL=$BFF_URL
RUN npm run build --workspace frontend

FROM base AS runner
ENV NODE_ENV=production
# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static

# Exports directory — mounted as a volume in production so MP4s persist
RUN mkdir -p /app/apps/frontend/public/exports && \
    chown nextjs:nodejs /app/apps/frontend/public/exports

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/frontend/server.js"]
