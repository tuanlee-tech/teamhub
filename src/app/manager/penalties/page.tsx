import { ModuleShell } from "@/components/module-shell";
import { PenaltyFormPanel } from "@/components/manager/penalty-form-panel";
import { DeletePenaltyButton } from "@/components/manager/delete-penalty-button";
import { PenaltiesTour } from "@/components/manager/penalties-tour";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PaperPanel, DisplayHeading, CurrencyText, DividedList, DividedListItem } from "@/components/ui";

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export default async function PenaltiesPage() {
  const context = await requireActiveMember("manager");
  const supabase = await createClient();
  const [{ data: tiers, error: tiersError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase
      .from("penalty_tiers")
      .select("id, threshold_minutes, amount_vnd")
      .eq("organization_id", context.membership.organizationId)
      .eq("is_active", true)
      .order("threshold_minutes"),
    supabase
      .from("organization_settings")
      .select("valid_check_in_time")
      .eq("organization_id", context.membership.organizationId)
      .single(),
  ]);

  if (tiersError || settingsError || !settings) {
    throw new Error("Không thể tải khung phạt.");
  }

  const graceStart = settings.valid_check_in_time?.slice(0, 5) ?? "09:00";

  return (
    <ModuleShell
      description="Một lần trễ chỉ áp dụng khung cao nhất đã vượt qua, không cộng dồn các khung thấp hơn."
      eyebrow="Khung phạt"
      title="Trễ hơn, phạt nặng hơn"
    >
      <div className="space-y-5">
        <div className="flex justify-end">
          <PenaltiesTour />
        </div>
        <PaperPanel className="overflow-hidden p-6 sm:p-8">
          <PenaltyFormPanel tourTarget="penalties-add" />
        </PaperPanel>
        <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-soft)]" data-tour="penalties-highest-tier">
          Chỉ áp dụng khung phạt cao nhất đã đạt được, không cộng dồn các khung thấp hơn.
        </p>
        <section data-tour="penalties-list">
        <PaperPanel className="overflow-hidden">
          {tiers.length === 0 ? (
            <p className="p-8 text-center text-[var(--ink-soft)]">Chưa có khung phạt. Người trễ vẫn được ghi nhận nhưng không phát sinh tiền.</p>
          ) : (
            <DividedList>
              {tiers.map((tier, index) => {
                const nextTier = tiers[index + 1];
                const from = tier.threshold_minutes;
                const to = nextTier ? nextTier.threshold_minutes - 1 : null;
                const timeFrom = addMinutes(graceStart, from);
                const timeTo = to ? addMinutes(graceStart, to) : null;
                const label = to
                  ? `Trễ ${from}–${to} phút`
                  : `Trễ từ ${from} phút`;
                const timeRange = timeTo
                  ? `${timeFrom} – ${timeTo}`
                  : `${timeFrom} trở đi`;
                return (
                  <DividedListItem key={tier.id}>
                    <div>
                      <p className="text-sm text-[var(--ink-soft)]">Áp dụng khi trễ</p>
                      <DisplayHeading level={3} className="mt-1">{label}</DisplayHeading>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">{timeRange}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <CurrencyText amount={tier.amount_vnd} className="text-lg" />
                      <PenaltyFormPanel
                        initialAmountVnd={tier.amount_vnd}
                        initialThresholdMinutes={tier.threshold_minutes}
                        mode="edit"
                        tierId={tier.id}
                      />
                      <DeletePenaltyButton tierId={tier.id} />
                    </div>
                  </DividedListItem>
                );
              })}
            </DividedList>
          )}
        </PaperPanel>
        </section>
      </div>
    </ModuleShell>
  );
}
