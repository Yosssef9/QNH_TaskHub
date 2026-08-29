import type { AuthMeData, PortalIdentity } from "../modules/auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      portalIdentity?: PortalIdentity;
      authContext?: AuthMeData;
      validated?: Partial<Record<"body" | "params" | "query", unknown>>;
    }
  }
}

export {};
