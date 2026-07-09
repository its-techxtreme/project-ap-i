# Build from repository root:
#   docker build -f apps/worker/Dockerfile -t project-api-worker .

FROM node:20-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && pip3 install yt-dlp --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @project-api/worker build
RUN pnpm deploy --filter @project-api/worker --prod /out/worker

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app
COPY --from=builder /out/worker ./
COPY apps/worker/assets/watermark.png ./assets/watermark.png

RUN npx playwright install-deps chromium
RUN npx playwright install chromium

EXPOSE 3001
CMD ["node", "dist/index.js"]
