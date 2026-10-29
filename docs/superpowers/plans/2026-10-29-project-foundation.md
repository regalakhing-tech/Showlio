# Showlio project foundation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in the current session. Steps use checkboxes for tracking.

**Goal:** Organize the blueprint into a runnable starter, add verified GitHub CI/CD, and push the initial repository.

**Architecture:** Keep public assets separate from private PHP source. A small PHP front controller serves one health endpoint. Node scripts build Tailwind, validate syntax and test HTTP behavior. A single GitHub workflow gates optional Vercel deployment on checks.

**Tech stack:** PHP 8.5, Node.js 24 LTS, Tailwind CSS 4.3.3, Vercel deployment REST API, community PHP runtime 0.9.0.

## Global constraints

- Preserve `SHOWLIO_INFO.md` as the original product blueprint.
- Only project folders and starter files are requested; no full MVP or upload manager.
- No real secrets, no database execution, no force push.
- Vercel credentials are configured in GitHub repository secrets.

### Task 1: Working source boundaries and local HTTP behavior

Files: `api/index.php`, `src/bootstrap.php`, `src/config/app.php`, `src/controllers/HealthController.php`, `src/helpers/http.php`, `scripts/router.php`, `public/index.html`, `public/assets/js/app.js`, `src/styles/app.css`, `tests/http.test.mjs`.

Interface: `GET /api/health` returns JSON `{ "status": "ok", "app": "Showlio" }`; HEAD has the same headers and no body. Static files come only from `public/`. Unknown API paths return JSON 404 and unsupported health methods return 405 with `Allow: GET, HEAD`.

- [x] Write HTTP tests using Node's built-in test runner and PHP's built-in server, then run `node --test tests/http.test.mjs` and confirm missing starter fails.
- [x] Add the PHP entry point, bootstrap, configuration, response helper, controller and safe development router.
- [x] Add a small accessible coming-soon starter page, JavaScript and Tailwind input. Preserve directories for services, middleware and images with purpose documentation.
- [x] Run the HTTP suite after the CSS build and confirm all behaviors pass.

### Task 2: Reproducible commands and checked deployment

Files: `package.json`, `package-lock.json`, `.node-version`, `.env.example`, `.gitignore`, `.vercelignore`, `.editorconfig`, `.gitattributes`, `scripts/check.mjs`, `scripts/deploy.mjs`, `scripts/lib/vercel.mjs`, `scripts/smoke.mjs`, `tests/deploy.test.mjs`, `vercel.json`, `.github/workflows/ci-cd.yml`, `.github/dependabot.yml`.

Interfaces: `npm run build` compiles CSS; `npm run dev` starts local PHP; `npm run check` checks syntax, builds and tests; `node scripts/smoke.mjs URL` checks deployed health.

- [x] Pin Tailwind CLI/CSS, generate the lockfile with npm and install dependencies. Use Vercel REST deployment to avoid the CLI dependency graph.
- [x] Add commands and configuration. PHP source is included in the serverless function; rewrites target API paths only.
- [x] Add CI for pull requests and main pushes; make production depend on it. Skip deployment with a clear setup notice when Vercel secrets are absent.
- [x] Validate workflow/configuration and run `npm run check`. Inspect packaged function boundaries and public output.

### Task 3: Setup documentation and initial push

Files: `README.md`, `docs/PROJECT_STRUCTURE.md`, `docs/DEPLOYMENT.md`, `database/README.md`, `database/schema.sql`, `database/policies.sql`.

- [x] Document local prerequisites, exact run commands, folder responsibilities, environment variables, GitHub secrets, expected CI behavior and the remaining MVP work.
- [x] Keep SQL files explicitly comment-only until schema and RLS implementation is requested and verified.
- [x] Inspect the full change and tracked files, run final checks, commit with a repository-local identity, push `main` to the supplied origin and verify `HEAD` matches `origin/main`.
- [x] Document the verification commands and live deployment requirements; report the final push and CI result in the delivery message.
