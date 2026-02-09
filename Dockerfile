# Stage 1: Build Frontend
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# Stage 3: Production Runner
FROM node:20-alpine
WORKDIR /app

# Copy Backend Build
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/package*.json ./
COPY --from=server-builder /app/server/node_modules ./node_modules

# Copy Frontend Build to Backend Public Folder (or serving path)
# We will serve static files from the backend
COPY --from=client-builder /app/client/dist ./public

# Environment Defaults
ENV PORT=3001
ENV NODE_ENV=production

# Persist data (sessions, contacts)
VOLUME ["/app/auth_info", "/app/data"]

EXPOSE 3001

CMD ["node", "dist/index.js"]
