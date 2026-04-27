import { useEffect, useState } from 'react';

type Variant = 'error' | 'success' | 'warning' | 'info';

interface AlertBannerProps {
  message: string | null;
  variant?: Variant;
  /** ms antes de auto-desaparecer. 0 = nunca */
  autoDismiss?: number;
  onDismiss?: () => void;
}

const variants: Record<Variant, { bg: string; border: string; text: string; icon: JSX.Element }> = {
  error: {
    bg: 'bg-red-900/40',
    border: 'border-red-500/50',
    text: 'text-red-300',
    icon: (
      <svg className="shrink-0 w-4 h-4 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  success: {
    bg: 'bg-emerald-900/40',
    border: 'border-emerald-500/50',
    text: 'text-emerald-300',
    icon: (
      <svg className="shrink-0 w-4 h-4 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-amber-900/40',
    border: 'border-amber-500/50',
    text: 'text-amber-300',
    icon: (
      <svg className="shrink-0 w-4 h-4 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  info: {
    bg: 'bg-blue-900/40',
    border: 'border-blue-500/50',
    text: 'text-blue-300',
    icon: (
      <svg className="shrink-0 w-4 h-4 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
      </svg>
    ),
  },
};

export function AlertBanner({ message, variant = 'error', autoDismiss = 0, onDismiss }: AlertBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      if (autoDismiss > 0) {
        const t = setTimeout(() => { setVisible(false); onDismiss?.(); }, autoDismiss);
        return () => clearTimeout(t);
      }
    } else {
      setVisible(false);
    }
  }, [message, autoDismiss, onDismiss]);

  if (!message || !visible) return null;

  const v = variants[variant];

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 mb-4 text-sm transition-all animate-fade-in ${v.bg} ${v.border} ${v.text}`}
      role="alert"
    >
      {v.icon}
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={() => { setVisible(false); onDismiss?.(); }}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Cerrar"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
