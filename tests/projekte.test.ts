import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  applyTemplatePhaseToProject,
  applyTemplateToProject,
  ausDemPapierkorb,
  createTask,
  inDenPapierkorb,
  linkMail,
  listBoardTasks,
  listProjects,
  offeneWiedervorlagen,
  papierkorbBereinigen,
  papierkorbInhalt,
  PAPIERKORB_TAGE,
  setzeWiedervorlage,
  suche,
  taskCountsByStatus,
  wiedervorlageErledigt,
} from "@/lib/service";
import { datenbankLeeren, projektAnlegen } from "./hilfen";

beforeEach(datenbankLeeren);

async function vorlageAnlegen() {
  return prisma.template.create({
    data: {
      name: "Exchange-Migration",
      phases: {
        create: [
          {
            title: "Aufnahme",
            position: 0,
            tasks: { create: [{ title: "Quellsystem dokumentieren", position: 0 }] },
          },
          {
            title: "Durchfuehrung",
            position: 1,
            tasks: {
              create: [
                { title: "Testpostfach migrieren", position: 0 },
                { title: "MX-Record umstellen", position: 1 },
              ],
            },
          },
        ],
      },
    },
  });
}

describe("Vorlagen", () => {
  test("werden kopiert, nicht referenziert", async () => {
    const vorlage = await vorlageAnlegen();
    const projekt = await projektAnlegen();

    await applyTemplateToProject(projekt.id, vorlage.id);

    // Aendert sich die Vorlage spaeter, bleibt das laufende Projekt unberuehrt -
    // genau das ist der Sinn des Kopierens.
    await prisma.templateTask.updateMany({ data: { title: "NACHTRAEGLICH GEAENDERT" } });

    const phasen = await prisma.phase.findMany({
      where: { projectId: projekt.id },
      include: { tasks: true },
      orderBy: { position: "asc" },
    });

    expect(phasen.map((p) => p.title)).toEqual(["Aufnahme", "Durchfuehrung"]);
    expect(phasen[1].tasks.map((t) => t.title).sort()).toEqual([
      "MX-Record umstellen",
      "Testpostfach migrieren",
    ]);
  });

  test("eine einzelne Phase laesst sich nachtraeglich einsetzen", async () => {
    const vorlage = await vorlageAnlegen();
    const projekt = await projektAnlegen();
    const nacharbeit = await prisma.templatePhase.findFirstOrThrow({
      where: { templateId: vorlage.id, title: "Durchfuehrung" },
    });

    await applyTemplatePhaseToProject(projekt.id, nacharbeit.id);

    const phasen = await prisma.phase.findMany({
      where: { projectId: projekt.id },
      include: { tasks: true },
    });

    // Nur die eine Phase, nicht die ganze Vorlage.
    expect(phasen).toHaveLength(1);
    expect(phasen[0].title).toBe("Durchfuehrung");
    expect(phasen[0].tasks).toHaveLength(2);
  });

  test("die eingesetzte Phase haengt sich hinten an, ohne Bestehendes anzufassen", async () => {
    const vorlage = await vorlageAnlegen();
    const projekt = await projektAnlegen();
    await prisma.phase.create({ data: { projectId: projekt.id, title: "Eigene Phase", position: 1 } });
    const vorlagenphase = await prisma.templatePhase.findFirstOrThrow({
      where: { templateId: vorlage.id, title: "Aufnahme" },
    });

    await applyTemplatePhaseToProject(projekt.id, vorlagenphase.id);

    const phasen = await prisma.phase.findMany({
      where: { projectId: projekt.id },
      orderBy: { position: "asc" },
    });
    expect(phasen.map((p) => p.title)).toEqual(["Eigene Phase", "Aufnahme"]);
  });

  test("der Fortschritt zaehlt aus den Aufgaben", async () => {
    const vorlage = await vorlageAnlegen();
    const projekt = await projektAnlegen();
    await applyTemplateToProject(projekt.id, vorlage.id);

    const eine = await prisma.task.findFirstOrThrow({ where: { projectId: projekt.id } });
    await prisma.task.update({ where: { id: eine.id }, data: { status: "ERLEDIGT" } });

    const [eintrag] = await listProjects();
    expect(eintrag.progress.total).toBe(3);
    expect(eintrag.progress.done).toBe(1);
  });
});

describe("Mails anheften", () => {
  // restId und deeplinkUrl sind optional, nicht nullable - das Add-in laesst sie
  // schlicht weg, wenn Office.js nichts liefert.
  const mail = {
    internetMessageId: "<abc@example.org>",
    subject: "Angebot",
    fromAddress: "kunde@example.org",
    receivedAt: new Date("2026-08-01T10:00:00Z"),
  };

  test("dieselbe Mail zweimal anheften erzeugt kein Duplikat", async () => {
    const projekt = await projektAnlegen();

    await linkMail(projekt.id, mail);
    await linkMail(projekt.id, mail);

    expect(await prisma.mailLink.count()).toBe(1);
  });

  test("erneutes Anheften verschiebt die Mail ins andere Projekt", async () => {
    const eins = await projektAnlegen("Projekt eins");
    const zwei = await projektAnlegen("Projekt zwei");

    await linkMail(eins.id, mail);
    await linkMail(zwei.id, mail);

    const links = await prisma.mailLink.findMany();
    expect(links).toHaveLength(1);
    expect(links[0].projectId).toBe(zwei.id);
  });
});

describe("Aufgabe kennt ihre Mail", () => {
  test("die Herkunft bleibt abrufbar", async () => {
    const projekt = await projektAnlegen();
    const link = await linkMail(projekt.id, {
      internetMessageId: "<herkunft@example.org>",
      subject: "Bitte Termin bestaetigen",
      fromAddress: "kunde@example.org",
      receivedAt: new Date(),
    });

    const aufgabe = await createTask({
      title: "Termin bestaetigen",
      projectId: projekt.id,
      mailLinkId: link.id,
    });

    const geladen = await prisma.task.findUniqueOrThrow({
      where: { id: aufgabe.id },
      include: { mailLink: true },
    });
    expect(geladen.mailLink?.subject).toBe("Bitte Termin bestaetigen");
  });

  test("faellt die Mail weg, bleibt die Aufgabe stehen", async () => {
    const projekt = await projektAnlegen();
    const link = await linkMail(projekt.id, {
      internetMessageId: "<weg@example.org>",
      subject: "Wird geloescht",
      fromAddress: "a@b.c",
      receivedAt: new Date(),
    });
    const aufgabe = await createTask({
      title: "Ueberlebt",
      projectId: projekt.id,
      mailLinkId: link.id,
    });

    await prisma.mailLink.delete({ where: { id: link.id } });

    // SetNull, nicht Cascade: die Aufgabe verliert nur den Rueckweg.
    const geladen = await prisma.task.findUnique({ where: { id: aufgabe.id } });
    expect(geladen).not.toBeNull();
    expect(geladen?.mailLinkId).toBeNull();
  });
});

describe("Papierkorb", () => {
  test("geloeschte Aufgaben verschwinden aus den Listen, bleiben aber da", async () => {
    const aufgabe = await createTask({ title: "Erst weg, dann wieder da" });

    await inDenPapierkorb("AUFGABE", aufgabe.id);

    expect(await listBoardTasks()).toHaveLength(0);
    expect((await taskCountsByStatus()).OFFEN).toBe(0);
    // Der Datensatz existiert weiter - nur eben als geloescht markiert.
    expect(await prisma.task.count()).toBe(1);

    const inhalt = await papierkorbInhalt();
    expect(inhalt.map((e) => e.titel)).toEqual(["Erst weg, dann wieder da"]);

    await ausDemPapierkorb("AUFGABE", aufgabe.id);
    expect(await listBoardTasks()).toHaveLength(1);
    expect(await papierkorbInhalt()).toHaveLength(0);
  });

  test("geloeschte Notizen und Dateien tauchen im Papierkorb auf", async () => {
    const projekt = await projektAnlegen();
    const notiz = await prisma.note.create({ data: { projectId: projekt.id, body: "Weg damit" } });
    const datei = await prisma.attachment.create({
      data: {
        projectId: projekt.id,
        filename: "angebot.pdf",
        mime: "application/pdf",
        sizeBytes: 10,
        storagePath: `${projekt.id}/angebot.pdf`,
      },
    });

    await inDenPapierkorb("NOTIZ", notiz.id);
    await inDenPapierkorb("DATEI", datei.id);

    const inhalt = await papierkorbInhalt();
    expect(inhalt.map((e) => e.art).sort()).toEqual(["DATEI", "NOTIZ"]);
  });

  test("geloeschte Aufgaben zaehlen nicht in den Fortschritt", async () => {
    const vorlage = await vorlageAnlegen();
    const projekt = await projektAnlegen();
    await applyTemplateToProject(projekt.id, vorlage.id);
    const eine = await prisma.task.findFirstOrThrow({ where: { projectId: projekt.id } });

    await inDenPapierkorb("AUFGABE", eine.id);

    const [eintrag] = await listProjects();
    expect(eintrag.progress.total).toBe(2);
  });

  test("Bereinigen raeumt nur weg, was lange genug liegt", async () => {
    const frisch = await createTask({ title: "Gerade geloescht" });
    const alt = await createTask({ title: "Lange her" });
    await inDenPapierkorb("AUFGABE", frisch.id);
    await prisma.task.update({
      where: { id: alt.id },
      data: { deletedAt: new Date(Date.now() - (PAPIERKORB_TAGE + 1) * 86_400_000) },
    });

    const weg = await papierkorbBereinigen();

    expect(weg).toBe(1);
    expect(await prisma.task.count()).toBe(1);
    expect((await papierkorbInhalt())[0].titel).toBe("Gerade geloescht");
  });

  test("die Suche uebergeht Geloeschtes", async () => {
    const projekt = await projektAnlegen();
    const notiz = await prisma.note.create({
      data: { projectId: projekt.id, body: "Geheimwort Zwiebelturm" },
    });

    expect(await suche("Zwiebelturm")).toHaveLength(1);
    await inDenPapierkorb("NOTIZ", notiz.id);
    expect(await suche("Zwiebelturm")).toHaveLength(0);
  });
});

describe("Wiedervorlage", () => {
  const mailDaten = {
    internetMessageId: "<nachfassen@example.org>",
    subject: "Angebot Migration",
    fromAddress: "kunde@example.org",
    receivedAt: new Date(),
  };

  test("wird gesetzt und taucht in den offenen auf", async () => {
    const projekt = await projektAnlegen("Projekt mit Nachfassen");
    const link = await linkMail(projekt.id, mailDaten);

    await setzeWiedervorlage(link.id, new Date("2026-08-10T12:00:00"));

    const offen = await offeneWiedervorlagen();
    expect(offen).toHaveLength(1);
    expect(offen[0].subject).toBe("Angebot Migration");
    expect(offen[0].projektName).toBe("Projekt mit Nachfassen");
  });

  test("abgehakt verschwindet sie aus den offenen, bleibt aber vermerkt", async () => {
    const projekt = await projektAnlegen();
    const link = await linkMail(projekt.id, mailDaten);
    await setzeWiedervorlage(link.id, new Date("2026-08-10T12:00:00"));

    await wiedervorlageErledigt(link.id);

    expect(await offeneWiedervorlagen()).toHaveLength(0);
    const geladen = await prisma.mailLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(geladen.followUpAt).not.toBeNull();
    expect(geladen.followUpDoneAt).not.toBeNull();
  });

  test("archivierte Projekte tauchen nicht auf", async () => {
    const projekt = await projektAnlegen();
    const link = await linkMail(projekt.id, mailDaten);
    await setzeWiedervorlage(link.id, new Date("2026-08-10T12:00:00"));
    await prisma.project.update({ where: { id: projekt.id }, data: { archived: true } });

    expect(await offeneWiedervorlagen()).toHaveLength(0);
  });
});

describe("Suche ueber Mails und Dateien", () => {
  test("findet den Mailbetreff und den Absender", async () => {
    const projekt = await projektAnlegen("Irgendein Projekt", "Kunde");
    await linkMail(projekt.id, {
      internetMessageId: "<such@example.org>",
      subject: "Wartungsfenster am Wochenende",
      fromAddress: "technik@spedition-roos.de",
      receivedAt: new Date(),
    });

    const nachBetreff = await suche("Wartungsfenster");
    expect(nachBetreff.map((t) => t.art)).toContain("MAIL");

    // Der Wortteil aus der Adresse muss greifen - danach sucht man wirklich,
    // nicht nach der vollstaendigen Adresse.
    const nachAbsender = await suche("roos");
    expect(nachAbsender.map((t) => t.art)).toContain("MAIL");

    const nachVollerAdresse = await suche("technik@spedition-roos.de");
    expect(nachVollerAdresse.map((t) => t.art)).toContain("MAIL");
  });

  test("findet Dateinamen", async () => {
    const projekt = await projektAnlegen();
    await prisma.attachment.create({
      data: {
        projectId: projekt.id,
        filename: "Migrationsplan.pdf",
        mime: "application/pdf",
        sizeBytes: 100,
        storagePath: `${projekt.id}/Migrationsplan.pdf`,
      },
    });

    const treffer = await suche("Migrationsplan");
    expect(treffer.map((t) => t.art)).toContain("DATEI");
  });
});

describe("Loeschen eines Projekts", () => {
  test("nimmt Phasen, Aufgaben, Notizen und Mails mit", async () => {
    const vorlage = await vorlageAnlegen();
    const projekt = await projektAnlegen();
    await applyTemplateToProject(projekt.id, vorlage.id);
    await prisma.note.create({ data: { projectId: projekt.id, body: "Notiz" } });
    await linkMail(projekt.id, {
      internetMessageId: "<x@example.org>",
      subject: "Betreff",
      fromAddress: "a@b.c",
      receivedAt: new Date(),
    });

    await prisma.project.delete({ where: { id: projekt.id } });

    expect(await prisma.phase.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.note.count()).toBe(0);
    expect(await prisma.mailLink.count()).toBe(0);
    // Die Vorlage ist kein Kind des Projekts und bleibt stehen.
    expect(await prisma.template.count()).toBe(1);
  });
});

describe("Volltextsuche", () => {
  test("findet ueber den Wortstamm und liefert den Auszug", async () => {
    const projekt = await projektAnlegen("Exchange Migration Nord", "Nordkunde");
    await prisma.note.create({
      data: { projectId: projekt.id, body: "Die Migrationen laufen ueber das Wochenende." },
    });

    const treffer = await suche("Migration");

    expect(treffer.length).toBeGreaterThanOrEqual(2);
    expect(treffer.map((t) => t.art)).toContain("PROJEKT");
    expect(treffer.map((t) => t.art)).toContain("NOTIZ");
  });

  test("archivierte Projekte bleiben auffindbar und sind gekennzeichnet", async () => {
    const projekt = await projektAnlegen("Altprojekt Intune");
    await prisma.project.update({ where: { id: projekt.id }, data: { archived: true } });

    const treffer = await suche("Intune");

    expect(treffer).toHaveLength(1);
    expect(treffer[0].archiviert).toBe(true);
  });

  test("kein ausfuehrbares HTML im Auszug", async () => {
    const projekt = await projektAnlegen("Sicherheitstest");
    await prisma.note.create({
      data: { projectId: projekt.id, body: "<script>alert(1)</script> Sicherheitstest" },
    });

    const auszuege = (await suche("Sicherheitstest")).map((t) => t.auszug).join(" ");

    // Zwei Schutzschichten greifen hier hintereinander: Postgres erkennt Tags
    // beim Parsen und wirft sie aus dem Auszug, und was durchkaeme, waere
    // escaped. Erlaubt bleibt allein das <b> um die Fundstelle.
    expect(auszuege).not.toContain("<script>");
    expect(auszuege.replaceAll("<b>", "").replaceAll("</b>", "")).not.toContain("<");
  });

  test("Sonderzeichen im Text werden escaped", async () => {
    const projekt = await projektAnlegen("Grenzwerte");
    await prisma.note.create({
      // Solche Zeichen laesst Postgres stehen, sie sind kein Tag - hier muss
      // also das eigene Escapen greifen.
      data: { projectId: projekt.id, body: 'Grenzwerte: 5 < 7 & "Zitat" pruefen' },
    });

    const auszuege = (await suche("Grenzwerte")).map((t) => t.auszug).join(" ");

    expect(auszuege).toContain("&lt;");
    expect(auszuege).toContain("&amp;");
    expect(auszuege).toContain("&quot;");
  });

  test("die Fundstelle im Fliesstext wird als <b> ausgezeichnet", async () => {
    const projekt = await projektAnlegen("Irgendein Projekt");
    await prisma.note.create({
      data: {
        projectId: projekt.id,
        body: "Am Freitag steht die Zertifikatserneuerung an, danach Neustart.",
      },
    });

    const notiz = (await suche("Zertifikatserneuerung")).find((t) => t.art === "NOTIZ");

    expect(notiz?.auszug).toContain("<b>");
    expect(notiz?.auszug).toContain("</b>");
  });

  test("eine freie Aufgabe verweist auf das Board, nicht auf ein Projekt", async () => {
    await prisma.task.create({ data: { title: "Zertifikat erneuern" } });

    const treffer = await suche("Zertifikat");

    expect(treffer).toHaveLength(1);
    expect(treffer[0].href).toBe("/aufgaben");
  });
});
