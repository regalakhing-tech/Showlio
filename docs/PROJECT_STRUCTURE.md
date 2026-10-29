# File organization guide

The repository follows section 8 of `SHOWLIO_INFO.md`, with `scripts/`, `tests/` and `.github/` added for repeatable development and deployment.

| Location | Put here | Keep out |
| --- | --- | --- |
| `api/index.php` | Route dispatch and middleware calls | SQL, AI prompts, large request handlers |
| `src/config/` | Server configuration read from environment | Committed credentials |
| `src/controllers/` | Profile, project, discovery, auth and AI request handlers | Browser scripts and persistent uploads |
| `src/services/` | Supabase REST/Auth/Storage and Gemini calls | Service-role access for normal creator CRUD |
| `src/middleware/` | Token verification, ownership checks and rate limits | Publicly served source |
| `src/helpers/` | Small shared validation and response functions | Unrelated feature implementations |
| `src/styles/` | Tailwind imports, theme and shared CSS | Generated build output |
| `public/` | HTML pages and browser-safe static assets | `.env`, SQL, raw imports or private PHP files |
| `public/assets/js/` | Vanilla browser interactions and page modules | Gemini or elevated Supabase keys |
| `public/assets/images/` | Repository-owned illustrations and icons | Creator uploads and draft media |
| `database/` | Schema/RLS notes and reviewed versioned migrations | Live credentials and database dumps with personal data |
| `scripts/` | Development, validation and deployment tooling | Product request handlers |
| `tests/` | HTTP and later feature/access-control tests | Real accounts or production credentials |
| `.github/` | Checks and deployment workflows | Application secrets in YAML |
| `docs/` | Setup, decisions and developer guides | Private user content |

## Adding a feature

For a profile feature, add a focused controller in `src/controllers/`, a Supabase service in `src/services/`, and ownership validation in `src/middleware/`. Wire its route through `api/index.php`. Put UI files under `public/` and browser modules under `public/assets/js/`. Add database migrations and owner/guest/draft tests before enabling writes or public reads. The starter intentionally supplies no unauthenticated editing routes.

For assets, edit `src/styles/app.css`, then run `npm run build`. Generated CSS is ignored and rebuilt in CI/Vercel. Store creator images in Supabase Storage with appropriate draft/public policies, never on the function filesystem.

## Routing

- `/` and assets are static files under `public/`.
- `/api/health` is the only implemented application endpoint.
- `api/index.php` answers unknown API routes with JSON 404.
- `scripts/router.php` emulates these boundaries for the PHP development server.
- `vercel.json` routes API paths to PHP and leaves static assets alone.
- Blueprint pages such as `/discover`, `/u/{username}` and `/dashboard` are future work and return 404 until implemented.

The server is stateless: do not use persistent PHP disk sessions, local upload storage or background PHP workers on Vercel.
