import { env } from "../../config/env.js";
import { emailRepository } from "./email.repository.js";
import { getEmailTransport } from "./email-transport.factory.js";
import type { QueueEmailInput, SendEmailNowInput } from "./email.types.js";
import { renderEmailTemplate } from "./templates/email-template.registry.js";

function assertEmailEnabled(): void {
  if (!env.EMAIL_ENABLED) {
    throw new Error("Email delivery is disabled.");
  }
}

export const emailService = {
  async queue(input: QueueEmailInput): Promise<{ id: number; inserted: boolean }> {
    assertEmailEnabled();
    return emailRepository.enqueue(input);
  },

  async sendNow(input: SendEmailNowInput): Promise<{ provider: string; messageId: string | null }> {
    assertEmailEnabled();
    const document = renderEmailTemplate(input.templateKey, input.payload, input.language);
    return getEmailTransport().send({
      to: input.recipientEmail,
      ...(input.recipientName ? { toName: input.recipientName } : {}),
      subject: document.subject,
      html: document.html,
      text: document.text,
    });
  },

  async verifyTransport(): Promise<void> {
    assertEmailEnabled();
    await getEmailTransport().verify();
  },
};
