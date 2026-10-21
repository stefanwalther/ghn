import { afterEach, describe, expect, test } from "vitest";
import { copyText } from "@/lib/clipboard";

interface FakeArea {
  value: string;
  style: { position: string; opacity: string };
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  select(): void;
}

interface FakeDocumentState {
  area: FakeArea | null;
  createdTag: string | null;
  appended: FakeArea | null;
  removed: FakeArea | null;
  selected: boolean;
  execCalls: number;
  execCommand: string | null;
}

interface FakeDocumentOptions {
  /** What `document.execCommand("copy")` returns. */
  execResult?: boolean;
  /** Makes `document.execCommand` throw instead of returning. */
  execThrows?: boolean;
  /** Makes `document.createElement` throw instead of returning. */
  createThrows?: boolean;
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function restoreGlobal(name: string, original: PropertyDescriptor | undefined): void {
  if (original) {
    Object.defineProperty(globalThis, name, original);
  } else {
    delete (globalThis as unknown as Record<string, unknown>)[name];
  }
}

function fakeDocument(options: FakeDocumentOptions = {}): {
  document: unknown;
  state: FakeDocumentState;
} {
  const state: FakeDocumentState = {
    area: null,
    createdTag: null,
    appended: null,
    removed: null,
    selected: false,
    execCalls: 0,
    execCommand: null,
  };

  const document = {
    createElement(tag: string): FakeArea {
      if (options.createThrows) throw new Error("no document");
      state.createdTag = tag;
      const area: FakeArea = {
        value: "",
        style: { position: "", opacity: "" },
        attributes: {},
        setAttribute(name: string, value: string) {
          area.attributes[name] = value;
        },
        select() {
          state.selected = true;
        },
      };
      state.area = area;
      return area;
    },
    body: {
      appendChild(node: FakeArea) {
        state.appended = node;
      },
      removeChild(node: FakeArea) {
        state.removed = node;
      },
    },
    execCommand(command: string): boolean {
      state.execCalls += 1;
      state.execCommand = command;
      if (options.execThrows) throw new Error("copy refused");
      return options.execResult ?? true;
    },
  };

  return { document, state };
}

afterEach(() => {
  restoreGlobal("navigator", originalNavigator);
  restoreGlobal("document", originalDocument);
});

describe("copyText", () => {
  // The modern clipboard API is the only path that works without a user
  // gesture on a secure origin, so it is the one that must be used when the
  // browser offers it.
  test("the async clipboard API is used when the browser has one", async () => {
    const written: string[] = [];
    setGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    const { document, state } = fakeDocument();
    setGlobal("document", document);

    await expect(copyText("https://github.com/acme/web/pull/12")).resolves.toBe(true);
    expect(written).toEqual(["https://github.com/acme/web/pull/12"]);
    expect(state.execCalls).toBe(0);
  });

  // Without the async API the legacy path has to copy the text through a
  // hidden textarea and select it.
  test("the legacy fallback copies through a hidden textarea", async () => {
    setGlobal("navigator", {});
    const { document, state } = fakeDocument();
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(true);
    expect(state.execCalls).toBe(1);
    expect(state.execCommand).toBe("copy");
    expect(state.createdTag).toBe("textarea");
    expect(state.area?.value).toBe("copy me");
    expect(state.area?.style.position).toBe("fixed");
    expect(state.area?.style.opacity).toBe("0");
    expect(state.area?.attributes.readonly).toBe("");
    expect(state.selected).toBe(true);
  });

  // The textarea is only a vehicle for the selection, so it must not be
  // left behind in the page.
  test("the legacy fallback removes the textarea from the page", async () => {
    setGlobal("navigator", {});
    const { document, state } = fakeDocument();
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(true);
    expect(state.appended).not.toBeNull();
    expect(state.removed).toBe(state.appended);
  });

  // The clipboard API can be refused, for example on a plain-http origin.
  // The legacy path is still allowed to save the copy.
  test("a refused clipboard API falls through to the legacy path", async () => {
    setGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("clipboard write refused");
        },
      },
    });
    const { document, state } = fakeDocument();
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(true);
    expect(state.execCalls).toBe(1);
    expect(state.area?.value).toBe("copy me");
  });

  // There is nothing to copy with when neither API exists, and the caller
  // has to be told so.
  test("without a clipboard and without a document the copy fails", async () => {
    setGlobal("navigator", {});
    restoreGlobal("document", originalDocument);

    await expect(copyText("copy me")).resolves.toBe(false);
  });

  // A copy command that reports failure means the text did not reach the
  // clipboard.
  test("a refused copy command reports failure", async () => {
    setGlobal("navigator", {});
    const { document, state } = fakeDocument({ execResult: false });
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(false);
    expect(state.execCalls).toBe(1);
  });

  // A throwing copy command is the same outcome as a refused one.
  test("a throwing copy command reports failure", async () => {
    setGlobal("navigator", {});
    const { document, state } = fakeDocument({ execThrows: true });
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(false);
    expect(state.execCalls).toBe(1);
  });

  // The textarea is only a vehicle for the selection, so it must not be
  // left behind in the page, not even when the copy command throws.
  test("a throwing copy command still removes the textarea", async () => {
    setGlobal("navigator", {});
    const { document, state } = fakeDocument({ execThrows: true });
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(false);
    expect(state.appended).not.toBeNull();
    expect(state.removed).toBe(state.appended);
  });

  // A document that cannot even be created has no copy path either.
  test("a document that cannot create an element reports failure", async () => {
    setGlobal("navigator", {});
    const { document } = fakeDocument({ createThrows: true });
    setGlobal("document", document);

    await expect(copyText("copy me")).resolves.toBe(false);
  });
});
