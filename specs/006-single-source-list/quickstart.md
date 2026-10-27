# Quickstart: Single-Source Inbox List

Validation guide proving the feature end to end. Implementation detail belongs in tasks.md and the code.

## Prerequisites

- Bun dependencies installed, seeded local database, GitHub stand-in as the only remote.
- Baseline gates green before starting: typecheck, lint, unit, integration, component.

## Validate

1. Throttled triage: mark 20 items done with a manual refresh mid-triage in each of 3 runs. Expect zero returned rows every run.
2. Failure path: simulate a failing bulk request. Expect the prior list restored with a message and usable controls, no reload.
3. All view: mark items done with the response gated. Expect rows to stay visible with done state throughout, no flash.
4. Offline plus revive: triage offline, revive one finished item, run a full sync. Expect hidden stays hidden with queued labels, revived stays revived, labels clear only after the push succeeds.
5. Placement: mute an immediate repo, change a rhythm, promote a quiet repo. Expect mute-beats-rhythm placement with no done flips and consistent counts.
6. Pin: pin and unpin repos. Expect section moves only, both sections searchable, counts and inbox untouched.

## Commands

- Fast gates: typecheck, lint, unit, integration, component per docs/development.md.
- Full suite plus coverage per the Makefile. End-to-end runs separately on the built app.
