import type { config as SqlConfig } from "mssql";

import { env } from "./env.js";

export const databaseConfig: SqlConfig = {
  server: env.DB_SERVER,
  database: env.DB_DATABASE,
  user: env.DB_USER,
  password: env.DB_PASSWORD,

  connectionTimeout: 15_000,
  requestTimeout: 60_000,

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },

  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,

    appName: "QNH Task Management",

    abortTransactionOnError: true,
  },
};
