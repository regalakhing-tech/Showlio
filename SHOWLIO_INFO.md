# Showlio — Project Information & Development Blueprint

> **Official Title:** Showlio: A Talent Showcase, Skill-Based Discovery, and Collaborative Networking Platform with AI-Assisted Profile Building  
> **Tagline:** **Show Your Skills. Share Your Work. Get Discovered.**  
> **Project Type:** Responsive web application / 7-day school project MVP  
> **Core Stack:** PHP, Supabase, HTML, Tailwind CSS, JavaScript, Vercel  
> **AI Provider (proposed):** Google Gemini API (server-side access only)

---

## 1. Project Overview

**Showlio** is a community-based platform where people can demonstrate skills, share completed or ongoing projects, and discover others with complementary talents. **An existing portfolio website is not required.** Users may create a profile from scratch, publish examples of their work, and indicate whether they are open to collaboration.

If a user already has a public website, Showlio can offer an **AI-assisted URL import**: retrieve permitted public website content, suggest a biography, skills, projects, and social links, and let the user **review and approve** suggestions before publishing. This feature is a convenience, not a prerequisite to join.

Showlio is **not** a recruitment agency, an employment guarantee, or a professional credentialing authority. It helps people discover others by *self-declared skills and visible work evidence*.

### Problem

- Students and early-career creators can have valuable skills and projects without a polished portfolio website.
- Their work is scattered across personal websites, code repositories, and social platforms.
- People seeking teammates struggle to find creators with relevant interests or skills.
- People may need a simple way to describe their work and receive constructive feedback.

### Proposed Solution

A unified web platform that supports profile creation, project showcases, searchable talents, optional AI assistance, and basic collaboration signals. Users can start without an existing website.

### Objectives

1. Make it easy to showcase skills, talents, and projects in one public profile.
2. Help visitors discover relevant creators by skills, role, projects, and optional broad location.
3. Help users write clear, accurate profile descriptions using AI suggestions.
4. Support consent-based collaboration through public links and availability indicators.
5. Keep profiles editable, user-controlled, and safe to share.

## 2. User Types and Permissions

### A. Guest / Visitor
- Browse **published** profiles and projects.
- Search, filter, and open public showcase pages.
- Visit creator-approved external links.
- Cannot edit content, access drafts, or view private information.

### B. Registered Creator
- Create/edit their own profile, skills, projects, images, links, and availability status.
- Choose whether their profile is draft, public, or hidden.
- Use optional AI profile writing and import features.
- Browse other people and discover collaborators.
- Control public contact methods; no direct messages required for MVP.

### C. Platform Moderator / Administrator (internal role, not a separate public user type)
- Review reported or abusive public content.
- Hide violating public content and manage moderation records.
- Cannot use moderation privileges to impersonate users or expose secrets.

**Important:** Every registered creator can also browse other creators. There are not two incompatible account types.

## 3. Seven-Day MVP — Required Features

### F01. Authentication and Account Management
- Sign up, log in, log out using Supabase Auth.
- Email/password account flow; use email verification if configured.
- Redirect guests attempting to edit to sign-in.
- Editable display name, username, profile photo, and profile visibility.
- Unique public username / slug.

**Acceptance:** A new user can register and securely edit only their own account profile.

### F02. Talent Profile Builder (No Existing Portfolio Needed)
User-editable fields:
- Display name and professional/creative headline.
- Short bio or "About Me".
- Talent category (development, design, photography, illustration, writing, video, etc.).
- Multiple skills and tools.
- Broad optional location (province/city only); **never request a home address**.
- Public social or work links, optional.
- Collaboration availability: `Open to collaborate`, `Not currently available`, or `Just showcasing`.
- Draft/published profile status.

**Acceptance:** A user with no website can complete a profile and publish a sharable URL like `/u/username`.

### F03. Project and Talent Showcase
- Create, edit, delete projects tied to the creator profile.
- Fields: project title, category, summary, user's role, technologies/skills, date (optional), project status, image(s), demo/repository link (optional).
- Projects may include nontechnical work (photographs, designs, writing, video-editing samples, etc.).
- Use externally hosted video links for MVP; avoid direct video hosting.
- Show project cards within creator profile.
- Upload images to Supabase Storage using controlled file size/type limits.

**Acceptance:** A creator can publish at least one project with an image and visitors can open it.

### F04. Public Creator and Project Discovery
- Browse all published profiles.
- Keyword search by name, headline, skills, or project title.
- Filters: category, skill, availability, optional region.
- Search project posts as well as creators.
- Creator cards display role, top skills, number of public projects, and availability.
- Clear empty states, pagination or result limits.

**Acceptance:** Searching for `PHP` returns profiles with that declared skill and relevant published projects.

### F05. AI Profile Description Assistant
- User supplies a few accurate facts, skills, and example projects.
- Gemini generates **suggested** profile headline, short bio, and clearer project descriptions.
- Generated text is editable and is not auto-published.
- Do not invent qualifications, companies, degrees, certifications, or completed projects.
- Show errors and allow manual completion if the AI service is unavailable.

**Acceptance:** A creator can generate and approve a draft bio without losing manually entered content.

### F06. Basic AI-Assisted Portfolio URL Import (Stretch MVP)
- Creator enters a website URL that they own or are authorized to use.
- Server checks URL format and only fetches safe public HTTPS web pages.
- Extract readable page title/text and selected public links (up to a small size limit).
- Ask AI to propose headline, bio, skills, and projects **only when grounded in the extracted content**.
- Show import preview with editable fields and source reference.
- Never publish automatically; user must confirm.
- Respect fetch restrictions and site access policies; do not bypass authentication or anti-bot measures.
- Handle sites with client-rendered/JavaScript-heavy content by returning partial results and suggesting manual entry.

**Acceptance:** A tested public HTML portfolio can generate editable suggestions; unsupported sites fail gracefully.

**Deadline rule:** If F06 is unstable by Day 5, demonstrate F01–F05 reliably and present F06 as a future improvement.

### F07. Responsible Discovery & Contact
- Show creator-selected public contact or website links only.
- Include an `Open to collaborate` status toggle.
- Creators can hide contact links or make profiles private.
- Basic report-content mechanism and moderator hide action.
- No in-app chat or public email exposure required for MVP.

**Acceptance:** A visitor can discover a creator and use only the contact route that creator opted to publish.

## 4. Later Releases (NOT required for the 7-day MVP)

| Feature | Description | Reason to defer |
|---|---|---|
| Natural-language AI talent finder | Interpret requests like "find a UI designer who works with mobile apps" | More ranking, indexing, and testing |
| AI portfolio evaluation | Content clarity feedback with criteria and citations | Needs reliable assessment rubric |
| Community reviews/endorsements | Constructive feedback from registered users | Abuse prevention and moderation |
| Collaboration board | Post requests for teammates on projects | Requires moderation and application workflows |
| In-app collaboration requests | Private request and reply system | Messaging, consent, privacy work |
| Save / bookmark talent | Personal shortlists | Extra database/UI work |
| Side-by-side profile comparison | Compare *declared* skills and projects (not a worth ranking) | Extra UI and fairness design |
| GitHub repository import | Import verified repository metadata with authorization | OAuth/API edge cases |
| Portfolio analytics | Views, interactions, top project clicks | Accuracy and privacy considerations |
| Multiple profile themes | Choose a layout for public showcase | Theme architecture and QA |
| Recommendations | Suggest related creators based on transparent skill overlap | Quality and bias testing |
| Video storage | Native video uploads / transcoding | Bandwidth and cost |

## 5. Site Pages & Navigation

### Public
- `/` — Landing page (hero, trending categories, how it works, CTA).
- `/discover` — Talent discovery and filtering.
- `/projects` — Public projects discovery.
- `/u/{username}` — Public creator profile.
- `/p/{project-slug}` — Public project detail (may use an ID segment to avoid collisions).
- `/login` and `/register` — Authentication.
- `/about`, `/privacy`, `/terms` — Basic information and policies.

### Logged-in Creator
- `/dashboard` — Profile completeness, quick links, and projects.
- `/dashboard/profile` — Edit biography, skills, links, category and availability.
- `/dashboard/projects` — Create/edit/remove own projects.
- `/dashboard/import` — Optional website URL import / review.
- `/dashboard/settings` — Privacy and account settings.

### Moderator
- `/admin/reports` — Restricted report queue / hide content.

Routes are conceptual and may be implemented via a PHP front controller; exact paths can change.

## 6. User Journeys

### Journey A: Creator without a website
1. Sign up.
2. Choose talent category and add skills.
3. Fill in bio manually or ask AI to suggest a draft.
4. Add projects and samples.
5. Preview public profile and click Publish.
6. Appear in discovery search based on published skills/projects.

### Journey B: Creator with an existing website
1. Sign up and choose "Import from website".
2. Paste authorized public HTTPS URL.
3. Review AI-imported suggestions and their source content.
4. Correct incorrect details; add missing projects.
5. Publish profile.

### Journey C: Visitor finding a teammate
1. Open Discover.
2. Search `PHP` and filter `Open to collaborate`.
3. Review creator projects, stated role, and public links.
4. Open creator's chosen contact method if offered.

## 7. Data Model (Supabase PostgreSQL)

**Use Supabase Auth (`auth.users`) for identities**. Proposed application tables:

| Table | Suggested columns | Notes |
|---|---|---|
| `profiles` | `id uuid PK references auth.users`, `username unique`, `display_name`, `headline`, `bio`, `category`, `location_region`, `avatar_path`, `availability`, `visibility`, `created_at`, `updated_at` | Editable by owner; only published fields visible publicly |
| `skills` | `id`, `name unique`, `slug unique` | Controlled/normalized list or approved free text |
| `profile_skills` | `profile_id`, `skill_id`, `created_at` | Composite unique key |
| `projects` | `id`, `creator_id`, `slug`, `title`, `category`, `summary`, `contribution`, `status`, `demo_url`, `repo_url`, `visibility`, `created_at`, `updated_at` | Public only when project and profile are published |
| `project_skills` | `project_id`, `skill_id` | Enables project-based searching |
| `project_media` | `id`, `project_id`, `storage_path`, `alt_text`, `sort_order` | Image metadata stored in DB; bytes in Storage |
| `social_links` | `id`, `profile_id`, `label`, `url`, `is_public` | Owner controls display |
| `ai_imports` | `id`, `profile_id`, `source_url`, `status`, `suggested_fields jsonb`, `error_code`, `created_at` | Owner-only; cap retention and avoid storing unnecessary scraped content |
| `content_reports` | `id`, `reporter_id`, `target_type`, `target_id`, `reason`, `status`, `created_at` | Restricted to reporter/moderator |

Additional design rules:
- Use database constraints on username, slug, visibility, and availability values.
- Add indexes for public profile status, project status, skill joins, and discovery searches.
- Enable **Row Level Security on every exposed table**.
- Public `SELECT` only for explicitly published, non-sensitive fields; use a carefully restricted public view or query.
- Only authenticated record owners can update/delete their data; authorized moderators have explicit limited controls.
- Keep all AI/import secrets outside the browser.
- Do not place full personal email addresses or other private account data in public profile responses by default.

## 8. Technology and Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5, Tailwind CSS, vanilla JavaScript | Responsive user interface |
| Backend | PHP 8.x | HTTP endpoints, validation, AI calls, safe import processing |
| Authentication | Supabase Auth | Sign-in, sign-up, access tokens |
| Database | Supabase PostgreSQL | Profiles, projects, skills, reports |
| File storage | Supabase Storage | Profile pictures and project images |
| AI | Google Gemini API (optional provider) | Draft writing and import extraction |
| Hosting | Vercel + **community PHP runtime** | Static files and PHP serverless functions |
| Version control | Git and GitHub | Source repository and deploy integration |

### Request Flow

```text
Visitor / Creator Browser
  |-- Static assets (HTML/CSS/JS) ----------> Vercel
  |-- App requests -------------------------> PHP Vercel Functions
                                                |-- Supabase Auth / REST APIs
                                                |-- Supabase PostgreSQL & Storage
                                                `-- Gemini API (server-side)
```

### IMPORTANT: PHP on Vercel

PHP is **not a first-party built-in Vercel runtime**. Use the documented **community `vercel-php` runtime**, which requires configuration in `vercel.json`. Verify the runtime version and deploy a minimal PHP endpoint **on Day 1 before building the app**. Serverless execution has request duration, read-only deployment filesystem, and statelessness constraints; keep persistent files in Supabase Storage, data in PostgreSQL, and avoid relying on PHP disk sessions or background PHP processes.

Suggested minimal structure:

```text
showlio/
├── api/
│   └── index.php               # PHP front controller / API entry
├── public/
│   ├── index.html
│   ├── assets/
│   │   ├── css/
│   │   ├── js/
│   │   └── images/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   └── helpers/
├── database/
│   ├── schema.sql
│   └── policies.sql
├── .env.example
├── .gitignore
├── composer.json                # If using PHP dependencies
├── vercel.json                  # Configure PHP community runtime and routes
└── README.md
```

**Do not blindly copy a `vercel.json` from an old tutorial:** verify the current community runtime version and ensure static assets are served without intercepting all routes. Test the deployed `api` endpoint before committing to the architecture.

If PHP runtime compatibility blocks deployment, a conventional PHP host is a fallback, but the planned target remains Vercel.

### Environment Variables (names only)

```dotenv
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server-only, use only when necessary
GEMINI_API_KEY=                # server-only
APP_URL=
```

Store secrets in Vercel's environment settings, never hardcode them, never commit `.env`, never expose a service-role key or Gemini key in frontend code. Prefer scoped user tokens and RLS-protected requests rather than a service-role key for ordinary CRUD.

## 9. AI Feature Rules and Safeguards

### AI Profile Writer
- Prompt using only the user's own entered facts.
- Output structured fields; verify format and length before displaying.
- Label output **AI suggestion — review before publishing**.
- Do not automatically change published profiles.

### URL Import Security
- Require creator authorization/ownership assertion before import.
- Accept HTTPS only; reject local hosts, IP literals, loopback/private/link-local/metadata network destinations, and non-web protocols.
- Validate DNS resolution and redirects at each hop to prevent SSRF; use strict redirect count, timeouts, response-size limits, allowed HTML content types, and rate limits.
- Do not fetch login-only pages or bypass website restrictions.
- Avoid fetching arbitrary embedded external resources, scripts, or forms.
- Treat imported website text as **untrusted data**, not AI instructions.
- Expose the source of each suggestion and allow correction.
- Delete raw import content as soon as it is no longer needed.

### Talent Discovery
- MVP uses deterministic database search and filters (not an opaque "talent score").
- Clearly distinguish user-declared skills and linked project evidence.
- Do not infer sensitive demographics or rank people's personal value.

## 10. Security, Trust and Privacy

- Hashing and credential handling managed by Supabase Auth; do not create custom plaintext password tables.
- Use Supabase access token verification and table-level RLS.
- Escape HTML output and sanitize rich text; protect against XSS and SQL injection.
- Use safe URL validation for all links and scanner requests.
- Accept only permitted image types; set upload size limits; use non-guessable storage paths.
- Use a private bucket for drafts and controlled access to public media; never accidentally publicize unpublished work.
- Rate-limit account actions, AI requests, uploads, imports, and reports.
- Public profile publishing is opt-in; only show city/province-level location when the user chooses it.
- Provide report and hide mechanisms for inappropriate or impersonating accounts.
- Never expose phone number, birth date, exact address, or school details by default.
- Make contact through creator-chosen public links; no unsolicited direct messaging in the MVP.

## 11. UI / UX Direction

**Design goal:** Clean, modern, friendly creative discovery platform, not a corporate job board.

- Visual style: professional cards, spacious typography, intuitive search and filters.
- Responsive: works on mobile, tablet, and desktop.
- Main navigation: `Discover Talents`, `Explore Projects`, `Create Profile`, `Dashboard`.
- Landing CTAs: **Showcase Your Talent** and **Discover Creators**.
- Profile: banner/avatar, bio, skills chips, project grid, availability, public links.
- Discovery: search bar at top, filter chips, creator cards, project previews.
- Dashboard: profile completeness, actions to add projects, publish/preview.
- Accessibility: labels, keyboard navigation, readable contrast, image alt text, visible focus styles.
- Loading, empty, error and confirmation states for all major actions.

## 12. Seven-Day Development Plan

| Day | Deliverable | Definition of done |
|---|---|---|
| **1 — Infrastructure** | Repo, PHP/Vercel proof-of-deployment, Supabase project, Auth, starter schema | Live Vercel PHP endpoint and working sign-in |
| **2 — Profiles** | Editable creator profile, skills, visibility, username, public URL | Sign in → create → publish → view public profile |
| **3 — Projects** | Project CRUD, safe image upload, profile project grid | Creator publishes project; guest can view it |
| **4 — Discovery** | Search by name/skills/projects, filter by category/availability | Test profiles can be found correctly |
| **5 — AI** | Generate bio suggestions; attempt safe single-site URL import | Editable AI output; clear fallback on failure |
| **6 — Safety & QA** | RLS, file validation, account/privacy tests, responsive fixes, basic moderation | Guests cannot edit; drafts hidden; mobile usable |
| **7 — Deployment & Demo** | Production test, bug fixes, example content, demo script, README | End-to-end demo reliable on deployed domain |

**Priority order:** Auth → manual profiles → projects → discovery → AI writing → URL import. Do not sacrifice the first four for an unstable scanner.

## 13. MVP Demonstration Script

1. Register a new user, e.g., a student photographer **without a website**.
2. Fill out their skills and short bio; optionally generate an AI draft.
3. Create a project with an image, a short explanation, and a sample work link.
4. Publish profile; open public shareable URL in a logged-out browser.
5. Register or open a second session and search for the creator by skill.
6. Filter by category and see their project in the results.
7. Show collaboration availability and a creator-approved public link.
8. Optionally show an existing public portfolio URL importing suggestions, followed by manual approval.

## 14. Success Criteria / Minimum Acceptance Checklist

- [ ] Auth works (register, sign in, sign out, blocked edits for guests).
- [ ] New creator can publish a profile **without any existing portfolio URL**.
- [ ] Creator can add/edit/delete their own skills and projects.
- [ ] Uploaded images display securely.
- [ ] Public pages show only published content.
- [ ] Search and category filters return relevant results.
- [ ] Availability status appears and can be updated.
- [ ] AI description assistant returns editable suggestions or a useful fallback error.
- [ ] Basic report/hide moderation exists.
- [ ] Website is mobile-friendly.
- [ ] PHP actually runs on Vercel and integrates with Supabase.
- [ ] Private API keys are not exposed in browser or Git.

### Stretch (only if all above pass)
- [ ] Import a public portfolio website and preview AI-extracted fields.
- [ ] Allow the user to approve/edit imported suggestions before saving.

## 15. Out of Scope for Version 1

- Hiring and placement guarantees.
- Employer verification or sensitive identity checks.
- Payments, contracts, or financial transactions.
- In-app chat/video calling.
- Social popularity rankings or "percent chance of getting hired" scores.
- Automatic crawling of entire websites or authenticated content.
- Native video hosting.
- Advanced recommendation engine.

## 16. Future Vision

Build a richer community for discovering people through *what they can show and create*, not only through résumés or existing personal websites. Future updates can add transparent talent matching, collaborative project listings, safe peer feedback, and integrations with code/design platforms.

---

## Deployment & Implementation References

- Vercel community runtimes: https://vercel.com/docs/functions/runtimes
- Community PHP runtime and examples: https://github.com/vercel-community/php
- Vercel function configuration: https://vercel.com/docs/functions/configuring-functions/runtime
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage: https://supabase.com/docs/guides/storage

> **Implementation note:** This is a development specification, not a claim that the application already exists. Final technology configuration, runtime compatibility, and AI feature availability must be tested during development.
