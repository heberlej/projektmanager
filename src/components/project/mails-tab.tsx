import { unlinkMailAction } from "@/lib/actions";
import { Card, CardBody, EmptyState } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { formatDateTime } from "@/lib/utils";
import type { ProjectDetail } from "./types";

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
