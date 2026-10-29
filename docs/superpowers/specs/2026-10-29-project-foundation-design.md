# Showlio project foundation

Source: `SHOWLIO_INFO.md`. Scope confirmed by the owner: project folders and starter files, with GitHub CI/CD and an initial push to `regalakhing-tech/Showlio`.

## Decision

Use the blueprint's plain PHP, HTML, vanilla JavaScript and compiled Tailwind CSS structure. A folder-only template would not prove routing or deployment; a full framework would add conventions outside the blueprint. This foundation supplies a runnable starter and preserves clear places for later MVP work.

## Boundaries

- `public/` contains only browser-safe files. The starter page states that the platform is under development; it does not advertise working account or discovery features.
- `api/index.php` handles JSON API requests and dispatches the initial `/api/health` route.
- `src/` contains PHP configuration, controllers, helpers, middleware and services. The health response proves PHP execution only and does not imply Supabase or Gemini connectivity.
- `database/` documents the planned schema and policy locations without shipping an untested database implementation.
- `scripts/` contains local serving, checks and deployment verification. `tests/` exercises actual HTTP requests against PHP.
- No user accounts, uploads, database changes, AI integration or portfolio imports are part of this foundation.

## Configuration and deployment

Use PHP 8.5, Node.js 24 LTS, pinned npm dependencies and a committed lockfile. Vercel uses the documented community `vercel-php@0.9.0` runtime, a `public` static output directory, and API-only rewrites. Include PHP source in the function bundle. Local PHP serves the same public files and API paths without exposing source files.

GitHub Actions runs the same syntax, build and HTTP checks as local development on pull requests and pushes to `main`. Production deployment depends on successful checks and runs only for trusted `main` events. Missing Vercel secrets produce a visible setup notice while CI continues. Configured deployments use Vercel's REST API to build the exact checked GitHub commit in the linked Vercel project, wait for readiness, and verify the public health endpoint. Native Vercel Git deployment is disabled to avoid a second deployment path bypassing checks. Runs are serialized to avoid overlapping production deployments.

The deployment script uses Node's built-in HTTP API instead of a Vercel CLI dependency. This keeps local build dependencies small and avoids introducing the CLI's dependency audit findings into the foundation. Test request scoping, commit pinning, readiness, failed builds, timeouts and missing configuration without live credentials.

Ignore real environment files, dependencies, editor files, generated CSS and Vercel state. Supply environment names without secret values, with modern Supabase publishable keys and legacy anon compatibility documented. No elevated Supabase key is needed by the starter.

## Verification

Verify the index, compiled CSS and JavaScript are served, JSON health is correct, HEAD requests have no body, unsupported methods return 405, unknown API routes return 404, and private repository files are unavailable over HTTP. Check PHP and JavaScript syntax, validate workflow syntax and Vercel configuration, scan staged files for secrets, then push without force and verify the remote commit. Real Vercel execution requires an authenticated Vercel project and cannot be claimed from local tests alone.
