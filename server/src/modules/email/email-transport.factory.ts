import { env } from "../../config/env.js";
import { SmtpEmailTransport } from "./transports/smtp.transport.js";
import type { EmailTransport } from "./transports/email-transport.js";

let transport: EmailTransport | undefined;

export function getEmailTransport(): EmailTransport {
  if (!env.EMAIL_ENABLED) {
    throw new Error("Email delivery is disabled. Set EMAIL_ENABLED=true after configuring SMTP.");
  }

  transport ??= new SmtpEmailTransport();
  return transport;
}
