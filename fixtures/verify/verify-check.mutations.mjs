// Planted breaks for verify.mjs --check (does the last verdict still stand?).
//   node scripts/mutation-run.mjs fixtures/verify/verify-check.mutations.mjs
// The suite named below must fail for every one. A break that no longer applies fails the run.
export default {
  "target": "scripts/verify.mjs",
  "copy": [
    "scripts",
    "fixtures/verify"
  ],
  "test": [
    "node",
    "--test",
    "fixtures/verify/verify-check.test.mjs"
  ],
  "mutations": [
    {
      "name": "check: the lock is not evidence",
      "find": "      ...(was.lock !== now.lock ? ['the lock'] : []),\n",
      "replace": ""
    },
    {
      "name": "check: the reference image is not evidence",
      "find": "      ...(was.reference !== now.reference ? ['the reference image'] : []),\n",
      "replace": ""
    },
    {
      "name": "check: the gate scripts are not evidence",
      "find": "      ...(was.engine !== now.engine ? ['the gate scripts'] : []),\n",
      "replace": ""
    },
    {
      "name": "check: changed files not noticed",
      "find": "      else if (was.tree[name] !== now.tree[name]) changed.push(name);",
      "replace": ""
    },
    {
      "name": "check: added files not noticed",
      "find": "      else if (!(name in (was.tree ?? {}))) added.push(name);",
      "replace": "      else if (!(name in (was.tree ?? {}))) continue;"
    },
    {
      "name": "check: removed files not noticed",
      "find": "      if (!(name in now.tree)) removed.push(name);\n      else if (!(name in (was.tree ?? {}))) added.push(name);",
      "replace": "      if (!(name in now.tree)) continue;\n      else if (!(name in (was.tree ?? {}))) added.push(name);"
    },
    {
      "name": "check: other screens' pages counted as this screen's evidence",
      "find": "    if (s.id !== screen.id && typeof s.url === 'string') others.add(rel(path.resolve(lockDir, s.url.split(/[?#]/)[0])));\n",
      "replace": ""
    },
    {
      "name": "check: the report folder counted as evidence",
      "find": "      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;",
      "replace": "      if (entry.name === 'node_modules') continue;"
    },
    {
      "name": "check: a stale verdict reported as it was",
      "find": "    if (why.length) {\n      open++;",
      "replace": "    if (false) {\n      open++;"
    },
    {
      "name": "check: a standing fail reported as fresh",
      "find": "    } else if (stored.status === 'pass') {",
      "replace": "    } else if (stored.status !== 'inconclusive') {"
    },
    {
      "name": "check: a standing fail exits 6",
      "find": "  const code = failing ? 1 : open ? 6 : 0;",
      "replace": "  const code = failing || open ? 6 : 0;"
    },
    {
      "name": "check: anything exits 0",
      "find": "  const code = failing ? 1 : open ? 6 : 0;",
      "replace": "  const code = 0;"
    },
    {
      "name": "check: an unmeasured screen exits 0",
      "find": "      open++;\n      console.log(`UNMEASURED ",
      "replace": "      console.log(`UNMEASURED "
    },
    {
      "name": "check: an inconclusive verdict counted as a pass",
      "find": "    } else if (stored.status === 'inconclusive') {\n      open++;",
      "replace": "    } else if (stored.status === 'inconclusive') {"
    },
    {
      "name": "verify: no verdict file written",
      "find": "    fs.writeFileSync(verdictPath(reportDir, id), JSON.stringify({ tool: 'verify.mjs', screen: id, status: sr.status, evidence: evidence[id] }, null, 2) + '\\n');",
      "replace": ""
    },
    {
      "name": "verify: every verdict stored as pass",
      "find": "status: sr.status, evidence: evidence[id] }",
      "replace": "status: 'pass', evidence: evidence[id] }"
    },
    {
      "name": "check: runs the gates anyway",
      "find": "if (args.check) {\n  checkScreens({ lockPath, lockDir, lock, screens });\n} else if (args.calibrate) {",
      "replace": "if (args.calibrate) {"
    },
    {
      "name": "check: combined with --calibrate allowed",
      "find": "  if (args.check && args.calibrate) die(2, '--check reads the last verdict and --calibrate writes the lock: one at a time');\n",
      "replace": ""
    },
    {
      "name": "check: file names not listed",
      "find": "...some('changed', changed), ...some('added', added), ...some('removed', removed),",
      "replace": "...(changed.length + added.length + removed.length ? ['files'] : []),"
    }
  ]
};
