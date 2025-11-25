FROM node:18-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --include=dev
COPY frontend/ ./
RUN npm run build
