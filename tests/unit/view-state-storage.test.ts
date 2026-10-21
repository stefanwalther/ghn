import { afterEach, describe, expect, test } from "vitest";
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  loadDrawerWidth,
  loadLastOpened,
  saveDrawerWidth,
  saveLastOpened,
} from "@/lib/view-state";

const originalSessionStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage"
);
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

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

afterEach(() => {
  restoreGlobal("sessionStorage", originalSessionStorage);
  restoreGlobal("localStorage", originalLocalStorage);
});

describe("the last opened thread", () => {
  // The inbox reopens the thread that was open last, so the id is kept in
  // the session storage.
  test("the last opened thread is remembered", () => {
    setGlobal("sessionStorage", fakeStorage());
    saveLastOpened("thread-42");
    expect(loadLastOpened()).toBe("thread-42");
  });

  // Before the first thread is opened there is nothing to reopen.
  test("nothing is remembered before the first thread is opened", () => {
    setGlobal("sessionStorage", fakeStorage());
    expect(loadLastOpened()).toBeNull();
  });

  // A session storage that refuses the write must not break the inbox.
  test("a session storage that refuses the write does not break the caller", () => {
    setGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("private mode");
      },
    });
    expect(() => saveLastOpened("thread-42")).not.toThrow();
  });

  // A session storage that refuses the read means there is no last thread.
  test("a session storage that refuses the read yields no thread", () => {
    setGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {},
    });
    expect(loadLastOpened()).toBeNull();
  });
});

describe("the stored drawer width", () => {
  // The drawer keeps its width between visits.
  test("the drawer width is remembered", () => {
    setGlobal("localStorage", fakeStorage());
    saveDrawerWidth(700);
    expect(loadDrawerWidth()).toBe(700);
  });

  // A width that is outside the allowed range is clamped on the way out.
  test("a width outside the allowed range is clamped", () => {
    setGlobal("localStorage", fakeStorage());
    saveDrawerWidth(99999);
    expect(loadDrawerWidth()).toBe(DRAWER_MAX_WIDTH);
  });

  // Without a stored width the drawer opens at its default.
  test("without a stored width the default is used", () => {
    setGlobal("localStorage", fakeStorage());
    expect(loadDrawerWidth()).toBe(DRAWER_DEFAULT_WIDTH);
  });

  // A stored value that is not a number cannot be used, so the default is
  // used instead.
  test("a stored width that is not a number falls back to the default", () => {
    setGlobal("localStorage", fakeStorage());
    localStorage.setItem("ghn:drawer-width", "wide");
    expect(loadDrawerWidth()).toBe(DRAWER_DEFAULT_WIDTH);
  });

  // A local storage that refuses the write must not break the inbox.
  test("a local storage that refuses the write does not break the caller", () => {
    setGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("private mode");
      },
    });
    expect(() => saveDrawerWidth(700)).not.toThrow();
  });
});
