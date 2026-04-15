import jwt from "jsonwebtoken";
import { env } from "../config.js";
export function signAccessToken(claims) {
    return jwt.sign(claims, env.JWT_SECRET, { expiresIn: "7d" });
}
export function verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_SECRET);
}
export function asAppRole(value) {
    return value === "ADMIN" || value === "USER" ? value : "USER";
}
