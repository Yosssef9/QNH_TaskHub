import { Router, type Router as ExpressRouter } from "express";

import { requireRole } from "../../middleware/requireRole.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  getContractAccessAdminData,
  listAccessUsers,
  updateAccessUser,
  updateContractDelegation,
} from "./access.controller.js";
import {
  accessListQuerySchema,
  accessUserParamsSchema,
  contractDelegationBodySchema,
  updateAccessBodySchema,
} from "./access.schemas.js";

export const accessRouter: ExpressRouter = Router();

accessRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireRole("ADMIN"));

accessRouter.get("/users", validateRequest({ query: accessListQuerySchema }), listAccessUsers);
accessRouter.put(
  "/users/:userId",
  validateRequest({ params: accessUserParamsSchema, body: updateAccessBodySchema }),
  updateAccessUser,
);
accessRouter.get("/contract-delegations", getContractAccessAdminData);
accessRouter.put(
  "/contract-delegations",
  validateRequest({ body: contractDelegationBodySchema }),
  updateContractDelegation,
);
