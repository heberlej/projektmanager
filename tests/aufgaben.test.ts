import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  changeTaskStatus,
  createTask,
  listBoardTasks,
  openTasksForDashboard,
  taskCountsByStatus,
} from "@/lib/service";
import { datenbankLeeren, projektAnlegen } from "./hilfen";

beforeEach(datenbankLeeren);

describe("Trennung von freien und Projektaufgaben", () => {
  test("das Board zeigt nur Aufgaben ohne Projekt", async () => {
    const projekt = await projektAnlegen();
    await createTask({ title: "Am Projekt", projectId: projekt.id });
    await createTask({ title: "Frei" });

    const board = await listBoardTasks();

    expect(board.map((t) => t.title)).toEqual(["Frei"]);
  });

  test("die Suche im Board holt keine Projektaufgabe herein", async () => {
    const projekt = await projektAnlegen();
    await createTask({ title: "Migration vorbereiten", projectId: projekt.id });
    await createTask({ title: "Migration dokumentieren" });

    const board = await listBoardTasks({ q: "Migration" });

    expect(board.map((t) => t.title)).toEqual(["Migration dokumentieren"]);
  });

  test("die Zaehlung der Spalten laesst Projektaufgaben aus", async () => {
    const projekt = await projektAnlegen();
    await createTask({ title: "Am Projekt", projectId: projekt.id });
    await createTask({ title: "Frei eins" });
    await createTask({ title: "Frei zwei", status: "ERLEDIGT" });

    const counts = await taskCountsByStatus();

    expect(counts.OFFEN).toBe(1);
    expect(counts.ERLEDIGT).toBe(1);
  });

  test("das Dashboard zeigt ebenfalls nur freie Aufgaben", async () => {
    const projekt = await projektAnlegen();
    await createTask({ title: "Am Projekt", projectId: projekt.id });
    await createTask({ title: "Frei" });

    const offen = await openTasksForDashboard();

    expect(offen.map((t) => t.title)).toEqual(["Frei"]);
  });
});

describe("Sortierung", () => {
  test("Faelligkeit schlaegt Prioritaet, Undatiertes kommt zuletzt", async () => {
    await createTask({ title: "Ohne Datum, hoch", priority: "HOCH" });
    await createTask({ title: "Spaet", dueDate: new Date("2026-12-01T12:00:00") });
    await createTask({ title: "Frueh, niedrig", priority: "NIEDRIG", dueDate: new Date("2026-01-05T12:00:00") });

    const board = await listBoardTasks();

    expect(board.map((t) => t.title)).toEqual(["Frueh, niedrig", "Spaet", "Ohne Datum, hoch"]);
  });
});

describe("Wiederkehrende Aufgaben", () => {
  test("beim Abhaken entsteht der Nachfolger mit verschobener Faelligkeit", async () => {
    const aufgabe = await createTask({
      title: "Backups pruefen",
      recurrence: "WOECHENTLICH",
      dueDate: new Date("2026-08-03T12:00:00"),
    });

    await changeTaskStatus(aufgabe.id, "ERLEDIGT");

    const alle = await prisma.task.findMany({ orderBy: { status: "asc" } });
    expect(alle).toHaveLength(2);

    const nachfolger = alle.find((t) => t.status === "OFFEN");
    expect(nachfolger?.title).toBe("Backups pruefen");
    expect(nachfolger?.recurrence).toBe("WOECHENTLICH");
    // 03.08. ist Vergangenheit, deshalb wird bis in die Zukunft weitergezaehlt -
    // aber immer im Wochenraster, der Wochentag bleibt also ein Montag.
    expect(nachfolger?.dueDate?.getDay()).toBe(1);
    expect(nachfolger!.dueDate!.getTime()).toBeGreaterThan(Date.now());
  });

  test("die erledigte Aufgabe bleibt als Beleg stehen", async () => {
    const aufgabe = await createTask({ title: "Monatsbericht", recurrence: "MONATLICH" });

    await changeTaskStatus(aufgabe.id, "ERLEDIGT");

    const erledigt = await prisma.task.findUnique({ where: { id: aufgabe.id } });
    expect(erledigt?.status).toBe("ERLEDIGT");
  });

  test("ohne Wiederholung entsteht kein Nachfolger", async () => {
    const aufgabe = await createTask({ title: "Einmalig" });

    await changeTaskStatus(aufgabe.id, "ERLEDIGT");

    expect(await prisma.task.count()).toBe(1);
  });

  test("eine Projektaufgabe bekommt keine Wiederholung", async () => {
    const projekt = await projektAnlegen();

    const aufgabe = await createTask({
      title: "Am Projekt",
      projectId: projekt.id,
      recurrence: "TAEGLICH",
    });

    expect(aufgabe.recurrence).toBeNull();

    await changeTaskStatus(aufgabe.id, "ERLEDIGT");
    expect(await prisma.task.count()).toBe(1);
  });

  test("ein Zurueckholen aus Erledigt erzeugt keinen zweiten Nachfolger", async () => {
    const aufgabe = await createTask({ title: "Wartung", recurrence: "TAEGLICH" });

    await changeTaskStatus(aufgabe.id, "ERLEDIGT");
    await changeTaskStatus(aufgabe.id, "OFFEN");

    expect(await prisma.task.count()).toBe(2);
  });
});
