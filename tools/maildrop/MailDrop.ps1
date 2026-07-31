#requires -version 5.1
<#
    Projektmanager MailDrop

    Kleines Ablagefenster fuer die Taskleiste: eine Mail darauf ziehen, Projekt
    waehlen, fertig. Benutzt dieselben Endpunkte wie das Outlook-Add-in
    (/api/addin/...), es gibt also keine zweite Fachlogik.

    Zwei Wege kommen an:
      - FileDrop            Dateien aus dem Explorer, und das neue Outlook,
                            das beim Ziehen eine .eml-Datei erzeugt
      - FileGroupDescriptor das klassische Outlook, das direkt aus dem Fenster
                            zieht, ohne vorher eine Datei anzulegen

    .msg wird ueber Outlook-COM gelesen (Betreff, Absender, Zeit,
    internetMessageId, Anhaenge). .eml wird als RFC-822 selbst geparst; daraus
    holt diese Fassung keine Anhaenge.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = $(if ($env:PM_BASE_URL) { $env:PM_BASE_URL } else { 'https://pm.localhost' })
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ===========================================================================
# Mail-Parsing
# ===========================================================================

<# "=?UTF-8?B?...?=" und "=?UTF-8?Q?...?=" aufloesen - deutsche Betreffs sind
   fast immer so kodiert. #>
function ConvertFrom-Rfc2047 {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return '' }

    $muster = '=\?([^?]+)\?([BbQq])\?([^?]*)\?='
    return [regex]::Replace($Text, $muster, {
        param($treffer)
        try {
            $kodierung = [Text.Encoding]::GetEncoding($treffer.Groups[1].Value)
            $art = $treffer.Groups[2].Value.ToUpperInvariant()
            $nutzlast = $treffer.Groups[3].Value
            if ($art -eq 'B') {
                return $kodierung.GetString([Convert]::FromBase64String($nutzlast))
            }
            # Quoted-Printable: Unterstrich ist ein Leerzeichen
            $roh = $nutzlast.Replace('_', ' ')
            $bytes = New-Object System.Collections.Generic.List[byte]
            for ($i = 0; $i -lt $roh.Length; $i++) {
                if ($roh[$i] -eq '=' -and $i + 2 -lt $roh.Length) {
                    $bytes.Add([Convert]::ToByte($roh.Substring($i + 1, 2), 16))
                    $i += 2
                } else {
                    $bytes.Add([byte][char]$roh[$i])
                }
            }
            return $kodierung.GetString($bytes.ToArray())
        } catch {
            return $treffer.Value
        }
    })
}

function Get-MailAusEml {
    param([string]$Pfad)

    $zeilen = [IO.File]::ReadAllLines($Pfad, [Text.Encoding]::UTF8)
    $kopf = @{}
    $letzter = $null
    foreach ($zeile in $zeilen) {
        if ([string]::IsNullOrWhiteSpace($zeile)) { break }   # Kopf zu Ende
        if ($zeile -match '^[ \t]' -and $letzter) {
            $kopf[$letzter] += ' ' + $zeile.Trim()            # Faltung aufloesen
            continue
        }
        if ($zeile -match '^([A-Za-z0-9\-]+):\s*(.*)$') {
            $letzter = $matches[1].ToLowerInvariant()
            if (-not $kopf.ContainsKey($letzter)) { $kopf[$letzter] = $matches[2] }
        }
    }

    $von = if ($kopf.ContainsKey('from')) { $kopf['from'] } else { '' }
    $adresse = if ($von -match '<([^>]+)>') { $matches[1] } else { ($von -replace '"', '').Trim() }

    $empfangen = Get-Date
    if ($kopf.ContainsKey('date')) {
        try { $empfangen = [DateTimeOffset]::Parse($kopf['date']).UtcDateTime } catch { }
    }

    $mid = ''
    if ($kopf.ContainsKey('message-id')) { $mid = $kopf['message-id'].Trim() }
    $betreff = ''
    if ($kopf.ContainsKey('subject')) { $betreff = ConvertFrom-Rfc2047 $kopf['subject'] }

    [pscustomobject]@{
        InternetMessageId = $mid
        RestId            = ''
        Subject           = $betreff
        FromAddress       = $adresse
        ReceivedAt        = $empfangen
        DeeplinkUrl       = ''
        Anhaenge          = @()
        Quelle            = 'eml'
    }
}

function Get-MailAusMsg {
    param([string]$Pfad)

    $outlook = $null
    $item = $null
    try {
        $outlook = New-Object -ComObject Outlook.Application
        $item = $outlook.Session.OpenSharedItem($Pfad)

        # PR_INTERNET_MESSAGE_ID - ohne das gibt es keine Idempotenz
        $mid = ''
        try {
            $mid = $item.PropertyAccessor.GetProperty(
                'http://schemas.microsoft.com/mapi/proptag/0x1035001F')
        } catch { }

        $absender = ''
        try {
            $absender = $item.SenderEmailAddress
            # Bei internen Mails steht hier ein X.500-Pfad statt SMTP
            if ($absender -like '/O=*') {
                $absender = $item.PropertyAccessor.GetProperty(
                    'http://schemas.microsoft.com/mapi/proptag/0x5D01001F')
            }
        } catch { }

        $anhaenge = @()
        $tempWurzel = Join-Path $env:TEMP ("pm-maildrop-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempWurzel -Force | Out-Null
        for ($i = 1; $i -le $item.Attachments.Count; $i++) {
            $a = $item.Attachments.Item($i)
            try {
                $ziel = Join-Path $tempWurzel $a.FileName
                $a.SaveAsFile($ziel)
                $anhaenge += [pscustomobject]@{
                    Dateiname = $a.FileName
                    Pfad      = $ziel
                    Groesse   = (Get-Item $ziel).Length
                }
            } catch { }
        }

        [pscustomobject]@{
            InternetMessageId = $mid
            RestId            = ''
            Subject           = $item.Subject
            FromAddress       = $absender
            ReceivedAt        = $item.ReceivedTime.ToUniversalTime()
            DeeplinkUrl       = ''
            Anhaenge          = $anhaenge
            Quelle            = 'msg'
        }
    } finally {
        if ($item)    { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
        if ($outlook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) }
    }
}

function Get-MailAusDatei {
    param([string]$Pfad)
    switch ([IO.Path]::GetExtension($Pfad).ToLowerInvariant()) {
        '.msg' { return Get-MailAusMsg -Pfad $Pfad }
        '.eml' { return Get-MailAusEml -Pfad $Pfad }
        default { throw "Nicht unterstuetzt: $([IO.Path]::GetFileName($Pfad)). Erwartet werden .msg oder .eml." }
    }
}

<# Klassisches Outlook liefert die Mail als Datenstrom statt als Datei.
   Wir schreiben sie in den Temp-Ordner und behandeln sie dann wie eine .msg. #>
function Save-DropAlsDatei {
    param([Windows.Forms.IDataObject]$Daten)

    if (-not $Daten.GetDataPresent('FileGroupDescriptorW')) { return $null }

    $beschreibung = $Daten.GetData('FileGroupDescriptorW')
    if (-not $beschreibung) { return $null }

    # FILEGROUPDESCRIPTORW: UInt32 Anzahl, dann FILEDESCRIPTORW a 592 Byte,
    # der Dateiname steht ab Offset 72 als 260 WCHAR.
    $puffer = New-Object byte[] $beschreibung.Length
    [void]$beschreibung.Read($puffer, 0, $puffer.Length)
    $name = [Text.Encoding]::Unicode.GetString($puffer, 4 + 72, 520).TrimEnd([char]0)
    if ([string]::IsNullOrWhiteSpace($name)) { $name = 'mail.msg' }

    $inhalt = $null
    foreach ($format in 'FileContents', 'FileContentsW') {
        try { $inhalt = $Daten.GetData($format) } catch { }
        if ($inhalt) { break }
    }
    if (-not $inhalt) { return $null }

    $ordner = Join-Path $env:TEMP ("pm-maildrop-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $ordner -Force | Out-Null
    $ziel = Join-Path $ordner $name

    $inhalt.Position = 0
    $dateiPuffer = New-Object byte[] $inhalt.Length
    [void]$inhalt.Read($dateiPuffer, 0, $dateiPuffer.Length)
    [IO.File]::WriteAllBytes($ziel, $dateiPuffer)
    return $ziel
}

# ===========================================================================
# Meldungen
# ===========================================================================

<# Schreibt ins Statusfeld, sobald es existiert - davor (und im Test ohne
   Oberflaeche) in den Ausgabestrom. So haengt die API-Schicht nicht an der UI. #>
function Melde {
    param([string]$Text)
    $zeile = (Get-Date -Format 'HH:mm:ss') + '  ' + $Text
    $feld = Get-Variable -Name status -Scope Script -ErrorAction SilentlyContinue
    if (-not $feld -or -not $feld.Value) {
        Write-Output $zeile
        return
    }
    $feld.Value.AppendText($zeile + "`r`n")
    $feld.Value.SelectionStart = $feld.Value.TextLength
    $feld.Value.ScrollToCaret()
    [Windows.Forms.Application]::DoEvents()
}

# ===========================================================================
# API
# ===========================================================================

function Invoke-Pm {
    # $args ist eine automatische Variable - der Splat-Hash heisst deshalb anders.
    param([string]$Pfad, [string]$Methode = 'Get', $Rumpf)
    $anfrage = @{ Uri = "$BaseUrl$Pfad"; Method = $Methode; TimeoutSec = 60 }
    if ($Rumpf) {
        $anfrage.ContentType = 'application/json; charset=utf-8'
        $anfrage.Body = [Text.Encoding]::UTF8.GetBytes(($Rumpf | ConvertTo-Json -Depth 8))
    }
    return Invoke-RestMethod @anfrage
}

function Get-Projekte {
    param([string]$Suche = '')
    $pfad = '/api/addin/projects'
    if ($Suche) { $pfad += '?q=' + [Uri]::EscapeDataString($Suche) }
    return (Invoke-Pm -Pfad $pfad).projects
}

function ConvertTo-MailRumpf {
    param($Mail)
    @{
        internetMessageId = $Mail.InternetMessageId
        restId            = $Mail.RestId
        subject           = $Mail.Subject
        fromAddress       = $Mail.FromAddress
        receivedAt        = $Mail.ReceivedAt.ToString('o')
        deeplinkUrl       = $Mail.DeeplinkUrl
    }
}

function Send-Anhaenge {
    param($Mail, [string]$ProjektId, [bool]$NurPdf)
    $zahl = 0
    foreach ($a in @($Mail.Anhaenge)) {
        if ($NurPdf -and $a.Dateiname -notmatch '\.pdf$') { continue }
        try {
            $bytes = [IO.File]::ReadAllBytes($a.Pfad)
            $typ = 'application/octet-stream'
            if ($a.Dateiname -match '\.pdf$') { $typ = 'application/pdf' }
            Invoke-Pm -Pfad '/api/addin/attachment' -Methode Post -Rumpf @{
                projectId     = $ProjektId
                filename      = $a.Dateiname
                mime          = $typ
                contentBase64 = [Convert]::ToBase64String($bytes)
            } | Out-Null
            $zahl++
            Melde "Anhang uebernommen: $($a.Dateiname)"
        } catch {
            Melde "Anhang fehlgeschlagen: $($a.Dateiname) - $($_.Exception.Message)"
        }
    }
    return $zahl
}

function Get-KundeAusAdresse {
    param([string]$Adresse)
    if (-not $Adresse -or $Adresse -notmatch '@') { return '' }
    $domain = ($Adresse -split '@')[1].ToLowerInvariant().Trim()
    $freemail = @('gmail.com','googlemail.com','outlook.com','hotmail.com','hotmail.de',
                  'live.com','web.de','gmx.de','gmx.net','t-online.de','yahoo.com',
                  'yahoo.de','icloud.com','me.com')
    if ($freemail -contains $domain) { return '' }
    $teil = ($domain -split '\.')[0]
    if (-not $teil) { return '' }
    return $teil.Substring(0,1).ToUpperInvariant() + $teil.Substring(1)
}

# ===========================================================================
# Oberflaeche
# ===========================================================================

$global:AktuelleMail = $null

$form = New-Object Windows.Forms.Form
$form.Text = 'Projektmanager MailDrop'
$form.Size = New-Object Drawing.Size(460, 560)
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = New-Object Drawing.Size(420, 480)
$form.BackColor = [Drawing.Color]::White

$ablage = New-Object Windows.Forms.Panel
$ablage.Location = New-Object Drawing.Point(12, 12)
$ablage.Size = New-Object Drawing.Size(420, 96)
$ablage.Anchor = 'Top,Left,Right'
$ablage.BackColor = [Drawing.Color]::FromArgb(241, 245, 249)
$ablage.AllowDrop = $true

$ablageText = New-Object Windows.Forms.Label
$ablageText.Text = "Mail hier ablegen`r`n(.msg oder .eml, oder direkt aus Outlook ziehen)"
$ablageText.Dock = 'Fill'
$ablageText.TextAlign = 'MiddleCenter'
$ablageText.Font = New-Object Drawing.Font('Segoe UI', 9.5)
$ablageText.ForeColor = [Drawing.Color]::FromArgb(71, 85, 105)
$ablage.Controls.Add($ablageText)
$form.Controls.Add($ablage)

$mailInfo = New-Object Windows.Forms.Label
$mailInfo.Location = New-Object Drawing.Point(12, 116)
$mailInfo.Size = New-Object Drawing.Size(420, 58)
$mailInfo.Anchor = 'Top,Left,Right'
$mailInfo.Font = New-Object Drawing.Font('Segoe UI', 9)
$mailInfo.ForeColor = [Drawing.Color]::FromArgb(30, 41, 59)
$mailInfo.Text = 'Noch keine Mail geladen.'
$form.Controls.Add($mailInfo)

$sucheLabel = New-Object Windows.Forms.Label
$sucheLabel.Text = 'Projekt suchen'
$sucheLabel.Location = New-Object Drawing.Point(12, 182)
$sucheLabel.Size = New-Object Drawing.Size(200, 18)
$sucheLabel.Font = New-Object Drawing.Font('Segoe UI', 8.5)
$form.Controls.Add($sucheLabel)

$sucheFeld = New-Object Windows.Forms.TextBox
$sucheFeld.Location = New-Object Drawing.Point(12, 202)
$sucheFeld.Size = New-Object Drawing.Size(320, 24)
$sucheFeld.Anchor = 'Top,Left,Right'
$form.Controls.Add($sucheFeld)

$sucheKnopf = New-Object Windows.Forms.Button
$sucheKnopf.Text = 'Suchen'
$sucheKnopf.Location = New-Object Drawing.Point(340, 201)
$sucheKnopf.Size = New-Object Drawing.Size(92, 26)
$sucheKnopf.Anchor = 'Top,Right'
$form.Controls.Add($sucheKnopf)

$liste = New-Object Windows.Forms.ListBox
$liste.Location = New-Object Drawing.Point(12, 234)
$liste.Size = New-Object Drawing.Size(420, 150)
$liste.Anchor = 'Top,Bottom,Left,Right'
$liste.Font = New-Object Drawing.Font('Segoe UI', 9)
$form.Controls.Add($liste)

$nurPdf = New-Object Windows.Forms.CheckBox
$nurPdf.Text = 'Nur PDF-Anhaenge uebernehmen'
$nurPdf.Location = New-Object Drawing.Point(12, 392)
$nurPdf.Size = New-Object Drawing.Size(420, 22)
$nurPdf.Anchor = 'Bottom,Left'
$nurPdf.Checked = $true
$form.Controls.Add($nurPdf)

$anheften = New-Object Windows.Forms.Button
$anheften.Text = 'An Projekt anheften'
$anheften.Location = New-Object Drawing.Point(12, 418)
$anheften.Size = New-Object Drawing.Size(200, 34)
$anheften.Anchor = 'Bottom,Left'
$anheften.Enabled = $false
$form.Controls.Add($anheften)

$neuesProjekt = New-Object Windows.Forms.Button
$neuesProjekt.Text = 'Neues Projekt daraus'
$neuesProjekt.Location = New-Object Drawing.Point(232, 418)
$neuesProjekt.Size = New-Object Drawing.Size(200, 34)
$neuesProjekt.Anchor = 'Bottom,Right'
$neuesProjekt.Enabled = $false
$form.Controls.Add($neuesProjekt)

$status = New-Object Windows.Forms.TextBox
$status.Location = New-Object Drawing.Point(12, 458)
$status.Size = New-Object Drawing.Size(420, 56)
$status.Anchor = 'Bottom,Left,Right'
$status.Multiline = $true
$status.ReadOnly = $true
$status.ScrollBars = 'Vertical'
$status.BackColor = [Drawing.Color]::FromArgb(248, 250, 252)
$form.Controls.Add($status)

# Melde ist weiter oben definiert und schreibt ab hier ins Statusfeld.

# WinForms kommt mit DisplayMember auf PSObjects nicht zuverlaessig klar.
# Deshalb stehen im ListBox nur Zeichenketten, die Ids parallel dazu.
$global:ProjektIds = @()

function Lade-Projekte {
    param([string]$Suche = '')
    try {
        $liste.Items.Clear()
        $global:ProjektIds = @()
        $projekte = @(Get-Projekte -Suche $Suche)
        if ($projekte.Count -eq 0) { Melde 'Keine Projekte gefunden.'; return }
        foreach ($p in $projekte) {
            [void]$liste.Items.Add("$($p.name)  -  $($p.customer)  [$($p.status)]")
            $global:ProjektIds += $p.id
        }
        Melde "$($projekte.Count) Projekt(e) geladen."
    } catch {
        Melde "Projekte laden fehlgeschlagen: $($_.Exception.Message)"
    }
}

function Get-GewaehltesProjekt {
    if ($liste.SelectedIndex -lt 0) { return $null }
    return $global:ProjektIds[$liste.SelectedIndex]
}

function Setze-Mail {
    param($Mail)
    if (-not $Mail.InternetMessageId) {
        Melde 'WARNUNG: keine internetMessageId gefunden - die Idempotenz greift dann nicht.'
    }
    $global:AktuelleMail = $Mail
    $anzahlAnhaenge = @($Mail.Anhaenge).Count
    $mailInfo.Text = "Betreff: $($Mail.Subject)`r`nVon: $($Mail.FromAddress)`r`n" +
                     "Empfangen: $($Mail.ReceivedAt.ToLocalTime().ToString('dd.MM.yyyy HH:mm'))  |  Anhaenge: $anzahlAnhaenge  |  Quelle: $($Mail.Quelle)"
    $anheften.Enabled = $true
    $neuesProjekt.Enabled = $true
    Melde "Mail geladen: $($Mail.Subject)"
    if ($Mail.Quelle -eq 'eml' -and $anzahlAnhaenge -eq 0) {
        Melde 'Hinweis: aus .eml liest diese Fassung keine Anhaenge.'
    }
    # Suchvorschlag aus der Absenderdomain
    $kunde = Get-KundeAusAdresse $Mail.FromAddress
    if ($kunde) { $sucheFeld.Text = $kunde; Lade-Projekte -Suche $kunde } else { Lade-Projekte }
}

# --- Drag and Drop ---------------------------------------------------------

$ablage.Add_DragEnter({
    param($absender, $e)
    if ($e.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop) -or
        $e.Data.GetDataPresent('FileGroupDescriptorW')) {
        $e.Effect = [Windows.Forms.DragDropEffects]::Copy
        $ablage.BackColor = [Drawing.Color]::FromArgb(219, 234, 254)
    } else {
        $e.Effect = [Windows.Forms.DragDropEffects]::None
    }
})
$ablage.Add_DragLeave({ $ablage.BackColor = [Drawing.Color]::FromArgb(241, 245, 249) })

$ablage.Add_DragDrop({
    param($absender, $e)
    $ablage.BackColor = [Drawing.Color]::FromArgb(241, 245, 249)
    try {
        $pfad = $null
        if ($e.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) {
            $dateien = @($e.Data.GetData([Windows.Forms.DataFormats]::FileDrop))
            if ($dateien.Count -gt 1) { Melde "Mehrere Dateien - es wird nur die erste verarbeitet." }
            $pfad = $dateien[0]
        } else {
            $pfad = Save-DropAlsDatei -Daten $e.Data
            if (-not $pfad) {
                Melde 'Dieser Ziehvorgang liefert keine Datei. Bitte die Mail erst in einen Ordner ziehen und die Datei dann hier ablegen.'
                return
            }
        }
        Melde "Verarbeite: $([IO.Path]::GetFileName($pfad))"
        Setze-Mail (Get-MailAusDatei -Pfad $pfad)
    } catch {
        Melde "Fehler: $($_.Exception.Message)"
    }
})

# --- Knoepfe ---------------------------------------------------------------

$sucheKnopf.Add_Click({ Lade-Projekte -Suche $sucheFeld.Text })
$sucheFeld.Add_KeyDown({
    param($absender, $e)
    if ($e.KeyCode -eq 'Enter') { $e.SuppressKeyPress = $true; Lade-Projekte -Suche $sucheFeld.Text }
})

$anheften.Add_Click({
    if (-not $global:AktuelleMail) { return }
    $projektId = Get-GewaehltesProjekt
    if (-not $projektId) { Melde 'Bitte zuerst ein Projekt auswaehlen.'; return }
    $form.Cursor = [Windows.Forms.Cursors]::WaitCursor
    try {
        $antwort = Invoke-Pm -Pfad '/api/addin/link-mail' -Methode Post -Rumpf @{
            projectId = $projektId
            mail      = ConvertTo-MailRumpf $global:AktuelleMail
        }
        if ($antwort.alreadyLinked) {
            Melde "Bereits verknuepft - kein Duplikat angelegt ($($antwort.projectName))."
        } elseif ($antwort.movedFromProjectId) {
            Melde "Mail von einem anderen Projekt hierher verschoben ($($antwort.projectName))."
        } else {
            Melde "Angeheftet an: $($antwort.projectName)"
        }
        $zahl = Send-Anhaenge -Mail $global:AktuelleMail -ProjektId $projektId -NurPdf $nurPdf.Checked
        Melde "Fertig. $zahl Anhang/Anhaenge uebernommen."
    } catch {
        Melde "Anheften fehlgeschlagen: $($_.Exception.Message)"
    } finally {
        $form.Cursor = [Windows.Forms.Cursors]::Default
    }
})

$neuesProjekt.Add_Click({
    if (-not $global:AktuelleMail) { return }
    $mail = $global:AktuelleMail
    $vorschlagName = if ($mail.Subject) { $mail.Subject } else { 'Projekt aus Mail' }
    $vorschlagKunde = Get-KundeAusAdresse $mail.FromAddress

    Add-Type -AssemblyName Microsoft.VisualBasic
    $name = [Microsoft.VisualBasic.Interaction]::InputBox('Projektname', 'Neues Projekt', $vorschlagName)
    if (-not $name) { return }
    $kunde = [Microsoft.VisualBasic.Interaction]::InputBox('Kunde', 'Neues Projekt', $vorschlagKunde)
    if (-not $kunde) { Melde 'Kunde darf nicht leer sein.'; return }

    $form.Cursor = [Windows.Forms.Cursors]::WaitCursor
    try {
        $antwort = Invoke-Pm -Pfad '/api/addin/project-from-mail' -Methode Post -Rumpf @{
            project = @{ name = $name; customer = $kunde; status = 'NEU'; priority = 'NORMAL'; templateId = ''; tagIds = @() }
            mail    = ConvertTo-MailRumpf $mail
        }
        Melde "Projekt angelegt: $($antwort.projectName)"
        $zahl = Send-Anhaenge -Mail $mail -ProjektId $antwort.projectId -NurPdf $nurPdf.Checked
        Melde "Fertig. $zahl Anhang/Anhaenge uebernommen."
        Lade-Projekte -Suche $kunde
    } catch {
        Melde "Anlegen fehlgeschlagen: $($_.Exception.Message)"
    } finally {
        $form.Cursor = [Windows.Forms.Cursors]::Default
    }
})

# --- Start -----------------------------------------------------------------

$form.Add_Shown({
    Melde "Verbunden mit $BaseUrl"
    try {
        [void](Invoke-Pm -Pfad '/api/addin/projects')
        Lade-Projekte
    } catch {
        Melde "Keine Verbindung zu $BaseUrl - laeuft der Stack? ($($_.Exception.Message))"
    }
})

[void]$form.ShowDialog()
