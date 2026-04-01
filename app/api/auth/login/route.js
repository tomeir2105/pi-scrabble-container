import { NextResponse } from "next/server";
import {
  assertAuthConfig,
  AUTH_COOKIE_NAME,
  createSessionToken,
  getClientIpFromHeaders,
  isSecureRequest,
  sessionCookieOptions,
  verifyPassword
} from "@/lib/auth";

const MAX_FAILURES = 3;
const BLOCK_MS = 1000 * 60 * 15;
const attemptsByIp = new Map();
const FAILURE_DELAY_MS = 350;
const GLOBAL_FAILURE_WINDOW_MS = 1000 * 10;
const GLOBAL_FAILURE_THRESHOLD = 5;
const GLOBAL_BLOCK_MS = 1000 * 60 * 5;
const MAX_BODY_BYTES = 1024;
const MAX_PASSWORD_LENGTH = 128;
const globalFailureTimestamps = [];
let globalBlockedUntil = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAttemptRecord(ip) {
  const now = Date.now();
  const current = attemptsByIp.get(ip);
  if (!current) {
    const fresh = { failures: 0, blockedUntil: 0, updatedAt: now };
    attemptsByIp.set(ip, fresh);
    return fresh;
  }

  // Simple stale cleanup by rotation window.
  if (current.updatedAt < now - BLOCK_MS * 4) {
    const fresh = { failures: 0, blockedUntil: 0, updatedAt: now };
    attemptsByIp.set(ip, fresh);
    return fresh;
  }

  return current;
}

function reject(message, status = 401) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function recordGlobalFailure(now) {
  globalFailureTimestamps.push(now);
  while (globalFailureTimestamps.length > 0 && now - globalFailureTimestamps[0] > GLOBAL_FAILURE_WINDOW_MS) {
    globalFailureTimestamps.shift();
  }
  if (globalFailureTimestamps.length > GLOBAL_FAILURE_THRESHOLD) {
    globalBlockedUntil = now + GLOBAL_BLOCK_MS;
    globalFailureTimestamps.length = 0;
  }
}

export async function POST(request) {
  assertAuthConfig();
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return reject("בקשה לא תקינה.", 400);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return reject("בקשה גדולה מדי.", 413);
  }

  const ip = getClientIpFromHeaders(request.headers);
  const record = getAttemptRecord(ip);
  const now = Date.now();

  if (globalBlockedUntil > now) {
    return reject("הכניסה חסומה זמנית עקב פעילות חשודה. נסו שוב מאוחר יותר.", 429);
  }

  if (record.blockedUntil > now) {
    return reject("יותר מדי ניסיונות כושלים. נסו שוב מאוחר יותר.", 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return reject("בקשה לא תקינה.", 400);
  }

  const password = typeof body?.password === "string" ? body.password.normalize("NFKC") : "";
  if (!password || password.length > MAX_PASSWORD_LENGTH || /[\u0000-\u001f\u007f]/.test(password)) {
    return reject("פרטי התחברות שגויים.");
  }

  const ok = verifyPassword(password);
  if (!ok) {
    await wait(FAILURE_DELAY_MS);
    recordGlobalFailure(now);

    if (globalBlockedUntil > now) {
      return reject("הכניסה חסומה זמנית עקב פעילות חשודה. נסו שוב מאוחר יותר.", 429);
    }

    record.failures += 1;
    record.updatedAt = now;

    if (record.failures >= MAX_FAILURES) {
      record.blockedUntil = now + BLOCK_MS;
      attemptsByIp.set(ip, record);
      return reject("יותר מדי ניסיונות כושלים. נסו שוב מאוחר יותר.", 429);
    }

    attemptsByIp.set(ip, record);
    return reject("פרטי התחברות שגויים.");
  }

  attemptsByIp.set(ip, { failures: 0, blockedUntil: 0, updatedAt: now });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(), sessionCookieOptions(isSecureRequest(request.headers)));
  return response;
}
