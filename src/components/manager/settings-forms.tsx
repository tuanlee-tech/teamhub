"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateAttendanceSettings,
  updateBankSettings,
  updateTtsSettings,
  type ManagerActionState,
} from "@/app/manager/actions";
import { SEPAY_BANKS } from "@/lib/banks";
import { Toggle } from "@/components/ui";

const initialState: ManagerActionState = {};
const inputClassName =
  "mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 font-normal outline-none transition focus:border-[var(--signal)] focus:ring-3 focus:ring-red-100";

function Feedback({ state }: { state: ManagerActionState }) {
  if (!state.error && !state.success) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        state.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.error ?? state.success}
    </p>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-action disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Đang lưu..." : "Lưu cấu hình"}
    </button>
  );
}

export type AttendanceSettingsValues = {
  timezone: string;
  sessionStart: string;
  sessionEnd: string;
  validCheckInTime: string;
  workDays: number[];
  officeLatitude: number | null;
  officeLongitude: number | null;
  officeRadiusM: number;
  maxGpsAccuracyM: number;
};

export function AttendanceSettingsForm({ values }: { values: AttendanceSettingsValues }) {
  const [state, action] = useActionState(updateAttendanceSettings, initialState);
  const [lat, setLat] = useState(values.officeLatitude != null ? String(values.officeLatitude) : "");
  const [lng, setLng] = useState(values.officeLongitude != null ? String(values.officeLongitude) : "");
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const weekdays = [
    [1, "T2"],
    [2, "T3"],
    [3, "T4"],
    [4, "T5"],
    [5, "T6"],
    [6, "T7"],
    [7, "CN"],
  ] as const;

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Trình duyệt không hỗ trợ định vị.");
      return;
    }
    setLocating(true);
    setGeoStatus("Đang lấy vị trí...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLat(String(latitude));
        setLng(String(longitude));
        setGeoStatus(`Đã lấy: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m) — nhớ Lưu cấu hình`);
        setLocating(false);
      },
      (err) => {
        const msg =
          err.code === 1
            ? "Bạn đã chặn quyền vị trí. Hãy cấp quyền trong cài đặt trình duyệt."
            : err.code === 2
              ? "Không xác định được vị trí."
              : "Hết thời gian lấy vị trí.";
        setGeoStatus(msg);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <form action={action} className="paper-panel space-y-6 p-6 sm:p-8">
      <div>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">01 / Điểm danh</p>
        <h2 className="display-type mt-2 text-3xl">Ca làm và văn phòng</h2>
      </div>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">
          Múi giờ IANA
          <input className={inputClassName} defaultValue={values.timezone} name="timezone" required />
        </label>
        <label className="text-sm font-bold">
          Bắt đầu phiên
          <input className={inputClassName} defaultValue={values.sessionStart} name="sessionStart" required type="time" />
        </label>
        <label className="text-sm font-bold">
          Kết thúc phiên
          <input className={inputClassName} defaultValue={values.sessionEnd} name="sessionEnd" required type="time" />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Giờ bắt đầu tính trễ
          <input className={inputClassName} defaultValue={values.validCheckInTime} name="validCheckInTime" required type="time" />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-bold">Ngày làm việc</legend>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {weekdays.map(([value, label]) => (
            <label className="cursor-pointer" key={value}>
              <input
                className="peer sr-only"
                defaultChecked={values.workDays.includes(value)}
                name="workDays"
                type="checkbox"
                value={value}
              />
              <span className="grid h-11 place-items-center rounded-xl border border-[var(--line)] bg-white text-sm font-black peer-checked:border-[var(--ink)] peer-checked:bg-[var(--ink)] peer-checked:text-white">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Vĩ độ
          <input className={inputClassName} name="officeLatitude" onChange={(e) => setLat(e.target.value)} placeholder="10.7769" step="any" type="number" value={lat} />
        </label>
        <label className="text-sm font-bold">
          Kinh độ
          <input className={inputClassName} name="officeLongitude" onChange={(e) => setLng(e.target.value)} placeholder="106.7009" step="any" type="number" value={lng} />
        </label>
        <div className="sm:col-span-2">
          <button
            aria-live="polite"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-bold transition hover:border-[var(--ink)] disabled:opacity-60"
            disabled={locating}
            onClick={handleGetLocation}
            type="button"
          >
            <span aria-hidden>📍</span>
            {locating ? "Đang lấy vị trí..." : "Lấy vị trí"}
          </button>
          {geoStatus ? <p className="mt-2 text-sm font-medium text-[var(--ink-soft)]">{geoStatus}</p> : null}
          <p className="mt-1 text-xs text-[var(--ink-soft)]">Yêu cầu HTTPS và cho phép quyền vị trí. Độ chính xác tốt nhất ngoài trời.</p>
        </div>
        <label className="text-sm font-bold">
          Bán kính văn phòng (m)
          <input className={inputClassName} defaultValue={values.officeRadiusM} min="10" name="officeRadiusM" required type="number" />
        </label>
        <label className="text-sm font-bold">
          GPS accuracy tối đa (m)
          <input className={inputClassName} defaultValue={values.maxGpsAccuracyM} min="10" name="maxGpsAccuracyM" required type="number" />
        </label>
      </div>
      <SaveButton />
    </form>
  );
}

export type BankSettingsValues = {
  bankCode: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  transferDescriptionRule: string;
  fundDisplayName: string;
  vietqrTemplate: "compact" | "qronly" | "standee";
  vietqrShowInfo: boolean;
  vietqrFullAccount: boolean;
};

export function BankSettingsForm({ values }: { values: BankSettingsValues }) {
  const [state, action] = useActionState(updateBankSettings, initialState);
  const [bankCode, setBankCode] = useState(values.bankCode);
  const [bankAccountNumber, setBankAccountNumber] = useState(values.bankAccountNumber);
  const [bankAccountHolder, setBankAccountHolder] = useState(values.bankAccountHolder);
  const [transferDescriptionRule, setTransferDescriptionRule] = useState(values.transferDescriptionRule);
  const [fundDisplayName, setFundDisplayName] = useState(values.fundDisplayName);
  const [vietqrTemplate, setVietqrTemplate] = useState(values.vietqrTemplate);
  const [showInfo, setShowInfo] = useState(values.vietqrShowInfo);
  const [fullAccount, setFullAccount] = useState(values.vietqrFullAccount);
  const [previewLoaded, setPreviewLoaded] = useState(true);
  const previewParams = new URLSearchParams({
    acc: bankAccountNumber,
    bank: bankCode,
    template: vietqrTemplate,
    showinfo: String(showInfo),
    fullacc: String(fullAccount),
  });
  if (transferDescriptionRule) previewParams.set("des", transferDescriptionRule);
  if (bankAccountHolder) previewParams.set("holder", bankAccountHolder);
  if (fundDisplayName) previewParams.set("store", fundDisplayName);
  const previewUrl = `https://vietqr.app/img?${previewParams.toString()}`;
  const canPreview = Boolean(bankCode && bankAccountNumber);

  return (
    <form action={action} className="paper-panel space-y-6 p-6 sm:p-8">
      <div>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">02 / Thanh toán</p>
        <h2 className="display-type mt-2 text-3xl">Ngân hàng và VietQR</h2>
      </div>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">
          Ngân hàng
          <select className={inputClassName} name="bankCode" onChange={(event) => { setPreviewLoaded(false); setBankCode(event.target.value); }} value={bankCode}>
            <option value="">Chưa cấu hình</option>
            {SEPAY_BANKS.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">
          Số tài khoản
          <input className={inputClassName} name="bankAccountNumber" onChange={(event) => { setPreviewLoaded(false); setBankAccountNumber(event.target.value); }} value={bankAccountNumber} />
        </label>
        <label className="text-sm font-bold">
          Chủ tài khoản
          <input className={inputClassName} name="bankAccountHolder" onChange={(event) => { setPreviewLoaded(false); setBankAccountHolder(event.target.value); }} value={bankAccountHolder} />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Quy tắc nội dung chuyển khoản
          <input className={inputClassName} name="transferDescriptionRule" onChange={(event) => { setPreviewLoaded(false); setTransferDescriptionRule(event.target.value); }} placeholder="SEVQR DONG PHAT" value={transferDescriptionRule} />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Tên quỹ / nhóm trên QR
          <input className={inputClassName} name="fundDisplayName" onChange={(event) => { setPreviewLoaded(false); setFundDisplayName(event.target.value); }} value={fundDisplayName} />
        </label>
        <label className="text-sm font-bold">
          Template VietQR
          <select className={inputClassName} name="vietqrTemplate" onChange={(event) => { setPreviewLoaded(false); setVietqrTemplate(event.target.value as BankSettingsValues["vietqrTemplate"]); }} value={vietqrTemplate}>
            <option value="compact">Compact</option>
            <option value="qronly">QR only</option>
            <option value="standee">Standee</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle checked={showInfo} label="Hiển thị thông tin TK" name="vietqrShowInfo" onChange={(event) => { setPreviewLoaded(false); setShowInfo(event.target.checked); }} value="on" />
        <Toggle checked={fullAccount} label="Hiển thị đầy đủ số TK" name="vietqrFullAccount" onChange={(event) => { setPreviewLoaded(false); setFullAccount(event.target.checked); }} value="on" />
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5" data-tour="settings-vietqr-preview">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--signal)]">Preview</p>
          <h3 className="display-type mt-1 text-2xl">Mẫu VietQR</h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Preview dữ liệu mẫu, không dùng để thanh toán.</p>
        </div>
        <div className="relative mx-auto mt-4 flex min-h-80 max-w-md justify-center rounded-xl bg-white p-3 shadow-sm">
          {/* The VietQR service returns the selected visual template as an image. */}
          {canPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`Preview template ${vietqrTemplate}`} className={`h-100 w-100 object-contain transition-opacity duration-200 ${previewLoaded ? "opacity-100" : "opacity-35"}`} key={previewUrl} onError={() => setPreviewLoaded(true)} onLoad={() => setPreviewLoaded(true)} src={previewUrl} />
              {!previewLoaded ? <span className="absolute inset-0 grid place-items-center text-sm font-bold text-[var(--ink-soft)]"><span className="rounded-full bg-[var(--paper)] px-4 py-2 shadow-sm">Đang tải preview...</span></span> : null}
            </>
          ) : (
            <span className="grid min-h-72 place-items-center px-6 text-center text-sm font-bold text-[var(--ink-soft)]">Chọn ngân hàng và nhập số tài khoản để xem preview.</span>
          )}
        </div>
        <p className="mt-3 text-center text-xs font-bold text-[var(--ink-soft)]">{vietqrTemplate === "compact" ? "Compact · QR kèm thông tin" : vietqrTemplate === "qronly" ? "QR only · Chỉ mã QR" : "Standee · Bố cục in/trưng bày"}</p>
      </div>
      <SaveButton />
    </form>
  );
}

export type TtsSettingsValues = {
  personality: string;
  enabledEvents: string[];
  cooldownSeconds: number;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  locale: string;
  preferredVoice: string;
  speechRate: number;
  speechPitch: number;
};

export function TtsSettingsForm({ values }: { values: TtsSettingsValues }) {
  const [state, action] = useActionState(updateTtsSettings, initialState);
  const [quietEnabled, setQuietEnabled] = useState(values.quietEnabled);
  const [speechRate, setSpeechRate] = useState(values.speechRate);
  const [speechPitch, setSpeechPitch] = useState(values.speechPitch);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const events = [
    ["late", "Người đi trễ"],
    ["payment", "Đóng phạt thành công"],
    ["on_time", "Check-in đúng giờ"],
    ["achievement", "Title mới"],
    ["fund_balance", "Số dư quỹ"],
  ] as const;

  // Load voices dynamically from the device
  const loadVoices = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const sorted = [...voices].sort((a, b) => {
        const aIsVi = a.lang.toLowerCase().startsWith("vi");
        const bIsVi = b.lang.toLowerCase().startsWith("vi");
        if (aIsVi && !bIsVi) return -1;
        if (!aIsVi && bIsVi) return 1;
        return a.name.localeCompare(b.name);
      });
      setAvailableVoices(sorted);
      setVoicesLoaded(true);
    }
  };

  useEffect(() => {
    // This state marks the client-only speech synthesis APIs as ready after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
    loadVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      // Some browsers need a kick
      setTimeout(loadVoices, 500);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    }
  }, []);

  const viVoices = availableVoices.filter((v) => v.lang.toLowerCase().startsWith("vi"));
  const otherVoices = availableVoices.filter((v) => !v.lang.toLowerCase().startsWith("vi"));

  return (
    <form action={action} className="paper-panel space-y-6 p-6 sm:p-8">
      <div>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">03 / Âm thanh</p>
        <h2 className="display-type mt-2 text-3xl">Giọng MC</h2>
      </div>
      <Feedback state={state} />
      <label className="block text-sm font-bold">
        Phong cách
        <select className={inputClassName} defaultValue={values.personality} name="personality">
          <option value="friendly">Thân thiện</option>
          <option value="teasing">Cà khịa nhẹ</option>
          <option value="spicy">Mặn</option>
          <option value="extra_spicy">Rất mặn</option>
          <option value="relentless">Không khoan nhượng</option>
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-bold">Sự kiện được đọc</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {events.map(([value, label]) => (
            <Toggle
              defaultChecked={values.enabledEvents.includes(value)}
              key={value}
              label={label}
              name="enabledEvents"
              value={value}
            />
          ))}
        </div>
      </fieldset>
      <div className="space-y-5">
        <Toggle
          checked={quietEnabled}
          description={!quietEnabled ? "tắt, MC đọc bất kỳ lúc nào" : undefined}
          label="Bật quiet hours (không đọc trong khung)"
          name="quietEnabled"
          onChange={(e) => setQuietEnabled(e.target.checked)}
          value="on"
        />
        {quietEnabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Quiet hours từ
              <input className={inputClassName} defaultValue={values.quietStart} name="quietStart" type="time" />
            </label>
            <label className="text-sm font-bold">
              Quiet hours đến
              <input className={inputClassName} defaultValue={values.quietEnd} name="quietEnd" type="time" />
            </label>
          </div>
        ) : (
          <>
            <input name="quietStart" type="hidden" value={values.quietStart} />
            <input name="quietEnd" type="hidden" value={values.quietEnd} />
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Cooldown (giây)
          <input className={inputClassName} defaultValue={values.cooldownSeconds} min="0" name="cooldownSeconds" type="number" />
        </label>
        <label className="text-sm font-bold" data-tour="settings-tts-range">
          Ngôn ngữ đọc
          <select className={inputClassName} defaultValue={values.locale} name="locale">
            <option value="vi-VN">Tiếng Việt (vi-VN)</option>
            <option value="en-US">English (en-US)</option>
            <option value="en-GB">English (en-GB)</option>
            <option value="ja-JP">日本語 (ja-JP)</option>
            <option value="ko-KR">한국어 (ko-KR)</option>
            <option value="zh-CN">中文 (zh-CN)</option>
          </select>
        </label>
        <label className="block text-sm font-bold sm:col-span-2">
          Giọng đọc ưu tiên
          {!hasMounted ? (
            <>
              <select className={`${inputClassName} bg-gray-50`} disabled name="preferredVoice">
                <option>Đang tải danh sách giọng...</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-[var(--ink-soft)]">Đang quét giọng có thật trên thiết bị này...</span>
            </>
          ) : typeof window === "undefined" || !("speechSynthesis" in window) ? (
            <>
              <input name="preferredVoice" type="hidden" value="" />
              <div className={`${inputClassName} flex items-center bg-gray-50 text-[var(--ink-soft)]`}>Thiết bị không hỗ trợ giọng đọc</div>
              <span className="mt-1 block text-xs font-normal text-[var(--ink-soft)]">Trình duyệt này không có Web Speech API — MC sẽ im lặng.</span>
            </>
          ) : !voicesLoaded ? (
            <>
              <select className={`${inputClassName} bg-gray-50`} disabled name="preferredVoice">
                <option>Đang tải danh sách giọng...</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-[var(--ink-soft)]">Đang quét giọng có thật trên thiết bị này...</span>
            </>
          ) : availableVoices.length === 0 ? (
            <>
              <input name="preferredVoice" type="hidden" value="" />
              <div className={`${inputClassName} flex items-center bg-gray-50 text-[var(--ink-soft)]`}>Không tìm thấy giọng nào</div>
              <span className="mt-1 block text-xs font-normal text-[var(--ink-soft)]">Không có voice khả dụng — sẽ dùng mặc định hệ thống.</span>
            </>
          ) : (
            <>
              <select className={inputClassName} defaultValue={values.preferredVoice} name="preferredVoice">
                <option value="">Mặc định</option>
                {viVoices.length > 0 ? (
                  <optgroup label={`Tiếng Việt (vi) — ${viVoices.length}`}>
                    {viVoices.map((v) => (
                      <option key={`${v.name}-${v.lang}`} value={v.name}>
                        {v.name} — {v.lang} {v.default ? "• mặc định" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherVoices.length > 0 ? (
                  <optgroup label={`Khác — ${otherVoices.length}`}>
                    {otherVoices.map((v) => (
                      <option key={`${v.name}-${v.lang}`} value={v.name}>
                        {v.name} — {v.lang}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <span className="mt-1 block text-xs font-normal text-[var(--ink-soft)]">
                Tìm thấy <b>{availableVoices.length}</b> giọng thực tế trên thiết bị này ({viVoices.length} vi).
                {values.preferredVoice && !availableVoices.some((v) => v.name === values.preferredVoice)
                  ? ` — Giọng đã lưu "${values.preferredVoice}" không tồn tại trên thiết bị này, sẽ fallback tự chọn.`
                  : ""}
              </span>
            </>
          )}
        </label>
        <label className="text-sm font-bold">
          <span className="flex items-center justify-between gap-3">
            <span>Tốc độ</span>
            <output className="rounded-full bg-[var(--paper-deep)] px-3 py-1 text-xs font-black text-[var(--signal)]">{speechRate.toFixed(1)}x</output>
          </span>
          <input
            aria-label="Tốc độ đọc"
            className="mt-4 h-2 w-full cursor-pointer accent-[var(--signal)]"
            max="2"
            min="0.5"
            name="speechRate"
            onChange={(event) => setSpeechRate(Number(event.target.value))}
            step="0.1"
            type="range"
            value={speechRate}
          />
          <span className="mt-2 flex justify-between text-xs font-normal text-[var(--ink-soft)]"><span>Chậm</span><span>Nhanh</span></span>
        </label>
        <label className="text-sm font-bold">
          <span className="flex items-center justify-between gap-3">
            <span>Cao độ</span>
            <output className="rounded-full bg-[var(--paper-deep)] px-3 py-1 text-xs font-black text-[var(--signal)]">{speechPitch.toFixed(1)}</output>
          </span>
          <input
            aria-label="Cao độ giọng đọc"
            className="mt-4 h-2 w-full cursor-pointer accent-[var(--signal)]"
            max="2"
            min="0"
            name="speechPitch"
            onChange={(event) => setSpeechPitch(Number(event.target.value))}
            step="0.1"
            type="range"
            value={speechPitch}
          />
          <span className="mt-2 flex justify-between text-xs font-normal text-[var(--ink-soft)]"><span>Trầm</span><span>Cao</span></span>
        </label>
      </div>
      <SaveButton />
    </form>
  );
}
