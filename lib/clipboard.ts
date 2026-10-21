export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (e.g. plain-http LAN origins where
    // the async clipboard API is unavailable).
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    try {
      area.select();
      return document.execCommand("copy");
    } finally {
      // The textarea has to go even when the copy command throws, or it
      // stays in the document until the page reloads.
      document.body.removeChild(area);
    }
  } catch {
    return false;
  }
}
