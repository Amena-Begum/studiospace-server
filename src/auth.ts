import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  email: string;
  name: string;
  photoURL: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

const COOKIE = "studiospace_token";
const isProd = () => process.env.NODE_ENV === "production";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not configured");
  return s;
}

export function issueToken(res: Response, user: AuthUser) {
  const token = jwt.sign(user, secret(), { expiresIn: "7d" });
  // Cross-domain (client and API on different Vercel domains) needs SameSite=None + Secure in production.
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearToken(res: Response) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? "none" : "lax",
    path: "/",
  });
}

export function readUser(req: Request): AuthUser | null {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, secret()) as AuthUser;
    return { email: p.email, name: p.name, photoURL: p.photoURL };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readUser(req);
  if (!user) return res.status(401).json({ message: "Unauthorized: please log in first." });
  req.user = user;
  next();
}
