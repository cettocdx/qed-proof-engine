import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config — no Node.js built-ins here.
 * Used by middleware (Edge Runtime). Full credentials logic is in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      if (nextUrl.pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false; // middleware redirects to signIn page
      }
      return true;
    },
  },
  providers: [], // providers added in auth.ts (Node.js runtime only)
} satisfies NextAuthConfig;
