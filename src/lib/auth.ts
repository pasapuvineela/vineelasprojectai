// src/lib/auth.ts
// Custom session-based authentication (no Netlify Identity / GoTrue).
// Password hashing lives in ./password.js (scrypt, "salt:hash" hex format).
import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, sessions } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";

export { hashPassword, verifyPassword };

const SESSION_COOKIE = "netsage_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: Date | null;
};

function toPublicUser(u: typeof users.$inferSelect): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

async function createSessionForUser(userId: number) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  setCookie(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export const registerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; email: string; password: string; role?: "admin" | "engineer" }) => data,
  )
  .handler(async ({ data }) => {
    const existing = await db.select().from(users).where(eq(users.email, data.email));
    if (existing.length > 0) {
      throw new Error("An account with this email already exists.");
    }

    const passwordHash = hashPassword(data.password);
    const role = data.role === "admin" ? "admin" : "engineer";

    const [user] = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash, role })
      .returning();

    await createSessionForUser(user.id);

    return toPublicUser(user);
  });

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const [user] = await db.select().from(users).where(eq(users.email, data.email));
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      throw new Error("Invalid email or password.");
    }

    await createSessionForUser(user.id);

    return toPublicUser(user);
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const sessionId = getCookie(SESSION_COOKIE);
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { success: true };
});

export const getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const sessionId = getCookie(SESSION_COOKIE);
  if (!sessionId) return null;

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return toPublicUser(row.user);
});

/**
 * Returns whether the given user's role is within the allowed set.
 * Routes should call this in `beforeLoad` and throw their own `redirect()`
 * when it returns false — this helper only reports the boolean.
 */
export function requireRole(user: PublicUser | null | undefined, roles: string[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}
