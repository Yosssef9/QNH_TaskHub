import { fileURLToPath } from "node:url";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { env } from "../../../config/env.js";
import type { EmailMessage, EmailSendResult } from "../email.types.js";
import type { EmailTransport } from "./email-transport.js";

const QNH_TASKHUB_LOGO_CID = "qnh-taskhub-logo@qnhospital.com";
const QNH_TASKHUB_LOGO_SOURCE = `cid:${QNH_TASKHUB_LOGO_CID}`;
const QNH_TASKHUB_LOGO_PATH = fileURLToPath(
  new URL("../../../../../client/public/images/fullLogo.png", import.meta.url),
);

export class SmtpEmailTransport implements EmailTransport {
  readonly name = "SMTP";
  private readonly transporter: Transporter;

  constructor() {
    const auth = env.SMTP_USER && env.SMTP_PASSWORD
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        }
      : undefined;

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: env.SMTP_REQUIRE_TLS,
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      ...(auth ? { auth } : {}),
      tls: {
        minVersion: "TLSv1.2",
      },
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: {
        name: env.EMAIL_FROM_NAME,
        address: env.EMAIL_FROM_ADDRESS!,
      },
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
      to: message.toName
        ? {
            name: message.toName,
            address: message.to,
          }
        : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.html.includes(QNH_TASKHUB_LOGO_SOURCE)
        ? {
            attachments: [
              {
                filename: "fullLogo.png",
                path: QNH_TASKHUB_LOGO_PATH,
                cid: QNH_TASKHUB_LOGO_CID,
                contentType: "image/png",
              },
            ],
          }
        : {}),
    });

    return {
      provider: this.name,
      messageId: typeof info.messageId === "string" && info.messageId ? info.messageId : null,
    };
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}
