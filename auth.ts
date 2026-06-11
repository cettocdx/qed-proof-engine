import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHash, timingSafeEqual } from "node:crypto";
import { authConfig } from "@/auth.config";

/** Constant-time string comparison via fixed-length hashes. */
function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminEmail || !adminPassword) return null;
        if (!safeEqual(String(credentials.email ?? ""), adminEmail)) return null;
        if (!safeEqual(String(credentials.password ?? ""), adminPassword)) return null;
        return { id: "admin", email: adminEmail, name: "Admin", role: "admin" };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role ?? "user";
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { role?: string }).role = String(token.role ?? "user");
      return session;
    },
  },
  session: { strategy: "jwt" },
});
