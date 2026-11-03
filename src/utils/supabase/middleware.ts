import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Diagnostic routes to protect
  const diagnosticRoutes = [
    "/scan",
    "/viewport",
    "/modes",
    "/safety",
    "/stress",
    "/defects",
    "/export",
    "/setup",
    "/material",
    "/tuner",
  ];

  const pathname = request.nextUrl.pathname;
  const isDiagnosticRoute = diagnosticRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // If unauthenticated and accessing diagnostic route, redirect to /auth
  // Note: if supabase is not yet configured with real credentials (placeholder), allow access in dev mode so the developer can evaluate the screens
  const isPlaceholderConfig =
    supabaseUrl.includes("placeholder") || supabaseAnonKey.includes("placeholder");

  if (!user && isDiagnosticRoute && !isPlaceholderConfig) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

