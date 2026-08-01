-- Herkunft einer Aufgabe: die Mail, aus der sie entstanden ist.
--
-- SetNull statt Cascade: loest sich die Mail vom Projekt, bleibt die Aufgabe
-- bestehen und verliert nur den Rueckweg nach Outlook. Eine Aufgabe wegen einer
-- verschobenen Mail zu loeschen waere die falsche Konsequenz.

ALTER TABLE "Task" ADD COLUMN "mailLinkId" TEXT;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_mailLinkId_fkey"
  FOREIGN KEY ("mailLinkId") REFERENCES "MailLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_mailLinkId_idx" ON "Task"("mailLinkId");
