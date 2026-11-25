// Planted breaks for fixtures/docs/doc-claims.test.mjs, in the README: one false sentence each.
//   node scripts/mutation-run.mjs fixtures/docs/readme.mutations.mjs
const COPY = ['README.md', 'CONTRACT.md', 'CONTRIBUTING.md', 'FAQ.md', 'GUIDE.md', 'RELEASING.md', 'SECURITY.md', 'skill-template.md',
  'LICENSE', 'NOTICE', 'package.json', 'package-lock.json', 'design-lock.schema.json', '.github', 'docs', 'fixtures', 'references', 'runtime', 'scripts', 'skill-scaffold'];

export default {
  target: 'README.md',
  copy: COPY,
  test: ['node', '--test', 'fixtures/docs/doc-claims.test.mjs'],
  mutations: [
    { name: 'a count that is wrong: four rules', find: 'three rules', replace: 'four rules' },
    { name: 'a count that is wrong: five rounds', find: 'four rounds', replace: 'five rounds' },
    { name: 'a count nobody measures', find: 'Thresholds are law:', replace: 'Thresholds are law across nine gates:' },
    { name: 'a command for a script that is not there', find: 'node scripts/release-check.mjs', replace: 'node scripts/release-checks.mjs' },
    { name: 'a flag the script does not know', find: '--calibrate', replace: '--calibration', count: 2 },
    { name: 'a path that is not there', find: 'references/behavior-kit.md', replace: 'references/behaviour-kit.md' },
    { name: 'a root document that is not there', find: '`CONTRIBUTING.md`', replace: '`CONTRIBUTORS.md`' },
    { name: 'a gap in the steps', find: '### Step 5:', replace: '### Step 9:' },
    { name: 'a Node floor setup-check does not enforce', find: 'Node.js version 20 or later', replace: 'Node.js version 18 or later' },
    { name: 'an exit code the contract does not have', find: '`2` = a setup', replace: '`9` = a setup' },
    { name: 'three exit codes with no pointer to the rest', find: ' The full contract is in `CONTRACT.md`.', replace: '' },
    { name: 'the gates in an order verify does not run', find: 'content and compliance lint, then structured self-critique (including the brand-transplant test), then the geometry gate,', replace: 'the geometry gate, then structured self-critique (including the brand-transplant test), then content and compliance lint,' },
  ],
};
