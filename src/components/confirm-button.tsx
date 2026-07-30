"use client";

import * as React from "react";
import { Button } from "./ui";

/**
 * Absenden-Knopf mit Rückfrage - für alles, was Daten entfernt.
 * Ohne JavaScript wird das Formular direkt abgeschickt.
 */
export function ConfirmButton({
  message,
  children,
  variant = "danger",
  size = "sm",
  className,
}: {
  message: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
