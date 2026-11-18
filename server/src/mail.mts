// Sign-in codes and notes to the owner go out through Resend's HTTP API. MAIL_LOG_CODES=1 logs codes instead, for development.
import { config } from './config.mts';

export class MailUnavailable extends Error {}

async function send(to: string, subject: string, text: string): Promise<void> {
  const res = await fetch(`${config.mail.resendBase}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mail.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mail.from, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend refused the email: ${res.status} ${await res.text()}`);
}

export async function sendCode(email: string, code: string): Promise<void> {
  if (config.mail.logCodes) {
    console.log(`[mail] sign-in code for ${email}: ${code}`);
    return;
  }
  if (!config.mail.resendKey) throw new MailUnavailable('Sign-in email is not configured yet.');
  const text = `Your First Try sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`;
  await send(email, `${code} is your First Try code`, text);
}

/** A plain-text note to the owner (OWNER_EMAIL), such as a refund request to act on. */
export async function notifyOwner(subject: string, text: string): Promise<void> {
  if (!config.mail.resendKey || !config.ownerEmail) throw new MailUnavailable('Owner email is not configured.');
  await send(config.ownerEmail, subject, text);
}
