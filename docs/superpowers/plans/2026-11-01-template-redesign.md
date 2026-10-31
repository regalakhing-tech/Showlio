# Portfolio template redesign implementation

## Goal and constraints

Implement the five approved concept pictures as responsive portfolio layouts. Studio is bright and balanced; Editorial uses cool paper and measured serif typography; Spotlight keeps its EXISTING creator-photo background and tonal treatment while updating text/layout; Bento uses a purposeful asymmetric modular grid; Gallery gives actual project imagery more space.

All creator identity, introductions, about text, logos, photos, contact links, skills, projects, ordering and visibility come from the existing portfolio model and Supabase publishing flow. Do not embed generated concept images, sample work, fixed creator names, fake counts, or project-specific layout conditions in production code. Zero, one, and many real projects must render cleanly. Respect accent/background/logo-size/show-image settings. Keep keyboard controls, safe escaping, filters, project dialogs, mobile layout, preview parity, offline export, and reduced motion.

## Design system

Base named tokens: ink #151D31, paper #F7F9FC, cloud #E8EFF8, muted #526172, creator accent from `style.accent`. Editorial uses cool paper #F7F8FA and petrol ink #173F48; Spotlight retains #07080C and its existing portrait overlay. Each template has its own display typeface, with no more than two families per template; all fonts are locally hosted and included in offline exports when used.

Composition:

```text
Studio / Editorial:     [identity and text][portrait]
                       [actual featured project image and caption]
                       [small portrait][about and skills]
Spotlight:             [readable text     | existing portrait backdrop]
                       [actual project frame][caption outside image]
Bento:                 [intro spanning two][portrait]
                       [real work image  ][contact]
                       [skills           ][availability/location]
Gallery:               [compact intro][small portrait]
                       [real project cover][actual extra photos, if any]
All:                   [contact] [one consolidated footer]
```

Keep body lines under 80 characters, balanced headings, restrained motion, no repeating pulse, no empty project columns, and no redundant filters for a single category. Extra Gallery photos must come from the project's real photo list, never duplicate placeholder art.

## Task 1: Data-driven renderer and viewer integration

Files: `portfolio-render.js`, `portfolio-view.js`, viewer `index.html`, render/HTTP tests.

- Add failing behavior checks for variable real project content, single-project layout markers, actual Gallery photos, consolidated footer, and Spotlight background preservation.
- Preserve existing classes and interaction hooks. Add `data-count` on `.pf-work-grid`; wrap cover/supporting media in `.pf-work-images`, with `.pf-work-supporting` for actual extra images only. Add a root `pf-has-portrait` class only for a visible creator portrait.
- Recompose Bento using existing `.pf-tile-*` classes, with no oversized project counter; omit empty optional tiles where appropriate.
- Simplify Studio's hero to a portrait rather than a project card floating over it.
- Add `community: 'owner' | 'guest' | null` rendering option, with owner edit / guest join links in the single existing footer. Remove the duplicate viewer platform footer.
- Run renderer and HTTP tests; report coverage and review concerns.

## Task 2: Template styles, local typography, offline export

Files: `portfolio-public.css`, local font assets/licenses, `portfolio-export.js` and export tests.

- Replace conflicting legacy template rules with a coherent shared foundation and five distinct tokenized layout sections.
- Preserve Spotlight backdrop source/position/overlays; change typography and composition only.
- Implement responsive rules using the portfolio container width so desktop and mobile previews match public pages.
- Load appropriate local fonts and make the exporter inline only safe local font assets declared in its stylesheet.
- Ensure single-project layouts fill their space, actual screenshots remain legible, and no missing optional field creates a broken grid.

## Task 3: Visual verification and delivery

- Run `npm.cmd run check`.
- Capture all five layouts at desktop and mobile widths with real public database content, plus zero/many/long-content fixtures. Check overflow, clipped text, image placement, and interactions.
- Review implementation against approved concepts and real-data requirements; resolve material findings.
- Commit the verified work and deploy through the existing Vercel session. Verify the live page, source assets and PHP health endpoint. GitHub syncing remains dependent on sign-in if no credential is available.
