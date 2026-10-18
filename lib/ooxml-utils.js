/**
 * Shared OOXML string parsing helpers.
 */

function parseAttrs(tag, attr) {
  if (!tag) return null;
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function emuToPct(emu, total) {
  if (!total && total !== 0) return null;
  return Number(((Number(emu) / Number(total)) * 100).toFixed(4));
}

module.exports = { parseAttrs, emuToPct };
