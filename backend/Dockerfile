FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production BRS_HOST=0.0.0.0 PORT=4317 BRS_DATA_ROOT=/data
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/app ./app
COPY --from=build /app/ui ./ui
COPY --from=build /app/shared ./shared
USER node
EXPOSE 4317
VOLUME ["/data"]
CMD ["pnpm", "start"]
