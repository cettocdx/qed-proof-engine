import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Middleware uses the edge-compatible authConfig (no Node.js built-ins).
 * Full Credentials provider with node:crypto lives in auth.ts (Node.js runtime only).
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/admin/:path*"],
};
