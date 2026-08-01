import { followUpDoneAction, setFollowUpAction, unlinkMailAction } from "@/lib/actions";
import { Button, Card, CardBody, EmptyState, Input } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { cn, formatDateTime } from "@/lib/utils";
import type { ProjectDetail } from "./types";

/** Datum als Wert fuer <input type="date">. */
function alsTagesWert(wert: Date | string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lage(followUpAt: Date | string | null, erledigt: Date | string | null) {
  if (!followUpAt) return null;
  if (erledigt) return { text: "nachgefasst", klasse: "text-slate-500" };
  const tage = Math.round(
    (new Date(new Date(followUpAt).toDateString()).getTime() -
      new Date(new Date().toDateString()).getTime()) /
      86_400_000,
  );
  const datum = new Date(followUpAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
  if (tage < 0) return { text: `überfällig seit ${datum}`, klasse: "font-medium text-rose-700" };
  if (tage === 0) return { text: "heute nachfassen", klasse: "font-medium text-amber-900" };
  return { text: `nachfassen am ${datum}`, klasse: "text-slate-600" };
}

export function MailsTab({ project }: { project: ProjectDetail }) {
  if (project.mailLinks.length === 0) {
    return (
      <EmptyState
        title="Keine Mails angeheftet"
        hint="Im Outlook-Add-in eine Mail öffnen und „An Projekt anheften“ wählen."
      />
    );
  }

  return (
    <Card>
      <CardBody className="divide-y divide-slate-100 px-0 py-0">
        {project.mailLinks.map((mail) => (
          <div key={mail.id} className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden className="pt-0.5 text-base">
              ✉
            </span>
            <div className="min-w-0 flex-1">
              {mail.deeplinkUrl ? (
                <a
                  href={mail.deeplinkUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate text-sm font-medium text-slate-900 hover:underline"
                  title="In Outlook öffnen"
                >
                  {mail.subject}
                </a>
              ) : (
                <span className="block truncate text-sm font-medium text-slate-900">
                  {mail.subject}
                </span>
              )}
              <p className="text-xs text-slate-500">
                {mail.fromAddress || "unbekannter Absender"} · {formatDateTime(mail.receivedAt)}
              </p>

              {/* Wiedervorlage: Angebot raus, Kunde antwortet nicht - das ist
                  die Stelle, an der das sonst untergeht. */}
              {(() => {
                const stand = lage(mail.followUpAt, mail.followUpDoneAt);
                return (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {stand ? <span className={cn("text-xs", stand.klasse)}>{stand.text}</span> : null}

                    <form action={setFollowUpAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="mailLinkId" value={mail.id} />
                      <Input
                        type="date"
                        name="followUpAt"
                        defaultValue={alsTagesWert(mail.followUpAt)}
                        aria-label={`Wiedervorlage für ${mail.subject}`}
                        className="h-7 w-auto py-0 text-xs"
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        {mail.followUpAt ? "ändern" : "nachfassen"}
                      </Button>
                    </form>

                    {mail.followUpAt && !mail.followUpDoneAt ? (
                      <form action={followUpDoneAction}>
                        <input type="hidden" name="mailLinkId" value={mail.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          erledigt
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })()}
            </div>
            <form action={unlinkMailAction}>
              <input type="hidden" name="mailLinkId" value={mail.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <ConfirmButton message="Mail-Verknüpfung entfernen?" variant="ghost">
                ✕
              </ConfirmButton>
            </form>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
