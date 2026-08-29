import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  archivePersonalList,
  createPersonalList,
  listPersonalLists,
  reorderPersonalLists,
  updatePersonalList,
} from "./lists.controller.js";
import {
  createListBodySchema,
  listParamsSchema,
  reorderListsBodySchema,
  updateListBodySchema,
} from "./lists.schemas.js";

export const listsRouter: ExpressRouter = Router();

listsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
listsRouter.get("/", listPersonalLists);
listsRouter.post("/", validateRequest({ body: createListBodySchema }), createPersonalList);
listsRouter.put(
  "/reorder",
  validateRequest({ body: reorderListsBodySchema }),
  reorderPersonalLists,
);
listsRouter.patch(
  "/:listId",
  validateRequest({ params: listParamsSchema, body: updateListBodySchema }),
  updatePersonalList,
);
listsRouter.delete("/:listId", validateRequest({ params: listParamsSchema }), archivePersonalList);
