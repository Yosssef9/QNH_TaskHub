import type { NextFunction, Request, Response } from "express";

import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../config/env.js";

import { AppError } from "../shared/errors/app-error.js";

interface PortalJwtPayload extends JwtPayload {
  userCode?: unknown;
}

export function verifyPortalJwt(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  const match = authHeader?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    next(
      new AppError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "QNH Portal authentication is required.",
      }),
    );

    return;
  }

  const token = match[1]?.trim();

  if (!token) {
    next(
      new AppError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Portal token is missing.",
      }),
    );

    return;
  }

  try {
    const decoded = jwt.verify(token, env.PORTAL_JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (typeof decoded === "string") {
      throw new Error("Invalid JWT payload");
    }

    const payload: PortalJwtPayload = decoded;

    if (typeof payload.userCode !== "string" || payload.userCode.trim().length === 0) {
      throw new Error("Portal JWT is missing the required USER_CODE identity claim.");
    }

    req.portalIdentity = {
      userCode: payload.userCode.trim(),
    };

    next();
  } catch {
    next(
      new AppError({
        statusCode: 401,
        code: "INVALID_PORTAL_TOKEN",
        message: "Your QNH Portal session is invalid or has expired.",
      }),
    );
  }
}
