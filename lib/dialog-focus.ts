import * as React from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * When focus was inside a transient popup (such as a filter dropdown) that
 * closes and unmounts as the modal takes focus, locate the trigger controlling
 * that popup so closing the modal can still return focus to a connected control.
 */
function findPopupTrigger(
  opener: HTMLElement | null,
  dialogRoot: HTMLElement
): HTMLElement | null {
  const popup = opener?.closest<HTMLElement>('[role="dialog"][id], [role="menu"][id]');
  if (!popup || popup === dialogRoot || !popup.id) return null;
  for (const control of document.querySelectorAll<HTMLElement>("[aria-controls]")) {
    const controlledIds = control.getAttribute("aria-controls")?.split(/\s+/) ?? [];
    if (controlledIds.includes(popup.id)) return control;
  }
  return null;
}

/**
 * Dialog focus contract shared by every overlay: when `active`, focus the
 * `[data-autofocus]` element (or the first input, or the root itself), trap
 * Tab inside the root, and return focus to the previously focused element
 * (or its controlling popup trigger if the opener unmounted) when the dialog
 * closes or unmounts.
 */
export function useDialogFocus(
  rootRef: React.RefObject<HTMLElement | null>,
  active: boolean = true
) {
  React.useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const node: HTMLElement = root;
    const prev = document.activeElement as HTMLElement | null;
    const fallback = findPopupTrigger(prev, node);
    const target =
      node.querySelector<HTMLElement>("[data-autofocus]") ??
      node.querySelector<HTMLElement>("input") ??
      node;
    const raf = requestAnimationFrame(() => {
      if (document.contains(target)) target.focus({ preventScroll: true });
    });
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const all = [...node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const visible = all.filter((el) => el.offsetParent !== null);
      const scope = visible.length > 0 ? visible : all;
      if (scope.length === 0) {
        e.preventDefault();
        return;
      }
      const first = scope[0];
      const last = scope[scope.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    node.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("keydown", onKeyDown);
      const restoreTarget =
        prev && document.contains(prev)
          ? prev
          : fallback && document.contains(fallback)
            ? fallback
            : null;
      if (restoreTarget) {
        try {
          restoreTarget.focus({ preventScroll: true });
        } catch {
          // A removed or unfocusable opener must not break dialog close.
        }
      }
    };
  }, [active, rootRef]);
}
