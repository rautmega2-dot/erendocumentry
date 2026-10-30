"use strict";
// ---- Check karne wale (Aadhaar / PAN) ----
const V_D = "0123456789 1234067895 2340178956 3401289567 4012395678 5987604321 6598710432 7659821043 8765932104 9876543210".split(" ").map(r => [...r].map(Number));
const V_P = "0123456789 1576283094 5803796142 8916043527 9453126870 4286573901 2793806415 7046913258".split(" ").map(r => [...r].map(Number));
function verhoeff(n) {
  if (!/^\d+$/.test(n)) return false;
  let c = 0;
  [...n].reverse().forEach((ch, i) => { c = V_D[c][V_P[i % 8][+ch]]; });
  return c === 0;
}
const aadhaarOk = n => /^[2-9]\d{11}$/.test(n) && verhoeff(n);
const panOk = p => /^[A-Z]{5}\d{4}[A-Z]$/.test(p);
const dobOk = d => /^\d{2}\/\d{2}\/\d{4}$/.test(d);

const FIELDS = {
  name: "Naam (Aadhaar ke hisaab se)", dob: "Janm tithi (DD/MM/YYYY)", gender: "Gender",
  aadhaar: "Aadhaar number", address: "Address", pincode: "Pincode",
  pan: "PAN number", pan_name: "PAN pe naam", father_name: "Pita ka naam (PAN)",
};

// ---- Text saaf karna ----
const BAD = /^(GOVERNMENT|GOVT|INDIA|AADHAAR|UNIQUE|IDENTIFICATION|AUTHORITY|DOB|MALE|FEMALE|YEAR|BIRTH|ADDRESS|INCOME|TAX|DEPARTMENT|PERMANENT|ACCOUNT|NUMBER|CARD|SIGNATURE|FATHER|FATHERS|NAME|DATE|VID|ENROLMENT|ISSUE|ISSUED|DETAILS)$/i;
const PREFIX = /^(md|mohd|mo|mst|sk|sd|kr|km|ku|sh|smt|shri|dr|om)$/i;   // Md., Mohd, Sk, Kr jaise chhote hisse rakhne hain
const DATE = /\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/;
const PIN = /(?<!\d)\d{6}(?!\d)/g;
const toLines = t => t.split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const title = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const asciiRatio = l => [...l].filter(c => c.charCodeAt(0) < 128).length / Math.max(l.length, 1);

// Line se sirf English naam nikalo (Hindi, nishan aur bekaar tukde hata ke)
function cleanName(line) {
  const toks = line.replace(/[^A-Za-z.\s]/g, " ").split(/\s+/).filter(Boolean);
  const keep = toks.filter(t => { const w = t.replace(/\./g, ""); return PREFIX.test(w) || (w.length >= 3 && /[aeiouy]/i.test(w)); });
  if (!keep.length || keep.length > 5) return "";
  if (keep.some(t => BAD.test(t.replace(/[.']/g, "")))) return "";
  if (!keep.some(t => t.replace(/\./g, "").length >= 3)) return "";
  return title(keep.join(" "));
}

function findAadhaar(t) {
  for (const m of t.matchAll(/(?<!\d)(\d{4}) {0,2}(\d{4}) {0,2}(\d{4})(?!\d)/g)) {
    const before = t.slice(Math.max(0, m.index - 8), m.index), after = t.slice(m.index + m[0].length);
    if (/vid/i.test(before) || /^ ?\d{4}(?!\d)/.test(after)) continue;   // VID (16 ank) ko chhodo
    const n = m[1] + m[2] + m[3];
    if (aadhaarOk(n)) return n;
  }
  return "";
}

// ---- Text se details nikalna ----
function parseFront(t) {
  const L = toLines(t), r = { aadhaar: findAadhaar(t) };
  const notIssue = l => !/issue/i.test(l);
  let di = L.findIndex(l => DATE.test(l) && /dob|birth/i.test(l) && notIssue(l));
  if (di < 0) di = L.findIndex(l => DATE.test(l) && notIssue(l));
  if (di >= 0) { const m = L[di].match(DATE); r.dob = `${m[1]}/${m[2]}/${m[3]}`; }
  else { const y = t.match(/(?:year of birth|yob)\s*[:\-]?\s*(\d{4})/i); if (y) r.dob = y[1]; }
  const g = t.match(/\b(female|male|transgender)\b/i);
  if (g) r.gender = title(g[1]);
  if (di > 0) for (let j = di - 1; j >= Math.max(di - 4, 0); j--) { const c = cleanName(L[j]); if (c) { r.name = c; break; } }
  return r;
}
function parseBack(t) {
  const L = toLines(t), r = { aadhaar: findAadhaar(t) };
  const junk = /uidai|www\.|help@|1947|\bvid\b|aadhaar|authority|identification|details as on|\b\d{4} \d{4} \d{4}\b/i;
  const good = l => l && asciiRatio(l) >= 0.6 && !junk.test(l);
  const hasPin = l => /(?<!\d)\d{6}(?!\d)/.test(l);
  const b = [];
  const s = L.findIndex(l => /\baddress\b/i.test(l) && !/uidai/i.test(l));
  if (s >= 0) {
    for (let k = s; k < Math.min(s + 9, L.length); k++) {
      let l = L[k];
      if (k === s) l = l.replace(/^.*?\baddress\b\s*[:\-]?\s*/i, "");
      if (!good(l)) continue;
      b.push(l.replace(/^[\s,]+|[\s,]+$/g, ""));
      if (hasPin(l)) break;
    }
  } else {
    let p = -1;
    L.forEach((l, k) => { if (good(l) && hasPin(l)) p = k; });
    if (p >= 0) for (let k = Math.max(0, p - 3); k <= p; k++) if (good(L[k])) b.push(L[k].replace(/^[\s,]+|[\s,]+$/g, ""));
  }
  const a = b.filter(Boolean).join(", ");
  if (a) { r.address = a; const p = a.match(PIN); if (p) r.pincode = p[p.length - 1]; }
  return r;
}
function parsePan(t) {
  const U = t.toUpperCase(), L = toLines(U), r = {};
  const m = U.match(/\b[A-Z]{5}\d{4}[A-Z]\b/);
  if (m) r.pan = m[0];
  const next = i => { for (const n of L.slice(i + 1, i + 4)) { const c = cleanName(n); if (c) return c; } return ""; };
  const ni = L.findIndex(l => /NAME/.test(l) && !/FATHER/.test(l)), fi = L.findIndex(l => /FATHER/.test(l));
  let a = ni >= 0 ? next(ni) : "", f = fi >= 0 ? next(fi) : "";
  if ((!a || !f) && m) {   // label na mile to PAN number ke neeche ke naam utha lo
    const pi = L.findIndex(l => l.includes(m[0])), pool = [];
    for (const n of L.slice(pi + 1, pi + 8)) { const c = cleanName(n); if (c && c !== a && c !== f) pool.push(c); }
    if (!a) a = pool.shift() || "";
    if (!f) f = pool.find(x => x !== a) || "";
  }
  if (a) r.pan_name = a;
  if (f) r.father_name = f;
  return r;
}

// ---- Aadhaar ke peeche ka QR (naam, DOB, address bilkul sahi milta hai) ----
const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
const GENDER = { M: "Male", F: "Female", T: "Transgender" };
const fixDob = d => { d = (d || "").replace(/-/g, "/"); return /^\d{2}\/\d{2}\/\d{4}$/.test(d) || /^\d{4}$/.test(d) ? d : ""; };
const joinAddr = (parts, pin) => {
  const u = []; parts.filter(Boolean).forEach(p => { if (!u.includes(p)) u.push(p); });
  return u.join(", ") + (pin ? " - " + pin : "");
};
async function gunzip(bytes) {
  const ds = new DecompressionStream("gzip"), w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function qrSecure(s) {   // naya QR: lamba number -> gzip -> 255 se bante fields
  try {
    let hex = BigInt(s).toString(16); if (hex.length % 2) hex = "0" + hex;
    const raw = await gunzip(Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16))));
    const fields = []; let cur = [];
    for (const b of raw) { if (b === 255) { fields.push(cur); cur = []; if (fields.length >= 30) break; } else cur.push(b); }
    const dec = new TextDecoder("iso-8859-1"), F = fields.map(f => dec.decode(Uint8Array.from(f)).trim());
    const di = F.findIndex(f => /^\d{2}-\d{2}-\d{4}$/.test(f));
    if (di < 1) return {};
    const r = { name: title(F[di - 1]), dob: fixDob(F[di]), gender: GENDER[F[di + 1]] || "" };
    const p = F.findIndex((f, i) => i > di + 1 && /^\d{6}$/.test(f));
    if (p >= 5) {
      r.pincode = F[p];
      r.address = joinAddr([F[p - 5], F[p - 2], F[p + 3], F[p - 3], F[p - 1], F[p + 5], F[p + 1], F[p + 4], F[p - 4], F[p + 2]], F[p]);
    }
    return r;
  } catch (e) { return {}; }
}
function qrXml(s) {   // purana QR (XML text)
  const a = k => (s.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] || "";
  const pc = a("pc"), uid = a("uid").replace(/\s/g, "");
  return {
    aadhaar: aadhaarOk(uid) ? uid : "", name: title(a("name")), dob: fixDob(a("dob") || a("yob")),
    gender: GENDER[a("gender")[0]] || title(a("gender")), pincode: pc,
    address: joinAddr([a("co"), a("house"), a("street"), a("lm"), a("loc"), a("vtc"), a("po"), a("subdist"), a("dist"), a("state")], pc),
  };
}
async function parseQr(raw) {
  if (!raw) return {};
  if (raw.includes("<") && /uid=|name=/.test(raw)) return qrXml(raw);
  if (/^\d{300,}$/.test(raw.trim())) return qrSecure(raw.trim());
  return {};
}
function loadScript(src) {
  return new Promise((ok, no) => { const e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); });
}
async function scanQr(canvas) {
  try {
    if ("BarcodeDetector" in window) { const r = await new BarcodeDetector({ formats: ["qr_code"] }).detect(canvas); if (r[0] && r[0].rawValue) return r[0].rawValue; }
  } catch (e) { /* aage badho */ }
  try {
    if (typeof jsQR === "undefined") await loadScript(JSQR_URL);
    const im = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const q = jsQR(im.data, im.width, im.height, { inversionAttempts: "attemptBoth" });
    if (q) return q.data;
  } catch (e) { /* QR nahi mila */ }
  return "";
}
async function qrFromFile(file) { return parseQr(await scanQr(await toCanvas(file, 0, 3000))); }

// ---- Photo padhna (browser me hi, kahin upload nahi hoti) ----
// Photo ke upar-neeche ki kaali patti (bilkul kaali) kaat deta hai
function contentBox(bmp) {
  const sw = Math.min(200, bmp.width), sh = Math.max(1, Math.round(bmp.height * sw / bmp.width));
  const c = document.createElement("canvas"); c.width = sw; c.height = sh;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data;
  const on = (xx, yy) => (d[(yy * sw + xx) * 4] + d[(yy * sw + xx) * 4 + 1] + d[(yy * sw + xx) * 4 + 2]) / 3 > 20;
  const row = y => { let n = 0; for (let i = 0; i < sw; i++) if (on(i, y)) n++; return n > sw * 0.05; };
  const col = xx => { let n = 0; for (let i = 0; i < sh; i++) if (on(xx, i)) n++; return n > sh * 0.05; };
  let t = 0, b = sh - 1, l = 0, r = sw - 1;
  while (t < b && !row(t)) t++; while (b > t && !row(b)) b--;
  while (l < r && !col(l)) l++; while (r > l && !col(r)) r--;
  const k = bmp.width / sw;
  const bx = Math.max(0, Math.floor(l * k)), by = Math.max(0, Math.floor(t * k));
  return { x: bx, y: by, w: Math.min(bmp.width - bx, Math.ceil((r - l + 1) * k)), h: Math.min(bmp.height - by, Math.ceil((b - t + 1) * k)) };
}
async function toCanvas(file, rot, cap = 2000) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const b = contentBox(bmp);
  const s = Math.min(1, cap / Math.max(b.w, b.h));
  const w = Math.round(b.w * s), h = Math.round(b.h * s);
  const c = document.createElement("canvas"), swap = rot % 180 !== 0;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const x = c.getContext("2d");
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180);
  x.drawImage(bmp, b.x, b.y, b.w, b.h, -w / 2, -h / 2, w, h);
  if (bmp.close) bmp.close();
  return c;
}
// jobs: [{file, rot, parse, ok}]  ->  milaya hua data
// Peeche wali photo me pehle QR try hota hai. Kaam ka data na mile to photo ghuma ke dobara padhta hai.
async function runOcr(jobs, onStep) {
  let pct = 0, i = 0, t = 0;
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: m => { if (m.status === "recognizing text") { pct = Math.round(m.progress * 100); onStep && onStep(i, jobs.length, pct, t); } },
  });
  const data = {};
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    for (i = 0; i < jobs.length; i++) {
      const j = jobs[i], base = j.rot, isBack = j.parse === parseBack;
      const ok = isBack ? (g => g.aadhaar) : (j.ok || (g => Object.values(g).filter(Boolean).length > 1));
      const qr = isBack ? await qrFromFile(j.file).catch(() => ({})) : {};
      let best = {}, bestN = -1;
      for (t = 0; t < 4; t++) {
        const rot = [base, base + 90, base + 270, base + 180][t] % 360;
        onStep && onStep(i, jobs.length, 0, t);
        const { data: d } = await worker.recognize(await toCanvas(j.file, rot));
        const got = j.parse(d.text), n = Object.values(got).filter(Boolean).length;
        if (n > bestN) { best = got; bestN = n; }
        if (ok(got)) break;
      }
      for (const k in best) if (best[k]) data[k] = best[k];
      for (const k in qr) if (qr[k]) data[k] = qr[k];   // QR ka data zyada sahi hota hai
    }
  } finally { await worker.terminate(); }
  return data;
}

// Agle step me yahan backend ko bhejna judega (queue, payment check)
async function submitJob(service, data) { /* TODO */ }

if (typeof module !== "undefined") module.exports = { verhoeff, aadhaarOk, panOk, cleanName, findAadhaar, parseFront, parseBack, parsePan, qrSecure, qrXml, parseQr };
