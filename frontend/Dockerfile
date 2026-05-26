FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_TG_BOT_USERNAME
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_TG_BOT_USERNAME=$VITE_TG_BOT_USERNAME

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# === runtime (nginx статика) ===
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
