# --- Stage 0: shared base ---
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Stage 1: install all workspace dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-crm/package.json ./apps/api-crm/
RUN pnpm install --frozen-lockfile

# --- Stage 2: compile TypeScript ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api-crm/tsconfig.json ./apps/api-crm/
COPY apps/api-crm/src ./apps/api-crm/src
RUN pnpm --filter api-crm run build

# --- Stage 3: slim production runtime ---
FROM base AS runtime
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-crm/package.json ./apps/api-crm/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api-crm/dist ./apps/api-crm/dist
EXPOSE 3012
CMD ["node", "apps/api-crm/dist/main-mcp.js"]
