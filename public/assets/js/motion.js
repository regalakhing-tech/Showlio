// Motion and navigation chrome for the landing page.
// Everything here is progressive: if this module fails, all content stays visible and usable.

export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedMotion.matches;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Elements that rise into view, grouped so siblings can stagger.
const revealGroups = [
  ['.steps article', 'pop'],
  ['.discovery-copy > :not([hidden])', 'rise'],
  ['.studio-copy > *', 'rise'],
  ['.studio', 'rise'],
  ['.projects-section .section-heading', 'rise'],
  ['.project-card', 'rise'],
  ['.stat', 'rise'],
  ['.testimonials-section .section-heading', 'rise'],
  ['.testimonial', 'rise'],
  ['.cta-banner', 'focus'],
];

// Only hide what starts below the fold, so nothing on screen flickers at load.
const belowFold = (element) => element.getBoundingClientRect().top > innerHeight * 0.92;

/** Fade a set of elements in with a short stagger (Web Animations API). */
export function staggerIn(elements, { x = 0, y = 10, step = 45, duration = 480 } = {}) {
  if (prefersReducedMotion()) return;
  [...elements].forEach((element, index) => {
    element.animate(
      [{ opacity: 0, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: 'none' }],
      { duration, delay: index * step, easing: EASE_OUT, fill: 'backwards' },
    );
  });
}

function countUp(element) {
  const final = element.dataset.value ?? element.textContent;
  const match = final.match(/^(\d+)(K?)(\+?)$/);
  if (!match || prefersReducedMotion()) return;
  const [, digits, unit, plus] = match;
  const target = Number(digits);
  const start = performance.now();
  const duration = 1500;
  const frame = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const value = target * (1 - 2 ** (-10 * progress));
    element.textContent = progress === 1 ? final : `${unit ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}${unit}${plus}`;
    if (progress < 1) requestAnimationFrame(frame);
  };
  element.textContent = `0${unit}${plus}`;
  requestAnimationFrame(frame);
}

/** Run a DOM change, then slide the given elements from their old positions to their new ones (FLIP). */
export function flip(elements, mutate) {
  const before = new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
  mutate();
  if (prefersReducedMotion()) return;
  for (const [element, rect] of before) {
    if (!element.isConnected) continue;
    const now = element.getBoundingClientRect();
    const dx = rect.left - now.left;
    const dy = rect.top - now.top;
    if (dx || dy) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EASE_OUT });
  }
}

function initReveals(onReveal) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      observer.unobserve(element);
      element.classList.add('is-revealed');
      onReveal(element);
      const index = Number(element.style.getPropertyValue('--i') || 0);
      // Hand the element back to its normal hover/transition styles once it has arrived.
      setTimeout(() => {
        element.classList.remove('reveal', 'is-revealed');
        element.removeAttribute('data-reveal');
        element.style.removeProperty('--i');
      }, 2200 + index * 80);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  for (const [selector, variant] of revealGroups) {
    $$(selector).forEach((element, index) => {
      if (!belowFold(element)) return;
      element.classList.add('reveal');
      element.dataset.reveal = variant;
      element.style.setProperty('--i', String(Math.min(index, 6)));
      observer.observe(element);
    });
  }
}

// Creator cards slide out from under Maya's card like a hand being dealt.
function initDeal() {
  const art = $('.creator-art');
  if (!art || !belowFold(art)) return;
  art.classList.add('pre-deal');
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    art.classList.add('is-dealing');
    art.classList.remove('pre-deal');
    setTimeout(() => art.classList.remove('is-dealing'), 2600);
  }, { threshold: 0.3 });
  observer.observe(art);
}

// Sticky header state and scroll-aware active navigation link.
function initHeader() {
  const header = $('.site-header');
  const nav = $('#main-nav');
  const links = $$('.nav-link', nav);
  const indicator = document.createElement('span');
  indicator.className = 'nav-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  nav.append(indicator);
  nav.classList.add('has-indicator');

  // Sections without their own nav item belong to the closest preceding one.
  const sections = [['home', '#home'], ['features', '#features'], ['explore', '#explore'], ['profile-studio', '#explore'], ['projects', '#explore'], ['community', '#community']]
    .map(([id, href]) => ({ element: document.getElementById(id), href }))
    .filter(({ element }) => element);
  let activeHref = null;
  let lockUntil = 0;

  const placeIndicator = () => {
    const link = links.find((item) => item.getAttribute('href') === activeHref);
    if (!link || !link.offsetWidth) return;
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.transform = `translateX(${link.offsetLeft}px)`;
  };
  const setActive = (href) => {
    if (href === activeHref) return;
    activeHref = href;
    for (const link of links) {
      const active = link.getAttribute('href') === href;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    placeIndicator();
  };
  const sectionInView = () => {
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) return sections.at(-1).href;
    const line = Math.min(innerHeight * 0.4, header.offsetHeight + 120);
    let href = sections[0].href;
    for (const section of sections) if (section.element.getBoundingClientRect().top <= line) href = section.href;
    return href;
  };
  let queued = false;
  const update = () => {
    queued = false;
    header.classList.toggle('is-scrolled', scrollY > 8);
    if (performance.now() >= lockUntil) setActive(sectionInView());
  };
  // While a clicked link scrolls the page, keep that link active instead of flickering through sections.
  const lockTo = (href) => { setActive(href); lockUntil = performance.now() + 1200; };

  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('scrollend', () => { lockUntil = 0; update(); });
  links.forEach((link) => link.addEventListener('click', () => lockTo(link.getAttribute('href'))));
  new ResizeObserver(placeIndicator).observe(nav);
  update();
  requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.add('is-ready')));
  return lockTo;
}

// The back-to-top button only appears once the visitor reaches the bottom of the page.
function initScrollTop(lockTo) {
  const button = $('#scroll-top');
  const footer = $('.site-footer');
  if (!button || !footer) return;
  new IntersectionObserver(([entry]) => button.classList.toggle('is-visible', entry.isIntersecting), { rootMargin: '0px 0px 10% 0px' }).observe(footer);
  button.addEventListener('click', () => {
    lockTo('#home');
    scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    $('.site-header .brand')?.focus({ preventScroll: true });
  });
}

// Ambient loops stop while their section is off screen.
function pauseOffscreen(selectors) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-paused', !entry.isIntersecting);
  });
  selectors.forEach((selector) => { const element = $(selector); if (element) observer.observe(element); });
}

// Start the hero once fonts and hero images are decoded, capped so a slow image never blocks it.
function startHero() {
  const decoded = $$('.hero img').map((image) => image.decode?.().catch(() => {}));
  const ready = Promise.all([document.fonts?.ready, ...decoded]);
  const cap = new Promise((resolve) => setTimeout(resolve, 1500));
  Promise.race([ready, cap]).then(() => requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('hero-ready'))));
}

export function initMotion() {
  startHero();
  // Stagger indexes for the profile studio's own entrance.
  $$('.studio-settings > *').forEach((element, index) => element.style.setProperty('--j', String(index)));
  $$('.preview-body > *').forEach((element, index) => element.style.setProperty('--k', String(index)));
  const lockTo = initHeader();
  initScrollTop(lockTo);
  initDeal();
  initReveals((element) => {
    if (element.matches('.stat')) { const value = $('.stat-value', element); if (value) countUp(value); }
  });
  pauseOffscreen(['.hero', '.discovery', '.studio-section', '.cta-section']);
}
