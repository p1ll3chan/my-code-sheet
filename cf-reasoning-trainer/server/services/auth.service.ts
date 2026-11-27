import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { eq, DrizzleQueryError } from "drizzle-orm";
import type { Database } from "../db";
import { users } from "../db/schema";
import type { RegisterInput, PublicUser } from "../../shared/contracts";
import { HttpError } from "../http";

// Only this explicit projection leaves the authentication service.
export const publicUserColumns = { id: users.id, username: users.username, name: users.name };
export async function createAuthService(db: Database) {
  const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  return {
    async register(input: RegisterInput): Promise<PublicUser> {
      const passwordHash = await bcrypt.hash(input.password, 12);
      try {
        const [user] = await db.insert(users).values({ username: input.username, name: input.name, email: input.email, passwordHash }).returning(publicUserColumns);
        return user;
      } catch (error) {
        const databaseError = error instanceof DrizzleQueryError ? error.cause : error;
        if ((databaseError as { code?: string })?.code === "23505") throw new HttpError(409, "An account with those details already exists");
        throw error;
      }
    },
    async authenticate(username: string, password: string): Promise<PublicUser | false> {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
      if (!user || !valid) return false;
      return { id: user.id, username: user.username, name: user.name };
    },
    async findPublicUser(id: number): Promise<PublicUser | undefined> {
      const [user] = await db.select(publicUserColumns).from(users).where(eq(users.id, id));
      return user;
    },
  };
}
export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
