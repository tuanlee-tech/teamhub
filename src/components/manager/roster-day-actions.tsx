"use client";

import { useActionState } from "react";

import { ensureRosterForDate, type RosterActionState } from "@/app/manager/roster/actions";
import { Feedback, PrimaryButton, useToast } from "@/components/ui";

export function RosterDayActions({ workDate }: { workDate: string }) {
  const { success } = useToast();
  const [state, action] = useActionState(async (previousState: RosterActionState, formData: FormData) => {
    const nextState = await ensureRosterForDate(previousState, formData);
    if (nextState.success) success(nextState.success);
    return nextState;
  }, {} as RosterActionState);

  return (
    <div className="flex flex-wrap items-center gap-3" data-tour="roster-sync">
      <form action={action}>
        <input name="workDate" type="hidden" value={workDate} />
        <PrimaryButton fullWidth={false}>Cập nhật danh sách</PrimaryButton>
      </form>
      <Feedback error={state.error} />
    </div>
  );
}
