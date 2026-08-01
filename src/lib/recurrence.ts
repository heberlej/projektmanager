/**
 * Wiederkehrende Aufgaben.
 *
 * Es gibt keinen Hintergrunddienst und keinen Scheduler: der Nachfolger
 * entsteht in dem Moment, in dem die Aufgabe abgehakt wird. Das hat zwei
 * Vorteile, die zu dieser App passen - es laeuft nichts, wenn niemand da ist,
 * und es entstehen keine Karteileichen fuer Wochen, in denen der Rechner aus
 * war. Der Preis: wer nie abhakt, bekommt auch keinen Nachfolger. Das ist
 * gewollt, sonst stapeln sich zwoelf offene "Backups pruefen".
 */

export const RECURRENCES = [
  "TAEGLICH",
  "WOECHENTLICH",
  "ZWEIWOECHENTLICH",
  "MONATLICH",
  "QUARTALSWEISE",
  "JAEHRLICH",
] as const;

export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  TAEGLICH: "täglich",
  WOECHENTLICH: "wöchentlich",
  ZWEIWOECHENTLICH: "alle zwei Wochen",
  MONATLICH: "monatlich",
  QUARTALSWEISE: "vierteljährlich",
  JAEHRLICH: "jährlich",
};

export function isRecurrence(value: unknown): value is Recurrence {
  return typeof value === "string" && (RECURRENCES as readonly string[]).includes(value);
}

/**
 * Naechste Faelligkeit ab einem Stichtag.
 *
 * Bei Monaten rechnet der Kalender, nicht 30 Tage: aus dem 31. Januar wird
 * monatlich der 28./29. Februar, weil `setMonth` sonst in den Maerz rutscht.
 * Der Tag wird dafuer auf das Monatsende geklemmt.
 */
export function naechsteFaelligkeit(recurrence: Recurrence, ab: Date): Date {
  const d = new Date(ab.getTime());

  switch (recurrence) {
    case "TAEGLICH":
      d.setDate(d.getDate() + 1);
      return d;
    case "WOECHENTLICH":
      d.setDate(d.getDate() + 7);
      return d;
    case "ZWEIWOECHENTLICH":
      d.setDate(d.getDate() + 14);
      return d;
    case "MONATLICH":
      return monateSpaeter(d, 1);
    case "QUARTALSWEISE":
      return monateSpaeter(d, 3);
    case "JAEHRLICH":
      return monateSpaeter(d, 12);
  }
}

function monateSpaeter(d: Date, monate: number): Date {
  const tag = d.getDate();
  const ziel = new Date(d.getTime());
  ziel.setDate(1);
  ziel.setMonth(ziel.getMonth() + monate);
  const letzterTag = new Date(ziel.getFullYear(), ziel.getMonth() + 1, 0).getDate();
  ziel.setDate(Math.min(tag, letzterTag));
  return ziel;
}

/**
 * Faelligkeit des Nachfolgers. Grundlage ist die alte Faelligkeit, damit eine
 * woechentliche Aufgabe ihren Wochentag behaelt, auch wenn spaet abgehakt wird.
 * Liegt die daraus errechnete Faelligkeit schon wieder in der Vergangenheit,
 * wird so lange weitergezaehlt, bis sie in der Zukunft liegt - sonst entstuende
 * beim Aufraeumen alter Rueckstaende sofort der naechste Rueckstand.
 */
export function faelligkeitDesNachfolgers(
  recurrence: Recurrence,
  alteFaelligkeit: Date | null,
  jetzt: Date = new Date(),
): Date {
  let naechste = naechsteFaelligkeit(recurrence, alteFaelligkeit ?? jetzt);

  // Deckel gegen Endlosschleifen bei absurd alten Daten.
  for (let i = 0; naechste <= jetzt && i < 500; i++) {
    naechste = naechsteFaelligkeit(recurrence, naechste);
  }
  return naechste;
}
