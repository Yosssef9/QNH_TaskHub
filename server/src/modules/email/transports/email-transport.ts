import type { EmailMessage, EmailSendResult } from "../email.types.js";

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
  verify(): Promise<void>;
}
