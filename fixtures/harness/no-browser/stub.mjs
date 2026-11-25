// A stand-in for the browser package that imports cleanly and cannot launch: the state a machine
// is in after `npm ci` and before `npx playwright install chromium`. no-browser.test.mjs routes
// `import 'playwright'` here with a module-resolve hook.
const launch = async () => { throw new Error("browserType.launch: Executable doesn't exist at /nowhere/chromium (stand-in)"); };
const type = { launch, launchPersistentContext: launch, executablePath: () => '/nowhere/chromium', name: () => 'chromium' };
export const chromium = type;
export const firefox = type;
export const webkit = type;
export default { chromium, firefox, webkit };
