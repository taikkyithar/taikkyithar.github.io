/* =============================================================
   Taikkyithar — site behaviour
   All motion checks prefers-reduced-motion before running.
   ============================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Footer year ---------- */
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Theme toggle ---------- */
  // The initial theme is applied by an inline script in <head> to avoid a flash.
  var root = document.documentElement;
  var themeToggle = $('#themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      var meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'light' ? '#f6f8fc' : '#0b1120');
    });
  }

  /* ---------- Mobile menu ---------- */
  var menuBtn = $('#menuBtn');
  var navLinks = $('#navLinks');
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    $$('a', navLinks).forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- Sticky nav shadow + scroll progress + back-to-top ---------- */
  var nav = $('#siteNav');
  var bar = $('#scrollProgress');
  var toTop = $('#toTop');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;

    if (nav) nav.classList.toggle('scrolled', y > 8);
    if (toTop) toTop.classList.toggle('show', y > 600);

    if (bar) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(y / h, 1) : 0) + ')';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  /* ---------- Scroll reveal (with per-group stagger) ---------- */
  var revealables = $$('.reveal');
  if (revealables.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      revealables.forEach(function (el) { el.classList.add('visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('visible');
          io.unobserve(e.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      // Siblings inside a [data-stagger] container cascade rather than pop at once.
      $$('[data-stagger]').forEach(function (group) {
        $$('.reveal', group).forEach(function (el, i) {
          el.style.setProperty('--d', (i * 90) + 'ms');
        });
      });

      revealables.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- Timeline draw-in ---------- */
  var timeline = $('.timeline');
  if (timeline) {
    if (reduced || !('IntersectionObserver' in window)) {
      timeline.classList.add('lit');
    } else {
      var tio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('lit');
          tio.unobserve(e.target);
        });
      }, { threshold: 0.1 });
      tio.observe(timeline);
    }
  }

  /* ---------- Cursor spotlight on cards ---------- */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    $$('.spotlight').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- Count-up stats ---------- */
  // Reads data-count / data-suffix / data-prefix; falls back to the literal text.
  var counters = $$('[data-count]');
  if (counters.length) {
    var render = function (el, v) {
      var dec = parseInt(el.dataset.decimals || '0', 10);
      el.textContent = (el.dataset.prefix || '') + v.toFixed(dec) + (el.dataset.suffix || '');
    };
    var run = function (el) {
      var target = parseFloat(el.dataset.count);
      if (reduced) { render(el, target); return; }
      var dur = 1400, start = null;
      var step = function (t) {
        if (start === null) start = t;
        var p = Math.min((t - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        render(el, target * eased);
        if (p < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    };

    if (!('IntersectionObserver' in window)) {
      counters.forEach(run);
    } else {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          run(e.target);
          cio.unobserve(e.target);
        });
      }, { threshold: 0.5 });
      counters.forEach(function (el) { cio.observe(el); });
    }
  }

  /* ---------- Terminal typewriter ---------- */
  // Each line types at ~42ms/char (see .line.type in CSS); the next line waits
  // for the previous one to finish, so the whole block streams like real output.
  var termLines = $$('.term-body .line[data-type]');
  if (termLines.length && !reduced) {
    var delay = 300;
    termLines.forEach(function (line) {
      var n = line.textContent.length;
      line.style.setProperty('--n', n);
      line.style.setProperty('--delay', delay + 'ms');
      line.classList.add('type');
      delay += n * 42 + 90;
    });
    var caret = $('#termCaret');
    if (caret) {
      caret.style.visibility = 'hidden';
      window.setTimeout(function () { caret.style.visibility = 'visible'; }, delay);
    }
  }

  /* ---------- Active section in nav ---------- */
  var sectionLinks = $$('.nav-links a[data-nav]');
  if (sectionLinks.length && 'IntersectionObserver' in window) {
    var sections = sectionLinks
      .map(function (a) { return document.getElementById(a.dataset.nav); })
      .filter(Boolean);

    if (sections.length) {
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          sectionLinks.forEach(function (a) {
            a.classList.toggle('active', a.dataset.nav === e.target.id);
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { sio.observe(s); });
    }
  }

  /* ---------- Blog tag filter ---------- */
  var filterBar = $('#filterBar');
  var postList = $('#postList');
  if (filterBar && postList) {
    var cards = $$('.post-card', postList);
    var emptyState = $('#emptyState');

    var apply = function (tag) {
      var shown = 0;
      cards.forEach(function (card) {
        var tags = (card.dataset.tags || '').split(' ').filter(Boolean);
        var match = tag === 'all' || tags.indexOf(tag) !== -1;
        if (match) shown++;

        if (reduced) {
          card.classList.toggle('filtered-hidden', !match);
          return;
        }
        if (match) {
          card.classList.remove('filtered-hidden');
          // Next frame, so the browser paints the un-hidden card before fading in.
          window.requestAnimationFrame(function () { card.classList.remove('filtering-out'); });
        } else {
          card.classList.add('filtering-out');
          window.setTimeout(function () {
            if (card.classList.contains('filtering-out')) card.classList.add('filtered-hidden');
          }, 250);
        }
      });
      if (emptyState) emptyState.hidden = shown > 0;
    };

    var buttons = $$('.filter-btn', filterBar);

    var select = function (tag, push) {
      var btn = buttons.filter(function (b) { return b.dataset.tag === tag; })[0];
      if (!btn) return false;
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      apply(tag);
      if (push) {
        history.replaceState(null, '', tag === 'all' ? location.pathname : '#' + tag);
      }
      return true;
    };

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () { select(btn.dataset.tag, true); });
    });

    // Post pages link tags here as /blog/#linux — honour that on load and on back/forward.
    var fromHash = function () {
      var tag = decodeURIComponent(location.hash.replace('#', ''));
      if (tag && !select(tag, false)) select('all', false);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
  }
})();
