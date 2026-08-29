import { pinoHttp } from "pino-http";

import { logger } from "./logger.js";

interface SerializedRequestInput {
  id?: unknown;
  method?: unknown;
  url?: unknown;
}

interface SerializedResponseInput {
  statusCode?: unknown;
}

export const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  autoLogging: {
    ignore: (req) => req.url === "/favicon.ico",
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method ?? "REQUEST"} ${req.url ?? ""} ${res.statusCode} - ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res) =>
    `${req.method ?? "REQUEST"} ${req.url ?? ""} ${res.statusCode} - request failed`,
  serializers: {
    req: (value: unknown) => {
      const request = value as SerializedRequestInput;

      return {
        id: request.id,
        method: request.method,
        url: request.url,
      };
    },
    res: (value: unknown) => {
      const response = value as SerializedResponseInput;

      return { statusCode: response.statusCode };
    },
  },
});
