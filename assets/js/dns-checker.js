/* =============================================================
   DNS Checker — DNS propagation & record lookup
   Asks the same DNS question of several independent public
   resolvers over DNS-over-HTTPS (JSON API), straight from the
   browser, then compares their answers to show propagation.
   All endpoints are keyless and CORS-enabled; any that a
   browser can't reach are shown as "Unreachable" rather than
   breaking the run. Nothing is stored.
   ============================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var form     = $('#dnsForm');
  var input    = $('#dnsInput');
  var typeSel  = $('#dnsType');
  var btn      = $('#dnsBtn');
  var errorBox = $('#dnsError');
  var summary  = $('#dnsSummary');
  var queryEl  = $('#dnsQuery');
  var badgeEl  = $('#dnsBadge');
  var progEl   = $('#dnsProgress');
  var results  = $('#dnsResults');
  var foot     = $('#dnsFoot');
  var toast     = $('#toast');
  var toastText = $('#toastText');

  if (!form || !results) return;

  /* ---------- Resolvers ----------
     Each entry: display name, operator, a location label + flag emoji
     (routing location for anycast networks), and a DoH JSON endpoint
     that follows the Google/RFC-8484 JSON shape (?name=&type=). */
  var RESOLVERS = [
    { name: 'Google',    org: 'Google Public DNS',     loc: 'Mountain View, US', flag: '🇺🇸', url: 'https://dns.google/resolve' },
    { name: 'Cloudflare', org: 'Cloudflare (1.1.1.1)', loc: 'Anycast · Global',  flag: '🌐', url: 'https://cloudflare-dns.com/dns-query' },
    { name: 'AdGuard',   org: 'AdGuard DNS',            loc: 'Cyprus',            flag: '🇨🇾', url: 'https://dns.adguard-dns.com/resolve' },
    { name: 'DNS.SB',    org: 'DNS.SB (xTom)',          loc: 'Anycast · Europe',  flag: '🇩🇪', url: 'https://doh.sb/dns-query' },
    { name: 'DNSPod',    org: 'Tencent DNSPod',         loc: 'China',             flag: '🇨🇳', url: 'https://doh.pub/dns-query' }
  ];

  var TYPE_NUM = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257 };
  var STATUS_TEXT = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 5: 'REFUSED' };

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showError(msg) { errorBox.textContent = msg; errorBox.classList.add('show'); }
  function clearError()   { errorBox.classList.remove('show'); errorBox.textContent = ''; }

  // Strip a URL/scheme/path down to a bare hostname; leave IPs untouched.
  function cleanHost(v) {
    v = v.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').replace(/\.$/, '');
    return v.toLowerCase();
  }

  function isIPv4(v) {
    return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(v) &&
      v.split('.').every(function (o) { return +o >= 0 && +o <= 255; });
  }

  // Turn an IPv4 (or already-formed .arpa) into the name to query for PTR.
  function ptrName(v) {
    if (/\.arpa$/i.test(v)) return v;
    if (isIPv4(v)) return v.split('.').reverse().join('.') + '.in-addr.arpa';
    return v; // IPv6 / anything else: query as typed
  }

  // Normalise a DoH JSON answer into the list of record values for `type`.
  function extractValues(data, typeNum) {
    if (!data || !data.Answer) return [];
    var out = [];
    data.Answer.forEach(function (a) {
      if (a.type !== typeNum) return;              // skip CNAME hops etc.
      out.push(String(a.data).replace(/\s+/g, ' ').trim());
    });
    return out;
  }

  function lowestTtl(data, typeNum) {
    if (!data || !data.Answer) return null;
    var ttl = null;
    data.Answer.forEach(function (a) {
      if (a.type !== typeNum) return;
      if (typeof a.TTL === 'number' && (ttl === null || a.TTL < ttl)) ttl = a.TTL;
    });
    return ttl;
  }

  // A stable signature of an answer set, order-independent, for comparison.
  function signature(values) {
    return values.map(function (v) { return v.toLowerCase(); }).sort().join('\n');
  }

  function fmtTtl(sec) {
    if (sec === null || sec === undefined) return '';
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    if (sec < 86400) return Math.round(sec / 360) / 10 + 'h';
    return Math.round(sec / 8640) / 10 + 'd';
  }

  /* ---------- Rendering ---------- */
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var WARN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
  var SPIN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  // Build the skeleton row for a resolver (pending state).
  function rowSkeleton(r, i) {
    var el = document.createElement('div');
    el.className = 'dns-server pending';
    el.id = 'dns-server-' + i;
    el.innerHTML =
      '<span class="dns-flag" aria-hidden="true">' + r.flag + '</span>' +
      '<div class="dns-meta">' +
        '<span class="dns-name">' + esc(r.name) + '</span>' +
        '<span class="dns-loc">' + esc(r.org) + ' · ' + esc(r.loc) + '</span>' +
      '</div>' +
      '<div class="dns-records" id="dns-records-' + i + '"><span class="dns-wait">Querying…</span></div>' +
      '<span class="dns-status" id="dns-status-' + i + '">' + SPIN + '</span>';
    return el;
  }

  function renderRecords(values, typeNum) {
    if (!values.length) return '<span class="dns-empty">No records</span>';
    return values.map(function (v) {
      return '<code class="dns-rec">' + esc(v) + '</code>';
    }).join('');
  }

  /* ---------- Query ---------- */
  function queryResolver(r, name, type) {
    var url = r.url + '?name=' + encodeURIComponent(name) +
              '&type=' + encodeURIComponent(type) + '&cd=0';
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);

    return fetch(url, {
      headers: { 'Accept': 'application/dns-json' },
      signal: ctrl.signal
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      return { ok: true, data: data };
    }).catch(function (err) {
      return { ok: false, error: err };
    }).then(function (r) { clearTimeout(timer); return r; });
  }

  var runId = 0;

  function run(name, type) {
    var thisRun = ++runId;
    var typeNum = TYPE_NUM[type];
    var queryName = type === 'PTR' ? ptrName(name) : name;

    clearError();
    summary.hidden = false;
    foot.hidden = false;
    queryEl.textContent = queryName + '  ·  ' + type;
    badgeEl.className = 'dns-badge';
    badgeEl.textContent = '';
    progEl.textContent = 'Querying ' + RESOLVERS.length + ' resolvers…';
    btn.disabled = true;

    // Lay down skeleton rows.
    results.innerHTML = '';
    RESOLVERS.forEach(function (r, i) { results.appendChild(rowSkeleton(r, i)); });

    var outcomes = new Array(RESOLVERS.length);
    var done = 0;

    RESOLVERS.forEach(function (r, i) {
      queryResolver(r, queryName, type).then(function (resp) {
        if (thisRun !== runId) return; // a newer search superseded this one
        outcomes[i] = { resolver: r, resp: resp, typeNum: typeNum };
        fillRow(i, outcomes[i]);
        done++;
        progEl.textContent = 'Answered by ' + done + ' of ' + RESOLVERS.length + ' resolvers…';
        if (done === RESOLVERS.length) finalize(outcomes, typeNum);
      });
    });
  }

  // Render a single resolver's raw result (before consensus is known).
  function fillRow(i, o) {
    var row  = $('#dns-server-' + i);
    var recs = $('#dns-records-' + i);
    var stat = $('#dns-status-' + i);
    if (!row) return;
    row.classList.remove('pending');

    if (!o.resp.ok) {
      row.classList.add('unreachable');
      recs.innerHTML = '<span class="dns-empty">Unreachable from browser (CORS or network)</span>';
      stat.className = 'dns-status err';
      stat.innerHTML = CROSS;
      o.status = 'unreachable';
      return;
    }

    var data = o.resp.data;
    var status = data.Status;
    var values = extractValues(data, o.typeNum);
    o.values = values;
    o.rcode = status;
    o.ttl = lowestTtl(data, o.typeNum);

    if (status === 3) { // NXDOMAIN
      row.classList.add('nxdomain');
      recs.innerHTML = '<span class="dns-empty">NXDOMAIN — domain does not exist</span>';
      o.status = 'nxdomain';
    } else if (status !== 0) {
      row.classList.add('nxdomain');
      recs.innerHTML = '<span class="dns-empty">' + (STATUS_TEXT[status] || ('Status ' + status)) + '</span>';
      o.status = 'error';
    } else if (!values.length) {
      recs.innerHTML = '<span class="dns-empty">No ' + esc(typeName(o.typeNum)) + ' records</span>';
      o.status = 'empty';
    } else {
      recs.innerHTML = renderRecords(values, o.typeNum) +
        (o.ttl !== null ? '<span class="dns-ttl">TTL ' + fmtTtl(o.ttl) + '</span>' : '');
      o.status = 'ok';
    }
    // Status icon is applied in finalize(), once consensus is known.
    stat.className = 'dns-status';
    stat.innerHTML = '';
  }

  function typeName(num) {
    for (var k in TYPE_NUM) if (TYPE_NUM[k] === num) return k;
    return 'matching';
  }

  // Compare every resolver's answer to the majority and stamp status icons.
  function finalize(outcomes, typeNum) {
    btn.disabled = false;

    // Tally answer signatures among resolvers that actually answered.
    var tally = {};
    var answered = 0;
    outcomes.forEach(function (o) {
      if (!o || o.status !== 'ok') return;
      answered++;
      var sig = signature(o.values);
      tally[sig] = (tally[sig] || 0) + 1;
    });

    // Pick the consensus signature (most common answer set).
    var consensus = null, best = 0;
    Object.keys(tally).forEach(function (sig) {
      if (tally[sig] > best) { best = tally[sig]; consensus = sig; }
    });

    var propagated = 0, reachable = 0;
    outcomes.forEach(function (o, i) {
      if (!o) return;
      var stat = $('#dns-status-' + i);
      if (!stat) return;

      if (o.status === 'unreachable') return; // already marked with a cross

      reachable++;
      var matches = o.status === 'ok' && signature(o.values) === consensus && consensus !== null;
      if (matches) {
        propagated++;
        stat.className = 'dns-status ok';
        stat.innerHTML = CHECK;
        stat.title = 'Matches the majority answer — propagated';
      } else {
        stat.className = 'dns-status warn';
        stat.innerHTML = WARN;
        stat.title = o.status === 'ok'
          ? 'Different answer from the majority'
          : (o.status === 'nxdomain' ? 'Domain not found' : 'No matching records');
      }
    });

    // Headline badge.
    if (reachable === 0) {
      badgeEl.className = 'dns-badge warn';
      badgeEl.textContent = 'No resolvers reachable';
      progEl.textContent = 'Your browser or network blocked every DNS-over-HTTPS endpoint.';
      return;
    }

    if (answered === 0) {
      badgeEl.className = 'dns-badge warn';
      badgeEl.textContent = 'No records found';
      progEl.textContent = 'None of the reachable resolvers returned a ' + typeName(typeNum) + ' record.';
    } else if (propagated === reachable && best === answered) {
      badgeEl.className = 'dns-badge ok';
      badgeEl.innerHTML = CHECK + ' Fully propagated';
      progEl.textContent = 'All ' + reachable + ' reachable resolvers agree.';
    } else {
      badgeEl.className = 'dns-badge warn';
      badgeEl.innerHTML = WARN + ' Propagating';
      progEl.textContent = propagated + ' of ' + reachable +
        ' resolvers match the majority answer — the change is still spreading.';
    }
  }

  /* ---------- Copy a record on click ---------- */
  function showToast(msg) {
    if (!toast) return;
    toastText.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () { toast.classList.remove('show'); }, 1600);
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); }
      catch (e) { reject(e); } finally { document.body.removeChild(ta); }
    });
  }

  results.addEventListener('click', function (e) {
    var rec = e.target.closest('.dns-rec');
    if (!rec) return;
    writeClipboard(rec.textContent)
      .then(function () { showToast('Copied record'); })
      .catch(function () { showToast('Copy failed'); });
  });

  /* ---------- Wiring ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var host = cleanHost(input.value);
    var type = typeSel.value;
    if (!host) { showError('Enter a domain or hostname to look up.'); input.focus(); return; }
    if (type === 'PTR' && !isIPv4(host) && !/\.arpa$/i.test(host)) {
      showError('PTR lookups need an IPv4 address (e.g. 8.8.8.8).'); input.focus(); return;
    }
    input.value = host;
    run(host, type);
  });
})();
