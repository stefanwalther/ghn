"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { HelpSidebar, type HelpTopic } from "@/components/help/help-sidebar";
import { Kbd } from "@/components/ui/kbd";
import { SHORTCUTS } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const TOPICS: HelpTopic[] = [
  { id: "search", label: "Universal search", blurb: "One box for threads, repos, and commands" },
  { id: "filtering", label: "Filtering the inbox", blurb: "Narrow the list or snooze a repository" },
  { id: "shortcuts", label: "Keyboard shortcuts", blurb: "Every shortcut, grouped by where it works" },
  { id: "digest", label: "Digest and snooze", blurb: "When each repository shows up again" },
  { id: "troubleshooting", label: "If something looks off", blurb: "What each banner means and what to do" },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-input bg-background px-1 py-0.5 font-mono text-xs whitespace-nowrap">
      {children}
    </code>
  );
}

function TipsList({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-2 text-sm leading-relaxed">{children}</ul>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="text-muted-foreground">→</span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

function SearchHelp() {
  return (
    <TipsList>
      <Tip>Hit <Kbd>⌘K</Kbd> from anywhere. The <Kbd>/</Kbd> key works too, as long as you are not typing.</Tip>
      <Tip><Kbd>Enter</Kbd> acts on the top hit. A thread opens in the preview drawer; selecting a repo filters the inbox to it.</Tip>
      <Tip>Hold <Kbd>⇧</Kbd> with <Kbd>Enter</Kbd> on a thread to filter the inbox to that thread&apos;s repository instead of opening it.</Tip>
      <Tip>The tabs above the results do the scoping without typing: All, Repos, Types, State, and Age. Typing <Code>repo:</Code>, <Code>type:</Code>, <Code>state:</Code>, or <Code>age:</Code> does the same.</Tip>
      <Tip>Not sure of the prefix? Type <Code>r</Code> and pick <Code>repo:</Code> from the suggestions. <Kbd>Enter</Kbd> completes it and you keep typing.</Tip>
      <Tip>Type <Code>filter</Code> to see Repository, Type, State, and Age, each showing its current value. Pick one to search by just that.</Tip>
      <Tip>See a <em>Filter repository list to …</em> row? That copies your query into the sidebar&apos;s repository filter and closes the palette.</Tip>
      <Tip>Looking for PR 862 in bg? Type <Code>bg#862</Code>. The <Code>#</Code> belongs to the number, so it never triggers a scope.</Tip>
      <Tip>The sidebar has its own repository box and it only matches names. Paste <Code>repo:bg</Code> in there and it just searches <Code>bg</Code>.</Tip>
    </TipsList>
  );
}

function FilteringHelp() {
  return (
    <TipsList>
      <Tip>Everything that shrinks the inbox lives in the sidebar: repository search, type buttons, and age and state dropdowns.</Tip>
      <Tip>The counts next to each filter show how many items match before you click.</Tip>
      <Tip>Clicking the active filter again clears it back to all.</Tip>
      <Tip>Right-click a repository row (or open its <Kbd>···</Kbd> menu) to snooze it for an hour, a day, or a week. Unsnooze any time to bring it back.</Tip>
      <Tip>Snoozed repositories sit in their own section until the snooze ends.</Tip>
    </TipsList>
  );
}

const SHORTCUT_GROUPS = ["Navigate", "Triage", "App"] as const;

function ShortcutsHelp() {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Shortcuts stay out of the way while typing in inputs. Press <Kbd>?</Kbd> anywhere for the searchable list.
      </p>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group} aria-label={`${group} shortcuts`}>
          <h3 className="mb-1 px-1 text-xs font-medium text-muted-foreground">{group}</h3>
          <ul className="flex flex-col gap-0.5">
            {SHORTCUTS.filter((s) => s.group === group).map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.description}</span>
                </span>
                <Kbd className="ml-auto shrink-0 px-2 py-0.5">{s.key}</Kbd>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DigestHelp() {
  return (
    <TipsList>
      <Tip>Give each repository a rhythm on the Repositories page: immediate, weekly, biweekly, or monthly.</Tip>
      <Tip>Anything not due yet stays collapsed under “Quiet until due”, with its pending count beside it.</Tip>
      <Tip>The moment a digest comes due, its items show up in the main flow.</Tip>
      <Tip>Snooze hides a repository until the snooze ends, no matter its rhythm. Unsnooze and it is back immediately.</Tip>
    </TipsList>
  );
}

function TroubleshootingHelp() {
  return (
    <TipsList>
      <Tip>Wondering how fresh the data is? The header shows the last GitHub sync.</Tip>
      <Tip>Seeing “Data may be stale”? Nothing is lost, the last loaded rows stay put. Select Retry to sync again.</Tip>
      <Tip>When the banner says GitHub is disconnected, the server cannot reach GitHub. Set <Code>GH_TOKEN</Code> or run <Code>gh auth login</Code> on the server, then retry.</Tip>
      <Tip>If the inbox is empty on first run, reseed the demo data, then sync to load your notifications.</Tip>
    </TipsList>
  );
}

function topicBody(id: string): React.ReactNode {
  switch (id) {
    case "filtering":
      return <FilteringHelp />;
    case "shortcuts":
      return <ShortcutsHelp />;
    case "digest":
      return <DigestHelp />;
    case "troubleshooting":
      return <TroubleshootingHelp />;
    case "search":
    default:
      return <SearchHelp />;
  }
}

function HelpView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("topic") ?? "search";
  const activeTopic = TOPICS.some((t) => t.id === raw) ? raw : "search";

  function setTopic(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "search") params.delete("topic");
    else params.set("topic", id);
    const query = params.toString();
    router.replace(`/help${query ? `?${query}` : ""}`, { scroll: false });
  }

  const active = TOPICS.find((t) => t.id === activeTopic) ?? TOPICS[0]!;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Help</h1>
        <p className="text-sm text-muted-foreground">
          How to search, filter, and fix things in ghn. Start with a topic.
        </p>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <nav
          aria-label="Help topics"
          className="w-full shrink-0 lg:sticky lg:top-2"
          // Fixed width via min() instead of a w-64 utility: the utility
          // never made it into the generated stylesheet, and this keeps
          // the full-width stacked layout on small screens for free.
          style={{ width: "min(100%, 16rem)" }}
        >
          <HelpSidebar topics={TOPICS} activeTopic={activeTopic} onTopic={setTopic} />
        </nav>
        <section
          aria-label={active.label}
          className={cn("min-w-0 flex-1 rounded-lg bg-card px-5 py-4 shadow-sm")}
        >
          <h2 className="mb-1 text-base font-semibold">{active.label}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{active.blurb}</p>
          {topicBody(activeTopic)}
        </section>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading help…</div>}>
      <HelpView />
    </React.Suspense>
  );
}
