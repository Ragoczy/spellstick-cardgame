# The online game: the game server plus the online build of the browser game, in one container.
# Built and pushed by GitHub Actions; runs on Azure Container Apps.

# ---- Build: compile the browser game and bundle the server ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:online && npm run build:server

# ---- Run: only what the server needs ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY server/migrations ./server/migrations
USER node
EXPOSE 8080
CMD ["node", "dist-server/main.js"]
