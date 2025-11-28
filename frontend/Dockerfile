FROM node:20 AS frontend

WORKDIR /frontend

COPY package*.json ./
RUN npm config set fetch-timeout 600000 && npm ci

COPY ./ ./
RUN npm run build

FROM nginx:alpine

COPY --from=frontend /frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 8080

CMD ["sh", "-c", "envsubst < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]