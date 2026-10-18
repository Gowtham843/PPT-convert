/**
 * Phase 2: Chart detection + basic static bar/line/pie from OOXML.
 */

const fs = require('fs');
const path = require('path');
const { parseAttrs } = require('./ooxml-utils');

function resolveChartPath(extractDir, relTarget) {
  if (!relTarget) return null;
  const normalized = relTarget.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return null;
  if (normalized.startsWith('ppt/')) return path.join(extractDir, normalized);
  return path.join(extractDir, 'ppt', 'slides', normalized);
}

function findChartFiles(extractDir) {
  const chartsDir = path.join(extractDir, 'ppt', 'charts');
  if (!fs.existsSync(chartsDir)) return [];
  return fs.readdirSync(chartsDir).filter((f) => f.endsWith('.xml'));
}

function detectChartType(chartXml) {
  if (/<c:barChart\b/.test(chartXml) || /<c:columnChart\b/.test(chartXml)) return 'bar';
  if (/<c:lineChart\b/.test(chartXml)) return 'line';
  if (/<c:pieChart\b/.test(chartXml)) return 'pie';
  if (/<c:areaChart\b/.test(chartXml)) return 'area';
  if (/<c:doughnutChart\b/.test(chartXml)) return 'pie';
  return 'unknown';
}

function extractSeriesValues(chartXml) {
  const series = [];
  const serRe = /<c:ser\b[\s\S]*?<\/c:ser>/g;
  let m;
  while ((m = serRe.exec(chartXml))) {
    const block = m[0];
    const name = block.match(/<c:tx>[\s\S]*?<c:v>([^<]+)/)?.[1] || '';
    const vals = [];
    const valRe = /<c:pt\b[^>]*idx="(\d+)"[^>]*>[\s\S]*?<c:v>([^<]+)/g;
    let vm;
    while ((vm = valRe.exec(block))) {
      vals.push({ idx: Number(vm[1]), value: Number(vm[2]) });
    }
    vals.sort((a, b) => a.idx - b.idx);
    series.push({ name, values: vals.map((v) => v.value).filter((v) => v != null && !Number.isNaN(v)) });
  }
  return series;
}

function extractSlideCharts(slideXml, rels, extractDir, slideW, slideH) {
  const charts = [];
  const frameRe = /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g;
  let m;
  while ((m = frameRe.exec(slideXml))) {
    const block = m[0];
    if (!/<c:chart\b/.test(block)) continue;
    const rid = parseAttrs(block.match(/<c:chart\b[^>]*>/)?.[0] || '', 'r:id');
    const rel = rels[rid];
    if (!rel) continue;

    const chartPath = resolveChartPath(extractDir, rel.target);
    if (!chartPath || !fs.existsSync(chartPath)) continue;

    const full = chartPath;

    const chartXml = fs.readFileSync(full, 'utf8');
    const id = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'id') || String(charts.length + 1);
    const x = parseAttrs(block.match(/<a:off\b[^>]*>/)?.[0] || '', 'x');
    const y = parseAttrs(block.match(/<a:off\b[^>]*>/)?.[0] || '', 'y');
    const cx = parseAttrs(block.match(/<a:ext\b[^>]*>/)?.[0] || '', 'cx');
    const cy = parseAttrs(block.match(/<a:ext\b[^>]*>/)?.[0] || '', 'cy');

    const type = detectChartType(chartXml);
    const series = extractSeriesValues(chartXml);

    charts.push({
      id: String(id),
      type,
      series,
      renderable: series.length > 0 && ['bar', 'line', 'pie'].includes(type),
      leftPct: x != null ? (Number(x) / slideW) * 100 : 10,
      topPct: y != null ? (Number(y) / slideH) * 100 : 15,
      widthPct: cx != null ? (Number(cx) / slideW) * 100 : 70,
      heightPct: cy != null ? (Number(cy) / slideH) * 100 : 55,
    });
  }
  return charts;
}

function renderChartSvg(chart) {
  const w = 400;
  const h = 240;
  if (chart.type === 'pie' && chart.series[0]) {
    const vals = chart.series[0].values;
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    let angle = 0;
    const colors = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5'];
    let paths = '';
    vals.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      const x1 = w / 2 + (w / 2 - 10) * Math.cos(angle);
      const y1 = h / 2 + (h / 2 - 10) * Math.sin(angle);
      angle += slice;
      const x2 = w / 2 + (w / 2 - 10) * Math.cos(angle);
      const y2 = h / 2 + (h / 2 - 10) * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      paths += `<path d="M${w / 2},${h / 2} L${x1},${y1} A${w / 2 - 10},${h / 2 - 10} 0 ${large} 1 ${x2},${y2} Z" fill="${colors[i % colors.length]}"/>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
  }

  if ((chart.type === 'bar' || chart.type === 'line') && chart.series[0]) {
    const vals = chart.series[0].values;
    const max = Math.max(...vals, 1);
    const barW = w / (vals.length * 1.5);
    let bars = '';
    vals.forEach((v, i) => {
      const bh = (v / max) * (h - 30);
      const x = i * barW * 1.5 + 20;
      bars += `<rect x="${x}" y="${h - bh - 10}" width="${barW}" height="${bh}" fill="#4472C4"/>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
  }

  return null;
}

module.exports = { extractSlideCharts, renderChartSvg, detectChartType, findChartFiles };
