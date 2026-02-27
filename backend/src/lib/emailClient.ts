import nodemailer from 'nodemailer';
import logger from './logger';

// Lazily create the transporter so the app boots even without SMTP config.
// If SMTP_HOST is not set, sendEmail() will log and return — no crash.
function createTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  const transporter = createTransporter();

  if (!transporter) {
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    logger.warn(`[Email] SMTP not configured — skipping send to ${recipients}: "${options.subject}"`);
    return;
  }

  await transporter.sendMail({
    from: `"Talent Hub" <${process.env.SMTP_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  logger.info(`[Email] Sent "${options.subject}" → ${recipients}`);
};
