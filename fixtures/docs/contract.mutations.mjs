// Planted breaks for fixtures/docs/doc-claims.test.mjs, in CONTRACT.md.
//   node scripts/mutation-run.mjs fixtures/docs/contract.mutations.mjs
import readme from './readme.mutations.mjs';

export default {
  target: 'CONTRACT.md',
  copy: readme.copy,
  test: readme.test,
  mutations: [
    { name: 'the diagram loses a folder that is in the tree', find: '├── fixtures/layout/', replace: '├── fixtures/layouts/' },
    { name: 'the diagram loses a top-level folder', find: '├── docs/  ', replace: '├── more/  ' },
    { name: 'the diagram loses a reference', find: '├── eval-harness.md', replace: '├── eval-harnes.md' },
    { name: 'the loop cap moves and the README does not', find: '4 rounds', replace: '5 rounds' },
    { name: 'the three-gate ordering has two numbered gates', find: '3. **Geometry + pixel gates**', replace: '- **Geometry + pixel gates**' },
    { name: 'the exit-code table loses the code the README explains', find: '| 2 | setup/usage error', replace: '| 8 | setup/usage error' },
    { name: 'a command for a script that is not there', find: 'node ~/.claude/fidelity-machine/scripts/new-system.mjs --name', replace: 'node ~/.claude/fidelity-machine/scripts/new-systems.mjs --name' },
  ],
};
