# Public portfolio publishing

The public portfolio must show the creator's published builder settings: uploaded logo (initials only when absent), intro, about text, contact/social links, appearance, and included work in its chosen order. Move the Showlio community bar below the portfolio. An unsuccessful server save must not announce a successful publish.

Use the existing owner-only `portfolio_drafts` table for a published snapshot envelope and the `portfolio-media` bucket. All writes use the caller's token and existing RLS. `published_portfolios` keeps only routing/moderation metadata with no content or media paths. After `creator_portfolio` resolves a visible creator through caller RLS, the server reads that exact owner's envelope and signs strictly owner-prefixed portfolio assets with its existing server credential. Direct anonymous REST/Storage calls cannot bypass profile privacy; hidden portfolio moderation still applies. Upload raster assets separately, store durable media references, and sign them on read. Keep Showlio project photos fresh and omit removed projects. Preserve the existing profile-based page for creators who have never published from the builder. No schema migration is required.

- [ ] Add failing model, publishing, HTTP and API regression tests.
- [ ] Add authenticated media upload and snapshot publishing; load and hydrate saved snapshots for public viewers.
- [ ] Wire builder publishing, restore saved settings, and preserve every editable field in public rendering.
- [ ] Move the community bar to the footer and correct publishing/share copy.
- [ ] Run `npm.cmd run check`, review changes, commit, push, deploy, and verify the live endpoints/assets.
