-- Volltextsuche ueber Projekte, Notizen und Aufgaben.
--
-- Generierte Spalten statt Trigger: Postgres haelt den tsvector selbst aktuell,
-- es gibt also keinen zweiten Ort, der vergessen werden koennte. Woerterbuch
-- 'german' - damit findet "Migration" auch "Migrationen".
--
-- Prisma kennt generierte Spalten nicht; sie stehen deshalb nur hier und werden
-- ausschliesslich per $queryRaw abgefragt. Im Schema tauchen sie nicht auf, was
-- in Ordnung ist: `prisma migrate diff` wuerde sie zwar bemerken, aber die
-- Anwendung greift nie ueber den Client darauf zu.

ALTER TABLE "Project"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('german', coalesce("customer", '')), 'B') ||
    setweight(to_tsvector('german', coalesce("description", '')), 'C')
  ) STORED;

ALTER TABLE "Note"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    to_tsvector('german', coalesce("body", ''))
  ) STORED;

ALTER TABLE "Task"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('german', coalesce("notes", '')), 'C')
  ) STORED;

CREATE INDEX "Project_suche_idx" ON "Project" USING GIN ("suche");
CREATE INDEX "Note_suche_idx" ON "Note" USING GIN ("suche");
CREATE INDEX "Task_suche_idx" ON "Task" USING GIN ("suche");
