// Regenerate the app's raster icons from one clean vector source.
//
// The brand mark is the three ascending bars (progressive overload) on the orange
// "Performance Instrument" tile — identical to src/app/icon.svg, just scaled up. The
// older hand-made PNGs carried a malformed upward arrow; this keeps a single source of
// truth so favicon, PWA, Apple-touch, and the Unraid template icon all match.
//
// Run: node scripts/build-icons.mjs   (requires `sharp`, already a dependency)
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// Master 512×512 source — same geometry as src/app/icon.svg (×16 from its 32px viewBox).
const MASTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#ff6a2b"/>
  <g transform="translate(64 64)" fill="#1a0d04">
    <rect x="56" y="208" width="64" height="112" rx="20.8"/>
    <rect x="160" y="152" width="64" height="168" rx="20.8"/>
    <rect x="264" y="96" width="64" height="224" rx="20.8"/>
  </g>
</svg>`;

const OUTPUTS = [
  { file: "public/icon-512.png", size: 512 },
  { file: "public/icon-192.png", size: 192 },
  { file: "src/app/apple-icon.png", size: 180 },
];

const svg = Buffer.from(MASTER_SVG);
for (const { file, size } of OUTPUTS) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(file, png);
  console.log(`wrote ${file} (${size}×${size}, ${png.length} bytes)`);
}
