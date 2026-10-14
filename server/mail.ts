import nodemailer from 'nodemailer';
import type { AppConfig } from './config';
export function createMailer(config: AppConfig) {
  return async (to: string, subject: string, url: string) => {
    const text = `${subject}\n\nOuvrez ce lien : ${url}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`;
    if (config.development) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(`${config.localDir}/mail`, { recursive: true });
      await writeFile(
        `${config.localDir}/mail/${crypto.randomUUID()}.json`,
        JSON.stringify({ to, subject, url }),
        { mode: 0o600 },
      );
      return;
    }
    if (!config.mail) throw new Error('L’envoi des emails n’est pas configuré.');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === '465',
      requireTLS: process.env.SMTP_PORT !== '465',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
  };
}
