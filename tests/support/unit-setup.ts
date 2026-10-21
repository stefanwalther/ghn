/**
 * The unit layer must not see a credential from the environment.
 *
 * The machine that runs the suite may have `GH_TOKEN` or `GITHUB_TOKEN`
 * exported, and the documented production variable is exactly that. Without
 * this setup the unit checks would read the ambient credential, the checks
 * that assert the local helper is consulted would fail, and a real token
 * would be sitting in the test process.
 *
 * The checks that need a credential set one themselves.
 */
for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GHN_TOKEN"]) {
  delete process.env[key];
}
