"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAttachmentBase64,
  loadOffice,
  readAttachments,
  readMail,
  type MailAttachment,
  type MailData,
} from "./office";
import { Button, Input, Label, Select, Textarea } from "../ui";
import { STATUS_BADGE, STATUS_LABEL, tagChipClass, type Status } from "@/lib/status";
import { customerFromEmail, formatBytes } from "@/lib/utils";

type ProjectHit = {
  id: string;
  name: string;
  customer: string;
  status: Status;
  tags: string[];
  openTasks: number;
};

type Meta = {
  tags: { id: string; name: string; color: string }[];
  templates: { id: string; name: string }[];
  customers: string[];
};

type Mode = "pin" | "new";

export function Taskpane() {
  const [office, setOffice] = useState<any>(null);
  const [mail, setMail] = useState<MailData | null>(null);
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
  const [fatal, setFatal] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("pin");
  const [meta, setMeta] = useState<Meta>({ tags: [], templates: [], customers: [] });
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [query, setQuery] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; projectId?: string } | null>(null);

  // Office.js laden und Mail auslesen
  useEffect(() => {
    let cancelled = false;
    loadOffice()
      .then((Office) => {
        if (cancelled) return;
        setOffice(Office);
        const data = readMail(Office);
        setMail(data);
        const files = readAttachments(Office);
        setAttachments(files);
        // Auftrags-PDFs sind der Regelfall - die sind vorausgewaehlt.
        setSelectedAttachments(
          new Set(files.filter((f) => f.contentType === "application/pdf").map((f) => f.id)),
        );
      })
      .catch((error: Error) => {
        if (!cancelled) setFatal(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Projektliste (entprellt) laden
  const search = useCallback(async (q: string, withMeta: boolean) => {
    const url = `/api/addin/projects?q=${encodeURIComponent(q)}${withMeta ? "&meta=1" : ""}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Projektliste nicht erreichbar");
    return response.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      search(query, meta.tags.length === 0)
        .then((data) => {
          if (cancelled) return;
          setHits(data.projects ?? []);
          if (data.tags) {
            setMeta({ tags: data.tags, templates: data.templates ?? [], customers: data.customers ?? [] });
          }
        })
        .catch((error: Error) => !cancelled && setResult({ ok: false, text: error.message }));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const suggestedCustomer = useMemo(
    () => customerFromEmail(mail?.fromAddress) || mail?.fromName || "",
    [mail],
  );

  async function uploadSelectedAttachments(projectId: string): Promise<string[]> {
    const problems: string[] = [];
    for (const file of attachments) {
      if (!selectedAttachments.has(file.id)) continue;
      try {
        const contentBase64 = await getAttachmentBase64(office, file.id);
        const response = await fetch("/api/addin/attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            filename: file.name,
            mime: file.contentType,
            contentBase64,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          problems.push(`${file.name}: ${body.error ?? response.statusText}`);
        }
      } catch (error) {
        problems.push(`${file.name}: ${(error as Error).message}`);
      }
    }
    return problems;
  }

  async function pinToProject(projectId: string) {
    if (!mail) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/addin/link-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, mail: toPayload(mail) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Anheften fehlgeschlagen");

      const problems = await uploadSelectedAttachments(projectId);
      setResult({
        ok: problems.length === 0,
        projectId,
        text: body.alreadyLinked
          ? `Bereits an „${body.projectName}“ angeheftet – Angaben aktualisiert.`
          : body.movedFromProjectId
            ? `Mail von einem anderen Projekt zu „${body.projectName}“ verschoben.`
            : `An „${body.projectName}“ angeheftet.` +
              (problems.length === 0 ? "" : ` Probleme: ${problems.join("; ")}`),
      });
    } catch (error) {
      setResult({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function createProject(formData: FormData) {
    if (!mail) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/addin/project-from-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            name: String(formData.get("name") ?? "").trim(),
            customer: String(formData.get("customer") ?? "").trim(),
            status: String(formData.get("status") ?? "NEU"),
            priority: "NORMAL",
            description: String(formData.get("description") ?? ""),
            templateId: String(formData.get("templateId") ?? ""),
            tagIds: formData.getAll("tagIds").map(String),
          },
          mail: toPayload(mail),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Anlegen fehlgeschlagen");

      const problems = await uploadSelectedAttachments(body.projectId);
      setResult({
        ok: problems.length === 0,
        projectId: body.projectId,
        text:
          `Projekt „${body.projectName}“ angelegt und Mail angeheftet.` +
          (problems.length === 0 ? "" : ` Probleme: ${problems.join("; ")}`),
      });
    } catch (error) {
      setResult({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (fatal) {
    return (
      <Notice tone="error">
        <p className="font-medium">Add-in konnte nicht starten</p>
        <p className="mt-1">{fatal}</p>
      </Notice>
    );
  }

  if (!mail) {
    return <p className="p-2 text-sm text-slate-500">Mail wird gelesen …</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <section className="rounded-md bg-slate-50 p-2.5 ring-1 ring-slate-200">
        <p className="truncate font-medium text-slate-900" title={mail.subject}>
          {mail.subject || "(kein Betreff)"}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {mail.fromName ? `${mail.fromName} · ` : ""}
          {mail.fromAddress}
        </p>
        <p className="text-xs text-slate-400">
          {new Date(mail.receivedAt).toLocaleString("de-DE")}
        </p>
      </section>

      {attachments.length > 0 ? (
        <section>
          <Label>Anhänge übernehmen</Label>
          <div className="space-y-1">
            {attachments.map((file) => (
              <label key={file.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedAttachments.has(file.id)}
                  onChange={(event) => {
                    setSelectedAttachments((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.add(file.id);
                      else next.delete(file.id);
                      return next;
                    });
                  }}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-slate-400">{formatBytes(file.size)}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex overflow-hidden rounded-md ring-1 ring-slate-300">
        {(["pin", "new"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setResult(null);
            }}
            className={`h-8 flex-1 text-xs font-medium ${
              mode === value ? "bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
          >
            {value === "pin" ? "An Projekt anheften" : "Neues Projekt"}
          </button>
        ))}
      </div>

      {result ? (
        <Notice tone={result.ok ? "ok" : "error"}>
          <p>{result.text}</p>
          {result.projectId ? (
            <a
              href={`/projekte/${result.projectId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-block underline underline-offset-2"
            >
              Projekt öffnen
            </a>
          ) : null}
        </Notice>
      ) : null}

      {mode === "pin" ? (
        <section className="space-y-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Projekt suchen …"
          />
          <div className="space-y-1.5">
            {hits.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Kein Projekt gefunden.</p>
            ) : (
              hits.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pinToProject(project.id)}
                  className="w-full rounded-md border border-slate-200 p-2 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{project.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_BADGE[project.status]}`}
                    >
                      {STATUS_LABEL[project.status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {project.customer}
                    {project.openTasks > 0 ? ` · ${project.openTasks} offen` : ""}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
      ) : (
        <form
          className="space-y-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            createProject(new FormData(event.currentTarget));
          }}
        >
          <div>
            <Label>Projektname</Label>
            <Input name="name" defaultValue={mail.subject} required maxLength={200} />
          </div>

          <div>
            <Label>Kunde</Label>
            <Input
              name="customer"
              defaultValue={suggestedCustomer}
              required
              maxLength={160}
              list="addin-kunden"
              autoComplete="off"
            />
            <datalist id="addin-kunden">
              {meta.customers.map((customer) => (
                <option key={customer} value={customer} />
              ))}
            </datalist>
          </div>

          <div>
            <Label>Vorlage</Label>
            <Select name="templateId" defaultValue="">
              <option value="">Ohne Vorlage</option>
              {meta.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue="NEU">
              {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </div>

          <fieldset>
            <Label>Projektart</Label>
            <div className="flex flex-wrap gap-1">
              {meta.tags.map((tag) => (
                <label
                  key={tag.id}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tagChipClass(tag.color)}`}
                >
                  <input type="checkbox" name="tagIds" value={tag.id} className="h-3 w-3 accent-slate-900" />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Label>Notiz zum Start</Label>
            <Textarea name="description" rows={3} maxLength={5000} />
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Wird angelegt …" : "Projekt anlegen und Mail anheften"}
          </Button>
        </form>
      )}
    </div>
  );
}

function toPayload(mail: MailData) {
  return {
    internetMessageId: mail.internetMessageId,
    restId: mail.restId,
    subject: mail.subject,
    fromAddress: mail.fromAddress,
    receivedAt: mail.receivedAt,
    deeplinkUrl: mail.deeplinkUrl,
  };
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-md px-2.5 py-2 text-xs ring-1 ${
        tone === "ok"
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-rose-50 text-rose-800 ring-rose-200"
      }`}
    >
      {children}
    </div>
  );
}
