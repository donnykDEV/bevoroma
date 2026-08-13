// Single source of truth for BEVO's opening hours — reused by any dynamic
// element that needs to know if the bar is open (currently: hero status).
// Days follow Date#getDay(): 0 = domenica ... 6 = sabato.
const OPENING_HOURS = {
  closedDays: [1], // lunedì chiuso
  openHour: 18,
  openMinute: 0,
  closeHour: 2, // chiusura il giorno successivo (dopo mezzanotte)
  closeMinute: 0,
};

function getOpeningStatus(date = new Date()) {
  const day = date.getDay();
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const openMinutes = OPENING_HOURS.openHour * 60 + OPENING_HOURS.openMinute;
  const closeMinutes = OPENING_HOURS.closeHour * 60 + OPENING_HOURS.closeMinute;

  const yesterday = (day + 6) % 7;
  const todayIsOpenDay = !OPENING_HOURS.closedDays.includes(day);
  const yesterdayWasOpenDay = !OPENING_HOURS.closedDays.includes(yesterday);

  // Aperto se: è passata l'apertura di oggi, oppure siamo ancora nella
  // coda dopo mezzanotte dell'apertura di ieri (es. l'1:00 di martedì
  // appartiene ancora alla serata aperta lunedì... salvo che lunedì è
  // chiuso, quindi qui si applica a es. l'1:00 di lunedì da domenica sera).
  const isOpen =
    (todayIsOpenDay && minutesNow >= openMinutes) ||
    (yesterdayWasOpenDay && minutesNow < closeMinutes);

  if (isOpen) return { level: 'open', label: 'Aperto ora' };

  // Non aperto e oggi non è nemmeno un giorno di apertura: lunedì.
  if (!todayIsOpenDay) return { level: 'closed', label: 'Chiuso oggi' };

  // Oggi apre, ma non ancora.
  const hh = String(OPENING_HOURS.openHour).padStart(2, '0');
  const mm = String(OPENING_HOURS.openMinute).padStart(2, '0');
  return { level: 'opening-soon', label: `Apre alle ${hh}:${mm}` };
}

const STATUS_LEVELS = ['open', 'opening-soon', 'closed'];

function renderOpeningStatus() {
  const statusEl = document.getElementById('hero-status');
  const textEl = document.getElementById('hero-status-text');
  if (!statusEl || !textEl) return;

  const { level, label } = getOpeningStatus();
  textEl.textContent = label;
  STATUS_LEVELS.forEach((l) => statusEl.classList.toggle(`hero__status--${l}`, l === level));
}

renderOpeningStatus();
setInterval(renderOpeningStatus, 60000);

document.getElementById('current-year').textContent = new Date().getFullYear();

// La sticky nav è visibile da subito: non serve più né il listener di scroll
// che la rivelava dopo la hero, né la rivelazione al primo Tab, che esisteva
// solo perché a scrollY 0 era `visibility:hidden` e quindi fuori dal tab order.

// La strip nightlife scrollabile non esiste più: le foto ora sono tre
// polaroid che da mobile si impilano, quindi niente scroll orizzontale da
// gestire e nessuna sfumatura di fine corsa.

// --- Mappa: caricamento su click ---
// Finché non si clicca non parte nessuna richiesta verso Google, quindi
// nessun cookie di terze parti prima del consenso e nessun banner da mostrare.
const mapContainer = document.getElementById('location-map');
const mapLoadButton = document.getElementById('map-load');

if (mapContainer && mapLoadButton) {
  mapLoadButton.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.className = 'location__map-frame';
    iframe.src = 'https://www.google.com/maps?q=41.8693142,12.5171454&z=16&output=embed';
    iframe.title = 'Mappa di BEVO';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.allowFullscreen = true;

    mapContainer.replaceChildren(iframe);
    // Il bottone appena premuto sparisce: il focus va portato sulla mappa,
    // altrimenti finisce sul body.
    iframe.setAttribute('tabindex', '0');
    iframe.focus();
  });
}

// --- Sezione corrente: marca il link attivo nella nav ---
const sectionLinks = Array.from(
  document.querySelectorAll('.site-nav__links a[href^="#"], .site-nav__overlay-links a[href^="#"]')
);

const linksByHash = new Map();
sectionLinks.forEach((link) => {
  const hash = link.getAttribute('href');
  if (!linksByHash.has(hash)) linksByHash.set(hash, []);
  linksByHash.get(hash).push(link);
});

// Ordine di documento, non ordine dei link: nav desktop e overlay elencano le
// stesse sezioni, ma non è garantito che lo facciano nello stesso ordine in
// cui compaiono nella pagina. Ordinare qui invece di fidarsi dell'ordine dei
// link evita che "prima sezione visibile" scelga quella sbagliata.
const observedSections = Array.from(linksByHash.keys())
  .map((hash) => document.querySelector(hash))
  .filter(Boolean)
  .sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

// Altezza coperta dalla sticky nav: stesso valore dello scroll-margin-top.
const SECTION_BAND_TOP = 84;

// La sezione corrente è la prima, in ordine di documento, che occupa la fascia
// fra la nav e la metà del viewport. Ricavarla dalla geometria invece che dal
// bookkeeping delle entry evita il caso limite di due sezioni adiacenti che si
// toccano sul bordo della fascia: lì l'intersezione è alta 0 px ma
// `isIntersecting` è comunque true, e resterebbe marcata la sezione precedente.
function getCurrentSection() {
  const bandBottom = window.innerHeight * 0.5;
  return (
    observedSections.find((section) => {
      const rect = section.getBoundingClientRect();
      // Serve una sovrapposizione reale, non frazioni di pixel: due sezioni
      // adiacenti condividono il bordo e il layout non cade su interi.
      return rect.top < bandBottom && rect.bottom - SECTION_BAND_TOP > 1;
    }) || null
  );
}

function updateActiveSection() {
  const current = getCurrentSection();
  // Nessuna sezione nella fascia — succede solo sulla hero, che non è in
  // elenco — significa "nessuna voce attiva", non "tieni l'ultima". Prima qui
  // c'era un `if (!current) return;` che lasciava acceso l'ultimo link
  // visitato: tornando in cima restava evidenziata una sezione che non si
  // stava guardando. Con il back to top il caso è diventato la norma invece
  // che l'eccezione, quindi lo stato va azzerato.
  linksByHash.forEach((links, hash) => {
    const isActive = current !== null && hash === `#${current.id}`;
    links.forEach((link) => {
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  });
}

if (observedSections.length && 'IntersectionObserver' in window) {
  // rootMargin: si ignorano gli 84px coperti dalla sticky nav e la metà
  // inferiore del viewport. Soglie 0 e 0.5: le sezioni più alte della fascia
  // ridotta non raggiungono mai il 50%, con la sola 0.5 non scatterebbe nulla.
  // L'observer serve solo da innesco, il calcolo è in getCurrentSection().
  const sectionObserver = new IntersectionObserver(updateActiveSection, {
    threshold: [0, 0.5],
    rootMargin: `-${SECTION_BAND_TOP}px 0px -50% 0px`,
  });

  observedSections.forEach((section) => sectionObserver.observe(section));
  window.addEventListener('resize', updateActiveSection);
}

// --- Stato legato allo scroll: quick bar, header, back to top ---
//
// Un listener solo per tre cose. La posizione si legge una volta per frame e
// la si distribuisce: tre listener separati significherebbero tre callback e
// tre rAF in volo per lo stesso identico frame.
//
// Lo stato dell'header stava in motion.js, dentro buildNav(). Quel file però
// esce in anticipo — `if (reduced || !gsap || !ScrollTrigger) return;` — quindi
// per chi ha chiesto meno movimento, o se GSAP non arriva, buildNav() non
// veniva mai raggiunta e l'header restava per sempre nello stato di riposo,
// trasparente anche con il contenuto che gli scorreva sotto. Lo stato di
// un'interfaccia non può dipendere dal livello di animazione: vive qui, in un
// file che non ha dipendenze e gira sempre.
const quickBar = document.getElementById('quick-bar');
const siteNav = document.getElementById('site-nav');
const backToTop = document.getElementById('back-to-top');

// Stessa soglia che usava buildNav(): l'header si densifica appena il
// contenuto comincia a passargli sotto.
const NAV_SCROLLED_AT = 40;
// Quick bar a 0.8 viewport: entra quando le CTA della hero sono ormai fuori
// campo, così non competono fra loro.
const QUICK_BAR_AT = 0.8;
// Back to top più tardi: prima di un viewport e mezzo "torna in cima" non è
// ancora un bisogno, ed è solo un altro oggetto che galleggia sullo schermo.
const BACK_TO_TOP_AT = 1.5;

let scrollTicking = false;

function updateScrollState() {
  scrollTicking = false;
  const y = window.scrollY;
  const vh = window.innerHeight;

  if (quickBar) quickBar.classList.toggle('is-visible', y > vh * QUICK_BAR_AT);
  if (siteNav) siteNav.classList.toggle('is-scrolled', y > NAV_SCROLLED_AT);
  if (backToTop) backToTop.classList.toggle('is-visible', y > vh * BACK_TO_TOP_AT);
}

function onScrollState() {
  if (!scrollTicking) {
    scrollTicking = true;
    requestAnimationFrame(updateScrollState);
  }
}

window.addEventListener('scroll', onScrollState, { passive: true });
window.addEventListener('resize', updateScrollState);
// Stato corretto anche se la pagina viene aperta già scrollata: ancora
// nell'URL, oppure ripristino di posizione del browser.
updateScrollState();

if (backToTop) {
  backToTop.addEventListener('click', () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Con Lenis attivo lo scroll nativo è forzato a `auto` dal suo CSS: questa
    // riga tornerebbe a essere un salto istantaneo. Quando c'è, il movimento
    // glielo si chiede a lui; quando non c'è — JS parziale, GSAP non caricato,
    // reduced motion — si resta sulla strada nativa di prima.
    if (window.__lenis && !reduced) {
      window.__lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    }

    // Il focus va spostato a mano: il bottone appena premuto sparisce sotto
    // soglia, e senza questo resterebbe su un elemento invisibile, facendo
    // ripartire la tabulazione dal fondo del documento invece che dall'inizio.
    const top = document.getElementById('top');
    if (top) {
      top.setAttribute('tabindex', '-1');
      top.focus({ preventScroll: true });
    }
  });
}

// --- Sticky nav: menu mobile overlay fullscreen ---
const navToggle = document.getElementById('site-nav-toggle');
const navOverlay = document.getElementById('site-nav-overlay');
const navOverlayClose = document.getElementById('site-nav-overlay-close');

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tutto ciò che sta dietro all'overlay: va reso inerte quando il dialog è
// aperto, altrimenti resta tabbabile e leggibile dagli screen reader.
function getBackgroundRegions() {
  return [
    document.getElementById('site-nav'),
    document.querySelector('header.hero'),
    document.querySelector('main'),
    document.querySelector('footer.site-footer'),
    // Gli skip link sono figli diretti di <body>: senza inertizzarli
    // resterebbero tabbabili anche a dialog aperto.
    ...document.querySelectorAll('.skip-link'),
  ].filter(Boolean);
}

function getOverlayFocusable() {
  return Array.from(navOverlay.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  );
}

let lastFocused = null;

function setMobileNavOpen(open) {
  if (!navToggle || !navOverlay) return;
  // Esc viene ascoltato sempre: senza questa guardia una chiusura "a vuoto"
  // rimanderebbe il focus a lastFocused fuori contesto.
  if (navOverlay.classList.contains('is-open') === open) return;

  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
  navOverlay.classList.toggle('is-open', open);
  navOverlay.setAttribute('aria-hidden', String(!open));
  document.documentElement.classList.toggle('nav-open', open);
  document.body.classList.toggle('nav-open', open);

  // `overflow: hidden` da solo non basta più a bloccare la pagina dietro
  // l'overlay: Lenis non usa lo scroll nativo, quindi continuerebbe a far
  // scorrere il contenuto sotto il menu a schermo pieno. Va fermato e
  // rifatto ripartire esplicitamente.
  if (window.__lenis) {
    if (open) window.__lenis.stop();
    else window.__lenis.start();
  }

  const regions = getBackgroundRegions();

  if (open) {
    lastFocused = document.activeElement;
    regions.forEach((el) => {
      el.inert = true;
      el.setAttribute('aria-hidden', 'true');
    });
    const focusable = getOverlayFocusable();
    if (focusable.length) focusable[0].focus();
  } else {
    regions.forEach((el) => {
      el.inert = false;
      el.removeAttribute('aria-hidden');
    });
    // Il focus va ripristinato dopo aver tolto `inert`, altrimenti il
    // bersaglio è ancora non focusabile e il focus finisce sul body.
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();

    // Il toggle vive dentro .site-nav, che a scrollY 0 è `visibility:hidden`:
    // in quel caso focus() non attecchisce. Succede solo se nel frattempo la
    // pagina è tornata in cima (link "#top" dell'overlay); per non lasciare il
    // focus sul body lo riportiamo all'inizio del contenuto.
    if (document.activeElement !== lastFocused) {
      const mainEl = document.getElementById('main');
      if (mainEl) {
        mainEl.setAttribute('tabindex', '-1');
        mainEl.focus();
      }
    }
    lastFocused = null;
  }
}

if (navToggle && navOverlay) {
  navToggle.addEventListener('click', () => {
    setMobileNavOpen(navToggle.getAttribute('aria-expanded') !== 'true');
  });

  if (navOverlayClose) {
    navOverlayClose.addEventListener('click', () => setMobileNavOpen(false));
  }

  // Chiude su click di un link (logo, sezioni, CTA, Instagram).
  navOverlay.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMobileNavOpen(false));
  });

  // Chiude cliccando fuori dai link/bottoni (l'area vuota dell'overlay).
  navOverlay.addEventListener('click', (event) => {
    if (!event.target.closest('a, button')) {
      setMobileNavOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMobileNavOpen(false);
  });

  // Focus trap: con l'overlay aperto, Tab e Shift+Tab ciclano solo al suo interno.
  navOverlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !navOverlay.classList.contains('is-open')) return;

    const focusable = getOverlayFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
