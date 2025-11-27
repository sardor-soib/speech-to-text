FROM node:20 AS frontend

WORKDIR /frontend

COPY package*.json ./
RUN npm config set fetch-timeout 1000 && npm ci

COPY ./ ./
RUN npm run build

FROM nginx:alpine

COPY --from=frontend /frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
