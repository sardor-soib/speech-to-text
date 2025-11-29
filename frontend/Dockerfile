FROM node:20 AS frontend

WORKDIR /frontend

COPY package*.json ./
RUN npm config set fetch-timeout 600000 && npm ci

COPY ./ ./
RUN npm run build