# Reference homepage implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the supplied design in the current session.

**Goal:** Recreate the supplied Showlio reference as a responsive, polished homepage with original imagery and the owner's logo.

**Architecture:** Static semantic HTML, compiled Tailwind/custom CSS, small vanilla JavaScript modules and locally served raster assets. Preserve the PHP health endpoint and existing CI/CD.

**Tech stack:** Existing PHP 8.5, Node 24, Tailwind 4.3.3 and vanilla JavaScript.

## Tasks

- [x] Copy the supplied logo and self-host the open-source Inter font; generate five creator portraits and four matching project thumbnails and save prompt provenance.
- [x] Replace `public/index.html` with the reference's complete section structure, layered hero/discovery compositions, project cards, testimonials and accessible dialogs.
- [x] Replace `src/styles/app.css` with the reference palette, typography, spacing and mobile layouts. Add browser interactions in `public/assets/js/app.js` and focused data modules.
- [x] Build and run syntax, HTTP, identity-consistency, asset-loading and HTML-structure checks; resolve the code-review findings.
- [ ] Visually inspect desktop/mobile rendering and exercise controls in a real browser. **Blocked:** Computer Use stopped because it could not verify the active Chrome URL safely; no further UI automation was attempted.
- [x] Review the final changes and update setup, asset-provenance and verification documentation.

Delivery: commit and push the verified code to the existing authorized GitHub destination, check CI and disclose the browser-verification limitation.
