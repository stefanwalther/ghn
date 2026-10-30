import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { VersionIndicator } from "@/components/version-indicator";
import {
  DOCKER_UPDATE_COMMANDS,
  SOURCE_UPDATE_COMMANDS,
} from "@/components/update-popover";
import { APP_VERSION } from "@/lib/app-meta";

const UPDATE = {
  current: APP_VERSION,
  latest: "9.9.9",
  updateAvailable: true,
  releaseUrl: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9",
};

const CURRENT = {
  current: APP_VERSION,
  latest: APP_VERSION,
  updateAvailable: false,
  releaseUrl: "https://github.com/stefanwalther/ghn/releases",
};

function stubVersion(payload: unknown, ok = true) {
  const fetchMock = vi.fn(async () =>
    ok ? Response.json(payload) : new Response("nope", { status: 500 })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VersionIndicator", () => {
  test("shows the running version when there is no update", async () => {
    stubVersion(CURRENT);

    render(<VersionIndicator />);

    expect(await screen.findByText(`v${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("stays quiet on load and opens the popover from the badge", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);

    await screen.findByRole("button", { name: /new ghn version/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new ghn version/i }));
    const dialog = await screen.findByRole("dialog", { name: "Update available" });
    expect(dialog.textContent).toContain(`This install runs v${APP_VERSION}.`);
    const blocks = dialog.querySelectorAll("pre");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.textContent).toBe(SOURCE_UPDATE_COMMANDS);
    expect(blocks[1]?.textContent).toBe(DOCKER_UPDATE_COMMANDS);
    expect(
      within(dialog).getByRole("link", { name: "View release notes for v9.9.9" })
    ).toHaveAttribute(
      "href",
      "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9"
    );
  });

  test("keeps the badge so the dialog can be revisited", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);

    await screen.findByText(`v${APP_VERSION}`);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The badge stays so the dialog can be reopened.
    expect(
      screen.getByRole("button", { name: /new ghn version/i })
    ).toBeInTheDocument();
  });

  test("reopens the popover from the badge", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);

    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );

    expect(
      await screen.findByRole("dialog", { name: "Update available" })
    ).toBeInTheDocument();
  });

  test("dismissing closes without recording anything", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    const dialog = await screen.findByRole("dialog", { name: "Update available" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(localStorage.getItem("ghn:update-seen")).toBeNull();
  });

  test("closes on backdrop click and stays open on content click", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    const dialog = await screen.findByRole("dialog", { name: "Update available" });

    fireEvent.click(within(dialog).getByText(/This install runs/));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("update-backdrop"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("anchors the popover above the sidebar badge", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    const dialog = await screen.findByRole("dialog", { name: "Update available" });

    expect(dialog).toHaveClass("absolute", "bottom-16", "left-4");
  });

  test("portals the backdrop to document.body so sidebar stacking cannot trap it", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    await screen.findByRole("dialog", { name: "Update available" });

    // The popover renders inside the sticky app sidebar. Without the
    // portal, the fixed backdrop stays in the sidebar stacking context
    // and sibling main-column rows paint over the dialog.
    expect(screen.getByTestId("update-backdrop").parentElement).toBe(
      document.body
    );
  });

  test("closes on Escape", async () => {

    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    await screen.findByRole("dialog", { name: "Update available" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("closes from the X button", async () => {
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    const dialog = await screen.findByRole("dialog", { name: "Update available" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Close update dialog" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("copies the source commands", async () => {
    const writeText = stubClipboard();
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    const dialog = await screen.findByRole("dialog", { name: "Update available" });

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Copy" })[0]!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(SOURCE_UPDATE_COMMANDS);
    });
    expect(await within(dialog).findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  test("copies the docker commands", async () => {
    const writeText = stubClipboard();
    stubVersion(UPDATE);

    render(<VersionIndicator />);
    fireEvent.click(
      await screen.findByRole("button", { name: /new ghn version/i })
    );
    const dialog = await screen.findByRole("dialog", { name: "Update available" });

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Copy" })[1]!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(DOCKER_UPDATE_COMMANDS);
    });
  });

  test("stays on the plain version when the check fails", async () => {
    stubVersion(null, false);

    render(<VersionIndicator />);

    await waitFor(() => {
      expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
