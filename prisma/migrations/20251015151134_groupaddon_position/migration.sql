-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stremioAuthKey" TEXT,
    "excludedAddons" TEXT,
    "protectedAddons" TEXT,
    "colorIndex" INTEGER,
    "accountId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "colorIndex" INTEGER,
    "accountId" TEXT,
    "userIds" TEXT,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manifestUrl" TEXT NOT NULL,
    "manifest" TEXT,
    "originalManifest" TEXT,
    "stremioAddonId" TEXT,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT,
    "iconUrl" TEXT,
    "manifestUrlHash" VARCHAR(64),
    "manifestHash" VARCHAR(64),
    "resources" TEXT,
    "catalogs" TEXT,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_addons" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER,
    "groupId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,

    CONSTRAINT "group_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_accounts" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "app_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_accountId_email_key" ON "users"("accountId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_accountId_username_key" ON "users"("accountId", "username");

-- CreateIndex
CREATE INDEX "addons_manifestUrlHash_idx" ON "addons"("manifestUrlHash");

-- CreateIndex
CREATE INDEX "addons_manifestHash_idx" ON "addons"("manifestHash");

-- CreateIndex
CREATE UNIQUE INDEX "addons_name_accountId_key" ON "addons"("name", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "group_addons_groupId_addonId_key" ON "group_addons"("groupId", "addonId");

-- CreateIndex
CREATE UNIQUE INDEX "app_accounts_uuid_key" ON "app_accounts"("uuid");

-- AddForeignKey
ALTER TABLE "group_addons" ADD CONSTRAINT "group_addons_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_addons" ADD CONSTRAINT "group_addons_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
