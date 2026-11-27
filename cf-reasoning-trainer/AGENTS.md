# CF Reasoning Trainer — Development Instructions

We are building a personalized, single-player Codeforces training application using the existing repository at `../my-code-sheet` as a starting point.

The original repository is read-only. All development must happen in the current new project workspace.

## Product Constraints

- Analyze Codeforces problems rated 1200–2000 inclusive.
- Store independently derived reasoning classifications and verified mathematical insights.
- Analyze individual Codeforces profiles, ratings, contests and submissions.
- Provide personalized training toward a target rating and deadline.
- Generate adaptive daily problem assignments.
- Track real thinking time, independent discovery, assistance and implementation progress.
- Incorporate recent Codeforces problem-style trends.
- Refresh the problem catalog and knowledge base weekly.
- Provide personal gamification and progress tracking.

Do not implement spreadsheets, Kanban, club features, mentors, social leaderboards or contest hosting.

## Architecture Principles

1. Prefer the original React, TypeScript, Vite, Express and Drizzle architecture.
2. Reuse functioning code instead of rewriting everything.
3. Do not introduce additional frameworks or services without justification.
4. Separate deterministic scheduling from LLM-based mathematical analysis.
5. Keep one persistent problem catalog shared by all user accounts.
6. Keep each user's training and submission history private.
7. Use database migrations and preserve data integrity.
8. Keep API keys server-side.
9. Do not copy sensitive files or secrets from the original repository.
10. Do not modify the original repository.

## AI Rules

- No paid AI requests unless the current phase explicitly authorizes them.
- Do not perform bulk AI analysis without explicit approval.
- Do not use Codeforces tags or editorials as inputs to initial problem classification.
- Require authorized problem statements for analysis.
- Store model and prompt versions, uncertainty and verification status.
- Never claim mathematical verification without supporting evidence.
- Use mocks during development whenever possible.

## Engineering Workflow

Work only on the current authorized phase.

Before significant changes, identify the relevant existing code and the smallest reasonable implementation.

After changes:

- Run appropriate tests and type checks.
- Run the build when relevant.
- Inspect the diff for unintended changes.
- Record remaining issues.
- Update `PHASE_STATUS.md` with a concise handoff.

Do not repeatedly rewrite the entire project documentation.

Do not add unnecessary dependencies.

Do not commit, push, deploy or start production jobs without explicit permission.

## Required Final Report

At the end of each task, provide:

1. What was implemented.
2. Important files changed.
3. Tests actually executed and results.
4. Security or correctness concerns.
5. Any unfinished requirements.
6. Whether the phase acceptance criteria are satisfied.

Stop at the end of the current phase. Do not begin the next phase automatically.
