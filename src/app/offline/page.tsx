import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="paper-panel max-w-lg p-8 text-center sm:p-12">
        <span className="stamp text-[var(--signal)]">Ngoại tuyến</span>
        <h1 className="display-type mt-7 text-5xl">Mất kết nối rồi</h1>
        <p className="mt-5 leading-relaxed text-[var(--ink-soft)]">
          Điểm danh và các thao tác quỹ cần kết nối mạng để lấy thời gian từ server.
        </p>
        <Link className="primary-action mt-8" href="/">
          Thử kết nối lại
        </Link>
      </section>
    </main>
  );
}
