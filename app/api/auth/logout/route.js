import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isSecureRequest } from "@/lib/auth";

export async function POST(request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecureRequest(request.headers),
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
  return response;
}
