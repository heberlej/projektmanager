-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "plannedEnd" TIMESTAMP(3),
ADD COLUMN     "plannedStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "plannedEnd" TIMESTAMP(3),
ADD COLUMN     "plannedStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "plannedEnd" TIMESTAMP(3),
ADD COLUMN     "plannedStart" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Phase_plannedStart_idx" ON "Phase"("plannedStart");

-- CreateIndex
CREATE INDEX "Project_plannedStart_idx" ON "Project"("plannedStart");

-- CreateIndex
CREATE INDEX "Task_plannedStart_idx" ON "Task"("plannedStart");

