// Planted breaks for how eval-correction.mjs refuses input files that are not there.
//   node scripts/mutation-run.mjs fixtures/harness/missing-input.mutations.mjs
// The suite named below must fail for every one. A break that no longer applies fails the run.
export default {
  "target": "scripts/eval-correction.mjs",
  "copy": [
    "scripts",
    "fixtures/harness",
    "fixtures/golden",
    "fixtures/motion",
    "design-lock.schema.json",
    "package.json"
  ],
  "test": [
    "node",
    "--test",
    "fixtures/harness/missing-input.test.mjs"
  ],
  "mutations": [
    {
      "name": "eval-correction: input files not checked before the model preflight",
      "find": "    if (!fs.existsSync(path.resolve(file))) fail2(`${flag} file not found: ${path.resolve(file)}`);",
      "replace": ""
    },
    {
      "name": "eval-correction: the missing path not named",
      "find": "fail2(`${flag} file not found: ${path.resolve(file)}`);",
      "replace": "fail2(`${flag} file not found`);"
    }
  ]
};
