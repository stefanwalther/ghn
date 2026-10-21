import { describe, expect, test } from "vitest";
import { isEditableTarget } from "@/lib/shortcuts";

describe("the editable target", () => {
  // A target that cannot answer is not editable, and asking it must not
  // throw.
  test("a target whose closest throws is not editable", () => {
    const target = {
      closest() {
        throw new Error("detached element");
      },
    } as unknown as EventTarget;
    expect(() => isEditableTarget(target)).not.toThrow();
    expect(isEditableTarget(target)).toBe(false);
  });

  // A target that answers with an input, a textarea or a select is
  // editable.
  test("a form field is editable", () => {
    const target = {
      closest: (selector: string) =>
        selector.includes("input") ? ({} as unknown) : null,
    } as unknown as EventTarget;
    expect(isEditableTarget(target)).toBe(true);
  });
});
