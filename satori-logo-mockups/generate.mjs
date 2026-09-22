// Satori logo mockups — riffing on the Zen concentric-ripple mark.
// Geometry sampled from configs/branding/release/logo512.png:
//   canvas 1024, corner r180, bg #202020 (twilight #537CF7), cream #F2F0E3
//   rings (mid radii / thickness): 136/30, 236/48, 356/68 — equal 62 gaps
// Run: node generate.mjs   → writes SVGs + 512px PNGs + contact-sheet.png

import sharp from "sharp";
import fs from "fs";
import { fileURLToPath } from "url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const S = 1024, C = 512;
const CREAM = "#F2F0E3";
const BG = "#202020";
const CORNER = 180;
const RINGS = [
  { mid: 136, w: 30 },
  { mid: 236, w: 48 },
  { mid: 356, w: 68 },
];

const rad = (d) => (d * Math.PI) / 180;
const pt = (r, a) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];

const bgRect = (fill) =>
  `<rect width="${S}" height="${S}" rx="${CORNER}" fill="${fill}"/>`;

const ring = ({ mid, w }, color = CREAM, opacity = 1) =>
  `<circle cx="${C}" cy="${C}" r="${mid}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${opacity}"/>`;

// clockwise arc between two angles (deg, 0=east), as stroked path
function arc(r, a0, a1, w, color = CREAM, cap = "round") {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const sweep = (((a1 - a0) % 360) + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  return `<path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}"/>`;
}

// tapered brush tip: from angle a0 (full width) to a1 (point) on ring of radii rOut/rIn
function taper(rOut, rIn, a0, a1, color = CREAM) {
  const steps = 48, outPoints = [], inPoints = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = 1 - Math.pow(1 - t, 1.9); // thin slowly, then fast (brush flick)
    const a = a0 + (a1 - a0) * t;
    const mid = (rOut + rIn) / 2;
    const ro = rOut + (mid - rOut) * e;
    const ri = rIn + (mid - rIn) * e;
    outPoints.push(pt(ro, a).map((v) => v.toFixed(2)).join(" "));
    inPoints.unshift(pt(ri, a).map((v) => v.toFixed(2)).join(" "));
  }
  return `<path d="M ${outPoints.join(" L ")} L ${inPoints.join(" L ")} Z" fill="${color}"/>`;
}

// 4-point sparkle (✦), k = waist sharpness (smaller = thinner)
function spark(cx, cy, R, k = 0.14) {
  const q = R * k;
  return `M ${cx} ${cy - R}
    Q ${cx + q} ${cy - q} ${cx + R} ${cy}
    Q ${cx + q} ${cy + q} ${cx} ${cy + R}
    Q ${cx - q} ${cy + q} ${cx - R} ${cy}
    Q ${cx - q} ${cy - q} ${cx} ${cy - R} Z`;
}

const svg = (name, defs, body) =>
  fs.writeFileSync(
    `${__dirname}/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs>${defs}</defs>${body}</svg>`
  );

/* ── A · LIT CENTER — Zen at night, but the void is filled with light ── */
const glowDefs = `
  <radialGradient id="glow"><stop offset="0%" stop-color="#FFB96E" stop-opacity=".50"/><stop offset="45%" stop-color="#FF9E57" stop-opacity=".16"/><stop offset="100%" stop-color="#FF9E57" stop-opacity="0"/></radialGradient>
  <radialGradient id="core"><stop offset="0%" stop-color="#FFE7BC"/><stop offset="60%" stop-color="#FFC978"/><stop offset="100%" stop-color="#FA9450"/></radialGradient>`;
svg(
  "a-lit-center",
  glowDefs,
  bgRect("#1E1C18") +
    `<circle cx="${C}" cy="${C}" r="230" fill="url(#glow)"/>` +
    `<circle cx="${C}" cy="${C}" r="118" fill="url(#core)"/>` +
    RINGS.map((r) => ring(r)).join("")
);

/* ── B · DAWN — twilight sky breaking into sunrise, coral horizon nods to brand orange ── */
const dawnDefs = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#191B3E"/><stop offset="45%" stop-color="#2A2A58"/><stop offset="70%" stop-color="#513868"/><stop offset="85%" stop-color="#8A4E5E"/><stop offset="100%" stop-color="#DD6B56"/></linearGradient>
  <radialGradient id="sunGlow"><stop offset="0%" stop-color="#FFCE8A" stop-opacity=".65"/><stop offset="50%" stop-color="#FFAB60" stop-opacity=".22"/><stop offset="100%" stop-color="#FFAB60" stop-opacity="0"/></radialGradient>
  <radialGradient id="sun"><stop offset="0%" stop-color="#FFF0CE"/><stop offset="55%" stop-color="#FFD08A"/><stop offset="100%" stop-color="#FFA357"/></radialGradient>`;
svg(
  "b-dawn",
  dawnDefs,
  bgRect("url(#sky)") +
    `<circle cx="${C}" cy="${C}" r="300" fill="url(#sunGlow)"/>` +
    `<circle cx="${C}" cy="${C}" r="118" fill="url(#sun)"/>` +
    RINGS.map((r) => ring(r, CREAM, 0.97)).join("")
);

/* ── C · ENSŌ — outer ring opens with a brush-flick tip ── */
svg(
  "c-enso",
  "",
  bgRect(BG) +
    ring(RINGS[0]) +
    ring(RINGS[1]) +
    arc(RINGS[2].mid, -8, 245, RINGS[2].w, CREAM, "butt") +
    (() => { const [cx, cy] = pt(RINGS[2].mid, -8); return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${RINGS[2].w / 2}" fill="${CREAM}"/>`; })() +
    taper(RINGS[2].mid + RINGS[2].w / 2, RINGS[2].mid - RINGS[2].w / 2, 245, 300)
);

/* ── D · SPARK — a flash of insight on the middle ring ── */
const sparkDefs = `
  <linearGradient id="sparkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFC87E"/><stop offset="100%" stop-color="#F76F53"/></linearGradient>
  <radialGradient id="sparkHalo"><stop offset="0%" stop-color="#FFB96E" stop-opacity=".45"/><stop offset="100%" stop-color="#FFB96E" stop-opacity="0"/></radialGradient>`;
const [sx, sy] = pt(RINGS[1].mid, -45); // sits on the middle ring, top-right
svg(
  "d-spark",
  sparkDefs,
  bgRect(BG) +
    RINGS.map((r) => ring(r)).join("") +
    `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="108" fill="url(#sparkHalo)"/>` +
    `<path d="${spark(sx, sy, 92)}" fill="url(#sparkG)"/>`
);

/* ── E · GRADIENT RINGS — exact Zen geometry; the rings are a mask over one shared gradient ──
   gradientUnits="userSpaceOnUse" pinned to ring bounds ⇒ color flows continuously
   across rings and gaps (vs. restarting per ring). */
function gradientRings(name, gradTag, gradId, bg = BG) {
  svg(name, gradTag, bgRect(bg) + RINGS.map((r) => ring(r, `url(#${gradId})`)).join(""));
}

// E1 · dawn flow — vertical periwinkle → violet → coral → amber
gradientRings(
  "e1-gradient-dawn",
  `<linearGradient id="g1" gradientUnits="userSpaceOnUse" x1="512" y1="${C - 390}" x2="512" y2="${C + 390}"><stop offset="0%" stop-color="#7AA2FF"/><stop offset="45%" stop-color="#B48CFF"/><stop offset="75%" stop-color="#FF8A6A"/><stop offset="100%" stop-color="#FFC97E"/></linearGradient>`,
  "g1"
);

// E2 · radiant — enlightenment emanating outward: amber core → coral → violet → indigo edge
gradientRings(
  "e2-gradient-radial",
  `<radialGradient id="g2" gradientUnits="userSpaceOnUse" cx="512" cy="512" r="400"><stop offset="0%" stop-color="#FFD08A"/><stop offset="40%" stop-color="#FF9E6B"/><stop offset="70%" stop-color="#C77DFF"/><stop offset="100%" stop-color="#6E8CFF"/></radialGradient>`,
  "g2"
);

// E3 · prism — diagonal pastel spectrum, corner to corner
gradientRings(
  "e3-gradient-prism",
  `<linearGradient id="g3" gradientUnits="userSpaceOnUse" x1="${C - 390}" y1="${C - 390}" x2="${C + 390}" y2="${C + 390}"><stop offset="0%" stop-color="#FFD08A"/><stop offset="30%" stop-color="#FF8FA3"/><stop offset="55%" stop-color="#C77DFF"/><stop offset="80%" stop-color="#6EA8FF"/><stop offset="100%" stop-color="#67E8C0"/></linearGradient>`,
  "g3"
);

/* ── rasterize + contact sheet ── */
(async () => {
  const names = ["a-lit-center", "b-dawn", "c-enso", "d-spark", "e1-gradient-dawn", "e2-gradient-radial", "e3-gradient-prism"];
  const pngs = [];
  for (const n of names) {
    const p = `${__dirname}/${n}-512.png`;
    await sharp(`${__dirname}/${n}.svg`).resize(512).png().toFile(p);
    await sharp(`${__dirname}/${n}.svg`).resize(48).png().toFile(`${__dirname}/${n}-48.png`);
    pngs.push(p);
    console.log("wrote", p);
  }
  const gap = 16, cell = 512;
  const cols = 4, rows = Math.ceil(names.length / cols);
  await sharp({
    create: { width: cols * cell + (cols + 1) * gap, height: rows * cell + (rows + 1) * gap, channels: 4, background: "#101010" },
  })
    .composite(pngs.map((p, i) => ({ input: p, left: gap + (i % cols) * (cell + gap), top: gap + Math.floor(i / cols) * (cell + gap) })))
    .png()
    .toFile(`${__dirname}/contact-sheet.png`);
  console.log("wrote contact-sheet.png");

  // favicon legibility check: 48px tiles on a light strip, upscaled for viewing
  const small = await Promise.all(
    names.map((n) => sharp(`${__dirname}/${n}-48.png`).resize(192, 192, { kernel: "nearest" }).toBuffer())
  );
  await sharp({ create: { width: names.length * (192 + 10) + 10, height: 192 + 20, channels: 4, background: "#E8E8E8" } })
    .composite(small.map((buf, i) => ({ input: buf, left: 10 + i * (192 + 10), top: 10 })))
    .png()
    .toFile(`${__dirname}/favicon-check.png`);
  console.log("wrote favicon-check.png");
})();
