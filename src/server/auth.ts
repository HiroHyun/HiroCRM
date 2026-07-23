// Single-admin auth: credentials from env, JWT session.
// Missing env credentials mean authorize() always refuses — an unset .env is
// a locked door, never an open one. Comparison is constant-time over
// fixed-length sha256 digests, both fields always evaluated.

import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextResponse } from "next/server";
import { jsonError } from "./http";

function digestsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        const adminUser = process.env.ADMIN_USER;
        const adminPass = process.env.ADMIN_PASS;
        if (!adminUser || !adminPass) return null;
        // Both comparisons always run; no short-circuit on the username.
        const userOk = digestsEqual(credentials?.username ?? "", adminUser);
        const passOk = digestsEqual(credentials?.password ?? "", adminPass);
        return userOk && passOk ? { id: "admin", name: adminUser } : null;
      },
    }),
  ],
};

/**
 * Route guard: null when a session exists, otherwise the 401 response to
 * return. Usage: `const denied = await requireSession(); if (denied) return denied;`
 */
export async function requireSession(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  return session ? null : jsonError(401, "unauthorized");
}
