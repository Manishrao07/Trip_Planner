/**
 * Lets the test files use the same extensionless imports as the app.
 *
 * Next/webpack resolves `./schema` to `schema.ts` automatically; raw Node ESM
 * does not. Rather than adding a transpiler dependency just to run tests — or
 * littering the app source with `.ts` extensions to suit the test runner — this
 * hook retries a failed relative resolution with `.ts` appended.
 *
 * Node strips the types itself, so there is no build step.
 */

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

    if (isRelative && !hasExtension) {
      try {
        return nextResolve(specifier, context);
      } catch {
        return nextResolve(`${specifier}.ts`, context);
      }
    }

    return nextResolve(specifier, context);
  },
});
