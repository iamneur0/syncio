<div align="center">

<img src="./client/public/logo-white.png" width="144"/>
  <h1 align="center">Syncio</h1>

  
  *Streamline your Stremio addon and user management across different groups*

</div>

  <div align="center">

  [![Discord](https://img.shields.io/discord/1225024298490662974?logo=discord&logoColor=f5f5f5&color=blue)](https://discord.gg/88dwGw9P)
  [![Docker](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fiamneur0%2Fsyncio%2Fsyncio&query=%24.downloadCount&logo=github&label=pulls&color=blue)](https://github.com/iamneur0/syncio/pkgs/container/syncio)
  ![Stars](https://img.shields.io/github/stars/iamneur0/syncio?style=flat-round&logo=github)
  ![GitHub Release](https://img.shields.io/github/v/release/iamneur0/syncio)

![Syncio Addons Page](./doc/AddonsPage.png)


</div>

## ✨ What Syncio Does

Syncio is a comprehensive management system for Stremio addons and users, designed for organizations that need to manage multiple Stremio accounts efficiently. It provides:

- 🏢 **Group Management** - Organize users into groups with custom colors and descriptions
- 🔌 **Addon Management** - Install, configure, update, and manage Stremio addons
- 👥 **User Management** - Add users, manage their Stremio accounts, and control access
- 🔄 **Smart Sync** - Keep addons synchronized across all users' Stremio accounts
- 🛡️ **Protected Addons** - Mark critical addons as protected to prevent accidental removal
- 📊 **Resource Filtering** - Select specific resources (movies, series, etc.) from addons
- 🎨 **Modern UI** - Beautiful, responsive interface with multiple themes
- 🔐 **Authentication** - Secure user authentication and account management
- 📤 **Import/Export** - Backup and restore your entire configuration

## 🚀 Quick Start with Docker Compose

The easiest way to run Syncio is using Docker Compose. You can find the complete compose files at [private](https://github.com/iamneur0/syncio/blob/main/docker-compose.private.yml) and [public](https://github.com/iamneur0/syncio/blob/main/docker-compose.public.yml).

### 📋 Setup Instructions

```bash
# 1. Clone the repository
git clone https://github.com/iamneur0/syncio.git
cd syncio

# 2. Create .env file from template
cp env.example .env

# 3. Edit .env with your configuration
nano .env

# 4. Start all services
docker compose up -d

# 5. View logs (optional)
docker-compose logs -f

# 6. Stop services (when needed)
docker-compose down
```

The application will be available at `http://localhost:3000`.

## ⚙️ Environment Variables

Create a `.env` file in your project root with the following variables:

```bash
# Database Configuration
DATABASE_URL="file:./prisma/sqlite.db"  # For private instances
# DATABASE_URL="postgresql://user:pass@localhost:5432/syncio"  # For public instances

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# Application Secrets (REQUIRED - Generate secure keys)
JWT_SECRET=your-jwt-secret-key-here
ENCRYPTION_KEY=your-encryption-key-here

# User/Group IDs for Docker (Optional - defaults to 1000:1000)
UID=1000
GID=1000
```

### 🔑 Generating Secure Keys

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate encryption key (32+ characters)
openssl rand -hex 16
```


## 📱 Screenshots

### Login Page
![LoginPage](./doc/LoginPage.png)

### Group View
![GroupView](./doc/GroupView.png)

### User View
![UserView](./doc/UserView.png)

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- Docker & Docker Compose
- Git

### Local Development

```bash
# 1. Clone and install dependencies
git clone https://github.com/iamneur0/syncio.git
cd syncio
bun install
cd client && bun install && cd ..

# 2. Set up environment
cp env.example .env
# Edit .env with your configuration

# 3. Start development servers
bun run dev  # Private instance
# or
bun run dev:public  # Public instance with auth
```

## 🐳 Docker Deployment

### Public Instance (With Authentication)
```bash
# Uses PostgreSQL database
docker compose -f docker-compose.public.yml up -d
```

### Private Instance (No Authentication)
```bash
# Uses SQLite database
docker compose -f docker-compose.private.yml up -d
```

## 🔧 Configuration

### Instance Types

**Private Instance**
- No authentication required
- Single-account access
- SQLite database
- Perfect for personal use

**Public Instance**
- JWT authentication
- Multi-user support
- PostgreSQL database
- Perfect for organizations

## 🐛 Troubleshooting

### Common Issues

**Permission Issues:**
```bash
# Check your UID/GID
id

# Update .env with correct values
echo "UID=$(id -u)" >> .env
echo "GID=$(id -g)" >> .env

# Fix ownership
sudo chown -R $(id -u):$(id -g) ./data
```

**Database Issues:**
```bash
# Reset database (WARNING: deletes all data)
docker-compose down
docker volume rm syncio_syncio_data
docker-compose up -d
```

**Port Conflicts:**
```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process or change port in docker-compose.yml
```

### Debug Logging

Enable debug logging for troubleshooting:

```bash
# Server-side debug logging
DEBUG=true

# Client-side debug logging
NEXT_PUBLIC_DEBUG=true
```

Debug logging includes:
- 📡 API request/response details
- 🔄 Sync status calculations
- 📦 Addon import/export operations
- 👤 User status changes
- 🗄️ Database operations


## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Made with ❤️ by neur0
</div>