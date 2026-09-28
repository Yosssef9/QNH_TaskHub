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
    for (const attachment of message.attachments ?? []) {
      if (!Buffer.isBuffer(attachment.content) || attachment.contentType !== "application/pdf" ||
          !/^Meeting-\d+-Report-(AR|EN)\.pdf$/.test(attachment.filename) ||
          attachment.content.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Invalid trusted PDF attachment.");
      }
    }
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
      ...(message.messageId ? { messageId: message.messageId } : {}),
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: [
        ...(message.html.includes(QNH_TASKHUB_LOGO_SOURCE) ? [{
          filename: "fullLogo.png",
          path: QNH_TASKHUB_LOGO_PATH,
          cid: QNH_TASKHUB_LOGO_CID,
          contentType: "image/png",
        }] : []),
        ...(message.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
          contentDisposition: "attachment" as const,
        })),
      ],
    });

    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      throw new Error("SMTP did not accept the recipient.");
    }
    return {
      provider: this.name,
      messageId: typeof info.messageId === "string" && info.messageId ? info.messageId : null,
    };
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}

