import crypto from "node:crypto";

export const AUTH_COOKIE_NAME = "scrable_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

function getSecret() {
  const secret = process.env.AUTH_SECRET || "dev-change-this-secret";
  return secret;
}

function getSharedPassword() {
  return process.env.GAME_PASSWORD || "ChangeMeNow123!";
}

export function assertAuthConfig() {
  const password = getSharedPassword();
  const secret = getSecret();

  if (process.env.NODE_ENV === "production") {
    if (password.length < 12) {
      throw new Error("GAME_PASSWORD must be at least 12 characters in production.");
    }
    if (secret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production.");
    }
  }
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createSessionToken() {
  const payloadObj = {
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString("hex")
  };

  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;
  const expected = signPayload(payload);

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return false;
  }

  const decoded = safeJsonParse(base64UrlDecode(payload));
  if (!decoded || typeof decoded !== "object") {
    return false;
  }

  if (typeof decoded.exp !== "number" || decoded.exp < Date.now()) {
    return false;
  }

  return true;
}

export function verifyPassword(inputPassword) {
  const candidate = String(inputPassword || "").normalize("NFKC");
  const expected = getSharedPassword().normalize("NFKC");

  const candidateBuffer = Buffer.from(candidate, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function parseCookies(headerValue) {
  const raw = String(headerValue || "");
  const result = {};

  raw.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return;
    }
    const cookieValue = rest.join("=");
    try {
      result[key] = decodeURIComponent(cookieValue);
    } catch {
      result[key] = cookieValue;
    }
  });

  return result;
}

export function getClientIpFromHeaders(headersLike) {
  const xff = headersLike.get ? headersLike.get("x-forwarded-for") : headersLike["x-forwarded-for"];
  const remote = headersLike.get ? headersLike.get("x-real-ip") : headersLike["x-real-ip"];
  const candidate = String(xff || remote || "").split(",")[0].trim();
  return candidate || "unknown";
}

export function isSecureRequest(headersLike) {
  const forwardedProto = headersLike?.get ? headersLike.get("x-forwarded-proto") : headersLike?.["x-forwarded-proto"];
  return String(forwardedProto || "").toLowerCase() === "https";
}

export function sessionCookieOptions(secure = false) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24
  };
}
