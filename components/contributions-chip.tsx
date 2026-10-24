import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface HeatDay {
  date: string;
  count: number;
}

// GitHub contribution-graph colors, light / dark, verified against the live
// primer stylesheets (bgColor-0..4 + borderColor-0).
const GITHUB_LEVELS = [
  "bg-[#eff2f5] dark:bg-[#151b23]",
  "bg-[#aceebb] dark:bg-[#033a16]",
  "bg-[#4ac26b] dark:bg-[#196c2e]",
  "bg-[#2da44e] dark:bg-[#2ea043]",
  "bg-[#116329] dark:bg-[#56d364]",
];

function levelClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return GITHUB_LEVELS[0];
  const ratio = count / max;
  if (ratio <= 0.25) return GITHUB_LEVELS[1];
  if (ratio <= 0.5) return GITHUB_LEVELS[2];
  if (ratio <= 0.75) return GITHUB_LEVELS[3];
  return GITHUB_LEVELS[4];
}

function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function monthLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short" });
}

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function ContributionsChip() {
  const [count, setCount] = React.useState<number | null>(null);
  const [login, setLogin] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<HeatDay[] | null>(null);
  const [loadingDays, setLoadingDays] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // A click that immediately follows a hover-open must keep the overlay
  // open: the toggle would otherwise read open === true and close it in
  // the same interaction (touch taps can produce the same sequence when
  // the browser emits a compatibility mouseenter before click).
  const hoverOpened = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/contributions?date=${localToday()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.count === "number") setCount(data.count);
        if (typeof data.login === "string" && data.login) setLogin(data.login);
      })
      .catch(() => {
        // stay quiet when offline or unauthenticated
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDays = React.useCallback(() => {
    if (days || loadingDays) return;
    setLoadingDays(true);
    fetch("/api/contributions?days=180", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.days)) {
          setDays(
            data.days.filter(
              (d: unknown): d is HeatDay =>
                typeof (d as HeatDay)?.date === "string" &&
                typeof (d as HeatDay)?.count === "number"
            )
          );
          if (typeof data.login === "string" && data.login) setLogin(data.login);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDays(false));
  }, [days, loadingDays]);

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  React.useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  const showOverlay = () => {
    cancelClose();
    setOpen(true);
    loadDays();
  };

  const label = count === null ? "– today" : `${count} today`;
  const total = days?.reduce((sum, d) => sum + d.count, 0) ?? null;
  const max = days?.reduce((m, d) => Math.max(m, d.count), 0) ?? 0;
  const padStart = days && days.length > 0 ? weekdayOf(days[0].date) : 0;
  const colCount = days && days.length > 0 ? Math.ceil((padStart + days.length) / 7) : 0;
  const monthLabels: string[] = [];
  if (days && days.length > 0) {
    const colMonth: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const idx = c * 7 - padStart;
      const first = days[Math.max(0, Math.min(idx < 0 ? 0 : idx, days.length - 1))];
      colMonth.push(monthLabel(first.date));
    }
    const span = new Map<string, number>();
    for (const m of colMonth) span.set(m, (span.get(m) ?? 0) + 1);
    const lastMonth = colMonth[colMonth.length - 1];
    let prev = "";
    for (let c = 0; c < colCount; c++) {
      const m = colMonth[c];
      // Skip single-column leading months so adjacent labels never collide; the
      // date-range footer still shows the full window.
      const roomy = (span.get(m) ?? 0) >= 2 || m === lastMonth;
      monthLabels.push(m !== prev && roomy ? m : "");
      prev = m;
    }
  }

  const badge = (
    <Badge variant="muted">
      {label}
    </Badge>
  );

  // GitHub draws a 0.5px hairline inside every 11px cell so empty days read
  // as squares. Border-box keeps the cell at exactly 11px.
  const cellRing = "border-[0.5px] border-[#1f23280d] dark:border-[#0104090d]";

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);

  // Keyboard and touch users get an explicit toggle; hover still opens on
  // desktop. Escape closes and returns focus to the trigger, and a
  // pointer-down outside closes without stealing focus.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        !overlayRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open ]);

  const toggleOverlay = () => {
    const openedByHover = hoverOpened.current;
    hoverOpened.current = false;
    if (openedByHover && open) return;
    if (open) {
      cancelClose();
      setOpen(false);
    } else {
      showOverlay();
    }
  };

  const overlay = open ? (
    <div
      ref={overlayRef}
      role="region"
      aria-label="Contributions in the last 180 days"
      className="absolute top-full right-0 z-50 mt-2 w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 text-card-foreground shadow-md sm:w-[430px]"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">Last 180 days</span>
        {total !== null ? (
          <span className="shrink-0 text-xs text-muted-foreground">{total} contributions</span>
        ) : null}
      </div>
      {loadingDays && !days ? (
        <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
      ) : days && days.length > 0 ? (
        <>
          <div className="flex gap-1.5">
            <div className="grid w-7 shrink-0 grid-rows-7 gap-[3px] pt-[18px]" aria-hidden="true">
              {WEEKDAY_LABELS.map((w, i) => (
                <span
                  key={i}
                  className="flex h-[11px] items-center overflow-hidden text-[9px] text-muted-foreground"
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="min-w-0 overflow-x-auto">
              <div
                className="grid grid-flow-col gap-[3px] text-[9px] text-muted-foreground [grid-auto-columns:11px]"
                aria-hidden="true"
              >
                {monthLabels.map((m, i) => (
                  <span
                    key={i}
                    className="h-[15px] w-[11px] overflow-visible leading-[15px] whitespace-nowrap"
                  >
                    {m}
                  </span>
                ))}
              </div>
              <div className="grid grid-flow-col grid-rows-7 gap-[3px] [grid-auto-columns:11px]" aria-hidden="true">
                {Array.from({ length: padStart }).map((_, i) => (
                  <span key={`pad-${i}`} className="h-[11px] w-[11px]" />
                ))}
                {days.map((d) => {
                  const tip = `${shortDate(d.date)}: ${d.count} contribution${d.count === 1 ? "" : "s"}`;
                  return (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <span
                          data-day-cell={d.date}
                          className={`h-[11px] w-[11px] rounded-[2px] ${cellRing} ${levelClass(d.count, max)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">{tip}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {shortDate(days[0].date)} – {shortDate(days[days.length - 1].date)}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" aria-hidden="true">
              Less
              {GITHUB_LEVELS.map((cls) => (
                <span key={cls} className={`h-[11px] w-[11px] rounded-[2px] ${cellRing} ${cls}`} />
              ))}
              More
            </span>
          </div>
          {login ? (
            <a
              href={`https://github.com/${login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[11px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Full graph on github.com/{login}
            </a>
          ) : null}
        </>
      ) : (
        <div className="py-2 text-xs text-muted-foreground">
          Contributions unavailable (offline or not signed in).
        </div>
      )}
      {login && (!days || days.length === 0) ? (
        <a
          href={`https://github.com/${login}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Full graph on github.com/{login}
        </a>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        hoverOpened.current = true;
        showOverlay();
      }}
      onMouseLeave={() => {
        hoverOpened.current = false;
        scheduleClose();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOverlay}
        aria-expanded={open}
        aria-label={
          login
            ? `GitHub contributions for ${login}, ${label}. Activate to ${open ? "hide" : "show"} the 180-day graph.`
            : `GitHub contributions, ${label}. Activate for details.`
        }
        className="cursor-pointer rounded-md transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {badge}
      </button>
      {overlay}
    </div>
  );
}
