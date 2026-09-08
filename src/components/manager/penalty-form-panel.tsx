"use client";

import { useState } from "react";

import { PenaltyForm } from "@/components/manager/penalty-form";
import { CloseButton, Modal, PrimaryButton, SecondaryButton } from "@/components/ui";

type PenaltyFormPanelProps = {
  tierId?: string;
  initialThresholdMinutes?: number;
  initialAmountVnd?: number;
  mode?: "create" | "edit";
  tourTarget?: string;
};

export function PenaltyFormPanel({
  tierId,
  initialThresholdMinutes,
  initialAmountVnd,
  mode = "create",
  tourTarget,
}: PenaltyFormPanelProps) {
  const [open, setOpen] = useState(false);
  const isEdit = mode === "edit";

  return (
    <div className={isEdit ? "relative" : ""}>
      <div className={isEdit ? "" : "flex items-center justify-between gap-4"}>
        {!isEdit ? (
          <div>
            <p className="font-bold">Thiết lập khung phạt</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]" data-tour="penalties-threshold">Thêm mốc phút trễ và số tiền áp dụng.</p>
          </div>
        ) : null}
        {isEdit ? (
          <SecondaryButton onClick={() => setOpen(true)} type="button">Sửa</SecondaryButton>
        ) : open ? (
          <CloseButton aria-label="Đóng form" onClick={() => setOpen(false)} />
        ) : (
          <PrimaryButton data-tour={tourTarget} fullWidth={false} onClick={() => setOpen(true)} type="button">
            <span aria-hidden="true" className="mr-1 text-lg leading-none">+</span>
            Thêm khung phạt
          </PrimaryButton>
        )}
      </div>
      {open && isEdit
        ? <Modal
            description="Cập nhật mốc thời gian và số tiền áp dụng."
            eyebrow="Chỉnh sửa"
            onClose={() => setOpen(false)}
            open={open}
            title="Khung phạt"
          >
            <PenaltyForm
              initialAmountVnd={initialAmountVnd}
              initialThresholdMinutes={initialThresholdMinutes}
              onSuccess={() => setOpen(false)}
              tierId={tierId}
            />
          </Modal>
        : open ? (
          <div className="mt-4 overflow-hidden">
            <PenaltyForm />
          </div>
        ) : null}
    </div>
  );
}
