import pino from "pino";

import { env } from "./env.js";

const developmentTransport =
  env.NODE_ENV === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname,reqId,req,res,responseTime",
          singleLine: true,
          translateTime: "SYS:HH:MM:ss",
        },
      }
    : undefined;

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  ...(developmentTransport ? { transport: developmentTransport } : {}),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "authorization",
      "token",
      "password",
    ],
    censor: "[REDACTED]",
  },
});
