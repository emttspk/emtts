import jwt from "jsonwebtoken";
import { env } from "../config.js";

export type AppRole = "USER" | "ADMIN";

export type JwtClaims = {
  sub: string;
  role: AppRole;
};

export function signAccessToken(claims: JwtClaims) {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtClaims;
}

export function asAppRole(value: unknown): AppRole {
  return value === "ADMIN" || value === "USER" ? value : "USER";
}
