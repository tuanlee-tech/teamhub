"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { Stamp } from "@/components/ui";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfilePanel({
  displayName,
  username,
  avatarUrl,
  organizationName,
  role,
  status,
  approvedAt,
  isManager,
}: {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  organizationName: string;
  role: string;
  status: string;
  approvedAt: string | null;
  isManager: boolean;
}) {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">
          Cá nhân
        </p>
        <h1 className="display-type mt-1 text-3xl">Tài khoản của tôi</h1>
      </section>

      <section className="paper-panel space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-[var(--signal)] text-lg font-black text-[var(--white)]">
              {initials(displayName)}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="display-type truncate text-2xl">{displayName}</h2>
            <p className="truncate text-sm text-[var(--ink-soft)]">@{username ?? "chưa đặt tên"}</p>
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <dt className="text-[var(--ink-soft)]">Tổ chức</dt>
            <dd className="font-bold">{organizationName}</dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <dt className="text-[var(--ink-soft)]">Vai trò</dt>
            <dd className="flex items-center gap-2 pt-1">
              <Stamp variant="muted">{role}</Stamp>
              <Stamp variant="success">Hoạt động</Stamp>
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <dt className="text-[var(--ink-soft)]">Trạng thái</dt>
            <dd className="font-bold capitalize">{status}</dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <dt className="text-[var(--ink-soft)]">Tham gia nhóm</dt>
            <dd className="font-bold">
              {approvedAt ? new Date(approvedAt).toLocaleDateString("vi-VN") : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {isManager ? (
        <Link
          href="/manager"
          className="paper-panel flex items-center justify-between gap-3 p-5 transition active:translate-y-px"
        >
          <div className="flex items-center gap-3">
            <Settings className="size-5 text-[var(--signal)]" />
            <div>
              <p className="font-black">Quản lý tổ chức</p>
              <p className="text-sm text-[var(--ink-soft)]">Thành viên, ngày công, quỹ, cài đặt.</p>
            </div>
          </div>
          <span className="font-bold text-[var(--signal)]">→</span>
        </Link>
      ) : null}

      <form action={signOut}>
        <button
          type="submit"
          className="paper-panel flex w-full items-center gap-3 p-5 text-left transition active:translate-y-px"
        >
          <LogOut className="size-5 text-[var(--signal)]" />
          <div>
            <p className="font-black text-[var(--signal)]">Đăng xuất</p>
            <p className="text-sm text-[var(--ink-soft)]">Đăng xuất khỏi thiết bị này.</p>
          </div>
        </button>
      </form>
    </div>
  );
}