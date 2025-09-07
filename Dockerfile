# Simple Dockerfile for Syncio
FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache curl postgresql-client openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY prisma ./prisma/

# Install dependencies
RUN npm install --no-package-lock
RUN cd client && npm install --no-package-lock

# Copy source code
COPY . .

# Generate Prisma client with correct binary targets
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"
RUN npx prisma generate

RUN cd client && npm run build

# Create simple startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Starting Syncio..."' >> /app/start.sh && \
    echo 'echo "Setting up database schema..."' >> /app/start.sh && \
    echo 'npx prisma db push' >> /app/start.sh && \
    echo 'echo "Starting both frontend and backend..."' >> /app/start.sh && \
    echo 'node server/database-backend.js &' >> /app/start.sh && \
    echo 'cd client && node .next/standalone/server.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose ports
EXPOSE 3000 4000

# Start the application
CMD ["/app/start.sh"]

