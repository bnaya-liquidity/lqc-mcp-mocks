# --- Stage 0: shared base ---
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Stage 1: install all workspace dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-task-hub/package.json ./apps/mcp-task-hub/
RUN pnpm install --frozen-lockfile

# --- Stage 2: compile TypeScript ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/mcp-task-hub/tsconfig.json ./apps/mcp-task-hub/
COPY apps/mcp-task-hub/src ./apps/mcp-task-hub/src
RUN pnpm --filter mcp-task-hub run build

# --- Stage 3: slim production runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-task-hub/package.json ./apps/mcp-task-hub/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/mcp-task-hub/dist ./apps/mcp-task-hub/dist
RUN chown -R node:node /app
USER node
EXPOSE 3010
CMD ["node", "apps/mcp-task-hub/dist/main.js"]
