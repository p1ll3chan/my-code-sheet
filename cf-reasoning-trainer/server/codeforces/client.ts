import type { Pool } from "pg";
import { z } from "zod";
import { cfContestSchema, cfHandleSchema, cfProblemsetSchema, cfRatingChangeSchema, cfSubmissionSchema, cfUserSchema } from "./types";

type Method = "problemset.problems" | "contest.list" | "user.info" | "user.rating" | "user.status";
export class CodeforcesError extends Error {
  constructor(public code: "not_found" | "rate_limited" | "unavailable" | "invalid_response", public status: number) { super(code); }
}
export interface RequestGate { acquire(): Promise<void>; defer(milliseconds: number): Promise<void>; }

// One persisted reservation schedule is shared by all requests and all app
// instances using this database. The official limit is one call per 2 seconds.
export function postgresRequestGate(pool: Pool): RequestGate {
  return {
    async acquire() {
      const client = await pool.connect();
      let waitMs = 0;
      try {
        await client.query("begin");
        const { rows } = await client.query<{ next_allowed_at: Date; now: Date }>("select next_allowed_at, clock_timestamp() as now from cf_api_gate where id=1 for update");
        if (!rows[0]) throw new Error("Codeforces API gate migration is missing");
        const slot = Math.max(rows[0].next_allowed_at.getTime(), rows[0].now.getTime());
        waitMs = Math.max(0, slot - rows[0].now.getTime());
        await client.query("update cf_api_gate set next_allowed_at=$1 where id=1", [new Date(slot + 2200)]);
        await client.query("commit");
      } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
      finally { client.release(); }
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    },
    async defer(milliseconds) {
      await pool.query("update cf_api_gate set next_allowed_at=greatest(next_allowed_at, clock_timestamp() + $1::integer * interval '1 millisecond') where id=1", [Math.min(60_000, Math.max(0, Math.ceil(milliseconds)))]);
    },
  };
}

type Options = { fetchImpl?: typeof fetch; gate: RequestGate; sleep?: (ms: number) => Promise<void>; now?: () => number };
export function createCodeforcesClient({ fetchImpl = fetch, gate, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }: Options) {
  const cache = new Map<string, { until: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();

  async function request<T>(method: Method, params: Record<string, string>, schema: z.ZodType<T>, ttlMs = 0, fresh = false): Promise<T> {
    const url = new URL(`https://codeforces.com/api/${method}`);
    for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) url.searchParams.set(key, value);
    url.searchParams.set("lang", "en");
    const key = url.toString();
    const hit = cache.get(key);
    if (!fresh && hit && hit.until > now()) return hit.value as T;
    if (pending.has(key)) return pending.get(key) as Promise<T>;
    const work = (async () => {
      let lastError = new CodeforcesError("unavailable", 503);
      for (let attempt = 0; attempt < 3; attempt++) {
        await gate.acquire();
        try {
          const response = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
          if (response.status === 429 || response.status >= 500) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2200 * (attempt + 1);
            await gate.defer(backoff);
            lastError = new CodeforcesError(response.status === 429 ? "rate_limited" : "unavailable", response.status === 429 ? 429 : 503);
          } else if (!response.ok) throw new CodeforcesError("unavailable", 502);
          else {
            let envelope: unknown;
            try { envelope = await response.json(); } catch { throw new CodeforcesError("invalid_response", 502); }
            const parsed = z.object({ status: z.enum(["OK", "FAILED"]), comment: z.string().optional(), result: z.unknown().optional() }).safeParse(envelope);
            if (!parsed.success) throw new CodeforcesError("invalid_response", 502);
            if (parsed.data.status === "FAILED") {
              if (/call limit exceeded/i.test(parsed.data.comment ?? "")) {
                await gate.defer(4400);
                lastError = new CodeforcesError("rate_limited", 429);
              } else if (/not found|does not exist|no such user/i.test(parsed.data.comment ?? "")) throw new CodeforcesError("not_found", 404);
              else throw new CodeforcesError("unavailable", 502);
            } else {
              const result = schema.safeParse(parsed.data.result);
              if (!result.success) throw new CodeforcesError("invalid_response", 502);
              if (ttlMs) {
                if (cache.size >= 100) cache.delete(cache.keys().next().value!);
                cache.set(key, { until: now() + ttlMs, value: result.data });
              }
              return result.data;
            }
          }
        } catch (error) {
          if (error instanceof CodeforcesError && (error.code === "not_found" || error.code === "invalid_response" || (error.code === "unavailable" && error.status === 502))) throw error;
          lastError = error instanceof CodeforcesError ? error : new CodeforcesError("unavailable", 503);
        }
        if (attempt < 2) await sleep(2200 * (attempt + 1));
      }
      throw lastError;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }

  return {
    problemset: (fresh = false) => request("problemset.problems", {}, cfProblemsetSchema, 6 * 60 * 60 * 1000, fresh),
    contests: (fresh = false) => request("contest.list", { gym: "false" }, cfContestSchema.array(), 6 * 60 * 60 * 1000, fresh),
    user: (handle: string) => request("user.info", { handles: cfHandleSchema.parse(handle) }, cfUserSchema.array()),
    ratings: (handle: string) => request("user.rating", { handle: cfHandleSchema.parse(handle) }, cfRatingChangeSchema.array()),
    submissions: (handle: string, from: number, count = 1000) => {
      if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error("Invalid pagination parameters");
      return request("user.status", { handle: cfHandleSchema.parse(handle), from: String(from), count: String(count) }, cfSubmissionSchema.array());
    },
  };
}
export type CodeforcesClient = ReturnType<typeof createCodeforcesClient>;
