-- CreateTable
CREATE TABLE "proxy_request_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL DEFAULT 'default',
    "addonId" TEXT NOT NULL,
    "addonName" TEXT,
    "proxyUuid" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "statusCode" INTEGER,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "proxy_request_logs_accountId_addonId_createdAt_idx" ON "proxy_request_logs"("accountId", "addonId", "createdAt");

-- CreateIndex
CREATE INDEX "proxy_request_logs_accountId_proxyUuid_createdAt_idx" ON "proxy_request_logs"("accountId", "proxyUuid", "createdAt");

-- CreateIndex
CREATE INDEX "proxy_request_logs_accountId_createdAt_idx" ON "proxy_request_logs"("accountId", "createdAt");
