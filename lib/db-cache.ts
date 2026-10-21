/**
 * A handle that is cached per resolved path.
 *
 * The path is the key, so a changed location can never hand back a handle to
 * a different file. The production client and the test client both use it,
 * so the invariant is covered even though only one of them can run on a
 * given runtime.
 */
export class PathCache<T> {
  private value: T | undefined;
  private path: string | undefined;

  /** The cached handle for the path, creating it when the path changed. */
  get(path: string, create: () => T): T {
    if (this.value !== undefined && this.path === path) return this.value;
    const next = create();
    this.value = next;
    this.path = path;
    return next;
  }

  /**
   * Adopt a handle that was created elsewhere.
   *
   * The production client keeps its handle on the global object so it
   * survives a module reload, which is what a development server does.
   */
  adopt(path: string, value: T): void {
    this.value = value;
    this.path = path;
  }
}
