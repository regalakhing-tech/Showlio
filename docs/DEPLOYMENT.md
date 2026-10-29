# GitHub and Vercel deployment

Destination repository: [regalakhing-tech/Showlio](https://github.com/regalakhing-tech/Showlio).

## 1. Run the checks

Use Node.js 24 LTS and PHP 8.5:

```sh
npm ci
npm run check
```

The check compiles Tailwind, checks PHP and JavaScript syntax, and makes real HTTP requests to a temporary PHP server. It does not contact Supabase or Gemini.

## 2. Import the repository into Vercel

In the Vercel dashboard, choose **Add New → Project**, connect GitHub, and import **regalakhing-tech/Showlio**. Grant the Vercel GitHub integration access to this repository, including organization access if it is private. Keep the root directory at the repository root, use project name **showlio**, choose the **Other** framework preset and **Node.js 24.x**. `vercel.json` supplies the build command, public output and community PHP runtime.

The dashboard may create an initial deployment during import. Subsequent automated production deployments come from the checked GitHub workflow. The project must remain linked to this GitHub repository so Vercel can fetch the exact checked commit.

Copy the **Project ID** from the project's general settings and the **Team ID** from the team's general settings. For an existing personally scoped project, use its account/organization ID. These correspond to `projectId` and `orgId` if you already have a local `.vercel/project.json`.

Create a Vercel access token in your account settings with access to the project's team. Do not commit the token or any `.vercel/` directory. No Vercel CLI installation is required.

## 3. Set GitHub Actions secrets

Open [repository Actions secrets](https://github.com/regalakhing-tech/Showlio/settings/secrets/actions), choose **New repository secret**, and add:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Your Vercel access token |
| `VERCEL_ORG_ID` | The project's Team ID (or existing personal account ID) |
| `VERCEL_PROJECT_ID` | The Project ID from the project's general settings |

Repository secrets are available to the `production` deployment environment unless organization/environment restrictions prevent it. You can instead configure all three as `production` environment secrets if that is your team's convention. Do not paste credentials into chat, source files or workflow YAML.

## 4. Deploy

Push a change to `main`, or open **Actions → Showlio CI/CD → Run workflow** and choose `main` after configuring the secrets.

1. **Build and test** installs locked dependencies and runs `npm run check`.
2. **Deploy production** checks that all three Vercel secrets are present. If any are missing, it writes a setup notice and skips deployment commands. A green CI result in this case means the starter passed checks, not that a deployment exists.
3. The deployment script calls the Vercel REST API with the repository ID and the exact GitHub commit that passed checks. Vercel fetches that commit, builds it using the linked project's production settings, and deploys it. The script waits for readiness and production alias assignment, or reports a build, domain or timeout error.
4. The workflow checks the deployed `/api/health` endpoint for a 200 JSON response containing `status: ok` and `app: Showlio`. The deployment URL appears in the run summary.

`git.deploymentEnabled` is set to `false` in `vercel.json`. This turns off Vercel's independent Git-triggered deployments so GitHub checks control the automated production path. Pull requests run checks only; this foundation does not deploy untrusted pull-request code with secrets. Workflow runs are serialized to avoid overlapping production deployments.

The deployment helper uses only built-in Node.js APIs. It does not send source files or application secrets through GitHub; Vercel reads source from its authorized GitHub integration and application environment values from its project settings. The local tests cover API request scoping, commit pinning, readiness, failed builds and timeout handling with test responses. Live Vercel behavior still requires real project credentials.

For production, use a publicly accessible deployment as required by the blueprint. If Vercel Deployment Protection requires sign-in, the automated public health check will fail until the intended public access is configured. A deployment may already have been created when a post-deploy health check fails; inspect Vercel logs and roll back from its dashboard if needed.

## Runtime verification

PHP on Vercel uses a community runtime, not a built-in PHP host. This starter pins `vercel-php@0.9.0`, includes `src/**` in the function bundle, and leaves browser assets under `public/`. Do not consider the hosting architecture proven until the deployed endpoint succeeds:

```sh
node scripts/smoke.mjs https://your-production-domain.vercel.app
```

If PHP packaging fails, inspect the Vercel build logs and the runtime compatibility notes. `vercel dev` is not used for local PHP; use `npm run dev`. The original blueprint allows a conventional PHP host as a fallback.

## Application environment

The starter health check requires no external services. When implementing them, configure names from `.env.example` in **Vercel → Project → Settings → Environment Variables** for the appropriate Preview and Production environments:

- `APP_ENV` and `APP_URL`
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `GEMINI_API_KEY` for the future server-side AI feature

Use the caller's access token and RLS for ordinary Supabase CRUD. Add an elevated Supabase key only for a narrowly authorized server-side use case. The workflow does not run SQL or change your Supabase project. Redeploy when environment configuration changes.

## References

- [Vercel create-deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)
- [Vercel deployment status API](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url)
- [Community PHP runtime configuration](https://github.com/vercel-community/php)
- [Vercel Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration)
- [GitHub repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys)
