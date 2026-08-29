import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    env: {
      NODE_ENV: "test",
      PORTAL_JWT_SECRET: "taskhub-test-secret-not-for-production",
      DB_SERVER: "localhost",
      DB_DATABASE: "QNH_TaskHub_Test",
      DB_USER: "test-user",
      DB_PASSWORD: "test-password",
      DB_ENCRYPT: "false",
      DB_TRUST_SERVER_CERTIFICATE: "true",
    },
  },
});
