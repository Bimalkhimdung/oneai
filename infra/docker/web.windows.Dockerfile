# syntax=docker/dockerfile:1.7

FROM node:20-windowsservercore-ltsc2022 AS deps
WORKDIR C:\\app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:20-windowsservercore-ltsc2022 AS build
WORKDIR C:\\app
COPY --from=deps C:\\app\\node_modules ./node_modules
COPY frontend/ .
ENV NODE_ENV=production
RUN npm run build

FROM node:20-windowsservercore-ltsc2022 AS runner
WORKDIR C:\\app
ENV NODE_ENV=production
COPY --from=build C:\\app\\.next\\standalone ./
COPY --from=build C:\\app\\.next\\static ./.next/static
COPY --from=build C:\\app\\public ./public
EXPOSE 3000
CMD ["node", "server.js"]