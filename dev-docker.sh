#!/bin/bash

echo "🚀 Starting Syncio in Docker Development Mode"
echo "This mimics your working 'npm run dev' setup"
echo ""

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker compose -f docker-compose.dev.yml down

# Start development environment
echo "🏗️  Building and starting development environment..."
docker compose -f docker-compose.dev.yml up --build -d

# Wait a moment for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Show status
echo "📊 Container status:"
docker compose -f docker-compose.dev.yml ps

echo ""
echo "🌐 Access your app:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000"
echo ""
echo "📋 Useful commands:"
echo "  View logs:    docker compose -f docker-compose.dev.yml logs -f"
echo "  Stop:         docker compose -f docker-compose.dev.yml down"
echo "  Restart:      docker compose -f docker-compose.dev.yml restart"
echo ""
