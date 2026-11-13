# Build: Vite → estáticos em /dist
FROM node:20-alpine AS builder

WORKDIR /app

# Dependências (Vite fica em devDependencies; não usar NODE_ENV=production no install)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines variáveis VITE_* no build — defina-as como Build Args / env no Easypanel
ARG VITE_PMS_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_URL
ARG VITE_SUPABASE_SERVICE_ROLE_KEY
ARG VITE_USE_RATE_CALENDAR_SUMMARY

ENV VITE_PMS_API_URL=$VITE_PMS_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SUPABASE_SERVICE_ROLE_KEY=$VITE_SUPABASE_SERVICE_ROLE_KEY
ENV VITE_USE_RATE_CALENDAR_SUMMARY=$VITE_USE_RATE_CALENDAR_SUMMARY

RUN npm run build

# Servir com nginx (SPA + proxy API opcional via BACKEND_UPSTREAM em runtime)
FROM nginx:1.27-alpine

ENV BACKEND_UPSTREAM=http://backend:3000
COPY deploy/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
