# Docker Guide - Unified Syncio

## 🐳 Single Dockerfile Approach

This project uses a **single Dockerfile** that builds both the frontend (Next.js) and backend (Express.js) into one container. This simplifies deployment while maintaining the benefits of containerization.

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│              Docker Container           │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │   Next.js   │    │   Express.js    │ │
│  │  Frontend   │    │    Backend      │ │
│  │   :3000     │    │     :3001       │ │
│  └─────────────┘    └─────────────────┘ │
│              Single Process             │
└─────────────────────────────────────────┘
│
├── PostgreSQL Container (Database)
├── Redis Container (Cache)
└── Nginx Container (Reverse Proxy)
```

## 📁 File Structure

```
Dockerfile                 # Single unified Docker image
docker-compose.yml         # Production setup
docker-compose.dev.yml     # Development setup
nginx/nginx.conf          # Reverse proxy configuration
```

## 🚀 Quick Start

### Development
```bash
# Start development environment
make dev
# or
docker-compose -f docker-compose.dev.yml up -d

# Run migrations
make migrate

# View logs
make dev-logs
```

### Production
```bash
# Start production environment
make prod
# or
docker-compose up -d

# Run migrations
docker-compose exec app npx prisma migrate deploy
```

## 🔧 How It Works

### Build Process
1. **Dependencies Stage**: Installs all npm dependencies for both frontend and backend
2. **Build Stage**: Builds the Next.js frontend and generates Prisma client
3. **Production Stage**: Creates optimized runtime image with both services

### Runtime Process
The container runs a startup script that:
1. Runs database migrations
2. Starts the Express.js backend on port 3001
3. Starts the Next.js frontend on port 3000
4. Manages both processes with proper signal handling

### Development vs Production

#### Development
- Uses the `builder` stage for faster rebuilds
- Mounts source code as volumes for hot reloading
- Runs both servers in development mode
- Direct port access (3000, 3001)

#### Production
- Uses optimized production stage
- Runs database migrations automatically
- Includes process management and graceful shutdown
- Served through Nginx reverse proxy

## 🎛️ Available Commands

```bash
# Development
make dev              # Start development environment
make dev-logs         # View development logs
make dev-down         # Stop development environment

# Production
make prod             # Start production environment
make prod-logs        # View production logs
make prod-down        # Stop production environment

# Database
make migrate          # Run database migrations
make db-reset         # Reset database (dev only)

# Maintenance
make build            # Build Docker image
make clean            # Clean up containers
make health           # Check service health
make status           # View container status
```

## 🔍 Debugging

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app

# Development logs
docker-compose -f docker-compose.dev.yml logs -f app
```

### Execute Commands
```bash
# Access container shell
docker-compose exec app sh

# Run database commands
docker-compose exec app npx prisma studio
docker-compose exec app npx prisma migrate status

# Check processes
docker-compose exec app ps aux
```

### Health Checks
```bash
# Check if services are running
curl http://localhost:3000/api/health  # Frontend health
curl http://localhost:3001/health      # Backend health

# Container health status
docker ps
```

## 🔧 Customization

### Environment Variables
All environment variables are configured in your `.env` file and passed to the container:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=...
PORT=3001
CLIENT_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Port Configuration
- Frontend: Port 3000
- Backend: Port 3001
- Database: Port 5432
- Redis: Port 6379
- Nginx: Port 80/443

### Volume Mounts (Development)
```yaml
volumes:
  - ./server:/app/server              # Backend hot reload
  - ./client/src:/app/client/src      # Frontend hot reload
  - ./prisma:/app/prisma              # Database schema
  - /app/node_modules                 # Preserve dependencies
  - /app/client/node_modules          # Preserve dependencies
```

## 🚀 Deployment

### Single Command Deployment
```bash
# Clone and deploy
git clone <repo-url>
cd stremio-family-manager
cp env.example .env
# Edit .env for your environment
make prod
```

### Manual Steps
```bash
# 1. Build the image
docker build -t stremio-family-manager .

# 2. Run with docker-compose
docker-compose up -d

# 3. Run migrations
docker-compose exec app npx prisma migrate deploy
```

## 💡 Benefits of Single Dockerfile

1. **Simplified Deployment**: One image to build and deploy
2. **Consistent Environment**: Frontend and backend always in sync
3. **Easier Management**: Single container to monitor and scale
4. **Reduced Complexity**: No inter-container communication issues
5. **Faster Startup**: No waiting for multiple services to coordinate

## 🔄 Migration from Multiple Dockerfiles

If you had separate Dockerfiles before, the new approach:
- ✅ Builds faster (shared dependencies)
- ✅ Deploys simpler (single container)
- ✅ Uses less resources (no duplicate base images)
- ✅ Maintains same functionality
- ✅ Keeps development hot-reloading

The unified approach provides the same functionality with significantly less complexity!
