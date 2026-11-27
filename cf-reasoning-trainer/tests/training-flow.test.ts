import assert from "node:assert/strict";
import { test } from "node:test";
import type { CodeforcesClient } from "../server/codeforces/client";
import { Browser, testApi, testDatabase } from "./helpers";

test("authenticated handle-to-goal-to-training flow uses real private records with no AI", async () => {
  const fixture = await testDatabase();
  const fake = { async problemset() { return { problems: [
    { contestId: 500, index: "A", name: "Fixture A", type: "PROGRAMMING", rating: 1200 },
    { contestId: 500, index: "B", name: "Fixture B", type: "PROGRAMMING", rating: 1200 },
  ], problemStatistics: [{ contestId: 500, index: "A", solvedCount: 100 }] }; },
  async contests() { return [{ id: 500, name: "Fixture Contest", type: "CF", phase: "FINISHED", durationSeconds: 7200, startTimeSeconds: 1_700_000_000 }]; },
  async user() { return [{ handle: "Fixture", rating: 1200, maxRating: 1300 }]; },
  async ratings() { return []; }, async submissions() { return []; } } as CodeforcesClient;
  const api = await testApi(fixture.config, fixture.database, fake);
  try {
    const a = new Browser(api.base, fixture.config.APP_ORIGIN);
    const b = new Browser(api.base, fixture.config.APP_ORIGIN);
    assert.equal((await a.register()).response.status, 201);
    assert.equal((await b.register()).response.status, 201);
    const sync = await a.request("POST", "/api/codeforces/sync", { handle: "Fixture" });
    assert.equal(sync.status, 200); assert.equal(sync.data.rating, 1200);
    const deadline = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const goal = { targetRating: 1500, deadline, dailyMinutes: 60, trainingDays: [0, 1, 2, 3, 4, 5, 6],
      intensity: "standard", focus: "balanced", progression: "strict-band", timeZone: "UTC" };
    assert.equal((await a.request("PUT", "/api/training/goal", goal)).status, 200);
    const plan = await a.request("POST", "/api/training/plan");
    assert.equal(plan.status, 200);
    assert.equal(plan.data.profile.currentRating, 1200);
    assert.equal(plan.data.progress.estimatedReadiness, null);
    assert(plan.data.today.assignments.length > 0);
    assert(plan.data.today.reservedMinutes <= plan.data.today.capacityMinutes);
    const id = plan.data.today.assignments[0].id;
    assert.equal((await a.request("POST", `/api/training/assignments/${id}/event`, { type: "start" })).status, 200);
    assert.equal((await a.request("POST", `/api/training/assignments/${id}/event`, { type: "observation", text: "Invariant found" })).status, 200);
    assert.equal((await a.request("POST", `/api/training/assignments/${id}/event`, { type: "assist", source: "hint" })).status, 200);
    assert.equal((await a.request("POST", `/api/training/assignments/${id}/event`, { type: "finish", outcome: "solved", independent: true })).status, 400);
    assert.equal((await a.request("POST", `/api/training/assignments/${id}/event`, { type: "finish", outcome: "solved", independent: false })).status, 200);
    const after = await a.request("GET", "/api/training/overview");
    assert.equal(after.data.today.assignments[0].status, "completed");
    assert.equal(after.data.today.assignments[0].observation, "Invariant found");
    assert.equal(after.data.progress.completedAssignments, 1);
    assert.equal((await a.request("GET", "/api/training/history")).data.length, plan.data.today.assignments.length);
    assert.equal((await b.request("PUT", "/api/training/goal", goal)).status, 200);
    assert.equal((await b.request("POST", `/api/training/assignments/${id}/event`, { type: "start" })).status, 404);
    assert.deepEqual((await b.request("GET", "/api/training/history")).data, []);
  } finally { await api.close(); await fixture.close(); }
});
