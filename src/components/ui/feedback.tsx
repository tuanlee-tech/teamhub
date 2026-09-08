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
        error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
      } ${className}`}
      aria-live="polite"
    >
      {error ?? success}
    </p>
  );
}
