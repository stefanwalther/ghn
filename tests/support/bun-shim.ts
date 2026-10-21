/**
 * A stand-in for the Bun runtime module.
 *
 * The application reaches the local credential helper through
 * `await import("bun")`, which only resolves inside Bun. The test suite
 * runs on Node, so the import is aliased to this module.
 *
 * The helper is deliberately unreachable here. The suite must never ask the
 * machine for a credential, and a check that needs one passes it in
 * explicitly instead.
 */
export const $ = (): never => {
  throw new Error("the Bun shell is not available in the test suite");
};
