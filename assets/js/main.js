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

  /* ---------- Seasonal: Halloween decor ---------- */
  // <head> sets data-season; colours live in CSS, this just adds the critters.
  if (document.documentElement.getAttribute('data-season') === 'halloween') {
    var spooky = document.createElement('div');
    spooky.className = 'spooky';
    spooky.setAttribute('aria-hidden', 'true');

    var web = '<svg class="web" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width=".8">' +
      '<path d="M0 0L100 18M0 0L88 56M0 0L56 88M0 0L18 100"/>' +
      '<path d="M25 4.5Q22 14 22 14T14 22T4.5 25"/>' +
      '<path d="M50 9Q44 28 44 28T28 44T9 50"/>' +
      '<path d="M75 13.5Q66 42 66 42T42 66T13.5 75"/></svg>';

    var spider = '<svg class="spider" viewBox="0 0 26 120" fill="currentColor">' +
      '<line class="thread" x1="13" y1="0" x2="13" y2="100" stroke-width=".8"/>' +
      '<g stroke="currentColor" stroke-width="1.2" fill="none">' +
      '<path d="M9 104L2 99M9 107L1 107M9 110L2 115M17 104L24 99M17 107L25 107M17 110L24 115"/></g>' +
      '<ellipse cx="13" cy="102" rx="3.5" ry="3"/><ellipse cx="13" cy="109" rx="5" ry="5.5"/></svg>';

    var html = web;
    if (!reduced) {
      html += spider;
      var bat = '<svg width="WIDTH" viewBox="0 0 64 32" fill="currentColor"><path d="M32 10c-1.5-3-3.5-5-3.5-5s-.5 3 .5 5.5C23 10 19 4 19 4s-3 6.5-12 7.5c4.5 2 7 6 7 9.5 3-3 7.5-3 10-1 1.5-3 4.5-4.5 8-4.5s6.5 1.5 8 4.5c2.5-2 7-2 10 1 0-3.5 2.5-7.5 7-9.5C48 10.5 45 4 45 4s-4 6-10 6.5c1-2.5.5-5.5.5-5.5s-2 2-3.5 5z"/></svg>';
      [
        { top: 14, w: 42, dur: 24, delay: 0 },
        { top: 32, w: 28, dur: 31, delay: 9 },
        { top: 58, w: 36, dur: 27, delay: 17 },
        { top: 22, w: 22, dur: 36, delay: 23 }
      ].forEach(function (b) {
        html += '<div class="bat" style="top:' + b.top + '%;animation-duration:' + b.dur + 's;animation-delay:' + b.delay + 's">' +
          bat.replace('WIDTH', b.w) + '</div>';
      });
    }
    spooky.innerHTML = html;
    document.body.appendChild(spooky);
  }

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

  /* ---------- Terminal: lyrics-style session ---------- */
  // Plays the session like synced song lyrics: each line types out on its own,
  // the line being "sung" glows and sits mid-card, sung lines fade and drift up.
  // Keep lines <= ~40 chars: .term-body is `white-space: pre` and the active line
  // is scaled up a touch, so longer lines get clipped.
  var termScreen = $('#termScreen');
  var termBody = $('#termBody');

  if (termScreen && termBody && !reduced) {
    var SCENES = [
      {
        cmd: 'whoami',
        out: ['<span class="val">taikkyithar</span>']
      },
      {
        cmd: 'cat profile.yml',
        out: [
          '<span class="key">role</span>: <span class="val">IT Support Specialist</span>',
          '<span class="key">focus</span>: <span class="val">[linux, security, support]</span>',
          '<span class="key">os</span>: <span class="val">Linux / Windows Server</span>',
          '<span class="key">taught</span>: <span class="val">Kali · Parrot · web app sec</span>',
          '<span class="key">since</span>: <span class="val">2013</span> <span class="comment"># still learning</span>'
        ]
      },
      {
        cmd: 'ssh lab-01 uptime',
        out: ['<span class="dim">14:22:07 up</span> <span class="val">96 days</span><span class="dim">, load 0.08</span>']
      },
      {
        cmd: 'nmap -sV lab-01',
        out: [
          '<span class="dim">PORT     STATE  SERVICE</span>',
          '<span class="val">22/tcp</span>   <span class="ok">open</span>   ssh',
          '<span class="val">80/tcp</span>   <span class="ok">open</span>   http',
          '<span class="val">443/tcp</span>  <span class="ok">open</span>   https',
          '<span class="dim">3306/tcp</span> <span class="warn">filtered</span> mysql'
        ]
      },
      {
        cmd: 'docker ps --format "{{.Names}}"',
        out: [
          '<span class="val">pihole</span>',
          '<span class="val">grafana</span>',
          '<span class="val">nginx-proxy</span>'
        ]
      }
    ];

    // Flatten into one verse: commands type slower, output faster, and each
    // scene ends on a longer breath.
    var LYRICS = [];
    SCENES.forEach(function (s) {
      LYRICS.push({ html: '<span class="cmd">$</span> ' + s.cmd, cmd: true, hold: 380 });
      s.out.forEach(function (html, i) {
        LYRICS.push({ html: html, hold: i === s.out.length - 1 ? 1000 : 260 });
      });
    });
    LYRICS.push({ html: '<span class="cmd">$</span> ', cmd: true, hold: 2600 });

    var caret = document.createElement('span');
    caret.className = 'cursor';

    var timer = null;
    var wait = function (ms, fn) { timer = window.setTimeout(fn, ms); };

    // Keep the active line vertically centred, like a lyrics view.
    var focus = function (el) {
      var prev = termScreen.querySelector('.line.active');
      if (prev) { prev.classList.remove('active'); prev.classList.add('past'); }
      el.classList.add('active');
      var shift = el.offsetTop + el.offsetHeight / 2 - termBody.clientHeight / 2;
      termScreen.style.transform = 'translateY(' + (-shift) + 'px)';
    };

    // Types an HTML line a character at a time, keeping its colour spans intact.
    var typeLine = function (el, html, cmd, done) {
      el.innerHTML = html;
      var nodes = [];
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = walker.nextNode())) { nodes.push({ node: n, text: n.nodeValue }); n.nodeValue = ''; }
      el.appendChild(caret);

      var ni = 0, ci = 0;
      (function tick() {
        while (ni < nodes.length && ci >= nodes[ni].text.length) { ni++; ci = 0; }
        if (ni >= nodes.length) return done();
        nodes[ni].node.nodeValue = nodes[ni].text.slice(0, ++ci);
        // Jitter so it reads as typing rather than a metronome.
        wait(cmd ? 50 + Math.random() * 65 : 22 + Math.random() * 30, tick);
      })();
    };

    var reset = function () {
      window.clearTimeout(timer);
      termScreen.textContent = '';
      // Jump back without animating, or the first line slides in from the old offset.
      termScreen.style.transition = 'none';
      termScreen.style.transform = '';
      void termScreen.offsetHeight;
      termScreen.style.transition = '';
    };

    var idx = 0;
    var sing = function () {
      if (idx >= LYRICS.length) {
        reset();
        idx = 0;
      }
      var lyric = LYRICS[idx++];
      var el = document.createElement('div');
      el.className = 'line';
      termScreen.appendChild(el);
      focus(el);
      typeLine(el, lyric.html, lyric.cmd, function () { wait(lyric.hold, sing); });
    };

    termBody.classList.add('lyrics');
    reset();                       // drop the static fallback
    wait(500, sing);

    // Don't animate offscreen — saves the timer churn while scrolled away.
    if ('IntersectionObserver' in window) {
      var paused = false;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && paused) {
            paused = false;
            sing();
          } else if (!e.isIntersecting && !paused) {
            paused = true;
            reset();
            idx = 0;
          }
        });
      }, { threshold: 0 }).observe(termBody);
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
