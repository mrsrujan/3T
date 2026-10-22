# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Empty VITE_API_BASE_URL means the SPA calls relative URLs ("/api/..."),
# which nginx in the runtime stage proxies to the backend. Keeps the image
# portable: same build, different nginx upstream per environment.
ENV VITE_API_BASE_URL=""
RUN npm run build


# ---- serve stage ----
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine runs envsubst on /etc/nginx/templates/*.template at startup,
# substituting ${API_UPSTREAM} with the env var. Set API_UPSTREAM at run time
# (e.g. backend:8000 in compose, api:8000 in K8s).
COPY nginx.conf /etc/nginx/templates/default.conf.template

ENV API_UPSTREAM=backend:8000

EXPOSE 80
