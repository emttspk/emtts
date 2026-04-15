import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";
export async function loadMoneyOrderBackgrounds() {
    const frontPath = (env.MONEY_ORDER_FRONT_IMAGE_PATH?.trim() || (await resolveDefaultPath("MO/MO Front.png"))) ?? "";
    const backPath = (env.MONEY_ORDER_BACK_IMAGE_PATH?.trim() || (await resolveDefaultPath("MO/MO Back.png"))) ?? "";
    if (!frontPath && !backPath)
        return null;
    const [front, back] = await Promise.all([
        frontPath ? fileToDataUrl(frontPath) : Promise.resolve(undefined),
        backPath ? fileToDataUrl(backPath) : Promise.resolve(undefined),
    ]);
    return { frontDataUrl: front, backDataUrl: back };
}
async function resolveDefaultPath(relativePath) {
    const abs = path.resolve(process.cwd(), relativePath);
    try {
        await fs.access(abs);
        return abs;
    }
    catch {
        return undefined;
    }
}
async function fileToDataUrl(p) {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
}
