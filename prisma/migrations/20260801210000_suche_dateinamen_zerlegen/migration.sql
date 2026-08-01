-- Dateinamen und Adressen zerlegt mitindizieren.
--
-- Postgres macht aus "Migrationsplan.pdf" einen einzigen Token vom Typ "file"
-- und aus "technik@spedition-roos.de" einen vom Typ "email". Wer nach
-- "Migrationsplan" oder "roos" sucht, findet damit nichts - die Frage zerlegt
-- anders als der Index.
--
-- Deshalb steht jetzt beides im Vektor: der Originaltext und eine Fassung, in
-- der Punkt, Klammeraffe, Unterstrich und Bindestrich zu Leerzeichen werden.
-- Die exakte Suche nach "Migrationsplan.pdf" funktioniert weiter, die nach dem
-- Wortteil zusaetzlich.
--
-- Generierte Spalten lassen sich nicht aendern, nur ersetzen. Der Index faellt
-- mit der Spalte und wird neu angelegt.

ALTER TABLE "MailLink" DROP COLUMN "suche";
ALTER TABLE "MailLink"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce("subject", '')), 'A') ||
    setweight(
      to_tsvector(
        'german',
        coalesce("fromAddress", '') || ' ' ||
        regexp_replace(coalesce("fromAddress", ''), '[._@-]+', ' ', 'g')
      ),
      'B'
    )
  ) STORED;

ALTER TABLE "Attachment" DROP COLUMN "suche";
ALTER TABLE "Attachment"
  ADD COLUMN "suche" tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'german',
      coalesce("filename", '') || ' ' ||
      regexp_replace(coalesce("filename", ''), '[._-]+', ' ', 'g')
    )
  ) STORED;

CREATE INDEX "MailLink_suche_idx" ON "MailLink" USING GIN ("suche");
CREATE INDEX "Attachment_suche_idx" ON "Attachment" USING GIN ("suche");
