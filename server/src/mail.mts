// Sign-in codes go out through Resend's HTTP API. MAIL_LOG_CODES=1 logs them instead, for development.
import { config } from './config.mts';

export class MailUnavailable extends Error {}

export async function sendCode(email: string, code: string): Promise<void> {
  if (config.mail.logCodes) {
    console.log(`[mail] sign-in code for ${email}: ${code}`);
    return;
  }
  if (!config.mail.resendKey) throw new MailUnavailable('Sign-in email is not configured yet.');
  const text = `Your Firstry sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mail.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mail.from, to: [email], subject: `${code} is your Firstry code`, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend refused the email: ${res.status} ${await res.text()}`);
}
