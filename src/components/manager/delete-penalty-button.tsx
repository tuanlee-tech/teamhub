"use client";

import { useActionState, useState } from "react";

import { deletePenaltyTier, type ManagerActionState } from "@/app/manager/actions";
import { Feedback, Modal, SecondaryButton, useToast } from "@/components/ui";

export function DeletePenaltyButton({ tierId }: { tierId: string }) {
  const [open, setOpen] = useState(false);
  const { success } = useToast();
  const [state, action, pending] = useActionState(async (_previousState: ManagerActionState, formData: FormData) => {
    const nextState = await deletePenaltyTier(formData);
    if (nextState.success) {
      success(nextState.success);
      setOpen(false);
    }
    return nextState;
  }, {} as ManagerActionState);

  return (
    <>
      <SecondaryButton onClick={() => setOpen(true)} type="button" variant="destructive">Xóa</SecondaryButton>
      <Modal
        description="Thao tác này sẽ xóa khung phạt khỏi các lần chấm công đang mở."
        onClose={() => setOpen(false)}
        open={open}
        title="Xóa khung phạt?"
      >
        <form action={action} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-end sm:p-8">
          <input name="tierId" type="hidden" value={tierId} />
          <Feedback className="order-first sm:order-none sm:mr-auto" error={state.error} />
          <SecondaryButton className="h-10 min-h-10 min-w-24 py-0" disabled={pending} onClick={() => setOpen(false)} type="button">Hủy</SecondaryButton>
          <SecondaryButton className="h-10 min-h-10 min-w-48 py-0 sm:max-w-xs" disabled={pending} type="submit" variant="destructive">{pending ? "Đang xóa..." : "Xóa khung phạt"}</SecondaryButton>
        </form>
      </Modal>
    </>
  );
}
