import "dotenv/config";
import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().email().optional(),
);
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    PORT: z.coerce.number().int().positive().default(3000),

    CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:5173"),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    PORTAL_JWT_SECRET: z.string().trim().min(1, "PORTAL_JWT_SECRET is required"),

    DB_SERVER: z.string().trim().min(1),

    DB_DATABASE: z.string().trim().min(1),

    DB_USER: z.string().trim().min(1),

    DB_PASSWORD: z.string().min(1),

    DB_ENCRYPT: booleanString.prefault("false"),

    DB_TRUST_SERVER_CERTIFICATE: booleanString.prefault("true"),

    APP_TIME_ZONE: z.string().trim().min(1).default("Asia/Riyadh"),

    ATTACHMENT_STORAGE_PATH: z.string().trim().min(1).default("storage/attachments"),

    EMAIL_ENABLED: booleanString.prefault("false"),
    EMAIL_PROVIDER: z.enum(["SMTP"]).default("SMTP"),
    TASKHUB_PUBLIC_URL: z.string().trim().url().default("http://localhost:5173"),
    EMAIL_LOGO_URL: optionalUrl,
    EMAIL_FROM_ADDRESS: optionalEmail,
    EMAIL_FROM_NAME: z.string().trim().min(1).max(160).default("QNH TaskHub"),
    EMAIL_REPLY_TO: optionalEmail,
    EMAIL_VERIFICATION_SECRET: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(32).optional(),
    ),

    SMTP_HOST: optionalTrimmedString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanString.prefault("false"),
    SMTP_REQUIRE_TLS: booleanString.prefault("true"),
    SMTP_USER: optionalTrimmedString,
    SMTP_PASSWORD: optionalTrimmedString,

    EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
    EMAIL_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
    EMAIL_PROCESSING_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(60).default(10),

    EMAIL_TEST_RECIPIENT: optionalEmail,
    EMAIL_TEST_RECIPIENT_NAME: optionalTrimmedString,
    EMAIL_TEST_LANGUAGE: z.enum(["ar", "en"]).default("ar"),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_ENABLED) {
      if (!value.EMAIL_FROM_ADDRESS) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_FROM_ADDRESS"],
          message: "EMAIL_FROM_ADDRESS is required when EMAIL_ENABLED=true",
        });
      }
      if (!value.SMTP_HOST) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_HOST"],
          message: "SMTP_HOST is required when EMAIL_ENABLED=true",
        });
      }
    }

    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: value.SMTP_USER ? ["SMTP_PASSWORD"] : ["SMTP_USER"],
        message: "SMTP_USER and SMTP_PASSWORD must either both be configured or both be empty",
      });
    }
  });

export const env = envSchema.parse(process.env);
