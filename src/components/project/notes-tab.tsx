import { addNoteAction, deleteNoteAction, togglePinNoteAction } from "@/lib/actions";
import { Button, Card, CardBody, EmptyState, Textarea } from "../ui";
import { ConfirmButton } from "../confirm-button";
import { Markdown } from "../markdown";
import { formatDateTime } from "@/lib/utils";
import type { ProjectDetail } from "./types";

export function NotesTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="py-3">
          <form action={addNoteAction} className="space-y-2">
            <input type="hidden" name="projectId" value={project.id} />
            <Textarea
              name="body"
              rows={4}
              required
              maxLength={20000}
              placeholder="Was ist passiert? Markdown wird unterstützt."
            />
            <div className="flex justify-end">
              <Button type="submit">Notiz speichern</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {project.notes.length === 0 ? (
        <EmptyState
          title="Noch keine Notizen"
          hint="Das Journal ist nach Datum sortiert, angeheftete Einträge stehen oben."
        />
      ) : (
        <div className="space-y-3">
          {project.notes.map((note) => (
            <Card key={note.id} className={note.pinned ? "border-amber-300 bg-amber-50/40" : ""}>
              <CardBody className="py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</span>
                  {note.pinned ? (
                    <span className="text-xs font-medium text-amber-700">angeheftet</span>
                  ) : null}

                  <div className="ml-auto flex items-center gap-1">
                    <form action={togglePinNoteAction}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {note.pinned ? "Lösen" : "Anheften"}
                      </Button>
                    </form>
                    <form action={deleteNoteAction}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <ConfirmButton message="Notiz löschen?" variant="ghost">
                        ✕
                      </ConfirmButton>
                    </form>
                  </div>
                </div>

                <Markdown>{note.body}</Markdown>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
