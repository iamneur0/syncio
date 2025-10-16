/*
  Warnings:

  - You are about to drop the column `position` on the `group_addons` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "group_addons" DROP COLUMN "position",
ADD COLUMN     "settings" TEXT;
