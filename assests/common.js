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

// ---- Text se details nikalna ----
const BAD = /\b(GOVERNMENT|GOVT|INDIA|AADHAAR|UNIQUE|IDENTIFICATION|AUTHORITY|DOB|MALE|FEMALE|YEAR|BIRTH|ADDRESS|INCOME|TAX|DEPARTMENT|PERMANENT|ACCOUNT|NUMBER|CARD|SIGNATURE|FATHER|NAME|DATE|VID|ENROLMENT|ISSUE|ISSUED)\b/i;
const DATE = /\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/;
const PIN = /(?<!\d)\d{6}(?!\d)/g;
const toLines = t => t.split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const isName = l => /^[A-Za-z][A-Za-z .'-]{2,}$/.test(l) && l.split(" ").length <= 5 && !BAD.test(l);
const title = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const asciiRatio = l => [...l].filter(c => c.charCodeAt(0) < 128).length / Math.max(l.length, 1);

function findAadhaar(t) {
  for (const m of t.matchAll(/(?<!\d)(\d{4})\s*(\d{4})\s*(\d{4})(?!\d)/g)) {
    const n = m[1] + m[2] + m[3];
    if (aadhaarOk(n)) return n;
  }
  return "";
}
function parseFront(t) {
  const L = toLines(t), r = { aadhaar: findAadhaar(t) };
  let di = L.findIndex(l => DATE.test(l) && /dob|birth/i.test(l));
  if (di < 0) di = L.findIndex(l => DATE.test(l));
  if (di >= 0) { const m = L[di].match(DATE); r.dob = `${m[1]}/${m[2]}/${m[3]}`; }
  const g = t.match(/\b(female|male|transgender)\b/i);
  if (g) r.gender = title(g[1]);
  if (di > 0) for (let j = di - 1; j >= Math.max(di - 4, 0); j--) if (isName(L[j])) { r.name = title(L[j]); break; }
  return r;
}
function parseBack(t) {
  const L = toLines(t), r = { aadhaar: findAadhaar(t) };
  const s = L.findIndex(l => /^address\b/i.test(l));
  if (s < 0) return r;
  const b = [];
  for (const l of L.slice(s, s + 9)) {
    if (/uidai|www\.|help@|1947|aadhaar/i.test(l) || asciiRatio(l) < 0.7) continue;
    b.push(l.replace(/^address\s*[:\-]?\s*/i, "").replace(/^[\s,]+|[\s,]+$/g, ""));
    if (/(?<!\d)\d{6}(?!\d)/.test(l)) break;
  }
  const a = b.filter(Boolean).join(", ");
  if (a) { r.address = a; const p = a.match(PIN); if (p) r.pincode = p[p.length - 1]; }
  return r;
}
function parsePan(t) {
  const U = t.toUpperCase(), L = toLines(U), r = {};
  const m = U.match(/\b[A-Z]{5}\d{4}[A-Z]\b/);
  if (m) r.pan = m[0];
  const after = test => {
    for (let i = 0; i < L.length; i++) if (test(L[i]))
      for (const n of L.slice(i + 1, i + 3)) if (/^[A-Z][A-Z .'-]{2,}$/.test(n) && !BAD.test(n)) return title(n);
    return "";
  };
  const a = after(l => /NAME/.test(l) && !/FATHER/.test(l)), f = after(l => /FATHER/.test(l));
  if (a) r.pan_name = a;
  if (f) r.father_name = f;
  return r;
}

// ---- Photo padhna (browser me hi, kahin upload nahi hoti) ----
async function toCanvas(file, rot) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement("canvas"), swap = rot % 180 !== 0;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const x = c.getContext("2d");
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180);
  x.drawImage(bmp, -w / 2, -h / 2, w, h);
  return c;
}
// jobs: [{file, rot, parse}]  ->  milaya hua data
async function runOcr(jobs, onStep) {
  let pct = 0, i = 0;
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: m => { if (m.status === "recognizing text") { pct = Math.round(m.progress * 100); onStep && onStep(i, jobs.length, pct); } },
  });
  const data = {};
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    for (i = 0; i < jobs.length; i++) {
      onStep && onStep(i, jobs.length, 0);
      const { data: d } = await worker.recognize(await toCanvas(jobs[i].file, jobs[i].rot));
      const got = jobs[i].parse(d.text);
      for (const k in got) if (got[k]) data[k] = got[k];
    }
  } finally { await worker.terminate(); }
  return data;
}

// Agle step me yahan backend ko bhejna judega (queue, payment check)
async function submitJob(service, data) { /* TODO */ }

if (typeof module !== "undefined") module.exports = { verhoeff, aadhaarOk, panOk, parseFront, parseBack, parsePan };
