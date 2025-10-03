-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT,
    "userIds" TEXT,
    "addonIds" TEXT
);

-- CreateTable
CREATE TABLE "addons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manifestUrl" TEXT NOT NULL,
    "version" TEXT,
    "author" TEXT,
    "tags" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT
);

-- CreateTable
CREATE TABLE "app_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_accountId_email_key" ON "users"("accountId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_accountId_username_key" ON "users"("accountId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "groups_accountId_name_key" ON "groups"("accountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "addons_accountId_manifestUrl_key" ON "addons"("accountId", "manifestUrl");

-- CreateIndex
CREATE UNIQUE INDEX "addons_accountId_name_key" ON "addons"("accountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "app_accounts_uuid_key" ON "app_accounts"("uuid");
