FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build
FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 80
