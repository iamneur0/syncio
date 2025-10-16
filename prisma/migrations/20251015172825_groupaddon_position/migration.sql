/*
  Warnings:

  - You are about to drop the column `settings` on the `group_addons` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "group_addons" DROP COLUMN "settings",
ADD COLUMN     "position" INTEGER;
