export async function resolve(specifier, context, next) {
  if (specifier === 'playwright' || specifier === 'playwright-core') return { url: new URL('./stub.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
