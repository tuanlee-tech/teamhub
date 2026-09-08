export type RosterMember = {
  user_id: string;
  is_required: boolean;
  exclusion_reason: string | null;
  display_name: string | null;
  username: string | null;
  state: string | null;
  late_minutes: number | null;
  fine_amount_snapshot: number | null;
  checked_in_at: string | null;
  check_in_method: string | null;
};