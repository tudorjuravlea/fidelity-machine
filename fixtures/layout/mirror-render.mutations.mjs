// Planted breaks for the mirrored render's place in render.mjs (fixtures/layout/mirror.test.mjs).
//   node scripts/mutation-run.mjs fixtures/layout/mirror-render.mutations.mjs
export default {
  target: 'scripts/render.mjs',
  copy: ['scripts', 'fixtures/layout', 'package.json'],
  test: ['node', '--test', 'fixtures/layout/mirror.test.mjs'],
  mutations: [
    { name: 'the lock\'s own locales are not consulted', find: 'mirrorLocale(screen.locales ?? lock.content?.locales)', replace: 'mirrorLocale(screen.locales)' },
    { name: 'no screen is ever mirrored', find: '    if (rtlLocale) {', replace: '    if (false) {' },
    { name: 'every screen is mirrored', find: '    if (rtlLocale) {', replace: '    if (true) {' },
    { name: 'the findings do not reach the dump', find: '      layoutAudit.findings.push(...mirrored.findings);\n', replace: '' },
    { name: 'what it cannot see does not reach the dump', find: '      layoutAudit.manual.push(...mirrored.manual);\n', replace: '' },
    { name: 'the count of what was mirrored does not reach the dump', find: '      layoutAudit.checked.mirrored = mirrored.checked.mirrored;\n', replace: '' },
  ],
};
