import { deleteAttachmentAction, uploadFilesAction } from "@/lib/actions";
import { Button, Card, CardBody, EmptyState } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { ProjectDetail } from "./types";

export function FilesTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="py-3">
          <form action={uploadFilesAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <input
              type="file"
              name="files"
              multiple
              required
              className="flex-1 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <Button type="submit">Hochladen</Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Maximal 32 MB je Datei.</p>
        </CardBody>
      </Card>

      {project.attachments.length === 0 ? (
        <EmptyState
          title="Keine Dateien"
          hint="Auftrags-PDFs landen hier auch, wenn du sie im Outlook-Add-in übernimmst."
        />
      ) : (
        <Card>
          <CardBody className="divide-y divide-slate-100 px-0 py-0">
            {project.attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center gap-3 px-4 py-2.5">
                <span aria-hidden className="text-base">
                  {attachment.mime === "application/pdf" ? "📄" : "📎"}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/files/${attachment.id}`}
                    className="block truncate text-sm font-medium text-slate-900 hover:underline"
                  >
                    {attachment.filename}
                  </a>
                  <p className="text-xs text-slate-500">
                    {formatBytes(attachment.sizeBytes)} · {formatDateTime(attachment.createdAt)}
                    {attachment.source === "OUTLOOK" ? " · aus Outlook" : ""}
                  </p>
                </div>
                <form action={deleteAttachmentAction}>
                  <input type="hidden" name="attachmentId" value={attachment.id} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <ConfirmButton message={`"${attachment.filename}" löschen?`} variant="ghost">
                    ✕
                  </ConfirmButton>
                </form>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
