import type { RequestHandler } from "express";

import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { GlobalSearchQuery } from "./search.schemas.js";
import { searchService } from "./search.service.js";
import type { GlobalSearchData } from "./search.types.js";

export const globalSearch: RequestHandler = async (req, res) => {
  const ownerUserId = req.authContext?.user.userId;
  if (!ownerUserId) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  }

  const query = getValidatedRequestPart<GlobalSearchQuery>(req, "query");
  const data = await searchService.search(ownerUserId, query.q, query.limit);
  const body: ApiSuccessResponse<GlobalSearchData> = { success: true, data };
  res.json(body);
};
