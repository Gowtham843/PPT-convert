/**
 * Phase 2: Theme, fonts, and color scheme extraction.
 */

const fs = require('fs');
const path = require('path');
const { parseAttrs } = require('./ooxml-utils');

function readTheme(extractDir) {
  const themeDir = path.join(extractDir, 'ppt', 'theme');
  if (!fs.existsSync(themeDir)) return null;
  const files = fs.readdirSync(themeDir).filter((f) => f.startsWith('theme') && f.endsWith('.xml'));
  if (!files.length) return null;
  const xml = fs.readFileSync(path.join(themeDir, files[0]), 'utf8');

  const major = xml.match(/<a:majorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/)?.[1] || null;
  const minor = xml.match(/<a:minorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/)?.[1] || null;

  const colors = {};
  const clrRe = /<a:(\w+)\s*>[\s\S]*?<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g;
  let m;
  while ((m = clrRe.exec(xml))) {
    colors[m[1]] = `#${m[2]}`;
  }

  return {
    majorFont: major,
    minorFont: minor,
    colors,
    note: 'Theme fonts are references; browser uses system/substitute fonts unless embedded.',
  };
}

function extractSlideFonts(slideXml) {
  const fonts = new Set();
  const re = /typeface="([^"]+)"/g;
  let m;
  while ((m = re.exec(slideXml))) {
    if (m[1] && m[1] !== '+mj-lt' && m[1] !== '+mn-lt') fonts.add(m[1]);
  }
  return [...fonts];
}

function resolveThemeFont(typeface, theme) {
  if (!typeface) return null;
  if (typeface === '+mj-lt') return theme?.majorFont || 'Calibri';
  if (typeface === '+mn-lt') return theme?.minorFont || 'Calibri';
  return typeface;
}

module.exports = { readTheme, extractSlideFonts, resolveThemeFont };
