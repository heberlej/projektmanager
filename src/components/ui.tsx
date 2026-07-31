import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Kleine, abhaengigkeitsfreie UI-Primitive im Stil von shadcn/ui, aber ohne
 * Radix - fuer den Umfang dieser App reicht natives HTML.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // Akzent-Token statt bg-blue-600: bleibt im dunklen Schema Blau (globals.css).
  primary: "bg-akzent text-akzent-auf hover:bg-akzent-stark",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-white text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      {...props}
    />
  );
}

const FIELD =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "min-h-20 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, "pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1 block text-xs font-medium text-slate-600", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-slate-200 px-4 py-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold text-slate-900", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
