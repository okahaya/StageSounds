import { useEffect } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

export interface ToastState {
  type: "success" | "error";
  message: string;
}

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-md border bg-stage-surface px-4 py-2.5 text-sm shadow-xl ${
          isSuccess ? "border-stage-border" : "border-stage-danger/50"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 size={16} className="text-stage-accent" />
        ) : (
          <XCircle size={16} className="text-stage-danger" />
        )}
        <span className="text-stage-fg">{toast.message}</span>
        <button onClick={onDismiss} className="ml-1 text-stage-muted hover:text-stage-fg" title="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
