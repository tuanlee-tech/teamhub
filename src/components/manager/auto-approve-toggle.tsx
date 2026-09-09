"use client";

import { startTransition, useActionState, useState } from "react";

import { setAutoApprove } from "@/app/manager/actions";
import { Feedback, Toggle } from "@/components/ui";

export function AutoApproveToggle({ enabled }: { enabled: boolean }) {
  const [state, action, isPending] = useActionState(
    async (_previous: { error?: string; success?: string } | null, next: boolean) => {
      return await setAutoApprove(next);
    },
    null,
  );
  const [checked, setChecked] = useState(enabled);

  return (
    <div className="space-y-3">
      <Toggle
        label="Tự động duyệt thành viên mới"
        description={
          checked
            ? "Đăng ký mới được kích hoạt ngay, không cần manager duyệt."
            : "Mặc định tắt — đăng ký mới chờ manager duyệt."
        }
        checked={checked}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          startTransition(() => action(next));
        }}
      />
      <Feedback error={state?.error} success={state?.success} />
    </div>
  );
}