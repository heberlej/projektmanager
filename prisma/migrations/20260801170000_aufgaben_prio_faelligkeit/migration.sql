-- Prioritaet, Faelligkeit und Wiederholung fuer Aufgaben.
--
-- Additiv: alle Spalten sind entweder nullable oder haben einen Default, die
-- Migration laeuft also ueber bestehende Aufgaben, ohne sie anzufassen.

CREATE TYPE "Recurrence" AS ENUM (
  'TAEGLICH',
  'WOECHENTLICH',
  'ZWEIWOECHENTLICH',
  'MONATLICH',
  'QUARTALSWEISE',
  'JAEHRLICH'
);

ALTER TABLE "Task" ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Task" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "recurrence" "Recurrence";

CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
