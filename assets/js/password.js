/* =============================================================
   Password Generator
   Randomness comes from the Web Crypto API only. Math.random() is
   never used here — it is not cryptographically secure and its
   output is predictable from a handful of observed values.
   ============================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var feature     = $('#pwFeature');
  var generateBtn = $('#generateBtn');
  if (!feature || !generateBtn) return;

  var list        = $('#pwList');
  var lengthInput = $('#pwLength');
  var lengthValue = $('#pwLengthValue');
  var countSelect = $('#pwCount');
  var countLabel  = $('#pwCountLabel');
  var copyFeature = $('#copyFeature');
  var copyAllBtn  = $('#copyAllBtn');
  var downloadBtn = $('#downloadBtn');
  var strengthFill  = $('#strengthFill');
  var strengthLabel = $('#strengthLabel');
  var strengthBits  = $('#strengthBits');
  var toast     = $('#toast');
  var toastText = $('#toastText');

  var optLower   = $('#optLower');
  var optUpper   = $('#optUpper');
  var optDigits  = $('#optDigits');
  var optSymbols = $('#optSymbols');
  var optNoLookalikes = $('#optNoLookalikes');
  var optRequireEach  = $('#optRequireEach');

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var crypto = window.crypto || window.msCrypto;

  /* ---------- Character sets ---------- */
  var SETS = [
    { input: optLower,   chars: 'abcdefghijklmnopqrstuvwxyz' },
    { input: optUpper,   chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
    { input: optDigits,  chars: '0123456789' },
    { input: optSymbols, chars: '!@#$%^&*()-_=+[]{};:,.?/~' }
  ];

  // Characters that are easy to confuse in most fonts.
  var LOOKALIKES = /[O0oIl1|]/g;

  function charsFor(set) {
    return optNoLookalikes.checked ? set.chars.replace(LOOKALIKES, '') : set.chars;
  }

  function activeSets() {
    return SETS.filter(function (s) { return s.input.checked; })
               .map(charsFor)
               .filter(function (c) { return c.length > 0; });
  }

  /* ---------- Randomness ---------- */
  // Uint32s are drawn in batches; one getRandomValues call per 256 values
  // rather than one per character.
  var pool = new Uint32Array(256);
  var poolIdx = pool.length;

  function nextUint32() {
    if (poolIdx >= pool.length) {
      crypto.getRandomValues(pool);
      poolIdx = 0;
    }
    return pool[poolIdx++];
  }

  // Uniform in [0, max). Plain `x % max` would bias toward the start of the
  // alphabet whenever max does not divide 2^32, so discard the tail instead.
  function randomInt(max) {
    var limit = Math.floor(4294967296 / max) * max;
    var x;
    do { x = nextUint32(); } while (x >= limit);
    return x % max;
  }

  function pick(chars) { return chars.charAt(randomInt(chars.length)); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- Generation ---------- */
  function makeOne(sets, alphabet, length) {
    var chars = [];

    // Seed one character per set, then shuffle, so "require each" holds without
    // overwriting fixed positions (which would leak where each class sits).
    if (optRequireEach.checked && sets.length <= length) {
      sets.forEach(function (set) { chars.push(pick(set)); });
    }
    while (chars.length < length) chars.push(pick(alphabet));

    return shuffle(chars).join('');
  }

  var passwords = [];

  function generate(n, length) {
    var sets = activeSets();
    if (!sets.length) throw new Error('No character sets selected.');
    if (!crypto || typeof crypto.getRandomValues !== 'function') {
      throw new Error('No cryptographically secure random source available.');
    }

    var alphabet = sets.join('');
    var out = [];
    for (var i = 0; i < n; i++) out.push(makeOne(sets, alphabet, length));
    return out;
  }

  /* ---------- Strength ---------- */
  // Entropy for a uniformly random string: length x log2(alphabet size).
  // This measures the generator, not the string — see the note on the page.
  var BANDS = [
    { max: 50,       label: 'weak',      color: '#ff5f56' },
    { max: 75,       label: 'fair',      color: '#ffbd2e' },
    { max: 100,      label: 'strong',    color: '#34d399' },
    { max: Infinity, label: 'excellent', color: 'var(--brand)' }
  ];

  function updateStrength() {
    var sets = activeSets();
    var size = sets.join('').length;
    var length = parseInt(lengthInput.value, 10);

    if (!size) {
      strengthFill.style.width = '0%';
      strengthLabel.textContent = '—';
      strengthBits.textContent = '';
      return;
    }

    var bits = length * (Math.log(size) / Math.LN2);
    var band = BANDS.filter(function (b) { return bits < b.max; })[0];

    strengthFill.style.setProperty('--sc', band.color);
    strengthLabel.style.setProperty('--sc', band.color);
    strengthFill.style.width = Math.min(bits / 128 * 100, 100) + '%';
    strengthLabel.textContent = band.label;
    strengthBits.textContent = Math.round(bits) + ' bits · ' + size + ' chars';
  }

  /* ---------- Rendering ---------- */
  // Only the featured password is colourised — doing this per character across
  // a 1000-password list would build tens of thousands of nodes.
  function colorize(pw) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < pw.length; i++) {
      var ch = pw.charAt(i);
      var cls = /[0-9]/.test(ch) ? 'pw-d' : (/[a-zA-Z]/.test(ch) ? '' : 'pw-s');
      if (!cls) { frag.appendChild(document.createTextNode(ch)); continue; }
      var span = document.createElement('span');
      span.className = cls;
      span.textContent = ch;
      frag.appendChild(span);
    }
    return frag;
  }

  function render(animate) {
    feature.textContent = '';
    feature.appendChild(colorize(passwords[0] || '—'));

    if (animate && !reduced) {
      feature.classList.remove('flash');
      void feature.offsetWidth; // restart the animation
      feature.classList.add('flash');
    }

    countLabel.textContent = passwords.length + ' password' + (passwords.length === 1 ? '' : 's');

    if (passwords.length < 2) { list.textContent = ''; return; }

    var frag = document.createDocumentFragment();
    passwords.forEach(function (pw, i) {
      var row = document.createElement('div');
      row.className = 'tool-row';
      if (!reduced && i < 25) row.style.animationDelay = (i * 22) + 'ms';
      else row.style.animation = 'none';

      var idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = (i + 1);

      var code = document.createElement('code');
      code.textContent = pw;

      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Copy password ' + (i + 1));
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        copy(pw, btn, 'Copied password ' + (i + 1));
      });

      row.appendChild(idx);
      row.appendChild(code);
      row.appendChild(btn);
      frag.appendChild(row);
    });

    list.textContent = '';
    list.appendChild(frag);
  }

  /* ---------- Clipboard ---------- */
  function showToast(msg) {
    if (!toast) return;
    toastText.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // execCommand fallback for non-secure contexts (plain http, file://).
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy rejected'));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function copy(text, btn, msg) {
    writeClipboard(text).then(function () {
      showToast(msg || 'Copied');
      if (!btn) return;
      var span = btn.querySelector('span');
      var prev = span ? span.textContent : btn.textContent;
      if (span) span.textContent = 'Copied'; else btn.textContent = 'Copied';
      btn.classList.add('copied');
      window.setTimeout(function () {
        if (span) span.textContent = prev; else btn.textContent = prev;
        btn.classList.remove('copied');
      }, 1400);
    }).catch(function () {
      showToast('Copy failed — select and copy manually');
    });
  }

  /* ---------- Wiring ---------- */
  function syncSlider() {
    var min = parseInt(lengthInput.min, 10);
    var max = parseInt(lengthInput.max, 10);
    var val = parseInt(lengthInput.value, 10);
    lengthValue.textContent = val;
    lengthInput.style.setProperty('--pct', ((val - min) / (max - min) * 100) + '%');
  }

  function run(animate) {
    var n = parseInt(countSelect.value, 10) || 1;
    var length = parseInt(lengthInput.value, 10) || 20;
    try {
      passwords = generate(n, length);
    } catch (e) {
      passwords = [];
      feature.textContent = e.message;
      list.textContent = '';
      countLabel.textContent = '';
      return;
    }
    render(animate);
  }

  function refresh(animate) {
    syncSlider();
    updateStrength();
    run(animate);
  }

  generateBtn.addEventListener('click', function () { run(true); });
  countSelect.addEventListener('change', function () { run(true); });

  // `input` fires continuously while dragging, so the preview tracks the slider.
  lengthInput.addEventListener('input', function () { refresh(false); });

  SETS.forEach(function (set) {
    set.input.addEventListener('change', function () {
      // An empty alphabet has nothing to generate from — keep the last set on.
      if (!activeSets().length) {
        set.input.checked = true;
        showToast('Pick at least one character set');
      }
      refresh(true);
    });
  });

  optNoLookalikes.addEventListener('change', function () { refresh(true); });
  optRequireEach.addEventListener('change', function () { refresh(true); });

  copyFeature.addEventListener('click', function () {
    if (passwords.length) copy(passwords[0], copyFeature, 'Copied password');
  });

  copyAllBtn.addEventListener('click', function () {
    if (!passwords.length) return;
    copy(passwords.join('\n'), copyAllBtn,
      'Copied ' + passwords.length + ' password' + (passwords.length === 1 ? '' : 's'));
  });

  downloadBtn.addEventListener('click', function () {
    if (!passwords.length) return;
    var blob = new Blob([passwords.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'passwords-' + passwords.length + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded ' + passwords.length + ' password' + (passwords.length === 1 ? '' : 's'));
  });

  // Press G to generate, unless the user is in a form control.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
    e.preventDefault();
    run(true);
  });

  refresh(false);
})();
