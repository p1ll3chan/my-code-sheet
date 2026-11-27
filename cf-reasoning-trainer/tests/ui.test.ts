import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import App from "../client/src/App";
import { queryClient } from "../client/src/lib/queryClient";
import { navigation } from "../client/src/lib/navigation";

const testUser = { id: 9271, username: "synthetic_user", name: "Synthetic User" };
function renderRoute(path: string, signedIn: boolean, coverage?: unknown) {
  queryClient.clear();
  queryClient.setQueryData(["/api/user"], signedIn ? testUser : null);
  if (signedIn) queryClient.setQueryData(["/api/codeforces/profile", testUser.id], null);
  if (signedIn) queryClient.setQueryData(["/api/training/overview", testUser.id], { serverNow: "2026-10-13T00:00:00Z", goal: null, profile: null, today: null, progress: null });
  if (signedIn && coverage) queryClient.setQueryData(["/api/reasoning/coverage", testUser.id], coverage);
  const hook = (): [string, (to: string) => void] => [path, () => {}];
  return renderToStaticMarkup(createElement(Router, { hook, children: createElement(App) }));
}

test("all five primary routes render their real empty state and the same accessible navigation", () => {
  const headings = new Map([
    ["/dashboard", "Welcome, Synthetic User"],
    ["/today", "Today&#x27;s Training"],
    ["/reasoning", "Reasoning Profile"],
    ["/progress", "Progress and History"],
    ["/settings", "Training Settings"],
  ]);
  assert.equal(navigation.length, 5);
  for (const item of navigation) {
    const html = renderRoute(item.href, true);
    assert.ok(html.includes(headings.get(item.href)!), `${item.href} page did not render`);
    assert.match(html, /aria-label="Training areas"/);
    assert.ok(new RegExp(`<a(?=[^>]*href="${item.href}")(?=[^>]*aria-current="page")`).test(html), `${item.href} is not marked active`);
    for (const destination of navigation) assert.match(html, new RegExp(`href="${destination.href}"`));
    assert.doesNotMatch(html, /href="\/(?:sheets|kanban|clubs|mentors|leaderboard|contests)(?:\/|\")/i);
  }
  assert.match(renderRoute("/today", true), /Set a rating goal first/);
  assert.match(renderRoute("/reasoning", true), /No reasoning profile yet/);
  assert.match(renderRoute("/reasoning", true), /href="\/knowledge-coverage"/);
  assert.match(renderRoute("/progress", true), /No imported Codeforces history/);
  assert.match(renderRoute("/settings", true), /Training goal not set/);
});

test("shared coverage view is protected and renders persisted values or a clear empty state", () => {
  const empty = { cataloged: 0, eligible: 0, unrated: 0, lastCatalogSync: null, catalogError: null,
    authorizedStatements: 0, completedAnalysis: 0,
    stages: { awaitingStatement: 0, ready: 0, queued: 0, analyzing: 0, needsReview: 0, verified: 0, failed: 0, blocked: 0 } };
  assert.match(renderRoute("/knowledge-coverage", true, empty), /No catalog metadata yet/);
  const populated = { ...empty, cataloged: 10, eligible: 4, unrated: 2, authorizedStatements: 1,
    lastCatalogSync: "2026-10-15T12:00:00Z", stages: { ...empty.stages, awaitingStatement: 3, verified: 1 } };
  const html = renderRoute("/knowledge-coverage", true, populated);
  assert.match(html, /Reasoning knowledge coverage/);
  assert.match(html, /Eligible rated 1200–2000/);
  assert.match(html, />4<\/p>/);
  assert.doesNotMatch(renderRoute("/knowledge-coverage", false), /Reasoning knowledge coverage/);
});

test("private pages do not render for signed-out users; auth page does not show sign-in to signed-in users", () => {
  for (const item of navigation) {
    const html = renderRoute(item.href, false);
    assert.doesNotMatch(html, /Synthetic User|Private practice journal|Training goal not set|Training overview/);
  }
  assert.doesNotMatch(renderRoute("/auth", true), /Sign In/);
});

test("removed product paths render the not-found page with no legacy navigation", () => {
  for (const path of ["/sheets", "/kanban", "/clubs", "/mentors", "/leaderboard", "/contest-hosting"]) {
    const html = renderRoute(path, true);
    assert.match(html, /Page not found/);
    assert.doesNotMatch(html, /aria-label="Training areas"/);
  }
});
