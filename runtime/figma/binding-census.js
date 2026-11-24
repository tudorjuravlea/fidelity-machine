// binding-census.js — how much of a component sheet is bound to styles and variables, and what the raw values are.
// Paste this whole file into the Figma MCP's use_figma. Read-only (CONTRACT.md §Plugin-sandbox scripts).
// Contract: runtime/figma/README.md. Output: { scope, totals, rawColours, rawNumbers, worst, nodes, truncated, notes }.
// The per-property checks follow the post-write audit in claude2figma (Sen Lin, MIT; NOTICE), turned from a
// pass/fail on the agent's own nodes into a census of the design system's masters.
//
// Input, one constant: NODE_IDS, the nodes to walk ([] = every COMPONENT and COMPONENT_SET on the current page,
// descendants included). One page per call.
const NODE_IDS = [];
const CAP = 4000; // nodes judged; past it, truncated: true

const out = { scope: null, totals: {}, rawColours: {}, rawNumbers: {}, worst: [], nodes: 0, truncated: false, notes: [] };
const classes = ['text', 'fill', 'stroke', 'effect', 'padding', 'gap', 'radius'];
for (const k of classes) out.totals[k] = { bound: 0, raw: 0 };
const h2 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0').toUpperCase();
const hex = (rgb, a) => `#${h2(rgb.r)}${h2(rgb.g)}${h2(rgb.b)}${a < 1 ? h2(a) : ''}`;
const count = (map, key) => { map[key] = (map[key] || 0) + 1; };
const isStr = (v) => typeof v === 'string' && v.length > 0;

let roots = [];
if (NODE_IDS.length > 0) {
  for (const id of NODE_IDS) {
    const n = await figma.getNodeByIdAsync(id);
    if (n) roots.push(n); else out.notes.push(`"${id}": no such node`);
  }
  out.scope = { nodeIds: NODE_IDS, page: figma.currentPage.name };
} else {
  roots = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] }).filter((n) => !(n.parent && n.parent.type === 'COMPONENT_SET'));
  out.scope = { page: figma.currentPage.name, masters: roots.length };
}

const judge = (n) => {
  const bv = n.boundVariables || {};
  const raw = [];
  const mark = (cls, bound, rawLabel) => { out.totals[cls][bound ? 'bound' : 'raw']++; if (!bound) raw.push(rawLabel || cls); };
  if (n.type === 'TEXT') {
    const bound = isStr(n.textStyleId) || ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle'].some((f) => Array.isArray(bv[f]) ? bv[f].length > 0 : !!bv[f]);
    mark('text', bound, 'text');
  }
  if ('fills' in n && Array.isArray(n.fills)) {
    const solids = n.fills.filter((p) => p.visible !== false && p.type === 'SOLID');
    if (solids.length > 0) {
      const bound = isStr(n.fillStyleId) || (Array.isArray(bv.fills) && bv.fills.length > 0) || solids.every((p) => p.boundVariables && p.boundVariables.color);
      mark('fill', bound, 'fill');
      if (!bound) for (const p of solids) if (!(p.boundVariables && p.boundVariables.color)) count(out.rawColours, hex(p.color, typeof p.opacity === 'number' ? p.opacity : 1));
    }
  }
  if ('strokes' in n && Array.isArray(n.strokes)) {
    const solids = n.strokes.filter((p) => p.visible !== false && p.type === 'SOLID');
    if (solids.length > 0) {
      const bound = isStr(n.strokeStyleId) || (Array.isArray(bv.strokes) && bv.strokes.length > 0) || solids.every((p) => p.boundVariables && p.boundVariables.color);
      mark('stroke', bound, 'stroke');
      if (!bound) for (const p of solids) if (!(p.boundVariables && p.boundVariables.color)) count(out.rawColours, hex(p.color, typeof p.opacity === 'number' ? p.opacity : 1));
    }
  }
  if ('effects' in n && Array.isArray(n.effects) && n.effects.some((e) => e.visible !== false)) {
    mark('effect', isStr(n.effectStyleId) || (Array.isArray(bv.effects) && bv.effects.length > 0), 'effect');
  }
  if ('layoutMode' in n && n.layoutMode && n.layoutMode !== 'NONE') {
    for (const p of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
      if (typeof n[p] === 'number' && n[p] > 0) { const b = !!bv[p]; mark('padding', b, p); if (!b) count(out.rawNumbers, `padding:${n[p]}`); }
    }
    if (typeof n.itemSpacing === 'number' && n.itemSpacing > 0) { const b = !!bv.itemSpacing; mark('gap', b, 'itemSpacing'); if (!b) count(out.rawNumbers, `gap:${n.itemSpacing}`); }
  }
  if ('cornerRadius' in n && typeof n.cornerRadius === 'number' && n.cornerRadius > 0) {
    const b = !!bv.cornerRadius || ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].every((k) => !!bv[k]);
    mark('radius', b, 'cornerRadius'); if (!b) count(out.rawNumbers, `radius:${n.cornerRadius}`);
  }
  return raw;
};

const seen = new Set();
for (const root of roots) {
  const nodes = [root].concat('findAll' in root ? root.findAll() : []);
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (out.nodes >= CAP) { out.truncated = true; break; }
    out.nodes++;
    const raw = judge(n);
    if (raw.length > 0) out.worst.push({ id: n.id, name: n.name, type: n.type, raw });
  }
  if (out.truncated) break;
}
out.worst.sort((a, b) => b.raw.length - a.raw.length);
out.worst = out.worst.slice(0, 40);
const sum = classes.reduce((acc, k) => ({ bound: acc.bound + out.totals[k].bound, raw: acc.raw + out.totals[k].raw }), { bound: 0, raw: 0 });
out.notes.push(`${out.nodes} node(s) judged${out.truncated ? ` (cut at ${CAP})` : ''}: ${sum.bound} bound, ${sum.raw} raw across ${classes.length} property classes`);
return out;
