// The browser package is not installed at all: resolving it fails the way Node fails a missing package.
export async function resolve(specifier, context, next) {
  if (specifier === 'playwright' || specifier === 'playwright-core') {
    const err = new Error(`Cannot find package '${specifier}' imported from ${context.parentURL}`);
    err.code = 'ERR_MODULE_NOT_FOUND';
    throw err;
  }
  return next(specifier, context);
}
