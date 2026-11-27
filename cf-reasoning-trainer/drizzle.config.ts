import { defineConfig } from "drizzle-kit";

// Generating reviewed SQL does not require or load database credentials.
export default defineConfig({ schema: "./server/db/schema.ts", out: "./migrations", dialect: "postgresql" });
