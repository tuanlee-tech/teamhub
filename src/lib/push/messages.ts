export type PushEventType = "payment" | "fine_issued";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function formatVnd(amountVnd: number): string {
  return `${amountVnd.toLocaleString("vi-VN")}₫`;
}

/** Build the Web Push payload shown by the service worker. No sensitive data. */
export function buildPushPayload(event: PushEventType, data: { fineCode: string; amountVnd: number }): PushPayload {
  if (event === "payment") {
    return {
      title: "Đã nhận thanh toán",
      body: `Phiếu ${data.fineCode} (${formatVnd(data.amountVnd)}) đã được thanh toán.`,
      url: `/fines/${data.fineCode}`,
      tag: `fine-paid-${data.fineCode}`,
    };
  }
  return {
    title: "Phiếu phạt mới",
    body: `Bạn có phiếu phạt ${data.fineCode} (${formatVnd(data.amountVnd)}). Mở để xem QR thanh toán.`,
    url: `/fines/${data.fineCode}`,
    tag: `fine-issued-${data.fineCode}`,
  };
}
