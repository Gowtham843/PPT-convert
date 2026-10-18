/**
 * LibreOffice → PDF → PNG fallback pipeline (unchanged behavior).
 */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const LIBREOFFICE_PATHS = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/local/bin/libreoffice',
  'soffice',
];

const PDFTOPPM_PATHS = [
  '/opt/homebrew/bin/pdftoppm',
  '/usr/local/bin/pdftoppm',
  '/usr/bin/pdftoppm',
  'pdftoppm',
];

const RENDER_DPI = 144;

function commandExists(cmdPath) {
  try {
    if (cmdPath.includes('/') || cmdPath.includes('\\')) return fs.existsSync(cmdPath);
    execSync(`command -v ${cmdPath}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function findLibreOffice() {
  for (const p of LIBREOFFICE_PATHS) {
    if (!commandExists(p)) continue;
    try {
      execFileSync(p, ['--version'], { stdio: 'pipe' });
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

function findPdftoppm() {
  for (const p of PDFTOPPM_PATHS) {
    if (!commandExists(p)) continue;
    if (p.includes('/') || p.includes('\\')) return p;
    try {
      execSync('command -v pdftoppm', { stdio: 'pipe' });
      return 'pdftoppm';
    } catch {
      /* next */
    }
  }
  return null;
}

function convertToPdf(libreOfficePath, inputFile, workDir) {
  fse.ensureDirSync(workDir);
  execFileSync(
    libreOfficePath,
    ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', workDir, inputFile],
    { timeout: 600000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const base = path.basename(inputFile, path.extname(inputFile));
  const pdfPath = path.join(workDir, `${base}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    const pdfs = fs.readdirSync(workDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 1) return path.join(workDir, pdfs[0]);
    throw new Error(`PDF generation failed — no PDF in ${workDir}`);
  }
  return pdfPath;
}

function rasterizePdfToPngs(pdftoppmPath, pdfPath, slidesDir) {
  fse.ensureDirSync(slidesDir);
  fse.emptyDirSync(slidesDir);
  const prefix = path.join(slidesDir, 'slide');
  execFileSync(pdftoppmPath, ['-png', '-r', String(RENDER_DPI), pdfPath, prefix], {
    timeout: 600000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const raw = fs
    .readdirSync(slidesDir)
    .filter((f) => /^slide-?\d+\.png$/i.test(f))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  if (!raw.length) throw new Error(`PDF → PNG failed — no PNGs in ${slidesDir}`);
  const slides = [];
  raw.forEach((name, i) => {
    const dest = `slide-${String(i + 1).padStart(3, '0')}.png`;
    const from = path.join(slidesDir, name);
    const to = path.join(slidesDir, dest);
    if (from !== to) {
      if (fs.existsSync(to)) fs.unlinkSync(to);
      fs.renameSync(from, to);
    }
    slides.push(dest);
  });
  let width = null;
  let height = null;
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path.join(slidesDir, slides[0])], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const wm = out.match(/pixelWidth:\s*(\d+)/);
    const hm = out.match(/pixelHeight:\s*(\d+)/);
    if (wm) width = parseInt(wm[1], 10);
    if (hm) height = parseInt(hm[1], 10);
  } catch {
    /* optional */
  }
  return { slides, width, height, renderDpi: RENDER_DPI };
}

function runPngFallback(inputPath, outputDir, workDir, options = {}) {
  const lo = findLibreOffice();
  const ppm = findPdftoppm();
  if (!lo) throw new Error('LibreOffice not found (PNG fallback)');
  if (!ppm) throw new Error('pdftoppm not found (PNG fallback)');

  const slideNumbers = options.slideNumbers || null;
  const keepAllSlides = !slideNumbers || !slideNumbers.length;

  const pdfWork = convertToPdf(lo, inputPath, workDir);
  const tempSlidesDir = path.join(workDir, 'png-slides');
  const raster = rasterizePdfToPngs(ppm, pdfWork, tempSlidesDir);

  const slidesDir = path.join(outputDir, 'slides');
  fse.ensureDirSync(slidesDir);

  if (keepAllSlides) {
    fse.emptyDirSync(slidesDir);
  } else {
    for (const name of fs.readdirSync(slidesDir)) {
      if (name.toLowerCase().endsWith('.png')) fs.unlinkSync(path.join(slidesDir, name));
    }
  }

  const keep = keepAllSlides ? null : new Set(slideNumbers);
  const slides = new Array(raster.slides.length).fill(null);

  raster.slides.forEach((file, i) => {
    const slideNum = i + 1;
    if (keep && !keep.has(slideNum)) return;
    const dest = `slide-${String(slideNum).padStart(3, '0')}.png`;
    fse.copyFileSync(path.join(tempSlidesDir, file), path.join(slidesDir, dest));
    slides[i] = dest;
  });

  return {
    slides,
    width: raster.width,
    height: raster.height,
    renderDpi: raster.renderDpi,
    slideNumbers: keepAllSlides ? raster.slides.map((_, i) => i + 1) : [...slideNumbers],
  };
}

module.exports = {
  RENDER_DPI,
  findLibreOffice,
  findPdftoppm,
  convertToPdf,
  rasterizePdfToPngs,
  runPngFallback,
};
