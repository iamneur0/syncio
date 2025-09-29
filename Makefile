# Syncio - Docker Commands

.PHONY: help dev prod nginx build up down logs clean restart migrate

# Default target
help:
	@echo "Syncio - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment (hot reload)"
	@echo "  make dev-logs     - View development logs"
	@echo "  make dev-down     - Stop development environment"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make nginx        - Start production with Nginx proxy"
	@echo "  make logs         - View logs"
	@echo "  make down         - Stop all services"
	@echo ""
	@echo "Database:"
	@echo "  make migrate      - Run database migrations"
	@echo "  make db-reset     - Reset database (development only)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make build        - Build Docker image"
	@echo "  make clean        - Clean up containers and images"
	@echo "  make restart      - Restart all services"
	@echo ""

# Development commands
dev:
	@echo "Starting development environment..."
	@cp env.development .env 2>/dev/null || echo "Using existing .env file"
	docker-compose up -d
	@echo "Development environment started!"
	@echo "Frontend: http://localhost:3000 (with hot reload)"
	@echo "Backend: http://localhost:4000 (with hot reload)"

dev-logs:
	docker-compose logs -f app

dev-down:
	docker-compose down

# Production commands
prod:
	@echo "Starting production environment..."
	@cp env.production .env 2>/dev/null || echo "Using existing .env file"
	docker-compose up -d app postgres redis
	@echo "Production environment started!"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend API: http://localhost:4000"

nginx:
	@echo "Starting production environment with Nginx..."
	@cp env.nginx .env 2>/dev/null || echo "Using existing .env file"
	docker-compose --profile nginx up -d
	@echo "Production environment with Nginx started!"
	@echo "Application: http://localhost"

logs:
	docker-compose logs -f

down:
	docker-compose --profile nginx down

# Database commands
migrate:
	@echo "Running database migrations..."
	docker-compose exec app npx prisma migrate dev
	docker-compose exec app npx prisma generate

migrate-prod:
	@echo "Running production database migrations..."
	docker-compose exec app npx prisma migrate deploy
	docker-compose exec app npx prisma generate

db-reset:
	@echo "Resetting database (development only)..."
	docker-compose exec app npx prisma migrate reset --force
	docker-compose exec app npx prisma generate

# Build commands
build:
	@echo "Building Docker image..."
	docker build -t syncio .

# Maintenance commands
clean:
	@echo "Cleaning up containers and images..."
	docker-compose --profile nginx down -v --remove-orphans
	docker system prune -f
	docker volume prune -f

restart:
	@echo "Restarting all services..."
	docker-compose restart

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm install
	cd client && npm install

# Setup environment
setup:
	@echo "Setting up environment..."
	@if [ ! -f .env ]; then cp env.example .env; echo "Created .env file from env.example"; fi
	make install
	@echo "Setup complete! Please edit .env file with your configuration."

# Health check
health:
	@echo "Checking service health..."
	@curl -f http://localhost:3000/api/health || echo "Frontend health check failed"
	@curl -f http://localhost:4000/health || echo "Backend health check failed"

# View container status
status:
	@echo "=== Container Status ==="
	docker-compose ps
	@echo ""
	@echo "=== Container Health ==="
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
