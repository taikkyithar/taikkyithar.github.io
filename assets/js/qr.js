/* =============================================================
   QR Code Generator — ISO/IEC 18004
   A self-contained encoder (numeric / alphanumeric / byte modes,
   versions 1-40, all four EC levels) plus the page wiring.
   Nothing here touches the network: the symbol is built, masked
   and painted entirely on the client.
   ============================================================= */
(function () {
  'use strict';

  /* ===========================================================
     Part 1 — Encoder
     =========================================================== */

  var ECL = {
    L: { name: 'L', ordinal: 0, formatBits: 1 },
    M: { name: 'M', ordinal: 1, formatBits: 0 },
    Q: { name: 'Q', ordinal: 2, formatBits: 3 },
    H: { name: 'H', ordinal: 3, formatBits: 2 }
  };

  // Indexed [ecl.ordinal][version]; index 0 is unused padding.
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  ];

  var NUM_EC_BLOCKS = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,57,60,63,66,70,74,77,81]
  ];

  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  var MODE = {
    NUMERIC: { bits: 0x1, cc: [10, 12, 14] },
    ALNUM:   { bits: 0x2, cc: [ 9, 11, 13] },
    BYTE:    { bits: 0x4, cc: [ 8, 16, 16] }
  };

  var ECC_LABEL = { L: '~7% recoverable', M: '~15% recoverable', Q: '~25% recoverable', H: '~30% recoverable' };

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function ccBits(mode, ver) {
    return mode.cc[ver <= 9 ? 0 : (ver <= 26 ? 1 : 2)];
  }

  // Total data + EC modules available, before function patterns are subtracted.
  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;   // two version-information blocks
    }
    return result;
  }

  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_EC_BLOCKS[ecl.ordinal][ver];
  }

  function getAlignmentPatternPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  /* ---------- UTF-8 ---------- */
  function toUtf8(str) {
    if (typeof TextEncoder === 'function') {
      var arr = new TextEncoder().encode(str), out = [];
      for (var i = 0; i < arr.length; i++) out.push(arr[i]);
      return out;
    }
    // Fallback: encodeURIComponent already produces UTF-8 percent-escapes.
    var esc = encodeURIComponent(str), bytes = [];
    for (var j = 0; j < esc.length; j++) {
      if (esc.charAt(j) === '%') { bytes.push(parseInt(esc.substr(j + 1, 2), 16)); j += 2; }
      else bytes.push(esc.charCodeAt(j));
    }
    return bytes;
  }

  /* ---------- Segment building ---------- */
  function appendBits(bits, val, len) {
    for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  }

  // One segment for the whole payload — the smallest mode that can hold it.
  // Mixed-mode splitting would occasionally save a version; it isn't worth
  // the complexity for the sizes people actually paste in here.
  function makeSegment(text) {
    var bits = [], i;

    if (/^[0-9]*$/.test(text)) {
      for (i = 0; i < text.length; ) {
        var n = Math.min(text.length - i, 3);
        appendBits(bits, parseInt(text.substr(i, n), 10), n * 3 + 1);
        i += n;
      }
      return { mode: MODE.NUMERIC, numChars: text.length, bits: bits, byteLen: text.length };
    }

    var alnumOk = true;
    for (i = 0; i < text.length; i++) {
      if (ALNUM.indexOf(text.charAt(i)) < 0) { alnumOk = false; break; }
    }
    if (alnumOk) {
      for (i = 0; i + 2 <= text.length; i += 2) {
        appendBits(bits, ALNUM.indexOf(text.charAt(i)) * 45 + ALNUM.indexOf(text.charAt(i + 1)), 11);
      }
      if (i < text.length) appendBits(bits, ALNUM.indexOf(text.charAt(i)), 6);
      return { mode: MODE.ALNUM, numChars: text.length, bits: bits, byteLen: text.length };
    }

    var bytes = toUtf8(text);
    for (i = 0; i < bytes.length; i++) appendBits(bits, bytes[i], 8);
    return { mode: MODE.BYTE, numChars: bytes.length, bits: bits, byteLen: bytes.length };
  }

  /* ---------- Reed-Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 ---------- */
  function rsMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function rsComputeDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }

  function rsComputeRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= rsMultiply(coef, factor); });
    });
    return result;
  }

  /* ---------- Symbol ---------- */
  function QrCode(version, ecl, dataCodewords) {
    this.version = version;
    this.ecl = ecl;
    this.size = version * 4 + 17;

    var size = this.size, i;
    this.modules = [];
    this.isFunction = [];
    for (i = 0; i < size; i++) {
      this.modules.push(new Array(size).fill(false));
      this.isFunction.push(new Array(size).fill(false));
    }

    this.drawFunctionPatterns();
    this.drawCodewords(this.addEccAndInterleave(dataCodewords));
    this.mask = this.chooseMask();
    this.isFunction = null;
  }

  QrCode.prototype.setFunctionModule = function (x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  };

  QrCode.prototype.drawFunctionPatterns = function () {
    var size = this.size, i, j;

    for (i = 0; i < size; i++) {          // timing patterns
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }

    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(size - 4, 3);
    this.drawFinderPattern(3, size - 4);

    var pos = getAlignmentPatternPositions(this.version), n = pos.length;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        // The three finder corners have no alignment pattern.
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignmentPattern(pos[i], pos[j]);
      }
    }

    this.drawFormatBits(0);   // placeholder; rewritten once the mask is chosen
    this.drawVersion();
  };

  QrCode.prototype.drawFinderPattern = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  QrCode.prototype.drawAlignmentPattern = function (x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  QrCode.prototype.drawFormatBits = function (mask) {
    var size = this.size, i;
    var data = (this.ecl.formatBits << 3) | mask;
    var rem = data;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);   // BCH(15,5)
    var bits = ((data << 10) | rem) ^ 0x5412;

    for (i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    for (i = 0; i < 8; i++) this.setFunctionModule(size - 1 - i, 8, getBit(bits, i));
    for (i = 8; i < 15; i++) this.setFunctionModule(8, size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, size - 8, true);   // always-dark module
  };

  QrCode.prototype.drawVersion = function () {
    if (this.version < 7) return;
    var i, rem = this.version;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);   // BCH(18,6)
    var bits = (this.version << 12) | rem;
    for (i = 0; i < 18; i++) {
      var dark = getBit(bits, i);
      var a = this.size - 11 + i % 3, b = Math.floor(i / 3);
      this.setFunctionModule(a, b, dark);
      this.setFunctionModule(b, a, dark);
    }
  };

  QrCode.prototype.addEccAndInterleave = function (data) {
    var ver = this.version, ecl = this.ecl;
    var numBlocks = NUM_EC_BLOCKS[ecl.ordinal][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [], divisor = rsComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsComputeRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);   // pad so every block interleaves evenly
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var j = 0; j < blocks[0].length; j++) {
      for (var b = 0; b < blocks.length; b++) {
        // Skip the padding byte added to the short blocks.
        if (j !== shortBlockLen - blockEccLen || b >= numShortBlocks) result.push(blocks[b][j]);
      }
    }
    return result;
  };

  QrCode.prototype.drawCodewords = function (data) {
    var size = this.size, i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;           // the vertical timing column is skipped
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  QrCode.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = x * y % 2 + x * y % 3 === 0; break;
          case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  // Try all eight masks and keep the one the standard's penalty rules like best.
  QrCode.prototype.chooseMask = function () {
    var best = 0, minPenalty = Infinity;
    for (var m = 0; m < 8; m++) {
      this.applyMask(m);
      this.drawFormatBits(m);
      var penalty = this.getPenaltyScore();
      if (penalty < minPenalty) { best = m; minPenalty = penalty; }
      this.applyMask(m);   // XOR again to undo
    }
    this.applyMask(best);
    this.drawFormatBits(best);
    return best;
  };

  QrCode.prototype.finderPenaltyAddHistory = function (runLength, history) {
    if (history[0] === 0) runLength += this.size;   // account for the quiet zone
    history.pop();
    history.unshift(runLength);
  };

  QrCode.prototype.finderPenaltyCountPatterns = function (h) {
    var n = h[1];
    var core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0)
         + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };

  QrCode.prototype.finderPenaltyTerminate = function (runColor, runLength, history) {
    if (runColor) { this.finderPenaltyAddHistory(runLength, history); runLength = 0; }
    runLength += this.size;
    this.finderPenaltyAddHistory(runLength, history);
    return this.finderPenaltyCountPatterns(history);
  };

  QrCode.prototype.getPenaltyScore = function () {
    var result = 0, size = this.size, m = this.modules, x, y;

    for (y = 0; y < size; y++) {                       // N1/N3 across rows
      var runColor = false, runLen = 0, hist = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        if (m[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runLen, hist);
          if (!runColor) result += this.finderPenaltyCountPatterns(hist) * PENALTY_N3;
          runColor = m[y][x];
          runLen = 1;
        }
      }
      result += this.finderPenaltyTerminate(runColor, runLen, hist) * PENALTY_N3;
    }

    for (x = 0; x < size; x++) {                       // N1/N3 down columns
      var cColor = false, cLen = 0, cHist = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        if (m[y][x] === cColor) {
          cLen++;
          if (cLen === 5) result += PENALTY_N1;
          else if (cLen > 5) result++;
        } else {
          this.finderPenaltyAddHistory(cLen, cHist);
          if (!cColor) result += this.finderPenaltyCountPatterns(cHist) * PENALTY_N3;
          cColor = m[y][x];
          cLen = 1;
        }
      }
      result += this.finderPenaltyTerminate(cColor, cLen, cHist) * PENALTY_N3;
    }

    for (y = 0; y < size - 1; y++) {                   // N2 — 2x2 blocks of one colour
      for (x = 0; x < size - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += PENALTY_N2;
      }
    }

    var dark = 0;                                      // N4 — overall light/dark balance
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (m[y][x]) dark++;
    var total = size * size;
    result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY_N4;

    return result;
  };

  /* ---------- Encoder entry point ---------- */
  function encode(text, eclName) {
    var ecl = ECL[eclName] || ECL.M;
    var seg = makeSegment(text);

    var version = 0, capacityBits = 0;
    for (var v = 1; v <= 40; v++) {
      capacityBits = getNumDataCodewords(v, ecl) * 8;
      if (4 + ccBits(seg.mode, v) + seg.bits.length <= capacityBits) { version = v; break; }
    }
    if (version === 0) {
      throw new Error('Too much data for a single QR code at error correction level ' + ecl.name +
        '. Shorten the content, or drop to a lower level.');
    }

    var bits = [];
    appendBits(bits, seg.mode.bits, 4);
    appendBits(bits, seg.numChars, ccBits(seg.mode, version));
    for (var i = 0; i < seg.bits.length; i++) bits.push(seg.bits[i]);

    // Terminator, then pad to a whole byte, then the standard alternating filler.
    appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
    appendBits(bits, 0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) appendBits(bits, pad, 8);

    var codewords = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      codewords.push(byte);
    }

    var qr = new QrCode(version, ecl, codewords);
    qr.mode = seg.mode === MODE.NUMERIC ? 'numeric' : (seg.mode === MODE.ALNUM ? 'alphanumeric' : 'byte (UTF-8)');
    qr.byteLen = seg.byteLen;
    qr.capacityBytes = Math.floor((capacityBits - 4 - ccBits(seg.mode, version)) / 8);
    return qr;
  }

  // Exposed so the encoder can be driven from the console or a test harness.
  window.QRCodeEncoder = { encode: encode };

  /* ===========================================================
     Part 2 — Page wiring
     =========================================================== */

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var canvas = $('#qrCanvas');
  if (!canvas) return;

  var ctx        = canvas.getContext('2d');
  var wrap       = $('#qrCanvasWrap');
  var meta       = $('#qrMeta');
  var errorBox   = $('#qrError');
  var warnBox    = $('#qrWarn');
  var tabs       = $$('.qr-tab');
  var panels     = $$('.qr-fields');
  var eclSelect  = $('#qrEcl');
  var marginIn   = $('#qrMargin');
  var marginVal  = $('#qrMarginValue');
  var fgIn       = $('#qrFg');
  var bgIn       = $('#qrBg');
  var optTrans   = $('#qrTransparent');
  var sizeSelect = $('#qrSize');
  var pngBtn     = $('#qrPng');
  var svgBtn     = $('#qrSvg');
  var copyBtn    = $('#qrCopy');
  var resetBtn   = $('#qrReset');
  var toast      = $('#toast');
  var toastText  = $('#toastText');

  var current = null;         // last successfully built symbol
  var activeType = 'text';

  /* ---------- Payload assembly ---------- */
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // Wi-Fi and vCard both treat these as structural characters.
  function escWifi(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
  function escVcard(s) { return s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n'); }

  function buildPayload() {
    if (activeType === 'text') {
      return document.getElementById('qrText').value;
    }

    if (activeType === 'wifi') {
      var ssid = val('wifiSsid');
      if (!ssid) return '';
      var enc = val('wifiEnc');
      var out = 'WIFI:T:' + enc + ';S:' + escWifi(ssid) + ';';
      if (enc !== 'nopass') out += 'P:' + escWifi(val('wifiPass')) + ';';
      if ($('#wifiHidden').checked) out += 'H:true;';
      return out + ';';
    }

    if (activeType === 'email') {
      var to = val('mailTo');
      if (!to) return '';
      var params = [];
      if (val('mailSubject')) params.push('subject=' + encodeURIComponent(val('mailSubject')));
      if (val('mailBody')) params.push('body=' + encodeURIComponent(val('mailBody')));
      return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
    }

    if (activeType === 'sms') {
      var num = val('smsNumber');
      if (!num) return '';
      var msg = val('smsMessage');
      return 'SMSTO:' + num + (msg ? ':' + msg : '');
    }

    if (activeType === 'phone') {
      var tel = val('telNumber');
      return tel ? 'tel:' + tel.replace(/[^\d+]/g, '') : '';
    }

    if (activeType === 'vcard') {
      var first = val('vcFirst'), last = val('vcLast');
      if (!first && !last && !val('vcOrg')) return '';
      var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      lines.push('N:' + escVcard(last) + ';' + escVcard(first) + ';;;');
      lines.push('FN:' + escVcard((first + ' ' + last).trim()));
      if (val('vcOrg'))   lines.push('ORG:' + escVcard(val('vcOrg')));
      if (val('vcTitle')) lines.push('TITLE:' + escVcard(val('vcTitle')));
      if (val('vcPhone')) lines.push('TEL;TYPE=CELL:' + val('vcPhone'));
      if (val('vcEmail')) lines.push('EMAIL:' + val('vcEmail'));
      if (val('vcUrl'))   lines.push('URL:' + val('vcUrl'));
      lines.push('END:VCARD');
      return lines.join('\n');
    }

    return '';
  }

  /* ---------- Colour helpers ---------- */
  function luminance(hex) {
    function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(parseInt(hex.substr(1, 2), 16) / 255)
         + 0.7152 * lin(parseInt(hex.substr(3, 2), 16) / 255)
         + 0.0722 * lin(parseInt(hex.substr(5, 2), 16) / 255);
  }

  function contrastWarning() {
    var fg = luminance(fgIn.value);
    // A transparent code will sit on something light more often than not.
    var bg = optTrans.checked ? 1 : luminance(bgIn.value);
    if (fg > bg) {
      return 'The modules are lighter than the background. Scanners expect dark on light, and most will not read an inverted code.';
    }
    if ((bg + 0.05) / (fg + 0.05) < 4) {
      return 'Low contrast between these two colours — this may scan unreliably. Keep the foreground clearly darker.';
    }
    return '';
  }

  /* ---------- Drawing ---------- */
  function paint(target, qr, moduleSize, margin, transparent) {
    var n = qr.size + margin * 2;
    target.width = target.height = n * moduleSize;
    var c = target.getContext('2d');

    c.clearRect(0, 0, target.width, target.height);
    if (!transparent) {
      c.fillStyle = bgIn.value;
      c.fillRect(0, 0, target.width, target.height);
    }

    c.fillStyle = fgIn.value;
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          c.fillRect((x + margin) * moduleSize, (y + margin) * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  }

  function drawPreview(qr) {
    var margin = parseInt(marginIn.value, 10);
    // Whole-pixel modules only — fractional ones blur the edges and scan badly.
    var moduleSize = Math.max(2, Math.floor(720 / (qr.size + margin * 2)));
    paint(canvas, qr, moduleSize, margin, optTrans.checked);
  }

  function buildSvg(qr) {
    var margin = parseInt(marginIn.value, 10);
    var n = qr.size + margin * 2;
    var path = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) path.push('M' + (x + margin) + ' ' + (y + margin) + 'h1v1h-1z');
      }
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '"' +
      ' width="' + (n * 8) + '" height="' + (n * 8) + '" shape-rendering="crispEdges">\n' +
      (optTrans.checked ? '' : '  <rect width="' + n + '" height="' + n + '" fill="' + bgIn.value + '"/>\n') +
      '  <path fill="' + fgIn.value + '" d="' + path.join('') + '"/>\n' +
      '</svg>\n';
  }

  /* ---------- Status ---------- */
  function setStatus(el, msg) {
    el.textContent = msg || '';
    el.classList.toggle('show', !!msg);
  }

  function setButtons(on) {
    [pngBtn, svgBtn, copyBtn].forEach(function (b) { b.disabled = !on; });
  }

  function clearSymbol() {
    current = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.height = 0;
    wrap.classList.add('is-empty');
    meta.textContent = '';
    setButtons(false);
  }

  function renderMeta(qr) {
    meta.textContent = '';
    [
      ['Version', qr.version + ' · ' + qr.size + '×' + qr.size + ' modules'],
      ['Mode', qr.mode],
      ['Correction', qr.ecl.name + ' · ' + ECC_LABEL[qr.ecl.name]],
      ['Payload', qr.byteLen + ' / ' + qr.capacityBytes + ' bytes'],
      ['Mask', String(qr.mask)]
    ].forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'qr-meta-row';
      var k = document.createElement('span');
      k.className = 'qr-meta-key';
      k.textContent = pair[0];
      var v = document.createElement('span');
      v.className = 'qr-meta-val';
      v.textContent = pair[1];
      row.appendChild(k);
      row.appendChild(v);
      meta.appendChild(row);
    });
  }

  function render() {
    var text = buildPayload();
    if (!text) {
      clearSymbol();
      setStatus(errorBox, '');
      setStatus(warnBox, '');
      return;
    }

    var qr;
    try {
      qr = encode(text, eclSelect.value);
    } catch (e) {
      clearSymbol();
      setStatus(warnBox, '');
      setStatus(errorBox, e.message);
      return;
    }

    current = qr;
    setStatus(errorBox, '');
    setStatus(warnBox, contrastWarning());
    wrap.classList.remove('is-empty');
    wrap.classList.toggle('is-transparent', optTrans.checked);
    drawPreview(qr);
    renderMeta(qr);
    setButtons(true);
  }

  /* ---------- Toast ---------- */
  function showToast(msg) {
    if (!toast) return;
    toastText.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  /* ---------- Export ---------- */
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export at a whole number of pixels per module, as close to the requested
  // size as that allows — a resampled QR code is a QR code that won't scan.
  function exportCanvas() {
    var margin = parseInt(marginIn.value, 10);
    var n = current.size + margin * 2;
    var moduleSize = Math.max(1, Math.round(parseInt(sizeSelect.value, 10) / n));
    var off = document.createElement('canvas');
    paint(off, current, moduleSize, margin, optTrans.checked);
    return off;
  }

  /* ---------- Wiring ---------- */
  var debounceTimer;
  function renderSoon() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(render, 160);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activeType = tab.getAttribute('data-type');
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-type') !== activeType; });
      var first = document.querySelector('.qr-fields:not([hidden]) input, .qr-fields:not([hidden]) textarea');
      if (first) first.focus();
      render();
    });
  });

  $$('.qr-fields input, .qr-fields textarea, .qr-fields select').forEach(function (el) {
    if (el.tagName === 'SELECT' || el.type === 'checkbox') el.addEventListener('change', render);
    else el.addEventListener('input', renderSoon);
  });

  // A password field is meaningless on an open network.
  var wifiEnc = $('#wifiEnc'), wifiPassField = $('#wifiPassField');
  if (wifiEnc) {
    wifiEnc.addEventListener('change', function () {
      wifiPassField.hidden = wifiEnc.value === 'nopass';
    });
  }

  [eclSelect, optTrans].forEach(function (el) { el.addEventListener('change', render); });
  [fgIn, bgIn].forEach(function (el) {
    el.addEventListener('input', renderSoon);
    el.addEventListener('change', render);
  });

  marginIn.addEventListener('input', function () {
    marginVal.textContent = marginIn.value;
    render();
  });

  pngBtn.addEventListener('click', function () {
    if (!current) return;
    exportCanvas().toBlob(function (blob) {
      saveBlob(blob, 'qr-code.png');
      showToast('Downloaded PNG');
    }, 'image/png');
  });

  svgBtn.addEventListener('click', function () {
    if (!current) return;
    saveBlob(new Blob([buildSvg(current)], { type: 'image/svg+xml;charset=utf-8' }), 'qr-code.svg');
    showToast('Downloaded SVG');
  });

  copyBtn.addEventListener('click', function () {
    if (!current) return;
    if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
      showToast('This browser cannot copy images — use Download');
      return;
    }
    exportCanvas().toBlob(function (blob) {
      navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
        .then(function () { showToast('Copied image'); })
        .catch(function () { showToast('Copy failed — use Download'); });
    }, 'image/png');
  });

  resetBtn.addEventListener('click', function () {
    $$('.qr-fields input, .qr-fields textarea').forEach(function (el) {
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
    if (wifiEnc) {
      wifiEnc.value = 'WPA';
      wifiPassField.hidden = false;
    }
    render();
    var first = document.querySelector('.qr-fields:not([hidden]) input, .qr-fields:not([hidden]) textarea');
    if (first) first.focus();
  });

  marginVal.textContent = marginIn.value;
  render();
})();
