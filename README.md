# Syncio - Stremio Group Management System

A streamlined Stremio addon and user management system that lets you create groups, manage members, and control which addons are available to different users.

## What the App Does

Syncio helps you manage Stremio addons across your organization by:

- **Create Groups** - Organize users into groups with custom names and descriptions
- **Managing Addons** - Install, configure, and update Stremio addons for specific groups or individual users
- **User Management** - Add members, assign roles, and control access to different addons
- **Sync Management** - Keep addons synchronized across all users' Stremio accounts
- **Security** - Encrypt sensitive data and provide secure authentication for all users

## Environment and Configuration (.env)

The app is designed to run locally with hot reload for frontend and backend, while PostgreSQL and Redis run in Docker. Minimal environment is required.

Create a `.env` in the project root (not committed) with:

```env
# Database (used by server when running outside Docker)
DATABASE_URL=postgresql://stremio_user:stremio_password@localhost:5432/stremio_family_manager_temp

# Redis
REDIS_URL=redis://localhost:6379

# Secrets
JWT_SECRET=replace-with-your-generated-secret
ENCRYPTION_KEY=replace-with-32-chars-key
```

Notes:
- `NEXT_PUBLIC_API_URL` is hardcoded via `client/next.config.js` to `http://localhost:4000/api` for local dev. No need to set it in `.env`.
- The Docker `compose` passes environment to the containerized app when used, but for local dev we run only DB and Redis in Docker.

### Generate Secure Keys

```bash
# JWT secret (base64)
openssl rand -base64 32

# 32-char encryption key (hex 16 bytes = 32 hex chars)
openssl rand -hex 16
```

## Running Locally (recommended)

1) Start DB and Redis via Docker:

```bash
docker compose up -d postgres redis
```

2) Start backend and frontend with hot reload:

```bash
npm run dev
```

Frontend: `http://localhost:3000`

Backend API: `http://localhost:4000/api`

## Docker (app inside container)

You can still run the whole app in Docker, but hot reload is better locally.

```bash
docker compose up -d
```

## Build and Publish Docker Image to GHCR

This repo includes a GitHub Actions workflow to build a multi-arch image (linux/amd64, linux/arm64) and push it to GHCR. See `.github/workflows/docker-publish.yml`.