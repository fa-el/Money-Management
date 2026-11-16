import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "mm_session";
const AUTH_PAGES = ["/login", "/register"];

/**
 * Pemeriksaan optimistis: tanpa cookie sesi, arahkan ke /login. Validasi sesi
 * sebenarnya tetap dilakukan backend di setiap request API.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!hasSession && !isAuthPage) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && (isAuthPage || pathname === "/")) {
    return NextResponse.redirect(new URL("/spaces", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg)$).*)"],
};
