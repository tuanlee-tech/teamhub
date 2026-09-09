type FeedbackProps = {
  error?: string | null;
  success?: string | null;
  className?: string;
};

export function Feedback({ error, success, className = "" }: FeedbackProps) {
  if (!error && !success) return null;
  return (
    <p
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        error ? "bg-red-950/40 text-red-300" : "bg-emerald-950/40 text-emerald-300"
      } ${className}`}
      aria-live="polite"
    >
      {error ?? success}
    </p>
  );
}
