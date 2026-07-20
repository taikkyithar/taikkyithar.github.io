/* =============================================================
   IP Checker — public IP + geolocation lookup
   Data comes from keyless public APIs, called straight from the
   browser: ipwho.is (primary, https + CORS) and ipapi.co
   (best-effort, for the CIDR "range" field). Nothing is stored.
   ============================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var feature   = $('#ipFeature');
  var copyIp    = $('#copyIp');
  var form      = $('#ipForm');
  var input     = $('#ipInput');
  var myIpBtn   = $('#myIpBtn');
  var lookupBtn = $('#lookupBtn');
  var panel     = $('#ipPanel');
  var errorBox  = $('#ipError');
  var toast     = $('#toast');
  var toastText = $('#toastText');

  if (!feature || !form) return;

  var F = {
    location: $('#f-location'),
    asn:      $('#f-asn'),
    hostname: $('#f-hostname'),
    range:    $('#f-range'),
    company:  $('#f-company'),
    domains:  $('#f-domains'),
    privacy:  $('#f-privacy'),
    anycast:  $('#f-anycast'),
    astype:   $('#f-astype'),
    city:     $('#f-city'),
    state:    $('#f-state'),
    country:  $('#f-country'),
    postal:   $('#f-postal'),
    localtime:$('#f-localtime'),
    timezone: $('#f-timezone'),
    coords:   $('#f-coords')
  };

  var DASH = '—'; // em dash for unknown / unavailable fields
  var currentIp = '';

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setText(el, value) {
    if (!el) return;
    var empty = value === undefined || value === null || value === '';
    el.classList.toggle('muted', empty);
    el.textContent = empty ? DASH : value;
  }

  function setHtml(el, html) {
    if (!el) return;
    el.classList.remove('muted');
    el.innerHTML = html;
  }

  function join(parts) {
    return parts.filter(function (p) { return p !== undefined && p !== null && p !== ''; }).join(', ');
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  }
  function clearError() {
    errorBox.classList.remove('show');
    errorBox.textContent = '';
  }

  function loading(on) {
    panel.classList.toggle('loading', on);
    lookupBtn.disabled = on;
    myIpBtn.disabled = on;
  }

  /* ---------- Rendering ---------- */
  function render(d, range) {
    currentIp = d.ip || '';
    feature.textContent = currentIp || 'Unknown';

    var conn = d.connection || {};
    var tz = d.timezone || {};

    // --- Summary ---
    setText(F.location, join([d.city, d.region, d.country_code || d.country]));

    if (conn.asn) {
      setHtml(F.asn, '<a href="https://ipinfo.io/AS' + encodeURIComponent(conn.asn) +
        '" target="_blank" rel="noopener">AS' + esc(conn.asn) + '</a>' +
        (conn.org ? ' ' + esc(conn.org) : ''));
    } else {
      setText(F.asn, '');
    }

    setText(F.hostname, '');           // not exposed by the free endpoints
    setText(F.range, range || '');     // best-effort from ipapi.co

    if (conn.org || conn.isp) {
      var company = conn.org || conn.isp;
      if (conn.domain) {
        setHtml(F.company, esc(company) + ' · <a href="https://' +
          encodeURIComponent(conn.domain) + '" target="_blank" rel="noopener">' +
          esc(conn.domain) + '</a>');
      } else {
        setText(F.company, company);
      }
    } else {
      setText(F.company, '');
    }

    setText(F.domains, '');            // paid feature
    setText(F.privacy, '');            // paid feature (VPN/proxy/tor)
    setText(F.anycast, '');            // paid feature
    setText(F.astype, '');             // paid feature

    // --- Geolocation ---
    setText(F.city, d.city);
    setText(F.state, join([d.region, d.region_code && d.region_code !== d.region ? d.region_code : '']));
    var flag = d.flag && d.flag.emoji ? d.flag.emoji + ' ' : '';
    setText(F.country, d.country ? flag + d.country + (d.country_code ? ' (' + d.country_code + ')' : '') : '');
    setText(F.postal, d.postal);

    setText(F.localtime, formatLocalTime(tz));
    setText(F.timezone, tz.id ? tz.id + (tz.utc ? ' (UTC' + tz.utc + ')' : '') : '');

    if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
      setHtml(F.coords, '<a href="https://www.openstreetmap.org/?mlat=' + d.latitude +
        '&mlon=' + d.longitude + '#map=10/' + d.latitude + '/' + d.longitude +
        '" target="_blank" rel="noopener">' + d.latitude + ', ' + d.longitude + '</a>');
    } else {
      setText(F.coords, '');
    }
  }

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatLocalTime(tz) {
    if (!tz) return '';

    // Preferred: an explicit timestamp from the API.
    if (tz.current_time) {
      var t = new Date(tz.current_time);
      if (!isNaN(t)) {
        try {
          return t.toLocaleString(undefined, {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        } catch (e) { /* fall through */ }
      }
      return tz.current_time;
    }

    // Fallback: derive the wall-clock from the UTC offset (in seconds). Shift
    // "now" by the offset, then read UTC parts so the viewer's own timezone
    // doesn't leak in.
    if (typeof tz.offset === 'number') {
      var d = new Date(Date.now() + tz.offset * 1000);
      var h = d.getUTCHours();
      var m = d.getUTCMinutes();
      var ap = h >= 12 ? 'PM' : 'AM';
      var h12 = ((h + 11) % 12) + 1;
      return DAYS[d.getUTCDay()] + ', ' + MONS[d.getUTCMonth()] + ' ' + d.getUTCDate() +
        ', ' + d.getUTCFullYear() + ', ' + h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap +
        (tz.abbr ? ' ' + tz.abbr : '');
    }
    return '';
  }

  /* ---------- Data ---------- */
  function fetchJson(url) {
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ipapi.co gives the CIDR "network" (range); ipwho.is does not. Best-effort:
  // never let its failure (rate limits etc.) block the main result.
  function fetchRange(ip) {
    var url = 'https://ipapi.co/' + (ip ? encodeURIComponent(ip) + '/json/' : 'json/');
    return fetchJson(url).then(function (d) {
      return (d && !d.error && d.network) ? d.network : '';
    }).catch(function () { return ''; });
  }

  function lookup(ip) {
    clearError();
    loading(true);
    feature.textContent = ip ? 'Looking up ' + ip + '…' : 'Detecting your IP…';

    var url = 'https://ipwho.is/' + (ip ? encodeURIComponent(ip) : '');

    Promise.all([fetchJson(url), fetchRange(ip)])
      .then(function (res) {
        var d = res[0];
        if (!d || d.success === false) {
          throw new Error((d && d.message) ? d.message : 'Lookup failed');
        }
        render(d, res[1]);
      })
      .catch(function (err) {
        feature.textContent = ip || currentIp || 'Lookup failed';
        showError('Could not look that up — ' + err.message + '. Check the address and try again.');
      })
      .then(function () { loading(false); });
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
      } catch (e) { reject(e); } finally { document.body.removeChild(ta); }
    });
  }

  function copy(text, btn, msg) {
    if (!text) return;
    writeClipboard(text).then(function () {
      showToast(msg || 'Copied');
      if (!btn) return;
      var span = btn.querySelector('span');
      if (span) span.textContent = 'Copied';
      btn.classList.add('copied');
      window.setTimeout(function () {
        if (span) span.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1400);
    }).catch(function () {
      showToast('Copy failed — select and copy manually');
    });
  }

  /* ---------- Wiring ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ip = input.value.trim();
    if (!ip) { lookup(''); return; }
    lookup(ip);
  });

  myIpBtn.addEventListener('click', function () {
    input.value = '';
    lookup('');
  });

  copyIp.addEventListener('click', function () {
    copy(currentIp, copyIp, 'Copied IP address');
  });

  lookup(''); // detect the visitor's own IP on load
})();
