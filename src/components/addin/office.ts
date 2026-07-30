/**
 * Schlanker Zugriff auf Office.js. Bewusst ohne @types/office-js - es wird nur
 * ein sehr kleiner Ausschnitt der API benutzt.
 */

const OFFICE_JS = "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Office?: any;
  }
}

export type MailData = {
  internetMessageId: string;
  restId: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  receivedAt: string;
  deeplinkUrl: string;
};

export type MailAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

let officePromise: Promise<any> | null = null;

/** Laedt office.js einmalig und wartet auf Office.onReady. */
export function loadOffice(): Promise<any> {
  if (officePromise) return officePromise;

  officePromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Nur im Browser verfuegbar"));
      return;
    }

    const ready = () => {
      if (!window.Office?.onReady) {
        reject(new Error("Office.js geladen, aber Office ist nicht verfuegbar"));
        return;
      }
      window.Office.onReady(() => resolve(window.Office));
    };

    if (window.Office?.onReady) {
      ready();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OFFICE_JS}"]`);
    if (existing) {
      existing.addEventListener("load", ready);
      existing.addEventListener("error", () => reject(new Error("Office.js konnte nicht geladen werden")));
      return;
    }

    const script = document.createElement("script");
    script.src = OFFICE_JS;
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("Office.js konnte nicht geladen werden"));
    document.head.appendChild(script);
  });

  return officePromise;
}

/** Liest die geoeffnete Mail aus. Erfordert Lesemodus. */
export function readMail(Office: any): MailData {
  const item = Office?.context?.mailbox?.item;
  if (!item) throw new Error("Keine Mail geöffnet");
  if (!item.internetMessageId) {
    throw new Error("Diese Ansicht liefert keine Nachrichtenkennung – bitte eine empfangene Mail öffnen.");
  }

  let restId = "";
  let deeplinkUrl = "";
  try {
    if (item.itemId) {
      restId = Office.context.mailbox.convertToRestId(
        item.itemId,
        Office.MailboxEnums.RestVersion.v2_0,
      );
      deeplinkUrl = `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(restId)}`;
    }
  } catch {
    // Ohne REST-ID gibt es eben keinen Ruecksprung-Link.
  }

  const received: Date = item.dateTimeCreated ?? new Date();

  return {
    internetMessageId: String(item.internetMessageId),
    restId,
    subject: item.subject ?? "",
    fromAddress: item.from?.emailAddress ?? item.sender?.emailAddress ?? "",
    fromName: item.from?.displayName ?? item.sender?.displayName ?? "",
    receivedAt: new Date(received).toISOString(),
    deeplinkUrl,
  };
}

/** Echte Dateianhaenge der geoeffneten Mail, ohne eingebettete Bilder. */
export function readAttachments(Office: any): MailAttachment[] {
  const item = Office?.context?.mailbox?.item;
  const list: any[] = item?.attachments ?? [];
  return list
    .filter((a) => !a.isInline && a.attachmentType !== "item")
    .map((a) => ({
      id: a.id,
      name: a.name ?? "anhang",
      contentType: a.contentType ?? "application/octet-stream",
      size: a.size ?? 0,
    }));
}

/** Holt einen Anhang als Base64 - genau das Format, das die API erwartet. */
export function getAttachmentBase64(Office: any, attachmentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Office.context.mailbox.item.getAttachmentContentAsync(attachmentId, (result: any) => {
      if (result.status !== "succeeded") {
        reject(new Error(result.error?.message ?? "Anhang konnte nicht gelesen werden"));
        return;
      }
      const value = result.value;
      if (value?.format !== Office.MailboxEnums.AttachmentContentFormat.Base64) {
        reject(new Error(`Anhangsformat ${value?.format} wird nicht unterstützt`));
        return;
      }
      resolve(value.content as string);
    });
  });
}
