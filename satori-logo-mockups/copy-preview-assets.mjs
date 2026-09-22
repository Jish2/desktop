// Copy the shipped branding assets into ./final for the brand-preview.html page,
// extracting the largest frame of each ICO to a PNG for browser-friendly display.
// Run: node copy-preview-assets.mjs   (re-run after build-branding.mjs changes)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SRC = "/Users/jgoon/github/desktop-satori-review/configs/branding/release";
const OUT = path.join(__dirname, "final");
fs.mkdirSync(OUT, { recursive: true });

const COPY = [
  "logo16.png", "logo24.png", "logo32.png", "logo48.png", "logo64.png", "logo128.png",
  "logo256.png", "logo512.png", "logo1024.png", "logo.png", "logo-mac.png",
  "VisualElements_150.png", "PrivateBrowsing_150.png", "wizWatermark.bmp",
  "content/about-logo.png", "content/about-logo@2x.png", "content/about-logo.svg",
  "content/about-logo-private.png", "content/about-logo-private.svg",
  "content/about-wordmark.svg", "content/firefox-wordmark.svg",
];

function extractIco(srcPath, outName) {
  const d = fs.readFileSync(srcPath);
  const count = d.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const w = d[o] || 256, size = d.readUInt32LE(o + 8), off = d.readUInt32LE(o + 12);
    if (!best || w > best.w) best = { w, size, off };
  }
  const payload = d.subarray(best.off, best.off + best.size);
  fs.writeFileSync(path.join(OUT, outName), payload);
  return `${outName} (${best.w}px)`;
}

for (const rel of COPY) fs.copyFileSync(path.join(SRC, rel), path.join(OUT, path.basename(rel)));
for (const name of ["firefox.ico", "firefox64.ico", "pbmode.ico", "document.ico", "document_pdf.ico"])
  console.log("extracted", extractIco(path.join(SRC, name), name.replace(/\.(ico)$/, "-256.png")));
console.log("copied", COPY.length, "files →", OUT);
