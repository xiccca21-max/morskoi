# Production: frontend + backend в одном контейнере (один origin для Telegram)
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# После COPY — иначе слой npm run build кэшируется и Telegram видит старый JS.
ARG GIT_SHA=dev
ENV VITE_BUILD_SHA=$GIT_SHA
ENV VITE_API_URL=
ENV VITE_SOCKET_URL=
ARG VITE_TG_BOT_USERNAME=MyNavalClashBot
ENV VITE_TG_BOT_USERNAME=$VITE_TG_BOT_USERNAME
ARG VITE_SUPPORT_URL=https://t.me/Naval_pay_manager
ENV VITE_SUPPORT_URL=$VITE_SUPPORT_URL
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_ASSET_ORIGIN=
ENV VITE_ASSET_ORIGIN=$VITE_ASSET_ORIGIN
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app

RUN apk add --no-cache openssl wget

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

RUN apk add --no-cache openssl wget

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
