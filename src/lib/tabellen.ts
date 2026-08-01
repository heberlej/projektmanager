/**
 * Sortierbare Spalten der beiden Listen.
 *
 * Absichtlich hier und nicht in der jeweiligen Tabellenkomponente: die
 * Aufgabentabelle ist eine Client-Komponente, und was ein Server-Modul aus
 * einer solchen Datei importiert, ist nicht der Wert, sondern ein Platzhalter.
 * Reine Konstanten gehoeren deshalb in ein neutrales Modul.
 */

export const PROJEKT_SPALTEN = ["name", "kunde", "status", "fortschritt", "zuletzt"] as const;
export type ProjektSpalte = (typeof PROJEKT_SPALTEN)[number];

export const AUFGABEN_SPALTEN = ["titel", "status", "prioritaet", "faellig", "termin"] as const;
export type AufgabenSpalte = (typeof AUFGABEN_SPALTEN)[number];
