/* =============================================================
   UUID Generator — RFC 4122 version 4
   Randomness comes from the Web Crypto API only; Math.random()
   is never used, since it is not cryptographically secure.
   ============================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var feature      = $('#uuidFeature');
  var list         = $('#uuidList');
  var countSelect  = $('#uuidCount');
  var countLabel   = $('#uuidCountLabel');
  var generateBtn  = $('#generateBtn');
  var copyAllBtn   = $('#copyAllBtn');
  var copyFeature  = $('#copyFeature');
  var downloadBtn  = $('#downloadBtn');
  var optUpper     = $('#optUppercase');
  var optHyphens   = $('#optHyphens');
  var optBraces    = $('#optBraces');
  var toast        = $('#toast');
  var toastText    = $('#toastText');

  if (!feature || !generateBtn) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Generation ---------- */
  var crypto = window.crypto || window.msCrypto;

  // Byte -> zero-padded hex, precomputed. Bulk runs do a lot of these.
  var HEX = [];
  for (var i = 0; i < 256; i++) HEX[i] = (i + 0x100).toString(16).slice(1);

  function uuidFromBytes(b, o) {
    return HEX[b[o]] + HEX[b[o + 1]] + HEX[b[o + 2]] + HEX[b[o + 3]] + '-' +
           HEX[b[o + 4]] + HEX[b[o + 5]] + '-' +
           HEX[b[o + 6]] + HEX[b[o + 7]] + '-' +
           HEX[b[o + 8]] + HEX[b[o + 9]] + '-' +
           HEX[b[o + 10]] + HEX[b[o + 11]] + HEX[b[o + 12]] + HEX[b[o + 13]] + HEX[b[o + 14]] + HEX[b[o + 15]];
  }

  function generate(n) {
    var out = [];

    // Preferred path, but it needs a secure context (https/localhost).
    if (crypto && typeof crypto.randomUUID === 'function') {
      for (var i = 0; i < n; i++) out.push(crypto.randomUUID());
      return out;
    }

    if (!crypto || typeof crypto.getRandomValues !== 'function') {
      throw new Error('No cryptographically secure random source available.');
    }

    // One getRandomValues call for the whole batch rather than n calls.
    var bytes = new Uint8Array(n * 16);
    // getRandomValues caps at 65536 bytes per call, so fill in chunks.
    for (var off = 0; off < bytes.length; off += 65536) {
      crypto.getRandomValues(bytes.subarray(off, Math.min(off + 65536, bytes.length)));
    }

    for (var j = 0; j < n; j++) {
      var p = j * 16;
      bytes[p + 6] = (bytes[p + 6] & 0x0f) | 0x40;  // version 4
      bytes[p + 8] = (bytes[p + 8] & 0x3f) | 0x80;  // variant 10xx
      out.push(uuidFromBytes(bytes, p));
    }
    return out;
  }

  /* ---------- Formatting ---------- */
  // Raw UUIDs are stored canonical (lowercase, hyphenated); display options are
  // applied at render time so toggling them never regenerates the values.
  var uuids = [];

  function format(raw) {
    var s = raw;
    if (!optHyphens.checked) s = s.replace(/-/g, '');
    if (optUpper.checked) s = s.toUpperCase();
    if (optBraces.checked) s = '{' + s + '}';
    return s;
  }

  function formatted() { return uuids.map(format); }

  /* ---------- Rendering ---------- */
  function render(animate) {
    feature.textContent = uuids.length ? format(uuids[0]) : '—';
    if (animate && !reduced) {
      feature.classList.remove('flash');
      void feature.offsetWidth; // restart the animation
      feature.classList.add('flash');
    }

    countLabel.textContent = uuids.length + ' UUID' + (uuids.length === 1 ? '' : 's');

    // The feature row already shows the only value when n === 1.
    if (uuids.length < 2) {
      list.textContent = '';
      return;
    }

    var frag = document.createDocumentFragment();
    uuids.forEach(function (raw, i) {
      var row = document.createElement('div');
      row.className = 'tool-row';
      // Stagger only the first rows — 1000 staggered rows would crawl.
      if (!reduced && i < 25) row.style.animationDelay = (i * 22) + 'ms';
      else row.style.animation = 'none';

      var idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = (i + 1);

      var code = document.createElement('code');
      code.textContent = format(raw);

      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Copy UUID ' + (i + 1));
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        copy(code.textContent, btn, 'Copied UUID ' + (i + 1));
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
  function run(animate) {
    var n = parseInt(countSelect.value, 10) || 1;
    try {
      uuids = generate(n);
    } catch (e) {
      feature.textContent = 'Unavailable — this browser has no secure random source.';
      list.textContent = '';
      countLabel.textContent = '';
      return;
    }
    render(animate);
  }

  generateBtn.addEventListener('click', function () { run(true); });
  countSelect.addEventListener('change', function () { run(true); });

  // Re-rendering is enough — the underlying values don't change.
  [optUpper, optHyphens, optBraces].forEach(function (o) {
    o.addEventListener('change', function () { render(false); });
  });

  copyFeature.addEventListener('click', function () {
    if (uuids.length) copy(format(uuids[0]), copyFeature, 'Copied UUID');
  });

  copyAllBtn.addEventListener('click', function () {
    if (!uuids.length) return;
    copy(formatted().join('\n'), copyAllBtn, 'Copied ' + uuids.length + ' UUID' + (uuids.length === 1 ? '' : 's'));
  });

  downloadBtn.addEventListener('click', function () {
    if (!uuids.length) return;
    var blob = new Blob([formatted().join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'uuid-v4-' + uuids.length + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded ' + uuids.length + ' UUID' + (uuids.length === 1 ? '' : 's'));
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

  run(false);
})();
