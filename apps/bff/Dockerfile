FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/bff/package.json ./apps/bff/
RUN npm install --workspace bff --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/bff/node_modules ./apps/bff/node_modules
COPY apps/bff ./apps/bff
RUN npm run build --workspace bff

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 bff
COPY --from=builder --chown=bff:nodejs /app/apps/bff/dist ./dist
COPY --from=deps --chown=bff:nodejs /app/apps/bff/node_modules ./node_modules
USER bff
EXPOSE 4010
ENV PORT=4010
CMD ["node", "dist/server.js"]
