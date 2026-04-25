-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stremioAuthKey" TEXT,
    "excludedAddons" TEXT,
    "protectedAddons" TEXT,
    "colorIndex" INTEGER,
    "useGravatar" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "expiresAt" DATETIME,
    "inviteCode" TEXT,
    "discordWebhookUrl" TEXT,
    "discordUserId" TEXT,
    "apiKey" TEXT,
    "activityVisibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" DATETIME,
    "syncStatus" TEXT,
    "syncErrorMessage" TEXT,
    "groupId" TEXT
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "colorIndex" INTEGER,
    "accountId" TEXT,
    "userIds" TEXT,
    "activityVisibility" TEXT NOT NULL DEFAULT 'private'
);

-- CreateTable
CREATE TABLE "addons" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "customLogo" TEXT,
    "manifestUrlHash" TEXT,
    "manifestHash" TEXT,
    "resources" TEXT,
    "catalogs" TEXT,
    "proxyUuid" TEXT,
    "proxyEnabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "group_addons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER,
    "groupId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    CONSTRAINT "group_addons_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "group_addons_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "addons" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "app_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "sync" TEXT,
    "apiKeyHash" TEXT
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT,
    "inviteCode" TEXT NOT NULL,
    "groupName" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "membershipDurationDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncOnJoin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "app_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invite_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invitationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "groupName" TEXT,
    "oauthCode" TEXT,
    "oauthLink" TEXT,
    "oauthExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "respondedBy" TEXT,
    CONSTRAINT "invite_requests_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "invitations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "watch_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "overallTimeWatched" TEXT,
    "timeOffset" TEXT,
    "lastWatched" DATETIME,
    "mtime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "watch_activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "watchTimeSeconds" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "episode_watch_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "showName" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "poster" TEXT,
    "watchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "watch_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "videoId" TEXT,
    "itemName" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "poster" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_expiresAt_idx" ON "users"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "addons_proxyUuid_key" ON "addons"("proxyUuid");

-- CreateIndex
CREATE INDEX "addons_manifestUrlHash_idx" ON "addons"("manifestUrlHash");

-- CreateIndex
CREATE INDEX "addons_manifestHash_idx" ON "addons"("manifestHash");

-- CreateIndex
CREATE INDEX "addons_proxyUuid_idx" ON "addons"("proxyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "addons_name_accountId_key" ON "addons"("name", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "group_addons_groupId_addonId_key" ON "group_addons"("groupId", "addonId");

-- CreateIndex
CREATE UNIQUE INDEX "app_accounts_uuid_key" ON "app_accounts"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "app_accounts_email_key" ON "app_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_inviteCode_key" ON "invitations"("inviteCode");

-- CreateIndex
CREATE INDEX "invitations_accountId_idx" ON "invitations"("accountId");

-- CreateIndex
CREATE INDEX "invitations_inviteCode_idx" ON "invitations"("inviteCode");

-- CreateIndex
CREATE INDEX "invite_requests_invitationId_idx" ON "invite_requests"("invitationId");

-- CreateIndex
CREATE INDEX "invite_requests_accountId_idx" ON "invite_requests"("accountId");

-- CreateIndex
CREATE INDEX "invite_requests_email_idx" ON "invite_requests"("email");

-- CreateIndex
CREATE INDEX "invite_requests_status_idx" ON "invite_requests"("status");

-- CreateIndex
CREATE INDEX "watch_snapshots_accountId_userId_date_idx" ON "watch_snapshots"("accountId", "userId", "date");

-- CreateIndex
CREATE INDEX "watch_snapshots_accountId_userId_itemId_idx" ON "watch_snapshots"("accountId", "userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "watch_snapshots_accountId_userId_itemId_date_key" ON "watch_snapshots"("accountId", "userId", "itemId", "date");

-- CreateIndex
CREATE INDEX "watch_activity_accountId_userId_date_itemType_idx" ON "watch_activity"("accountId", "userId", "date", "itemType");

-- CreateIndex
CREATE INDEX "watch_activity_accountId_userId_itemId_idx" ON "watch_activity"("accountId", "userId", "itemId");

-- CreateIndex
CREATE INDEX "watch_activity_accountId_date_idx" ON "watch_activity"("accountId", "date");

-- CreateIndex
CREATE INDEX "episode_watch_history_accountId_userId_watchedAt_idx" ON "episode_watch_history"("accountId", "userId", "watchedAt");

-- CreateIndex
CREATE INDEX "episode_watch_history_accountId_userId_showId_idx" ON "episode_watch_history"("accountId", "userId", "showId");

-- CreateIndex
CREATE UNIQUE INDEX "episode_watch_history_accountId_userId_videoId_key" ON "episode_watch_history"("accountId", "userId", "videoId");

-- CreateIndex
CREATE INDEX "watch_sessions_accountId_userId_startTime_idx" ON "watch_sessions"("accountId", "userId", "startTime");

-- CreateIndex
CREATE INDEX "watch_sessions_accountId_userId_isActive_idx" ON "watch_sessions"("accountId", "userId", "isActive");

-- CreateIndex
CREATE INDEX "watch_sessions_accountId_isActive_idx" ON "watch_sessions"("accountId", "isActive");
