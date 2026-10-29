# Portfolio Builder Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans for the bounded tasks below. Preserve the existing homepage/workspace.

**Goal:** Implement the approved portfolio generator images on a new page, with one Create portfolio entry in the existing workspace.

**Architecture:** A standalone vanilla-JavaScript builder at `/portfolio/` uses a new browser IndexedDB repository and a shared portfolio renderer. A separate `/portfolio/view/` page opens saved snapshots. Styles are scoped and compiled separately. No backend, login, external publishing or network uploads are added.

**Tech stack:** Existing PHP router, vanilla ES modules, Tailwind CSS build, browser IndexedDB, locally bundled QR encoder.

## Global constraints

- User requests UI only, without demo labels.
- Match Inter, pale blue background, navy text, blue/violet Showlio accents and supplied mockups.
- Existing current UI remains intact; add one Create portfolio button.
- Preserve the existing untracked workspace-clay.jpg asset.
- Browser saves must report actual success/failure. No live-publication claims.
- Website/QR destinations are same-browser previews; explain that in useful sharing copy and documentation.
- Never change account/profile data in the existing workspace.
- New styles use pb-/pf- namespaces; no generic changes to existing page selectors.
- No hard-coded small work count. Uploaded raster images max 5 MB; reject SVG/invalid image data.
- Render user content as escaped text; accept only validated HTTPS/email links, validated color values and whitelisted layouts.

## Tasks

- [ ] Model and repository: add tests for corruption, validation, multi-item ordering, safe URLs and immutable snapshots hiding excluded work; verify failure, implement `portfolio-model.js` and `portfolio-store.js`, rerun focused tests.
- [ ] Shared portfolio renderer: add escaping/draft visibility tests, implement generated personal website and viewer, QR encoder and decode test; keep vendor dependency pinned and licensed.
- [ ] Builder styling: implement responsive full-screen shell, five steps, work cards, appearance controls, preview, dialogs and sharing. Match generated references without affecting other pages.
- [ ] Builder controller and forms: implement identity, about/skills, multiple work items, file inputs/drop zones, edit/remove/reorder/filter, style presets/color, autosave, immutable saved preview and link/QR/export actions.
- [ ] Integration: add only one workspace CTA, new page routes, CSS build/watch command and route tests.
- [ ] Verification: run all checks, perform desktop/mobile UI checks when computer use is available, review change scope and fix material findings.

## Model contracts

`Portfolio = {version:1,id:'primary',profile:{name,role,intro,bio,slug,location,logo,avatar,email,website,instagram,github,linkedin,availability,skills:string[]},style:{layout:'classic'|'minimal'|'showcase',accent:'#006aff',background:'white'|'tint',showLogo:boolean,showAvatar:boolean},works:Work[],updatedAt:number,publishedAt?:number}`.

`Work = {id,title,description,type:'website'|'app'|'product'|'design'|'video'|'other',image,url,role,skills:string[],visible:boolean}`.

Model exports: `createPortfolio(seed={})`, `normalizePortfolio(value)`, `validateStep(portfolio,step)` returning `{field,message}[]` for steps 0..4, `visibleWorks(portfolio)`, `filterWorks(works,{query,type})`, `reorderWorks(works,id,direction)` with direction -1/1, `createPublishedSnapshot(portfolio,now=Date.now())`, `portfolioProgress(portfolio)` returning five booleans. Publish needs valid name/role/slug plus one included titled work. Empty optional fields are allowed.

Store exports async `loadDraft()`, `saveDraft(portfolio)`, `saveSnapshot(snapshot)`, `loadSnapshot(slug)`. The snapshot does not change while the draft is edited. Use IndexedDB, no cross-tab/backend mutations of the existing workspace store.

Renderer exports `renderPortfolio(portfolio,{embedded=false,type='all'}={})` with `.pf-` classes and `data-pf-filter` / `data-pf-work` attributes. Filtered/hidden work must remain excluded. No scripts or inline user-authored CSS. Renderer uses canonical model values and escapes all user text. `portfolio-qr.js` exports `createQrSvg(text)` using a pinned locally served QR encoder. Root handles embedded events; viewer handles its own filters/work dialog.

## Builder DOM/style contract

`body.pb-body`, `header.pb-header` (`.pb-brand`, `.pb-back-link`, `.pb-save-status`, `.pb-header-actions`), `.pb-shell` with `.pb-sidebar` / `.pb-steps` / `.pb-step` (`.is-active`, `.is-complete`, `.pb-step-num`) and `main.pb-main`.

Profile/about/style use `.pb-editor-split > .pb-form-pane + .pb-preview-pane`. Form classes: `.pb-heading`, `.pb-form`, `.pb-field`, `.pb-grid2`, `.pb-identity`, `.pb-upload`, `.pb-avatar-upload`, `.pb-logo-upload`, `.pb-hint`, `.pb-section`, `.pb-chips`. Buttons `.pb-btn`, `.pb-primary`, `.pb-outline`, `.pb-ghost`, `.pb-icon-button`. Preview `.pb-preview-toolbar`, `.pb-device-toggle`, `.pb-preview-surface.is-mobile` containing the shared pf renderer.

Library `.pb-library`, `.pb-library-toolbar`, `.pb-search`, `.pb-filters`, `.pb-work-grid`, `.pb-work-card`, `.pb-work-image`, `.pb-card-body`, `.pb-card-menu`, `.pb-type-tag`, `.pb-status`, `.pb-add-work`, `.pb-empty`. Style `.pb-style-layouts`, `.pb-style-option`, `.pb-mini-layout`, `.pb-swatches`, `.pb-swatch`, `.pb-color-input`, `.pb-choices`, `.pb-choice`, `.pb-toggle-row`, `.pb-switch`.

Publish `.pb-publish-layout`, `.pb-publish-summary`, `.pb-checklist`, `.pb-publish-card`. Native modal `.pb-dialog`, `.pb-modal-header`, `.pb-modal-body`, `.pb-share-tabs`, `.pb-share-person`, `.pb-qr`, `.pb-copy-row`, `.pb-share-actions`, `.pb-modal-note`. Footer `.pb-footer` / `.pb-footer-back` / `.pb-footer-note` / `.pb-footer-next`; status `.pb-toast`. Ensure minimum 44px mobile targets, keyboard focus, reduced motion, max-width containment and no toolbar overlap.

## Review/verification commands

`node --test tests/portfolio*.test.mjs` for focused model/render/QR tests. `npm.cmd run check` for the existing and new syntax/build/HTTP checks. Browser QA covers all steps, saving/reloading, upload errors, editing/removing/reordering work, preview styles, QR download, share tabs and narrow screens. No staging, commits or pushing unrelated work.
