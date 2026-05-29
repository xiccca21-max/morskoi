# Production: frontend + backend в одном контейнере (один origin для Telegram)
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Пустые URL = тот же домен (API и WebSocket через nginx/тот же порт)
ENV VITE_API_URL=
ENV VITE_SOCKET_URL=
ARG VITE_TG_BOT_USERNAME=MyNavalClashBot
ENV VITE_TG_BOT_USERNAME=$VITE_TG_BOT_USERNAME
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY backend/package*.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/tsconfig.json backend/nest-cli.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /data

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
