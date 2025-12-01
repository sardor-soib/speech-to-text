FROM node:20 AS frontend

WORKDIR /frontend

COPY package*.json ./
RUN npm config set fetch-timeout 600000 && npm ci

COPY ./ ./
RUN npm run build

FROM nginx:alpine AS runtime

RUN apk add --no-cache gettext

RUN rm -rf /usr/share/nginx/html/*
COPY --from=frontend /frontend/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf.template

ENV PORT 80
EXPOSE 80
CMD ["sh", "-c", "envsubst '\\$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]