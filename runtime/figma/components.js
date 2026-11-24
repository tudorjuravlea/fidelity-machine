// components.js — one page's component sets and solo components, by id and name, as a capture.json fragment.
// Paste this whole file into the Figma MCP's use_figma. Read-only (CONTRACT.md §Plugin-sandbox scripts).
// Contract: runtime/figma/README.md. Output: { page, sets, solos, truncated, notes }.
//
// Input, one constant: PAGE_ID, the page to read ('' = the current page). One page per call: the Plugin API
// loads a page's content only when it is current, and a use_figma call may switch pages once.
const PAGE_ID = '';
const CAP = 300; // entries per list; past it, truncated: true and the count

const out = { page: null, sets: [], solos: [], truncated: false, notes: [] };
let page = figma.currentPage;
if (PAGE_ID) {
  const p = await figma.getNodeByIdAsync(PAGE_ID);
  if (!p || p.type !== 'PAGE') { out.notes.push(`"${PAGE_ID}" is not a page in this file`); return out; }
  await figma.setCurrentPageAsync(p);
  page = p;
}
out.page = { id: page.id, name: page.name };

const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
const comps = page.findAllWithCriteria({ types: ['COMPONENT'] });
for (const s of sets) {
  if (out.sets.length >= CAP) { out.truncated = true; break; }
  const defs = s.componentPropertyDefinitions || {};
  out.sets.push({
    id: s.id, name: s.name, key: s.key, remote: !!s.remote,
    variants: s.children.length,
    properties: Object.keys(defs).map((k) => ({ name: k, type: defs[k].type, options: defs[k].variantOptions ? defs[k].variantOptions.slice(0, 24) : undefined })),
  });
}
for (const c of comps) {
  if (c.parent && c.parent.type === 'COMPONENT_SET') continue;
  if (out.solos.length >= CAP) { out.truncated = true; break; }
  out.solos.push({ id: c.id, name: c.name, key: c.key, remote: !!c.remote, width: c.width, height: c.height });
}
out.notes.push(`${sets.length} set(s), ${comps.length} component(s) on "${page.name}"${out.truncated ? ` — lists cut at ${CAP}` : ''}`);
return out;
