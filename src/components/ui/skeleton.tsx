type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-xl bg-[var(--paper-deep)] ${className}`} />;
}

export function SkeletonPanel({ className = "", children }: SkeletonProps & { children?: React.ReactNode }) {
  return <div className={`paper-panel animate-pulse p-5 ${className}`}>{children}</div>;
}

export function PageSkeleton({ variant = "main" }: { variant?: "main" | "module" | "kiosk" | "auth" }) {
  if (variant === "module") {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-5 py-6 sm:px-8 lg:px-12 lg:py-10" aria-busy="true" aria-label="Đang tải">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-5">
          <Skeleton className="h-9 w-32" />
          <div className="flex gap-4"><Skeleton className="h-7 w-20 rounded-full" /><Skeleton className="h-10 w-24" /></div>
        </div>
        <div className="grid gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
          <div className="space-y-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-16 w-4/5 sm:h-24" /><Skeleton className="h-5 w-full max-w-xl" /><Skeleton className="h-5 w-2/3 max-w-xl" /></div>
          <SkeletonPanel className="min-h-[24rem]" />
        </div>
      </main>
    );
  }

  if (variant === "kiosk") {
    return (
      <div className="min-h-dvh bg-[var(--paper)]" aria-busy="true" aria-label="Đang tải kiosk">
        <header className="border-b border-[var(--line)] bg-[var(--white)]"><div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4"><Skeleton className="h-9 w-32" /><div className="flex gap-2"><Skeleton className="size-9 rounded-full" /><Skeleton className="size-9 rounded-full" /></div></div></header>
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6"><Skeleton className="h-12 w-64" /><div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]"><SkeletonPanel className="min-h-[36rem]" /><SkeletonPanel className="min-h-[24rem]" /></div></main>
      </div>
    );
  }

  if (variant === "auth") {
    return <main className="grid min-h-dvh place-items-center bg-[var(--paper)] px-5 py-10" aria-busy="true" aria-label="Đang tải"><SkeletonPanel className="w-full max-w-md space-y-5"><Skeleton className="mx-auto h-10 w-40" /><Skeleton className="h-10 w-3/4" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></SkeletonPanel></main>;
  }

  return <div className="space-y-6" aria-busy="true" aria-label="Đang tải"><section className="space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-48" /></section><SkeletonPanel className="min-h-[22rem]" /></div>;
}
