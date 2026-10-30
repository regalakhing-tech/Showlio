# Showlio

**Show your skills. Share your work. Get discovered.**

Project foundation for the talent showcase and creator discovery platform described in [SHOWLIO_INFO.md](SHOWLIO_INFO.md). The responsive homepage follows the supplied Showlio reference, with the owner's logo, generated creator portraits and project artwork, a PHP health endpoint, local tooling and GitHub CI/CD. Live accounts, database-backed discovery, uploads, AI generation and database policies remain future implementation work.

## Homepage preview

The page includes the reference's layered hero, creator discovery, AI writing panel, featured projects, community stories and signup call to action. Mobile layouts stack the sections, scale the decorative compositions and provide a compact navigation menu.

- Search and category chips filter sample creators. Creator and project cards open detail previews.
- Project likes and bookmarks are stored in the current browser only.
- Signup builds a temporary local profile preview; it does not create an account or publish data.
- The AI panel shows editable example copy, with writing-mode choices and copying. It does not call Gemini.
- Statistics, profiles, projects and stories are marked as illustrative preview content.

Generated web images are in `public/assets/images/`; [asset prompts](docs/ASSET_PROMPTS.md) document their provenance. Raw generated PNGs are preserved locally in the ignored `output/imagegen/originals/` folder. Inter is self-hosted with its open-source license under `public/assets/fonts/`.

## Run locally

Install **PHP 8.5** and **Node.js 24 LTS**, with `php`, `node` and `npm` on your PATH. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm ci
npm run check
npm run dev
```

Open **http://127.0.0.1:8000**. PHP liveness is available at **http://127.0.0.1:8000/api/health**. No Supabase or Gemini account is required to run the starter. The health endpoint tests PHP only.

While editing styles, run `npm run watch:css` in a second terminal. After pulling changes, use `npm ci` and `npm run check` again.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve public files and PHP API locally |
| `npm run build` | Compile Tailwind into `public/assets/css/app.css` |
| `npm run watch:css` | Rebuild CSS during development |
| `npm test` | Run real HTTP tests (build CSS first) |
| `npm run check` | Check syntax, compile CSS and run all tests |
| `npm run deploy:production` | Deploy the checked commit from configured GitHub Actions |

## File organization

```text
Showlio/
├── .github/             # CI/CD and dependency updates
├── api/index.php        # PHP API front controller
├── database/            # Data model map and database notes
├── docs/                # Structure, deployment and implementation decisions
├── public/              # Browser-safe HTML and assets only
│   ├── index.html
│   └── assets/{css,js,images}/
├── scripts/             # Local router, checks and live health verification
├── src/
│   ├── bootstrap.php
│   ├── config/          # Server configuration
│   ├── controllers/     # Request handlers
│   ├── helpers/         # Shared response helpers
│   ├── middleware/      # Future authentication and request validation
│   ├── services/        # Future Supabase, Storage and Gemini integrations
│   └── styles/          # Tailwind source
├── supabase/            # CLI config, auth email template and versioned SQL migrations
├── tests/               # HTTP, model and database access-rule tests
├── .env.example         # Variable names only
├── package.json         # Commands and pinned build tools
├── package-lock.json    # Reproducible dependencies
├── vercel.json          # PHP runtime, static output and API routing
└── SHOWLIO_INFO.md       # Original product blueprint
```

See [the file organization guide](docs/PROJECT_STRUCTURE.md) for where to add each MVP feature.

## GitHub CI/CD

Pull requests and pushes to `main` run syntax checks, the CSS build and HTTP tests. Production deployment waits for those checks. With no deployment credentials configured, CI still runs and the deployment job writes a setup notice.

To activate production deployment, link a Vercel project and add these **GitHub Actions secrets**:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Follow the [deployment setup guide](docs/DEPLOYMENT.md). PHP uses the community **`vercel-php@0.9.0`** runtime; a live Vercel health check is required before considering hosting verified. The workflow performs that check after each configured production deployment.

## Configuration and next work

`.env.example` documents the variables. For local development PHP also reads a `.env` file at the project root; real process variables (Vercel) always win. Never commit real credentials.

Sign-in, sign-up, email codes and password resets go through the PHP API (`/api/auth/*`), which validates input, rate-limits attempts and keeps the Supabase session in HttpOnly cookies. It needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SECRET_KEY`. See [database notes](database/README.md) for the schema and limits.

Build the MVP in the blueprint's order: Supabase Auth → editable profiles and RLS → projects and safe Storage uploads → public discovery → AI writing → optional portfolio URL import. See [database notes](database/README.md) before exposing user data.
