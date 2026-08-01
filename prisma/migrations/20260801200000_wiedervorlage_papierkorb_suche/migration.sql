-- Drei Erweiterungen auf einmal, weil sie alle nur Spalten hinzufuegen:
--   1. Wiedervorlage an angehefteten Mails
--   2. Papierkorb: geloescht heisst 30 Tage lang wiederherstellbar
--   3. Volltextsuche ueber Mailbetreffe und Dateinamen
--
-- Alles additiv und nullable, die Migration laeuft ueber bestehende Daten,
-- ohne sie anzufassen.

-- 1. Wiedervorlage -----------------------------------------------------------
ALTER TABLE "MailLink" ADD COLUMN "followUpAt" TIMESTAMP(3);
ALTER TABLE "MailLink" ADD COLUMN "followUpDoneAt" TIMESTAMP(3);
CREATE INDEX "MailLink_followUpAt_idx" ON "MailLink"("followUpAt");

-- 2. Papierkorb --------------------------------------------------------------
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Note" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");
CREATE INDEX "Note_deletedAt_idx" ON "Note"("deletedAt");
CREATE INDEX "Attachment_deletedAt_idx" ON "Attachment"("deletedAt");

-- 3. Suche ueber Mails und Dateien -------------------------------------------
-- Wie bei den uebrigen Suchspalten: generiert, damit Postgres sie selbst
-- aktuell haelt. Der Absender wird mitindiziert - "wo war die Mail von Roos"
-- ist genau die Frage, die man stellt.
ALTER TABLE "MailLink"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce("subject", '')), 'A') ||
    setweight(to_tsvector('german', coalesce("fromAddress", '')), 'B')
  ) STORED;

ALTER TABLE "Attachment"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    to_tsvector('german', coalesce("filename", ''))
  ) STORED;

CREATE INDEX "MailLink_suche_idx" ON "MailLink" USING GIN ("suche");
CREATE INDEX "Attachment_suche_idx" ON "Attachment" USING GIN ("suche");
