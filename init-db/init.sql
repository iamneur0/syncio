-- Initialize database for Syncio
-- This script runs when the PostgreSQL container starts for the first time

-- Create database if it doesn't exist
-- (This is handled by POSTGRES_DB environment variable)

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Set timezone
SET timezone = 'UTC';

-- Create initial admin user (this will be done via Prisma migrations)
-- The migrations will handle the actual table creation
