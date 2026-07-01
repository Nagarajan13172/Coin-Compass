import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;

/** Lazily build (and reuse) the SMTP transport from env credentials. */
function getTransport(): Transporter | null {
  if (!env.mail.configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transporter;
}

/**
 * Send an email. When SMTP isn't configured, we don't fail — we log the message
 * (and any links it contains) to the server console so local dev works without a
 * real mail provider. This mirrors how OAuth degrades when credentials are absent.
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  const tx = getTransport();
  if (!tx) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail] SMTP not configured — email not sent. Preview below.\n` +
        `  to:      ${msg.to}\n` +
        `  subject: ${msg.subject}\n` +
        `  text:\n${msg.text.replace(/^/gm, "    ")}\n`
    );
    return;
  }
  await tx.sendMail({ from: env.mail.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
}
