import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { money } from "./core.ts";

const FONT_URL = "https://raw.githubusercontent.com/googlefonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans/NotoSans-Regular.ttf";

type Party = Record<string, string | null | undefined>;

export async function createInvoicePdf(input: {
  number: string;
  documentType: string;
  issueDate: string;
  seller: Party;
  buyer: Party;
  productName: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
}) {
  const fontResponse = await fetch(FONT_URL);
  if (!fontResponse.ok) throw new Error("Nepavyko įkelti PDF šrifto");
  const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const teal = rgb(0.09, 0.31, 0.29);
  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.38, 0.36, 0.33);
  const line = rgb(0.89, 0.87, 0.82);
  const left = 54;
  let y = height - 58;
  const text = (value: string, x: number, yy: number, size = 10, color = ink) => page.drawText(value || "-", { x, y: yy, size, font: regular, color });
  const title = input.documentType === "vat_invoice" ? "PVM SĄSKAITA FAKTŪRA" : input.documentType === "invoice" ? "SĄSKAITA FAKTŪRA" : "MOKĖJIMO PATVIRTINIMAS";

  text("ATMINIMAS", left, y, 12, teal);
  text(title, left, y - 42, 22, ink);
  text(`Nr. ${input.number}`, left, y - 64, 10, muted);
  text(`Data: ${input.issueDate}`, width - 190, y - 64, 10, muted);
  y -= 105;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: line });
  y -= 30;

  text("PARDAVĖJAS", left, y, 9, teal);
  text("PIRKĖJAS", 320, y, 9, teal);
  const sellerLines = [input.seller.legal_name, input.seller.activity_form, input.seller.registration_code ? `Kodas: ${input.seller.registration_code}` : "", input.seller.vat_code ? `PVM kodas: ${input.seller.vat_code}` : "", input.seller.address, input.seller.email].filter(Boolean) as string[];
  const buyerLines = [input.buyer.name, input.buyer.email, input.buyer.address].filter(Boolean) as string[];
  sellerLines.forEach((lineText, index) => text(lineText, left, y - 20 - index * 16, 9.5));
  buyerLines.forEach((lineText, index) => text(lineText, 320, y - 20 - index * 16, 9.5));
  y -= 130;

  page.drawRectangle({ x: left, y: y - 28, width: width - left * 2, height: 28, color: rgb(0.96, 0.94, 0.88) });
  text("Prekė / paslauga", left + 8, y - 19, 9, ink);
  text("Suma", width - 130, y - 19, 9, ink);
  y -= 56;
  text(input.productName, left + 8, y, 10, ink);
  text(money(input.subtotalCents, input.currency), width - 130, y, 10, ink);
  y -= 30;
  text("Pristatymas", left + 8, y, 10, ink);
  text(money(input.shippingCents, input.currency), width - 130, y, 10, ink);
  y -= 24;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: line });
  y -= 30;
  text("IŠ VISO", width - 230, y, 12, teal);
  text(money(input.totalCents, input.currency), width - 130, y, 12, teal);
  text("Dokumentas sugeneruotas automatiškai po patvirtinto mokėjimo.", left, 58, 8.5, muted);
  return new Uint8Array(await pdf.save());
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
