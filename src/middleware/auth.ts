import type { NextFunction, Request, Response } from "express";
import { auth as authFromLib } from "../lib/auth";
import { fromNodeHeaders } from "better-auth/node";

export enum UserRole {
  STUDENT = "STUDENT",
  TUTOR = "TUTOR",
  ADMIN = "ADMIN",
}

const auth = (...roles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await authFromLib.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      //   console.log(session);

      if (!session || !session.user) {
        return res.status(401).json({
          success: false,
          message: "unauthorized",
        });
      }

      if ((session.user as { status?: string }).status === "BANNED") {
        return res.status(403).json({
          success: false,
          message: "Your account has been banned",
        });
      }
      if (roles.length && !roles.includes(session.user.role as UserRole)) {
        return res.status(403).json({
          success: false,
          message: "forbidden",
        });
      }

      req.user = session.user;
      req.session = session.session;

      return next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      return res.status(500).json({
        success: false,
        message: "Auth checked failed! :(",
      });
    }
  };
};

export default auth;
