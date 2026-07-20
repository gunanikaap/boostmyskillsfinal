import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface CertificatePdfData {
  learnerName: string;
  credentialTitle: string;
  credentialCode: string;
  organisationName: string;
  issuerName: string;
  issueDate: string;
  verificationCode: string;
  siteUrl: string;
}

/** Render a simple, self-contained A4 landscape certificate PDF (no network assets). */
export async function renderCertificatePdf(data: CertificatePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 landscape
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.12, 0.48, 0.33);
  const ink = rgb(0.07, 0.13, 0.1);
  const muted = rgb(0.36, 0.42, 0.39);

  const center = (text: string, y: number, size: number, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (842 - w) / 2, y, size, font: f, color });
  };

  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: green, borderWidth: 3 });
  center("CERTIFICATE OF COMPLETION", 500, 26, bold, green);
  center(data.organisationName, 465, 14, font, muted);
  center("This certifies that", 410, 14, font, muted);
  center(data.learnerName, 375, 30, bold, ink);
  center("has successfully completed", 335, 14, font, muted);
  center(`${data.credentialCode} — ${data.credentialTitle}`, 300, 20, bold, ink);

  center(`Issued by ${data.issuerName}`, 200, 12, font, muted);
  center(`Issue date: ${data.issueDate.slice(0, 10)}`, 180, 12, font, muted);
  center(`Verification code: ${data.verificationCode}`, 150, 11, font, muted);
  center(`Verify at: ${data.siteUrl}/certificates/${data.verificationCode}`, 132, 10, font, muted);

  return pdf.save();
}
