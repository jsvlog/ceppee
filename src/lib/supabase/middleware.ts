import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = ["/dashboard", "/admin", "/exam", "/study", "/account"];
const authPaths = ["/login", "/signup"];

/**
 * Where to send a signed-out visitor, remembering the EXACT page they wanted.
 *
 * Built from a plain URL on purpose: `request.nextUrl.clone()` keeps the original
 * query internally, so `url.search = ""` followed by `searchParams.set("next", …)`
 * re-serialises the old params too (`/login?mode=practice&next=…`).
 */
function loginRedirect(request: NextRequest) {
  const target = new URL("/login", request.url);
  target.searchParams.set("next", request.nextUrl.pathname + (request.nextUrl.search || ""));
  return NextResponse.redirect(target);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = protectedPaths.some((p) => path === p || path.startsWith(p + "/"));
  const isAuthPage = authPaths.includes(path);

  // This middleware runs on EVERY navigation, and `supabase.auth.getUser()` is a
  // network round-trip to Supabase Auth. Paying it on a public page view is pure
  // latency — the Server Components resolve the user themselves (getUserContext,
  // cached per request), so a visitor used to wait for that round-trip up to three
  // times (middleware + layout + page) before anything rendered.
  //
  // Fast path 1: no Supabase auth cookie at all -> definitely anonymous.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

  if (!hasAuthCookie) {
    if (isProtected) return loginRedirect(request);
    return NextResponse.next({ request });
  }

  // Fast path 2: public routes (/review/*, /read/*, /, /pricing, /coaches). Protected
  // routes keep the full check below — that is where the session is refreshed and a
  // signed-out visitor is bounced to /login.
  if (!isProtected && !isAuthPage) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) return loginRedirect(request);

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
