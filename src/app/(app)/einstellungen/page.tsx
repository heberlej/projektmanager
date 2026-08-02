import { einrichtungsstand, istDesktop } from "@/lib/addin-einrichtung";
import { manifestErzeugenAction, ordnerOeffnenAction } from "@/lib/actions";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Ein Punkt der Prüfliste: erledigt, offen, oder nur ein Hinweis. */
function Schritt({
  erfuellt,
  titel,
  children,
}: {
  erfuellt: boolean | null;
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          erfuellt === true && "bg-erledigt text-akzent-auf",
          erfuellt === false && "bg-status-wartet text-akzent-auf",
          erfuellt === null && "bg-slate-200 text-slate-600",
        )}
      >
        {erfuellt === true ? "✓" : erfuellt === false ? "!" : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          {titel}
          <span className="sr-only">{erfuellt === true ? " – erledigt" : " – offen"}</span>
        </p>
        <div className="mt-1 space-y-2 text-sm text-slate-600">{children}</div>
      </div>
    </div>
  );
}

function Befehl({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
      {children}
    </pre>
  );
}

export default async function EinstellungenPage() {
  if (!istDesktop()) {
    return (
      <div className="mx-auto max-w-3xl">
        <header className="glas-kante sticky top-0 z-20 -mx-4 mb-4 px-4 py-3 md:-mx-8 md:px-8">
          <h1 className="text-xl font-semibold text-slate-900">Einstellungen</h1>
        </header>
        <EmptyState
          title="Nichts einzustellen"
          hint="Diese Seite richtet das Outlook-Add-in der Windows-Fassung ein. Im Docker-Betrieb steht der Weg dorthin in der README."
        />
      </div>
    );
  }

  const stand = await einrichtungsstand();
  const bereit = stand.zertifikat && stand.zuhoerer && stand.manifest;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="glas-kante sticky top-0 z-20 -mx-4 mb-4 px-4 py-3 md:-mx-8 md:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Einstellungen</h1>
        <p className="mt-0.5 text-sm text-slate-500">Outlook-Add-in einrichten</p>
      </header>

      <Card className="mb-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Outlook-Add-in</CardTitle>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              bereit
                ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                : "bg-amber-100 text-amber-900 ring-amber-300",
            )}
          >
            {bereit ? "einsatzbereit" : "noch nicht fertig"}
          </span>
        </CardHeader>

        <CardBody className="pt-0">
          <p className="border-b border-slate-100 pb-3 text-sm text-slate-600">
            Mit dem Add-in lässt sich eine Mail aus Outlook an ein Projekt anheften oder
            direkt in ein Projekt verwandeln. Outlook lädt solche Seiten nur über HTTPS mit
            einem Zertifikat, dem Windows vertraut – deshalb die drei Schritte. Die
            Anwendung selbst braucht nichts davon.
          </p>

          <div className="divide-y divide-slate-100">
            <Schritt erfuellt={stand.zertifikat} titel="Zertifikat für pm.localhost">
              {stand.zertifikat ? (
                <p>Liegt in {stand.zertifikatsOrdner}.</p>
              ) : (
                <>
                  <p>
                    Einmalig eine lokale Zertifizierungsstelle anlegen und ein Zertifikat
                    ausstellen. Der erste Befehl öffnet eine Administratorabfrage – er trägt
                    die Stelle in den Zertifikatspeicher ein, damit Windows ihr vertraut.
                  </p>
                  <Befehl>{`winget install FiloSottile.mkcert
mkcert -install
mkdir "${stand.zertifikatsOrdner}"
mkcert -cert-file "${stand.zertifikatsOrdner}\\pm.localhost.pem" -key-file "${stand.zertifikatsOrdner}\\pm.localhost-key.pem" pm.localhost`}</Befehl>
                  <p className="text-xs text-slate-500">
                    Der private Schlüssel entsteht dabei auf diesem Rechner und bleibt hier.
                    Danach die Anwendung neu starten.
                  </p>
                </>
              )}
            </Schritt>

            <Schritt erfuellt={stand.hostsEintrag} titel="Namensauflösung für pm.localhost">
              {stand.hostsEintrag ? (
                <p>Der Eintrag steht in der hosts-Datei.</p>
              ) : (
                <>
                  <p>
                    In <code className="rounded bg-slate-100 px-1">
                      C:\Windows\System32\drivers\etc\hosts
                    </code>{" "}
                    als Administrator ergänzen:
                  </p>
                  <Befehl>127.0.0.1 pm.localhost</Befehl>
                  <p className="text-xs text-slate-500">
                    Ohne diesen Eintrag findet Outlook den Namen unter Umständen nicht.
                  </p>
                </>
              )}
            </Schritt>

            <Schritt erfuellt={stand.zuhoerer} titel={`HTTPS auf Port ${stand.port}`}>
              {stand.zuhoerer ? (
                <p>
                  Läuft.{" "}
                  <a
                    href={`https://pm.localhost:${stand.port}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-blue-700 hover:underline"
                  >
                    Im Browser prüfen
                  </a>{" "}
                  – das Schloss muss ohne Warnung erscheinen.
                </p>
              ) : (
                <p>
                  Wird erst gestartet, wenn das Zertifikat liegt. Nach dem Hinterlegen die
                  Anwendung einmal schließen und neu öffnen.
                </p>
              )}
            </Schritt>

            <Schritt erfuellt={Boolean(stand.manifest)} titel="Manifest für Outlook">
              {stand.manifest ? (
                <p className="break-all">{stand.manifest}</p>
              ) : (
                <p>Noch nicht erzeugt.</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <form action={manifestErzeugenAction}>
                  <Button type="submit" variant={stand.manifest ? "secondary" : "primary"} size="sm">
                    {stand.manifest ? "Neu erzeugen" : "Manifest erzeugen"}
                  </Button>
                </form>
                {stand.manifest ? (
                  <form action={ordnerOeffnenAction}>
                    <Button type="submit" variant="secondary" size="sm">
                      Ordner öffnen
                    </Button>
                  </form>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Beim erneuten Erzeugen bleibt die Kennung erhalten – eine neue würde Outlook
                als zweites Add-in führen.
              </p>
            </Schritt>

            <Schritt erfuellt={null} titel="In Outlook einbinden">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Neues Outlook öffnen</li>
                <li>Einstellungen → Allgemein → <strong>Add-Ins verwalten</strong></li>
                <li>
                  Meine Add-Ins → <em>Benutzerdefiniertes Add-In</em> →{" "}
                  <strong>Aus Datei hinzufügen</strong>
                </li>
                <li>Die Manifestdatei von oben auswählen</li>
                <li>
                  Eine Mail öffnen – die Schaltfläche <strong>Zu Projekt</strong> liegt unter
                  „Apps" oder hinter den drei Punkten
                </li>
              </ol>
              <p className="text-xs text-slate-500">
                Fehlt der Menüpunkt <em>Benutzerdefiniertes Add-In</em>, sperrt eine
                Tenant-Richtlinie das Sideloading – dann hilft nur das
                Microsoft-365-Admin-Center. Und: Das Taskpane bleibt weiß, solange diese
                Anwendung nicht läuft.
              </p>
            </Schritt>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
