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

  /* ---------- Terminal: live hacker session ---------- */
  // Types each command a character at a time with human-ish jitter, pauses, then
  // streams its output, then loops. Keep output lines <= ~42 chars: .term-body is
  // `white-space: pre` with no horizontal scroll, so longer lines get clipped.
  var termScreen = $('#termScreen');
  var termBody = $('#termBody');

  if (termScreen && termBody && !reduced) {
    var SCENES = [
      {
        cmd: 'whoami',
        out: ['<span class="val">system_engineer</span>']
      },
      {
        cmd: 'cat profile.yml',
        out: [
          '<span class="key">role</span>: <span class="val">System Engineer</span>',
          '<span class="key">focus</span>: <span class="val">[infra, automation, uptime]</span>',
          '<span class="key">os</span>: <span class="val">Linux / Windows Server</span>',
          '<span class="key">cloud</span>: <span class="val">AWS · Docker · K8s</span>',
          '<span class="key">uptime</span>: <span class="val">99.9%</span> <span class="comment"># and counting</span>'
        ]
      },
      {
        cmd: 'ssh prod-01 uptime',
        out: ['<span class="dim">14:22:07 up</span> <span class="val">412 days</span><span class="dim">, load 0.08</span>']
      },
      {
        cmd: 'ansible-playbook site.yml',
        out: [
          '<span class="dim">PLAY [lab] ******************</span>',
          '<span class="ok">ok</span>: [prod-01]',
          '<span class="warn">changed</span>: [prod-02]',
          '<span class="dim">PLAY RECAP ******************</span>',
          '<span class="val">prod-01</span> <span class="ok">ok=12</span> <span class="dim">failed=0</span>'
        ]
      },
      {
        cmd: 'kubectl get pods -n prod',
        out: [
          '<span class="dim">NAME        READY  STATUS</span>',
          '<span class="val">api-7d9f8c</span>  1/1    <span class="ok">Running</span>',
          '<span class="val">web-5c8b21</span>  1/1    <span class="ok">Running</span>',
          '<span class="val">cache-3a1f</span>  1/1    <span class="ok">Running</span>'
        ]
      }
    ];

    var caret = document.createElement('span');
    caret.className = 'cursor';

    var timer = null;
    var wait = function (ms, fn) { timer = window.setTimeout(fn, ms); };

    var addLine = function () {
      var el = document.createElement('div');
      el.className = 'line';
      termScreen.appendChild(el);
      return el;
    };
    // Terminals scroll; the card has a fixed height, so ride the bottom.
    var toBottom = function () { termBody.scrollTop = termBody.scrollHeight; };

    var typeCmd = function (text, done) {
      var line = addLine();
      var prompt = document.createElement('span');
      prompt.className = 'cmd';
      prompt.textContent = '$ ';
      line.appendChild(prompt);

      var typed = document.createElement('span');
      line.appendChild(typed);
      line.appendChild(caret);
      toBottom();

      var i = 0;
      (function tick() {
        if (i >= text.length) return wait(420, done);
        typed.textContent += text.charAt(i++);
        toBottom();
        // Jitter so it reads as typing rather than a metronome.
        wait(42 + Math.random() * 70, tick);
      })();
    };

    var printOut = function (lines, done) {
      if (caret.parentNode) caret.parentNode.removeChild(caret); // no caret mid-output
      var i = 0;
      (function tick() {
        if (i >= lines.length) return wait(1100, done);
        addLine().innerHTML = lines[i++];
        toBottom();
        wait(70 + Math.random() * 90, tick);
      })();
    };

    var scene = 0;
    var runScene = function () {
      var s = SCENES[scene];
      typeCmd(s.cmd, function () {
        printOut(s.out, function () {
          scene++;
          if (scene < SCENES.length) return runScene();
          // Idle at a fresh prompt, then wipe and loop.
          var last = addLine();
          var p = document.createElement('span');
          p.className = 'cmd';
          p.textContent = '$ ';
          last.appendChild(p);
          last.appendChild(caret);
          toBottom();
          wait(2600, function () {
            termScreen.textContent = '';
            scene = 0;
            runScene();
          });
        });
      });
    };

    termScreen.textContent = '';   // drop the static fallback
    wait(500, runScene);

    // Don't animate offscreen — saves the timer churn while scrolled away.
    if ('IntersectionObserver' in window) {
      var paused = false;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && paused) {
            paused = false;
            runScene();
          } else if (!e.isIntersecting && !paused) {
            paused = true;
            window.clearTimeout(timer);
            termScreen.textContent = '';
            scene = 0;
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
