/* ==========================================================================
   BEVO — livello di movimento (GSAP + ScrollTrigger)
   ==========================================================================

   Regole che valgono per tutto il file:

   1. Il contenuto non deve MAI restare invisibile. Lo stato iniziale nascosto
      lo mette il CSS solo sotto `.js-motion`, e questa classe viene tolta
      subito se GSAP non c'è o se l'utente ha chiesto meno movimento. Nessuna
      animazione è una condizione accettabile; una pagina bianca no.

   2. Dove il CSS usa già `transform` (le polaroid ruotate, le tile con hover)
      GSAP non ci scrive sopra: lo stile inline batte la regola CSS e
      spegnerebbe hover e rotazioni. In quei casi si anima il contenitore,
      oppure si ripuliscono le proprietà a fine corsa.

   3. Le durate stanno fra 0.6s e 1.2s con ease lungo. Sotto i 0.4s il
      movimento sembra un glitch, sopra 1.4s sembra lento: la fascia di mezzo
      è quella che si legge come "curato".
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Uscita di sicurezza. `js-motion` è ciò che tiene gli elementi a opacità 0:
  // toglierla è il modo di garantire che, comunque vada, la pagina si veda.
  if (reduced || !window.gsap || !window.ScrollTrigger) {
    root.classList.remove('js-motion');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  var EASE = 'power3.out';

  /* ------------------------------------------------------------------------
     0. Scroll con inerzia (Lenis)
     ------------------------------------------------------------------------
     Sta qui dentro e non in un file suo per una ragione precisa: la guardia in
     cima a questo modulo è già l'unico posto in cui la pagina decide se
     muoversi o no. Mettendo Lenis dopo quella guardia, `prefers-reduced-motion`
     lo spegne gratis — e uno scroll con inerzia è esattamente il tipo di
     movimento che quella preferenza esiste per disattivare.

     Il touch resta nativo (è il default di Lenis): sul telefono lo scroll del
     sistema è già fluido e ha un'inerzia che l'utente conosce, riscriverla
     produce solo un ritardo percepito. Qui si addolcisce la rotella, che è
     dove il salto secco si sente davvero.

     La sincronia con ScrollTrigger non è opzionale: Lenis non muove più la
     pagina con lo scroll nativo del browser a ogni frame, quindi senza
     `ScrollTrigger.update` i trigger leggerebbero una posizione vecchia e
     parallasse e reveal partirebbero fuori tempo. `lagSmoothing(0)` disattiva
     la compensazione dei cali di frame rate di GSAP, che combattendo con il
     tempo di Lenis fa scattare lo scroll dopo ogni rallentamento. */

  function buildSmoothScroll() {
    if (!window.Lenis) return null;

    var lenis = new Lenis({
      // Poco più di un secondo per esaurire l'inerzia: sopra 1.3 la pagina
      // sembra scivolare sul ghiaccio e si perde il controllo di dove si sta
      // andando, sotto 0.8 non si distingue dallo scroll nativo.
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
    });

    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    /* Le ancore vanno reindirizzate a mano. Lenis impone
       `scroll-behavior: auto`, quindi un click su `#menu` tornerebbe a essere
       un salto istantaneo — proprio la cosa che si sta cercando di togliere.

       Il `preventDefault` però porta via anche una cosa che il salto nativo
       faceva gratis: spostare il focus sulla sezione di destinazione. Senza
       rimetterlo a mano, gli skip link in cima al documento ("Vai al
       contenuto") smetterebbero di funzionare per chi naviga da tastiera —
       scrollerebbero la pagina lasciando il focus dov'era. Il `tabindex="-1"`
       è lo stesso espediente che script.js usa già per `#top` e `#main`. */
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var link = event.target.closest('a[href^="#"]');
      if (!link) return;

      var hash = link.getAttribute('href');
      if (!hash || hash.length < 2) return;

      var target = document.querySelector(hash);
      if (!target) return;

      event.preventDefault();

      // -84: la stessa altezza di header che il CSS dichiara come
      // `scroll-margin-top` sulle sezioni. Lenis non legge quella proprietà,
      // quindi il valore va ripetuto qui — se cambia là, cambia anche qui.
      lenis.scrollTo(target, { offset: -84 });

      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });

      if (window.history && history.pushState) history.pushState(null, '', hash);
    });

    /* script.js ha bisogno di parlare con Lenis in due punti — il bottone
       "torna in cima" e l'apertura dell'overlay — ma gira prima di questo
       file, quindi non può riceverlo come argomento. Lo si appende al window
       e lì lo va a cercare al momento del click, quando ormai esiste. */
    window.__lenis = lenis;
    return lenis;
  }

  buildSmoothScroll();

  /* ------------------------------------------------------------------------
     Utilità
     ------------------------------------------------------------------------ */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* A fine animazione si toglie l'attributo e si ripuliscono le proprietà
     inline. Serve a due cose: la regola CSS che nasconde `[data-reveal]` smette
     di valere (quindi l'elemento resta visibile senza dipendere da GSAP), e
     l'assenza di `transform` inline restituisce al CSS il controllo degli
     stati :hover. Senza questo, .gallery__item--cta non si solleverebbe più. */
  function settle(targets) {
    targets.forEach(function (el) { el.removeAttribute('data-reveal'); });
    gsap.set(targets, { clearProps: 'all' });
  }

  /* Opacità di arrivo di un reveal. Non è sempre 1: parecchi elementi nascono
     già smorzati dal CSS (.body-text sta a .85, .body-text--muted a .75,
     .location__hours a .8, .hero__info a .92). Animandoli fino a 1 e poi
     ripulendo le proprietà inline, il valore tornava di scatto a quello di
     progetto: uno scalino di opacità proprio sull'ultimo fotogramma, su quasi
     ogni blocco di testo della pagina.

     L'attributo va tolto PRIMA di leggere il valore: finché sta lì, la regola
     `.js-motion [data-reveal]` risponde 0 e si leggerebbe quello invece
     dell'opacità vera. Toglierlo non fa lampeggiare nulla, perché la `from`
     della tween che segue viene applicata nello stesso frame. */
  function naturalOpacity(el) {
    el.removeAttribute('data-reveal');
    var v = parseFloat(getComputedStyle(el).opacity);
    return isNaN(v) ? 1 : v;
  }

  function toOpacity(i, target) { return target.__revealTo; }

  /* ------------------------------------------------------------------------
     Split in parole
     ------------------------------------------------------------------------
     Scritto a mano invece di usare SplitText: servono solo le parole, e il
     plugin porta con sé una licenza da valutare per una manciata di righe.

     Il testo viene poi raggruppato per riga misurando l'offsetTop delle
     parole: le righe vere non coincidono con i <br>, dipendono da quanto è
     larga la finestra. Ogni riga diventa un blocco con overflow nascosto, che
     è ciò che permette alle parole di salire da sotto una maschera invece che
     apparire e basta.

     Accessibilità: spezzare il testo in span può far compitare la frase parola
     per parola ad alcuni screen reader. Per questo il titolo riceve un
     aria-label con la frase originale, che vince sul contenuto. */
  function splitIntoWords(el) {
    /* Il <br> non produce testo, quindi `el.textContent` incolla le due righe:
       "Nati da tre amici,<br>cresciuti a Roma" diventerebbe
       "amici,cresciuti", ed è quella la stringa che finisce nell'aria-label
       letto dagli screen reader. Va sostituito con uno spazio prima di
       normalizzare. */
    var original = Array.prototype.map.call(el.childNodes, function walk(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType === 1) {
        if (node.tagName === 'BR') return ' ';
        return Array.prototype.map.call(node.childNodes, walk).join('');
      }
      return '';
    }).join('').replace(/\s+/g, ' ').trim();

    var words = [];

    // I nodi si raccolgono prima: modificare il DOM mentre lo si percorre
    // sposta gli indici e salta pezzi di testo.
    var nodes = [];
    (function collect(node) {
      Array.prototype.forEach.call(node.childNodes, function (child) {
        if (child.nodeType === 3) nodes.push(child);
        else if (child.nodeType === 1 && child.tagName !== 'BR') collect(child);
      });
    })(el);

    nodes.forEach(function (textNode) {
      var parts = textNode.textContent.split(/(\s+)/).filter(function (p) { return p.length; });
      if (!parts.length) return;

      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
          return;
        }
        var span = document.createElement('span');
        span.className = 'split-word';
        span.textContent = part;
        frag.appendChild(span);
        words.push(span);
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });

    if (!words.length) return null;

    el.setAttribute('aria-label', original);
    return words;
  }

  /* Raggruppa le parole già inserite nel DOM in righe visive e le avvolge in
     un contenitore con overflow nascosto. Va chiamata dopo splitIntoWords,
     a layout calcolato. */
  function wrapLines(el, words) {
    var lines = [];
    var currentTop = null;
    var current = null;

    words.forEach(function (word) {
      var top = word.offsetTop;
      // Tolleranza di 2px: pedici, accenti e font fallback fanno oscillare
      // l'offsetTop di frazioni di pixel dentro la stessa riga.
      if (currentTop === null || Math.abs(top - currentTop) > 2) {
        current = [];
        lines.push(current);
        currentTop = top;
      }
      current.push(word);
    });

    /* Nel wrapper va spostato l'INTERVALLO di nodi dalla prima all'ultima
       parola, non solo le parole. Gli spazi fra una parola e l'altra sono nodi
       di testo separati: muovendo i soli span restavano fuori dal wrapper e il
       titolo si leggeva tutto attaccato ("Quellochebeviamo").
       `nextSibling` va letto PRIMA di appendChild, che stacca il nodo dalla
       posizione attuale e azzera il collegamento al successivo. */
    var wrappers = [];
    lines.forEach(function (lineWords) {
      var first = lineWords[0];
      var last = lineWords[lineWords.length - 1];
      var parent = first.parentNode;

      // Se le parole di una stessa riga stanno in rami diversi del DOM
      // l'intervallo non è contiguo: si ripiega sullo spostamento delle sole
      // parole, che perde gli spazi ma non rompe la struttura.
      var contiguous = last.parentNode === parent;

      var wrapper = document.createElement('span');
      wrapper.className = 'split-line';
      parent.insertBefore(wrapper, first);

      if (contiguous) {
        var node = first;
        while (node) {
          var next = node.nextSibling;
          wrapper.appendChild(node);
          if (node === last) break;
          node = next;
        }
      } else {
        lineWords.forEach(function (w) { wrapper.appendChild(w); });
      }

      wrappers.push(wrapper);
    });

    /* I <br> del markup vanno tolti DOPO aver misurato le righe. Servivano a
       decidere dove spezzare (l'offsetTop li tiene in conto), ma ora ogni riga
       è un blocco e si va a capo da sé: lasciandoli si otterrebbe una riga
       vuota in mezzo al titolo, larga quanto l'interlinea.
       Si rimuovono solo quelli rimasti fuori dai wrapper, che sono per
       costruzione quelli fra una riga e l'altra. */
    Array.prototype.slice.call(el.querySelectorAll('br')).forEach(function (br) {
      if (!br.closest('.split-line')) br.parentNode.removeChild(br);
    });

    el.__splitWrappers = wrappers;
    return words;
  }

  /* ------------------------------------------------------------------------
     1. Hero — sequenza di apertura
     ------------------------------------------------------------------------
     Parte a fonts caricati: con Anton non ancora pronto il titolo verrebbe
     misurato in Arial e le righe si spezzerebbero in un altro punto. */

  function buildHero() {
    var tl = gsap.timeline({ defaults: { ease: EASE, duration: 1 } });
    var logo = $('.hero__logo');
    var claim = $('.hero__claim');
    var info = $('.hero__info');
    var actions = $('.hero__actions');

    // .hero__scroll-indicator non viene animato qui: ha già il keyframe CSS
    // `scroll-bounce`, che anima anche l'opacità. Un'animazione CSS batte lo
    // stile inline, quindi qualunque tween di GSAP sull'opacità sarebbe
    // silenziosamente ignorato. Meglio non scrivere codice che non fa nulla.

    if (logo) {
      // Si anima l'immagine, non .hero__logo-wrap: sul wrap gira il keyframe
      // `neon-flicker`, e un'animazione CSS ha la precedenza sullo stile
      // inline di GSAP per le proprietà che tocca (qui, opacity).
      //
      // Niente `filter` in questa tween, per quanto un blur in entrata starebbe
      // bene: il CSS usa già `filter` sul logo per i due drop-shadow del neon.
      // Scriverlo inline li sostituirebbe, e al clearProps finale l'alone
      // ricomparirebbe di scatto. Opacità e scala bastano e non hanno conflitti.
      logo.__revealTo = naturalOpacity(logo);
      tl.fromTo(logo,
        { opacity: 0, scale: 0.9 },
        { opacity: toOpacity, scale: 1, duration: 1.3, onComplete: function () { settle([logo]); } },
        0);
    }

    if (claim) {
      var claimWords = splitIntoWords(claim);
      if (claimWords) {
        wrapLines(claim, claimWords);
        // removeAttribute prima della lettura: da qui in poi a nascondere sono
        // le maschere di riga, non l'opacità del blocco.
        claim.style.opacity = String(naturalOpacity(claim));
        tl.from(claimWords, {
          yPercent: 115,
          duration: 1.05,
          stagger: 0.07,
        }, 0.35);
      } else {
        claim.__revealTo = naturalOpacity(claim);
        tl.to(claim, { opacity: toOpacity, y: 0 }, 0.35);
      }
    }

    [info, actions].forEach(function (el, i) {
      if (!el) return;
      el.__revealTo = naturalOpacity(el);
      tl.fromTo(el,
        { opacity: 0, y: 22 },
        { opacity: toOpacity, y: 0, duration: 0.9, onComplete: function () { settle([el]); } },
        0.75 + i * 0.12);
    });
  }

  /* ------------------------------------------------------------------------
     2. Titoli di sezione — parole che salgono da sotto la maschera
     ------------------------------------------------------------------------ */

  function buildTitles() {
    $$('[data-reveal="title"]').forEach(function (el) {
      var words = splitIntoWords(el);
      if (!words) return;
      wrapLines(el, words);

      // Il titolo torna visibile subito: da qui in poi a nascondere qualcosa
      // sono le maschere di riga, non l'opacità del blocco.
      el.style.opacity = String(naturalOpacity(el));

      gsap.from(words, {
        yPercent: 118,
        duration: 1.05,
        ease: EASE,
        stagger: 0.055,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
  }

  /* ------------------------------------------------------------------------
     3. Reveal generici, raggruppati per ingresso in viewport
     ------------------------------------------------------------------------
     ScrollTrigger.batch raccoglie gli elementi che entrano nello stesso
     momento e li anima insieme: è il modo di avere lo sfalsamento senza
     legarlo alla sezione, che essendo alta farebbe partire l'animazione di
     roba ancora fuori campo. */

  function batchReveal(selector, fromVars, stagger) {
    if (!$$(selector).length) return;

    ScrollTrigger.batch(selector, {
      start: 'top 88%',
      once: true,
      /* Senza un tetto, un batch raccoglie tutti gli elementi che entrano nella
         stessa finestra di 0.1s — e con uno scroll veloce (il tasto Fine, la
         barra trascinata, o il salto lungo di `scroll-behavior: smooth` quando
         si clicca "Dove siamo") quella finestra può contenere mezza pagina.
         Misurato: 23 elementi in un solo batch, che con lo stagger qui sotto
         fanno una fila di 3.64s — l'ultimo blocco compariva quando l'utente
         era fermo lì da tre secondi buoni.

         A sei, il caso peggiore torna sotto i due secondi e gli elementi in
         eccesso passano semplicemente al batch successivo, che è il
         comportamento che si voleva fin dall'inizio. */
      batchMax: 6,
      onEnter: function (batch) {
        batch.forEach(function (el) { el.__revealTo = naturalOpacity(el); });
        gsap.fromTo(batch, fromVars, {
          opacity: toOpacity,
          y: 0,
          scale: 1,
          duration: 1,
          ease: EASE,
          stagger: stagger,
          overwrite: true,
          onComplete: function () { settle(this.targets()); },
        });
      },
    });
  }

  /* ------------------------------------------------------------------------
     4. Parallasse sugli sfondi fotografici
     ------------------------------------------------------------------------
     Le immagini sono già scalate del 12% dal CSS, altrimenti spostandole si
     scoprirebbe il bordo. `scrub: true` le lega allo scroll invece di
     lanciarle: il parallasse deve seguire il dito, non avere una vita propria. */

  function buildParallax() {
    [['.hero', '.hero__bg-img'], ['.aperitivo', '.aperitivo__bg-img']].forEach(function (pair) {
      var section = $(pair[0]);
      var img = $(pair[1]);
      if (!section || !img) return;

      gsap.fromTo(img,
        { yPercent: -6 },
        {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
    });
  }

  /* ------------------------------------------------------------------------
     5. Aperitivo — l'orario è l'insegna della pagina
     ------------------------------------------------------------------------ */

  function buildAperitivo() {
    var hours = $('.aperitivo__hours');
    if (!hours) return;

    hours.__revealTo = naturalOpacity(hours);
    gsap.fromTo(hours,
      { opacity: 0, scale: 0.92, filter: 'blur(18px)' },
      {
        opacity: toOpacity,
        scale: 1,
        filter: 'blur(0px)',
        duration: 1.4,
        ease: EASE,
        onComplete: function () { settle([hours]); },
        scrollTrigger: { trigger: hours, start: 'top 85%', once: true },
      });
  }

  /* ------------------------------------------------------------------------
     6. Galleria — leggerissimo ken burns legato allo scroll
     ------------------------------------------------------------------------
     Va sull'<img>, non sulla tile: la tile CTA ha un :hover che sposta la
     card, e uno stile inline su di lei lo bloccherebbe. */

  /* Stesso principio applicato alle foto del menu, ma con un'ampiezza dimezzata.
     Serviva vita, non un'affordance: le card sono <article> non cliccabili e il
     CSS lo dichiara esplicitamente rifiutando qualsiasi :hover, perché il glow
     prometteva un click che non esiste. Una deriva legata allo scroll non
     promette niente — si muove perché si sta scorrendo, non perché ci si è
     passati sopra — quindi aggiunge movimento senza rimettere quella bugia.

     `.menu__card-media` ha già `overflow: hidden`, quindi la scala non esce dal
     riquadro. Nessun conflitto con la regola 2 in cima al file: su queste foto
     il CSS non usa `transform` da nessuna parte. */
  function buildMenuDrift() {
    $$('.menu__card-photo').forEach(function (img) {
      gsap.fromTo(img,
        { scale: 1.06, yPercent: -1.5 },
        {
          scale: 1,
          yPercent: 1.5,
          ease: 'none',
          scrollTrigger: {
            trigger: img.closest('.menu__card') || img,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
    });
  }

  function buildGalleryDrift() {
    $$('.gallery__img').forEach(function (img) {
      gsap.fromTo(img,
        { scale: 1.12, yPercent: -3 },
        {
          scale: 1,
          yPercent: 3,
          ease: 'none',
          scrollTrigger: {
            trigger: img.closest('.gallery__item') || img,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
    });
  }

  /* ------------------------------------------------------------------------
     7. Footer — il filo che si tira
     ------------------------------------------------------------------------
     I tre blocchi del footer salgono con i `data-reveal="up"` del markup,
     insieme a tutto il resto della pagina. Il divisore no: è una linea, e una
     linea si disegna invece di farla salire. `scaleX` da 0 con origine a
     sinistra la fa correre nella stessa direzione in cui sfuma il gradiente,
     così movimento e colore raccontano la stessa cosa.

     Non passa da `data-reveal` proprio per questo: quella strada porta
     all'opacità 0 del CSS e a una tween su `y`, che qui sarebbero entrambe
     sbagliate. */

  function buildFooterRule() {
    var divider = $('.site-footer__divider');
    if (!divider) return;

    gsap.from(divider, {
      scaleX: 0,
      transformOrigin: 'left center',
      duration: 1.1,
      ease: EASE,
      onComplete: function () { gsap.set(divider, { clearProps: 'all' }); },
      scrollTrigger: { trigger: divider, start: 'top 94%', once: true },
    });
  }

  /* ------------------------------------------------------------------------
     8. Header — spostato in script.js
     ------------------------------------------------------------------------

     Qui c'era buildNav(), che applicava `.is-scrolled` via ScrollTrigger. Era
     nel posto sbagliato: questo file esce in anticipo quando l'utente chiede
     meno movimento o quando GSAP non carica (vedi la guardia in cima), e in
     entrambi i casi buildNav() non veniva mai raggiunta — l'header restava
     nello stato di riposo per sempre, trasparente anche sotto il contenuto.

     Lo stato di un'interfaccia non è un'animazione e non deve dipendere dal
     livello di movimento. Ora sta in script.js, insieme a quick bar e back to
     top, dentro l'unico listener di scroll della pagina. */

  /* ------------------------------------------------------------------------
     Avvio
     ------------------------------------------------------------------------ */

  function start() {
    buildHero();
    buildTitles();

    batchReveal('[data-reveal="up"]', { opacity: 0, y: 30 }, 0.12);
    batchReveal('[data-reveal="card"]', { opacity: 0, y: 46, scale: 0.97 }, 0.13);
    batchReveal('[data-reveal="tile"]', { opacity: 0, y: 38, scale: 0.96 }, 0.1);
    batchReveal('[data-reveal="media"]', { opacity: 0, y: 40 }, 0);

    buildParallax();
    buildAperitivo();
    buildMenuDrift();
    buildGalleryDrift();
    buildFooterRule();

    ScrollTrigger.refresh();
  }

  /* I font si aspettano prima di misurare le righe: con Anton non ancora
     applicato lo split raggrupperebbe le parole secondo la metrica del font di
     ripiego, e a sostituzione avvenuta le maschere finirebbero a metà lettera.
     `document.fonts.ready` non rifiuta mai; il timeout è solo per i browser
     senza Font Loading API, dove si parte comunque dopo mezzo secondo. */
  var fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready
    : new Promise(function (res) { setTimeout(res, 500); });

  Promise.race([
    fontsReady,
    new Promise(function (res) { setTimeout(res, 2000); }),
  ]).then(start);

  /* Il ricalcolo delle righe al resize non c'è di proposito. Le maschere sono
     `overflow: hidden` su blocchi che seguono il testo: se la finestra cambia
     larghezza il testo si riflette dentro i wrapper e resta leggibile, solo
     con le maschere non più allineate alle righe nuove. Poiché le animazioni
     partono `once: true` e a quel punto sono già finite, non si vede nulla.
     Rifare lo split a ogni resize costerebbe molto di più di quel che rende. */
}());
