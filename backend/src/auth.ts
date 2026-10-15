import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "./config.js";

function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export const basicAuth: RequestHandler = (req, res, next) => {
  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (separator >= 0 && safeEqual(user, config.adminUser) && safeEqual(password, config.adminPassword)) {
      next();
      return;
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Memory test admin", charset="UTF-8"');
  res.status(401).json({ error: "Unauthorized" });
};
