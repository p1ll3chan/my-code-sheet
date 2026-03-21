import bcrypt from "bcrypt";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { User } from "@shared/schema";

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  return bcrypt.compare(supplied, stored);
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function createUser(data: typeof users.$inferInsert): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}
