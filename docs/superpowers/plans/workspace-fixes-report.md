# Workspace final review fixes

Scope: only the new browser-local demo workspace JavaScript/CSS and `tests/workspace.test.mjs`; no homepage files, staging, or commits.

- Restored local projects now use an explicit field whitelist. IDs, nonempty bounded text/categories, images, duration (`m:ss` or `mm:ss`), and nonnegative finite timestamps are validated. Ownership/creator and counters are assigned locally, and unknown fields are discarded. Project cards independently HTML-escape duration.
- The skip link prevents hash navigation and focuses the current main workspace, preserving the selected route.
- Closed mobile navigation uses `visibility: hidden`, removing its controls from keyboard navigation and the accessibility tree. Opening restores visibility; closing from the sidebar or backdrop returns focus to the menu toggle. Desktop visibility remains normal.
- DOM replacements preserve control identity and focus. If a saved card disappears, focus moves to the corresponding control on a successor card, or the main workspace when none remains. Header search is untouched by view-only replacements; full renders and modal updates also retain matching controls.
- Settings social-link validation and help/errors consistently require HTTPS. The default availability option reads “Available for new projects.”
- Scoped Settings heading CSS stacks the title and description.
- Added regressions for hostile stored duration data, whitelist behavior, valid duration restoration, rendering-boundary escaping, and saved-notification additions/removals including an empty saved list.

## Verification

The regression was first run before the fix: `node --test tests/workspace.test.mjs` exited 1 with 6 passing and 1 failing test; the failure showed the malicious `<img src=x onerror=alert(1)>` duration was restored unchanged.

After the fixes:

- `node --test tests/workspace.test.mjs`: exit 0; 7 tests, 7 passed, 0 failed, 0 skipped/cancelled/todo.
- `node --check` for `public/assets/js/workspace.js`, `workspace-shared.js`, `workspace-model.js`, `workspace-explore.js`, and `workspace-settings.js`: all exited 0, no diagnostics.
- `node node_modules/@tailwindcss/cli/dist/index.mjs -i src/styles/workspace.css -o public/assets/css/workspace.css --minify`: exit 0; Tailwind CSS v4.3.3, “Done in 195ms.” This rebuild touched only the workspace output CSS.

Browser interaction and visual QA is being performed by the owning agent; this report does not claim independent browser verification.
