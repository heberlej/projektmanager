-- Aufgaben bekommen einen eigenen Status; "done" faellt weg.
-- Reihenfolge ist wichtig: erst die neue Spalte, dann der Uebertrag der
-- bestehenden Haekchen, erst danach darf "done" verschwinden. Der von
-- `prisma migrate diff` erzeugte Entwurf haette beides in einer Anweisung
-- gemacht und dabei jedes erledigte Haekchen verloren.

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OFFEN', 'IN_ARBEIT', 'WARTET', 'ERLEDIGT');

-- DropIndex
DROP INDEX "Task_projectId_done_idx";

-- AddColumn
ALTER TABLE "Task" ADD COLUMN "status" "TaskStatus" NOT NULL DEFAULT 'OFFEN';

-- Backfill: erledigte Aufgaben behalten ihren Zustand
UPDATE "Task" SET "status" = 'ERLEDIGT' WHERE "done" = true;

-- DropColumn
ALTER TABLE "Task" DROP COLUMN "done";

-- Aufgaben duerfen ohne Projekt bestehen
ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE INDEX "Task_status_position_idx" ON "Task"("status", "position");
