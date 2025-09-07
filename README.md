# Syncio - Stremio Group Management System

A streamlined Stremio addon and user management system that lets you create groups, manage members, and control which addons are available to different users.

## What the App Does

Syncio helps you manage Stremio addons across your organization by:

- **Create Groups** - Organize users into groups with custom names and descriptions
- **Managing Addons** - Install, configure, and update Stremio addons for specific groups or individual users
- **User Management** - Add members, assign roles, and control access to different addons
- **Sync Management** - Keep addons synchronized across all users' Stremio accounts
- **Security** - Encrypt sensitive data and provide secure authentication for all users




## Quick Start with Docker Compose

The easiest way to run Syncio is using Docker Compose. You can find the complete configuration at [docker-compose.yml](https://github.com/iamneur0/syncio/blob/main/docker-compose.yml).

### Running with Docker Compose
```bash
# Start all services
docker compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

The application will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env` file in your project root with the following variables:

```bash
# Database Configuration
POSTGRES_DB=syncio
POSTGRES_USER=syncio_user
POSTGRES_PASSWORD=syncio_password
POSTGRES_PORT=5432

# Redis Configuration
REDIS_PORT=6379

# Application Secrets (REQUIRED - Generate secure keys)
JWT_SECRET=your-jwt-secret-key-here
ENCRYPTION_KEY=your-encryption-key-here
```

### Generating Secure Keys
```bash
# Generate JWT secret
openssl rand -base64 32

# Generate encryption key
openssl rand -hex 16
```