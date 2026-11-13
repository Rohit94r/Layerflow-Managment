"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/format";
import type { ActionResult } from "@/server/action";
import { toast } from "./toaster";

type FormAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const PendingContext = createContext(false);

export function SubmitButton({ children, className, pendingLabel }: { children: React.ReactNode; className?: string; pendingLabel?: string }) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingContext);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" disabled={pending} className={cn("btn btn-primary", className)}>
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * Progressive-enhancement form bound to a server action. Shows field errors via
 * `aria-invalid` on matching inputs and a summary message.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  toastOnSuccess = true,
  onSuccess,
  id,
}: {
  action: FormAction;
  children: React.ReactNode | ((state: ActionResult | null) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  toastOnSuccess?: boolean;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
  id?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    const form = ref.current;
    form?.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    if (state.ok) {
      if (resetOnSuccess) form?.reset();
      if (toastOnSuccess && state.message) toast(state.message);
      onSuccess?.(state);
    } else if (state.fieldErrors && form) {
      for (const name of Object.keys(state.fieldErrors)) {
        form.querySelector(`[name="${CSS.escape(name)}"]`)?.setAttribute("aria-invalid", "true");
      }
    }
  }, [state, resetOnSuccess, toastOnSuccess, onSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      // Submit manually so React does not auto-reset the fields when validation fails.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className={className}
      id={id}
    >
      <PendingContext.Provider value={isPending}>{typeof children === "function" ? children(state) : children}</PendingContext.Provider>
      {state && !state.ok && (
        <p role="alert" className="mt-3 rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {state.error}
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 1 && (
            <span className="block text-[12px] opacity-80">
              {Object.entries(state.fieldErrors)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </span>
          )}
        </p>
      )}
    </form>
  );
}

/** Runs a server action from a click, with pending state and toasts. */
export function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const exec = (fn: () => Promise<ActionResult | undefined | void>, successMessage?: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) toast(r.error, "error");
        else {
          if (r && r.ok && r.message) toast(r.message);
          else if (successMessage) toast(successMessage);
          router.refresh();
        }
      } catch (e) {
        // Redirects thrown by server actions are handled by Next; anything else is unexpected.
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        toast("Something went wrong. Please try again.", "error");
      }
    });
  return { pending, exec };
}

/** A select that saves itself on change. */
export function InlineSelect({
  value,
  options,
  onSave,
  label: ariaLabel,
  className,
  disabled,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => Promise<ActionResult | undefined | void>;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending, exec } = useAction();
  const [current, setCurrent] = useState(value);
  // Reset the optimistic value when the server value changes (adjust state during render).
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setCurrent(value);
  }
  return (
    <select
      aria-label={ariaLabel}
      className={cn("input input-bare w-auto", pending && "opacity-60", className)}
      value={current}
      disabled={disabled || pending}
      onChange={(e) => {
        const v = e.target.value;
        setCurrent(v);
        exec(() => onSave(v));
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Two-step button for destructive or significant actions. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Click again to confirm",
  className = "btn btn-danger-outline btn-sm",
  successMessage,
}: {
  onConfirm: () => Promise<ActionResult | undefined | void>;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  successMessage?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending, exec } = useAction();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        exec(onConfirm, successMessage);
      }}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {armed ? confirmLabel : children}
    </button>
  );
}

export function ActionButton({
  onClick,
  children,
  className = "btn btn-secondary btn-sm",
  successMessage,
  title,
}: {
  onClick: () => Promise<ActionResult | undefined | void>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  title?: string;
}) {
  const { pending, exec } = useAction();
  return (
    <button type="button" title={title} aria-label={title} className={className} disabled={pending} onClick={() => exec(onClick, successMessage)}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input font-mono text-[12.5px]" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Opens children in a modal dialog. Uses the native <dialog> for focus trapping and Escape. */
export function Modal({
  trigger,
  title,
  children,
  triggerClassName = "btn btn-primary",
  wide,
}: {
  trigger: React.ReactNode;
  title: string;
  children: (close: () => void) => React.ReactNode;
  triggerClassName?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // The <dialog> element is an external system: drive it from state.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className={cn(
          "m-auto w-[calc(100%-2rem)] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        {open && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl">{title}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="Close">
                Esc
              </button>
            </div>
            {children(close)}
          </div>
        )}
      </dialog>
    </>
  );
}
