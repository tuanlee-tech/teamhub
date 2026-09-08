"use client";

import { useActionState, useRef, useState } from "react";

import { upsertPenaltyTier, type ManagerActionState } from "@/app/manager/actions";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/currency";
import { Feedback, FormInput, FormLabel, PrimaryButton, useToast } from "@/components/ui";

export function PenaltyForm({ tierId, initialThresholdMinutes, initialAmountVnd, onSuccess }: {
  tierId?: string;
  initialThresholdMinutes?: number;
  initialAmountVnd?: number;
  onSuccess?: () => void;
}) {
  const { success } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [amountDisplay, setAmountDisplay] = useState(
    initialAmountVnd !== undefined ? formatCurrencyInput(String(initialAmountVnd)) : "",
  );
  const [amountValue, setAmountValue] = useState(initialAmountVnd ?? 0);
  const [state, action] = useActionState(async (previousState: ManagerActionState, formData: FormData) => {
    const nextState = await upsertPenaltyTier(previousState, formData);
    if (nextState.success && !tierId) {
      formRef.current?.reset();
      setAmountDisplay("");
      setAmountValue(0);
    }
    if (nextState.success) {
      success(nextState.success);
      onSuccess?.();
    }
    return nextState;
  }, {} as ManagerActionState);

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatCurrencyInput(e.target.value);
    setAmountDisplay(formatted);
    setAmountValue(parseCurrencyInput(formatted));
  }

  return (
    <form action={action} className="p-6 sm:p-8" ref={formRef}>
      {tierId ? <input name="tierId" type="hidden" value={tierId} /> : null}
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <FormLabel>
          Sau bao nhiêu phút
          <FormInput defaultValue={initialThresholdMinutes} min="0" name="thresholdMinutes" required type="number" />
        </FormLabel>
        <FormLabel>
          Số tiền (VNĐ)
          <FormInput min="1" onChange={handleAmountChange} placeholder="0" required type="text" value={amountDisplay} />
          <input name="amountVnd" type="hidden" value={amountValue} />
        </FormLabel>
        <PrimaryButton>{tierId ? "Lưu thay đổi" : "Thêm khung phạt"}</PrimaryButton>
      </div>
      <Feedback className="mt-4" error={state.error} />
    </form>
  );
}
