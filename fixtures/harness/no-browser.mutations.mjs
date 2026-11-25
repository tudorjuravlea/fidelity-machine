// Planted breaks for how render.mjs fails without the browser package.
//   node scripts/mutation-run.mjs fixtures/harness/no-browser.mutations.mjs
// The suite named below must fail for every one. A break that no longer applies fails the run.
export default {
  "target": "scripts/render.mjs",
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
    "fixtures/harness/no-browser.test.mjs"
  ],
  "mutations": [
    {
      "name": "render: a missing package exits 1",
      "find": "Run scripts/setup-check.mjs for the install command.`);\n  process.exit(2);",
      "replace": "Run scripts/setup-check.mjs for the install command.`);\n  process.exit(1);"
    },
    {
      "name": "render: a missing package is rethrown",
      "find": "} catch (err) {\n  console.error(`render.mjs: exit 2 (setup/usage error): the browser package is not installed",
      "replace": "} catch (err) {\n  throw err;\n  console.error(`render.mjs: exit 2 (setup/usage error): the browser package is not installed"
    },
    {
      "name": "render: the message does not say where to look",
      "find": "Run scripts/setup-check.mjs for the install command.`);\n  process.exit(2);",
      "replace": "`);\n  process.exit(2);"
    }
  ]
};
