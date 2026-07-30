// Idempotenter Seed - laeuft bei jedem Containerstart.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TAGS = [
  { name: "Exchange-Migration", color: "blue" },
  { name: "Tenant-to-Tenant", color: "violet" },
  { name: "Intune-Einrichtung", color: "cyan" },
  { name: "Software-Verteilung", color: "emerald" },
  { name: "Sonstiges", color: "slate" },
];

const TEMPLATES = [
  {
    name: "Exchange-Migration",
    description: "Migration eines On-Premises- oder Fremdanbieter-Postfachbestands nach Exchange Online.",
    phases: [
      {
        title: "Aufnahme",
        tasks: [
          { title: "Auftrag und Leistungsumfang mit Kunde abgleichen" },
          { title: "Bestand erfassen: Postfaecher, Groessen, Verteiler, Ressourcen" },
          { title: "Quellsystem und Version dokumentieren" },
          { title: "Zugangsdaten und Ansprechpartner sammeln" },
        ],
      },
      {
        title: "Vorbereitung",
        tasks: [
          { title: "Zieltenant pruefen: Lizenzen, Domains, DNS-Zugriff" },
          { title: "Akzeptierte Domains und Autodiscover planen" },
          { title: "Migrationsverfahren festlegen (Cutover / Staged / Hybrid / Drittwerkzeug)" },
          { title: "Testpostfach migrieren und Ergebnis pruefen" },
          { title: "Migrationsfenster mit Kunde abstimmen" },
        ],
      },
      {
        title: "Durchfuehrung",
        tasks: [
          { title: "Erstsynchronisation starten" },
          { title: "Fortschritt und Fehlerberichte auswerten" },
          { title: "Delta-Sync unmittelbar vor Umschaltung" },
          { title: "MX-Record und Autodiscover umstellen", notes: "TTL vorher senken." },
          { title: "Clients neu profilieren (Outlook, Mobilgeraete)" },
        ],
      },
      {
        title: "Nacharbeit",
        tasks: [
          { title: "Stichproben: Kalender, Kontakte, Freigaben, Regeln" },
          { title: "Verteiler und freigegebene Postfaecher pruefen" },
          { title: "Altsystem abschalten oder einfrieren" },
          { title: "Dokumentation an Kunde uebergeben" },
          { title: "Abnahme einholen" },
        ],
      },
    ],
  },
  {
    name: "Intune-Einrichtung",
    description: "Grundeinrichtung von Microsoft Intune inklusive Enrollment und Basisrichtlinien.",
    phases: [
      {
        title: "Aufnahme",
        tasks: [
          { title: "Geraetebestand und Betriebssysteme erfassen" },
          { title: "Lizenzierung pruefen" },
          { title: "Bestehende Verwaltung (GPO / Drittanbieter) dokumentieren" },
        ],
      },
      {
        title: "Konfiguration",
        tasks: [
          { title: "MDM-Authority und Enrollment-Einschraenkungen setzen" },
          { title: "Autopilot-Profil anlegen" },
          { title: "Compliance-Richtlinien definieren" },
          { title: "Konfigurationsprofile (Update-Ringe, BitLocker, Defender)" },
        ],
      },
      {
        title: "Rollout",
        tasks: [
          { title: "Pilotgruppe aufnehmen" },
          { title: "Rueckmeldungen einarbeiten" },
          { title: "Breitenrollout" },
          { title: "Uebergabe und Kurzeinweisung" },
        ],
      },
    ],
  },
];

async function main() {
  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      create: tag,
      update: { color: tag.color },
    });
  }

  for (const template of TEMPLATES) {
    const existing = await prisma.template.findUnique({ where: { name: template.name } });
    if (existing) continue;

    await prisma.template.create({
      data: {
        name: template.name,
        description: template.description,
        phases: {
          create: template.phases.map((phase, phaseIndex) => ({
            title: phase.title,
            position: phaseIndex + 1,
            tasks: {
              create: phase.tasks.map((task, taskIndex) => ({
                title: task.title,
                notes: task.notes ?? null,
                position: taskIndex + 1,
              })),
            },
          })),
        },
      },
    });
    console.log(`[seed] Vorlage angelegt: ${template.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[seed] fehlgeschlagen:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
