# --- Stage 1: install all workspace dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
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
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-task-hub/package.json ./apps/mcp-task-hub/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/mcp-task-hub/dist ./apps/mcp-task-hub/dist
EXPOSE 3010
CMD ["node", "apps/mcp-task-hub/dist/main.js"]
