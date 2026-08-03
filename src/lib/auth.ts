import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
// Support both plain and bcrypt-hashed admin password via ADMIN_PASSWORD env.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
// Pre-hashed variant (optional)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

async function verifyPassword(input: string): Promise<boolean> {
  if (ADMIN_PASSWORD_HASH) {
    try {
      return await bcrypt.compare(input, ADMIN_PASSWORD_HASH);
    } catch {
      return false;
    }
  }
  // Plain text comparison (acceptable for single admin with strong random password)
  return input === ADMIN_PASSWORD;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) return null;
        const usernameOk = credentials.username === ADMIN_USERNAME;
        const passwordOk = await verifyPassword(credentials.password);
        if (usernameOk && passwordOk) {
          return { id: "admin", name: ADMIN_USERNAME, email: "admin@local", role: "admin" } as any;
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET || process.env.SERVICE_PASSWORD_64_NEXTAUTH || "dev-secret-change-me",
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role || "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).name = token.name;
      }
      return session;
    },
  },
};

export { ADMIN_USERNAME };
