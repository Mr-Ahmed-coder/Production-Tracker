import {
  randomBytes,
  scrypt as callbackScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(callbackScrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, options);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(":");
  const derived = await scrypt(password, salt, 64, options);
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
}
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}
export function objectBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid("A JSON object is required.");
  return value;
}
