# Database

The schema lives in versioned migrations under [`supabase/migrations/`](../supabase/migrations/). Never edit a migration that has been applied; add a new one. [`tests/database.test.mjs`](../tests/database.test.mjs) applies every migration to an in-memory Postgres (PGlite) with stand-ins for Supabase's `auth` and `storage` schemas, then checks the access rules as guests and signed-in users. `npm test` runs it.

## Access model

- Identities live in Supabase Auth (`auth.users`). A trigger creates the `profiles` row and `user_preferences` row at sign-up, using the `username` and `full_name`/`name` sign-up metadata. If the username is invalid or taken, it falls back to a generated one, so sign-up never fails.
- Every exposed table has Row Level Security. The browser and PHP use the publishable key plus the signed-in user's access token. No elevated key is needed for normal CRUD.
- Table privileges are explicit and column-scoped. Clients cannot write moderation fields (`hidden_at`), counters, timestamps or row owners. Owner columns default to `auth.uid()`.
- Helper functions used by policies live in the `private` schema, which the Data API does not expose.
- Guests see a profile only when `visibility = 'public'` and it is not hidden. They see a project only when it is published, not hidden, and its creator's profile is public.

## Tables

| Table | Purpose | Who can read | Who can write |
|---|---|---|---|
| `categories` | Talent categories (seeded: Development, AI Automation, Design, UI/UX, Video, Photography, Illustration, Digital Art, Writing, Music & Audio, Other) | Everyone | Migrations only |
| `profiles` | Creator profile: username, display name, headline, bio, category, broad region, avatar path, availability, visibility (`draft`/`public`/`private`), discoverable | Public profiles: everyone. Own: owner | Owner (no insert/delete; trigger creates it) |
| `user_preferences` | Notification switches | Owner | Owner |
| `skills` | Skill and tool names, unique case-insensitively | Everyone | `set_profile_skills()` / `set_project_skills()` |
| `profile_skills` | Profile ↔ skill, ordered, max 15 | Same as profile | `set_profile_skills()` |
| `social_links` | Creator-chosen HTTPS links, max 10 | Public links of public profiles | Owner |
| `projects` | Work samples: title, summary, description, role, status, dates, demo/repo/video links, counters | Public projects: everyone. Own: owner | Owner (max 100) |
| `project_categories` | Project ↔ category, max 3 | Same as project | Owner |
| `project_skills` | Project ↔ skill/tool, max 15 | Same as project | `set_project_skills()` |
| `project_media` | Image metadata; bytes in Storage at `{owner}/{project}/{file}`, max 10 | Same as project | Owner |
| `follows` | Follower → creator | The two people involved | Follower |
| `project_likes` | Likes; updates `projects.like_count` | Liker | Liker (public projects only) |
| `bookmarks` | Private saved projects; updates `bookmark_count` | Saver | Saver (public projects only) |
| `collaboration_requests` | Invitations to creators who are open to collaborate | Sender and recipient | Sender creates/withdraws; recipient accepts/declines (20/day) |
| `notifications` | Follow, like, bookmark, collaboration and report updates | Recipient | Triggers create; recipient marks read/saved or deletes |
| `content_reports` | Reports on profiles, projects or portfolios | Reporter and moderators | Reporter creates (20/day); moderators update |
| `moderation_actions` | Audit log of hide/unhide | Moderators | `moderate_content()` only |
| `ai_imports` | Website import suggestions, purged after 7 days | Owner | Owner (10/day) |
| `portfolio_drafts` | Portfolio builder draft (JSON) | Owner | Owner |
| `published_portfolios` | Public portfolio snapshot by slug; `media_paths` lists readable images | Everyone unless hidden | Owner |
| `private.user_roles` | Moderator/admin staff roles | Nobody through the API | SQL only |

Discovery views (`security_invoker`, so the caller's RLS applies):

- `creator_cards`: public, discoverable creators with ordered `skills`, lowercase `skill_keys`, `public_project_count` and `search_vector`.
- `project_cards`: public projects with creator name, `categories`, `skills`, cover image path and `search_vector`.

Search examples through the REST API: `creator_cards?skill_keys=cs.{php}`, `creator_cards?search_vector=wfts(simple).creative developer`, `project_cards?category_slugs=cs.{video}&order=like_count.desc`.

## RPCs

| Function | Caller | Purpose |
|---|---|---|
| `username_available(candidate)` | Anyone | Sign-up check |
| `set_profile_skills(skill_names)` | Signed in | Replace own skills (max 15, 40 characters each) |
| `set_project_skills(project_id, skill_names)` | Project owner | Replace project skills/tools |
| `record_project_view(project_id)` | Anyone | Increment the public view counter (display only, not de-duplicated) |
| `moderate_content(target_type, target_id, action, reason, report_id)` | Moderators | Hide/unhide content, log it, resolve the report |

## Storage

| Bucket | Public | Limit | Path | Read |
|---|---|---|---|---|
| `avatars` | Yes | 2 MB, JPEG/PNG/WebP | `{user_id}/{file}` | Public URL |
| `project-media` | No | 5 MB, JPEG/PNG/WebP/GIF/AVIF | `{user_id}/{project_id}/{file}` | Owner, or anyone when a `project_media` row links it to a public project (use signed URLs) |
| `portfolio-media` | No | 5 MB, same types | `{user_id}/{file}` | Owner, or anyone when listed in a visible `published_portfolios.media_paths` |

Uploads are allowed only inside the uploader's own folder. Use random file names. Deleting a database row does not delete the file: remove the object through the Storage API too.

## Making someone a moderator

Run in the SQL Editor:

```sql
insert into private.user_roles (user_id, role)
select id, 'moderator' from auth.users where email = 'moderator@example.com';
```
