# Reference workspace screens implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the isolated settings view and code review; the owner integrates the shared shell and other views.

**Goal:** Build the supplied Explore projects, Notifications & activity and Account settings references inside a connected demo workspace.

**Architecture:** A static `/app/` document with hash navigation shares one header and profile sidebar. Focused view modules render the three screens. Browser-local state powers editing, saved projects, follow toggles and notification actions. The existing homepage Sign in action opens an explicitly labeled demo entry.

**Tech stack:** Existing PHP local router, compiled Tailwind/custom CSS and vanilla JavaScript, without added runtime dependencies.

## Global constraints

- The user selected **Demo entry for now**; no real authentication, messaging, billing, external AI calls or server-side account changes.
- Follow the three supplied visual references: white/pale-blue canvas, blue-to-violet actions, Inter, rounded white panels, profile sidebar and responsive layouts.
- Preserve all pre-existing homepage edits and untracked files. Do not reset, overwrite or stage unrelated user work.
- No new secrets, database schema or Supabase changes.
- Keep illustrative activity and all local-only actions clearly qualified by the demo workspace indicator.

## Tasks

- [ ] Create `public/app/index.html`, `workspace-shared.js`, `workspace-data.js`, `workspace-model.js`, `workspace.js` and `workspace.css`; connect local/Vercel `/app/` routing and a minimal Sign in entry patch.
- [ ] Implement Settings in `workspace-settings.js` and `workspace-settings.css`, following the isolated task brief.
- [ ] Implement Explore and Notifications in focused modules with working local controls, including search/filter/sort, project detail/share, following/bookmarks, request review/dismiss, mark-read and settings editing.
- [ ] Generate the new portrait, mountain banner and four reference project images; export web assets and save prompt provenance.
- [ ] Run baseline and changed checks, meaningful state/persistence tests and asset/route HTTP checks. Attempt permitted browser QA; disclose any remaining visual-verification limit.
- [ ] Review the integrated result and document how to enter the demo workspace.
