import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { globalSearch } from "./search.controller.js";
import { globalSearchQuerySchema } from "./search.schemas.js";

export const searchRouter: ExpressRouter = Router();
searchRouter.use(verifyPortalJwt, resolveTaskHubAccess);
searchRouter.get("/", validateRequest({ query: globalSearchQuerySchema }), globalSearch);
