// Build the full Satori branding asset set ("e2 gradient-radial" design) into a
// surfer release branding dir. Replaces Zen art in place; mask/private-browsing
// assets and MacOSInstaller.svg are generic and left untouched.
// Usage: node build-branding.mjs [release-branding-dir]
//   default: /Users/jgoon/github/desktop-satori-review/configs/branding/release

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TARGET = process.argv[2] ?? "/Users/jgoon/github/desktop-satori-review/configs/branding/release";

/* ── e2 master design (1024 canvas, Zen geometry: mid/thickness, equal 62 gaps) ── */
const S = 1024, C = 512;
const BG = "#202020";
const RINGS = [ { mid: 136, w: 30 }, { mid: 236, w: 48 }, { mid: 356, w: 68 } ];

const GRAD_DEF = `<radialGradient id="e2" gradientUnits="userSpaceOnUse" cx="512" cy="512" r="400">
  <stop offset="0%" stop-color="#FFD08A"/><stop offset="40%" stop-color="#FF9E6B"/>
  <stop offset="70%" stop-color="#C77DFF"/><stop offset="100%" stop-color="#6E8CFF"/></radialGradient>`;

const rings = (k = 1, cx = C, cy = C, stroke = "url(#e2)") =>
  RINGS.map(r => `<circle cx="${(cx).toFixed(2)}" cy="${(cy).toFixed(2)}" r="${(r.mid * k).toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${(r.w * k).toFixed(2)}"/>`).join("");

const svgDoc = (w, h, body, defs = GRAD_DEF) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

// full-bleed app icon
const fullSVG = svgDoc(S, S, `<rect width="${S}" height="${S}" rx="180" fill="${BG}"/>` + rings());
// macOS Big Sur inset icon (96px padding)
const macSVG = svgDoc(S, S, `<rect x="96" y="96" width="832" height="832" rx="146" fill="${BG}"/>` + rings(0.8125, C, C));
// slightly inset variant for firefox64.ico
const ico64SVG = svgDoc(S, S, `<rect x="51" y="51" width="922" height="922" rx="204" fill="${BG}"/>` + rings(0.9004, C, C));
// Windows start tile: near full-bleed on the odd 1042x1046 canvas Windows uses
const tileSVG = svgDoc(1042, 1046, `<rect x="4" y="2" width="1034" height="1042" rx="183" fill="${BG}"/>` + rings(1.0176, 523, 525));
// about dialog mark: gradient rings, no background
const aboutSVG = svgDoc(S, S, rings());

// document icons: page + rings glyph (solid dark for plain, grey under the PDF banner)
function docSVG(pdf) {
  const pageFill = "#FDFDFE", pageLine = "#A6AAB8";
  const glyph = rings(0.195, 128, 150, pdf ? "#C7CBDA" : "#1A1A1A");
  const banner = pdf
    ? `<rect x="21" y="136" width="214" height="106" fill="#FF0000"/>
       <text x="128" y="214" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="72" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="2">PDF</text>`
    : "";
  return svgDoc(256, 256, `
    <path d="M41 8 H160 L223 71 V240 Q223 248 215 248 H41 Q33 248 33 240 V16 Q33 8 41 8 Z" fill="${pageFill}" stroke="${pageLine}" stroke-width="8"/>
    <path d="M160 8 L223 71 H160 Z" fill="#DDE0EA" stroke="${pageLine}" stroke-width="6" stroke-linejoin="round"/>
    ${glyph}${banner}`);
}

// Windows installer wizard watermark: 164x314 black banner, gradient arcs peeking
// over the top edge, wordmark text bottom-left (Zen's said "zen browser")
const wizSVG = svgDoc(164, 314, `
  <rect width="164" height="314" fill="${BG}"/>
  ${rings(0.235, 164 / 2, -12)}
  <text x="10" y="301" font-family="SF Pro Rounded, Arial Rounded MT Bold, Helvetica, sans-serif" font-size="15" font-weight="bold" fill="#ffffff">satori browser</text>`);

/* ── ICO packer (PNG payloads, BMP-legal too) ── */
function writeICO(pngBuffers, outPath) {
  const n = pngBuffers.length;
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(n, 4);
  let offset = 6 + n * 16;
  const entries = [], parts = [];
  for (const { size, buf } of pngBuffers) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    offset += buf.length; entries.push(e); parts.push(buf);
  }
  fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...parts]));
}

const render = async (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
const write = async (svg, size, outPath) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
const log = (p) => console.log("  ", path.relative(TARGET, p));

(async () => {
  console.log("→", TARGET);
  fs.mkdirSync(path.join(TARGET, "content"), { recursive: true });

  // wordmarks first (python/fontTools, SF Rounded baked to paths)
  execFileSync("/tmp/ftenv/bin/python", [`${__dirname}/bake-wordmarks.py`, TARGET], { stdio: "inherit" });
  log(path.join(TARGET, "content/about-wordmark.svg"));
  log(path.join(TARGET, "content/firefox-wordmark.svg"));

  // app icons
  fs.writeFileSync(path.join(TARGET, "content/about-logo.svg"), aboutSVG); log(path.join(TARGET, "content/about-logo.svg"));
  for (const sz of [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024]) { const p = path.join(TARGET, `logo${sz}.png`); await write(fullSVG, sz, p); log(p); }
  await write(fullSVG, 1024, path.join(TARGET, "logo.png")); log(path.join(TARGET, "logo.png"));
  await write(macSVG, 1024, path.join(TARGET, "logo-mac.png")); log(path.join(TARGET, "logo-mac.png"));
  await write(aboutSVG, 512, path.join(TARGET, "content/about-logo.png")); log(path.join(TARGET, "content/about-logo.png"));
  await write(aboutSVG, 1024, path.join(TARGET, "content/about-logo@2x.png")); log(path.join(TARGET, "content/about-logo@2x.png"));

  // windows tiles (both names share the odd 1042x1046 plate in Zen's set)
  await sharp(Buffer.from(tileSVG)).png().toFile(path.join(TARGET, "VisualElements_70.png")); log(path.join(TARGET, "VisualElements_70.png"));
  await sharp(Buffer.from(tileSVG)).png().toFile(path.join(TARGET, "VisualElements_150.png")); log(path.join(TARGET, "VisualElements_150.png"));

  // ICOs
  const frames = [16, 32, 48, 64, 256];
  writeICO(await Promise.all(frames.map(async sz => ({ size: sz, buf: await render(fullSVG, sz) }))), path.join(TARGET, "firefox.ico")); log(path.join(TARGET, "firefox.ico"));
  writeICO(await Promise.all(frames.map(async sz => ({ size: sz, buf: await render(ico64SVG, sz) }))), path.join(TARGET, "firefox64.ico")); log(path.join(TARGET, "firefox64.ico"));
  const docFrames = [16, 32, 48, 64, 128, 256];
  writeICO(await Promise.all(docFrames.map(async sz => ({ size: sz, buf: await render(docSVG(false), sz) }))), path.join(TARGET, "document.ico")); log(path.join(TARGET, "document.ico"));
  writeICO(await Promise.all(docFrames.map(async sz => ({ size: sz, buf: await render(docSVG(true), sz) }))), path.join(TARGET, "document_pdf.ico")); log(path.join(TARGET, "document_pdf.ico"));

  // macOS .icns via iconutil
  const set = path.join(__dirname, "satori.iconset");
  fs.rmSync(set, { recursive: true, force: true }); fs.mkdirSync(set);
  for (const [name, px] of [["icon_16x16", 16], ["icon_16x16@2x", 32], ["icon_32x32", 32], ["icon_32x32@2x", 64], ["icon_128x128", 128], ["icon_128x128@2x", 256], ["icon_256x256", 256], ["icon_256x256@2x", 512], ["icon_512x512", 512], ["icon_512x512@2x", 1024]])
    await write(macSVG, px, path.join(set, `${name}.png`));
  execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(TARGET, "firefox.icns")]);
  fs.rmSync(set, { recursive: true }); log(path.join(TARGET, "firefox.icns"));

  // windows wizard watermark (164x314 BMP)
  const wizPng = path.join(__dirname, "wiz.tmp.png");
  await sharp(Buffer.from(wizSVG)).png().toFile(wizPng);
  execFileSync("sips", ["-s", "format", "bmp", wizPng, "--out", path.join(TARGET, "wizWatermark.bmp")]);
  fs.unlinkSync(wizPng); log(path.join(TARGET, "wizWatermark.bmp"));

  console.log("done. unchanged (generic mask/placeholder): pbmode.ico, PrivateBrowsing_*, about-logo-private.*, MacOSInstaller.svg");
})();
