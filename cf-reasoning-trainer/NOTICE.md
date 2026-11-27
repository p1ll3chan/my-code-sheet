# Source attribution

This project reuses selected code from the local `my-code-sheet` repository, audited at commit `db1f5c9`. The original software is MIT licensed, copyright 2026 Abhijith.R.Pillai. The original license text is retained unchanged in `LICENSE`.

`docs/REUSE_MANIFEST.json` records the 21 positively allowlisted files and their original SHA-256 hashes. Reused material includes the React entrypoint, authentication form, sidebar/layout, UI primitives, styles, utility and toast hooks, Tailwind/PostCSS configuration and license. Authentication and navigation were adapted to the single-player scope. The existing React/Vite/Express/Drizzle/Passport architecture and controller/service patterns were retained; backend security boundaries and database schema were implemented for the independent project.

No original Git metadata/history, environment configuration, database, credentials, uploads, dependency directories or generated build output were copied. Source files in the original directory remain unchanged. The manifest describes provenance, not the final hashes of adapted files.

Third-party packages retain their own licenses. `package-lock.json` records the independent dependency installation. Helmet and express-rate-limit supply security headers and request throttling; the development-only embedded-postgres package supplies pinned real PostgreSQL binaries for reproducible setup and integration tests. Node's built-in test runner avoids adding a separate test framework. None of these additions introduces a new application framework or hosted service.
