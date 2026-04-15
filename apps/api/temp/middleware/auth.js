import { verifyAccessToken } from "../auth/jwt.js";
export function requireAuth(req, res, next) {
    const header = req.header("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    const queryToken = typeof req.query?.token === "string" ? req.query.token : null;
    const token = bearer ?? queryToken;
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const claims = verifyAccessToken(token);
        req.user = { id: claims.sub, role: claims.role };
        next();
    }
    catch {
        return res.status(401).json({ error: "Unauthorized" });
    }
}
export function requireAdmin(req, res, next) {
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role !== "ADMIN")
        return res.status(403).json({ error: "Forbidden" });
    next();
}
