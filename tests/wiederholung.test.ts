import { describe, expect, test } from "vitest";
import { faelligkeitDesNachfolgers, naechsteFaelligkeit } from "@/lib/recurrence";

/** Reine Rechnerei, keine Datenbank noetig. */
describe("naechsteFaelligkeit", () => {
  test("zaehlt Tage und Wochen schlicht weiter", () => {
    const basis = new Date(2026, 7, 3); // 03.08.2026, ein Montag
    expect(naechsteFaelligkeit("TAEGLICH", basis).getDate()).toBe(4);
    expect(naechsteFaelligkeit("WOECHENTLICH", basis).getDate()).toBe(10);
    expect(naechsteFaelligkeit("ZWEIWOECHENTLICH", basis).getDate()).toBe(17);
  });

  test("rechnet in Monaten, nicht in 30 Tagen", () => {
    const basis = new Date(2026, 0, 15);
    const naechste = naechsteFaelligkeit("MONATLICH", basis);
    expect(naechste.getMonth()).toBe(1);
    expect(naechste.getDate()).toBe(15);
  });

  test("klemmt den 31. auf das Monatsende statt in den Folgemonat zu rutschen", () => {
    const basis = new Date(2026, 0, 31); // 31. Januar
    const naechste = naechsteFaelligkeit("MONATLICH", basis);
    expect(naechste.getMonth()).toBe(1); // Februar, nicht Maerz
    expect(naechste.getDate()).toBe(28); // 2026 ist kein Schaltjahr
  });

  test("Quartal und Jahr springen um drei bzw. zwoelf Monate", () => {
    const basis = new Date(2026, 10, 20);
    expect(naechsteFaelligkeit("QUARTALSWEISE", basis).getMonth()).toBe(1);
    expect(naechsteFaelligkeit("QUARTALSWEISE", basis).getFullYear()).toBe(2027);
    expect(naechsteFaelligkeit("JAEHRLICH", basis).getFullYear()).toBe(2027);
  });
});

describe("faelligkeitDesNachfolgers", () => {
  test("liegt immer in der Zukunft, auch wenn spaet abgehakt wird", () => {
    const langeHer = new Date(2020, 0, 6);
    const jetzt = new Date(2026, 7, 1);

    const naechste = faelligkeitDesNachfolgers("WOECHENTLICH", langeHer, jetzt);

    expect(naechste.getTime()).toBeGreaterThan(jetzt.getTime());
    // Wochenraster bleibt erhalten: 06.01.2020 war ein Montag.
    expect(naechste.getDay()).toBe(1);
  });

  test("ohne alte Faelligkeit zaehlt sie ab jetzt", () => {
    const jetzt = new Date(2026, 7, 1);

    const naechste = faelligkeitDesNachfolgers("TAEGLICH", null, jetzt);

    expect(naechste.getDate()).toBe(2);
  });
});
