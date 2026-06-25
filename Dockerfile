# Deployable image for the shared-context REST backend (packages/server).
# Build from the repo root:  docker build -t sac-server .
# Run:  docker run -p 4000:4000 -v sac-data:/data -e CONTEXT_API_KEYS=teamkey sac-server

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/server/package.json packages/server/tsconfig.json ./packages/server/
WORKDIR /app/packages/server
RUN npm install
COPY packages/server/src ./src
RUN npm run build

# ---- runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app/packages/server
ENV NODE_ENV=production PORT=4000 SAC_DATA_FILE=/data/commits.json
COPY packages/server/package.json ./
RUN npm install --omit=dev && mkdir -p /data && chown -R node:node /data
COPY --from=build /app/packages/server/dist ./dist
USER node
EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
