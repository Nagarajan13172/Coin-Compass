FROM node:22-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:22-alpine AS server-runtime
WORKDIR /app

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
COPY --from=client-builder /app/client/dist/ ./public/

EXPOSE 4000
CMD ["npm", "start"]
