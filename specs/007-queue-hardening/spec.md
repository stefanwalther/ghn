# Feature Specification: Queue Hardening

**Feature Branch**: `007-queue-hardening`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Writeback queue has become the backbone of the application. Plan the quick hardening improvements: index and count query, atomic retry counting, poison-row handling, small-path dedupe, plus single-flight between background and sync drains."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retries stop clogging the queue (Priority: P1)

A user triages notifications while some GitHub threads are deleted or permanently failing. The queue drops permanently-failed items and caps retries so one bad thread never blocks good ones.

**Why this priority**: Poison rows are the only unbounded growth path today. Every sync retries them, inflating queue depth and GitHub traffic.

**Independent Test**: Can be fully tested by seeding one deleted thread plus one good thread, running sync, and confirming the good thread drains while the bad thread is dropped or capped with its reason preserved.

**Acceptance Scenarios**:

1. **Given** a queued item whose thread no longer exists, **When** the drain runs, **Then** the item is removed from the queue and does not reappear on the next sync.
2. **Given** a queued item that keeps failing with a retryable error, **When** it exceeds the max attempt cap, **Then** it stops being retried and its last error remains inspectable.

---

### User Story 2 - Queue stays fast at 1000+ items (Priority: P1)

A user does a repo-wide bulk action producing 1000+ queued writebacks. Queue lookups, depth checks, and drains stay fast and do not load full rows into memory.

**Why this priority**: Bulk triage is the main queue producer. Full scans on every sync and drain scale linearly and will visibly slow sync as the queue grows.

**Independent Test**: Can be fully tested by seeding 1500 queued rows and measuring drain lookup plus depth check time and memory against the current baseline.

**Acceptance Scenarios**:

1. **Given** 1500 queued rows, **When** sync checks queue depth or pending ids, **Then** the check completes quickly without loading full row bodies.
2. **Given** 1500 queued rows, **When** a per-bulk drain looks up one thread, **Then** it uses an indexed lookup rather than scanning all rows.

---

### User Story 3 - Retry counts stay accurate under overlap (Priority: P2)

A background bulk drain and a sync drain overlap on the same rows. Attempt counters never go backwards or get reset by a stale read.

**Why this priority**: Concurrent drains are possible today and the counter uses a stale snapshot value, so failures can be undercounted and poison detection delayed.

**Independent Test**: Can be fully tested by simulating two overlapping drains over the same failing row and confirming the attempt count increases by two, not one.

**Acceptance Scenarios**:

1. **Given** two drains failing on the same row concurrently, **When** both record their failure, **Then** the attempt count reflects both failures.

---

### User Story 4 - Same thread never queues twice (Priority: P2)

A user retries a small bulk action twice while offline. The queue holds one row per thread and action, not duplicates, so one drain clears the intent.

**Why this priority**: The large bulk path replaces superseded rows but the small path appends, so repeated retries create duplicates that waste GitHub calls.

**Independent Test**: Can be fully tested by enqueueing the same thread and action twice through the small path and confirming only one row exists.

**Acceptance Scenarios**:

1. **Given** the same thread and action enqueued twice, **When** the queue is inspected, **Then** only one pending row exists for that pair.
2. **Given** a duplicate enqueue with a newer error reason, **When** dedupe runs, **Then** the surviving row keeps the newest reason and a reset attempt count.

---

### User Story 5 - Overlapping drains do not double-call GitHub (Priority: P3)

A large bulk schedules a background drain and the user immediately triggers sync. The same thread is sent to GitHub once, not twice.

**Why this priority**: Double calls are idempotent but wasteful and increase rate-limit pressure during the exact burst the queue was built to smooth.

**Independent Test**: Can be fully tested by starting a background drain with a gated remote call, triggering sync over the same ids, and counting remote calls per thread.

**Acceptance Scenarios**:

1. **Given** a background drain in flight for a thread set, **When** sync starts over the same set, **Then** each thread is sent remotely at most once per drain cycle.

---

### Edge Cases

- What happens when the process restarts mid-drain? Rows stay queued and the next sync picks them up with no loss.
- How does the system handle auth loss mid-queue? Items stay queued with reason auth and retry on the next authenticated sync.
- What happens when a user marks a thread unread while its done action is queued? The queued row is withdrawn and the later drain skips it without calling GitHub.
- What happens when the queue holds mixed terminal and retryable failures? Terminal rows drop immediately while retryable rows keep their attempts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST locate a queued row by thread and action quickly even with 1000 or more rows queued.
- **FR-002**: System MUST report queue depth quickly even with 1000 or more rows queued.
- **FR-003**: System MUST NOT lose or reset retry counts when two drains record failures on the same row at the same time.
- **FR-004**: System MUST treat permanently deleted threads as terminal and remove them from the queue instead of retrying.
- **FR-005**: System MUST cap retryable rows at a fixed maximum attempt count and stop retrying beyond it while preserving the last error.
- **FR-006**: System MUST hold at most one pending row per thread and action pair, with re-enqueue replacing the superseded row.
- **FR-007**: System MUST prevent overlapping drains from sending the same thread to the remote service twice in one cycle.
- **FR-008**: System MUST preserve withdrawal semantics so a mark-unread during a drain still skips the remote call.
- **FR-009**: System MUST preserve replacement semantics so a row replaced mid-drain survives the in-flight drain.
- **FR-010**: System MUST expose queue health including depth, oldest queued age, and failure reason breakdown for diagnosis.

### Key Entities *(include if feature involves data)*

- **Writeback item**: One pending remote intent with thread identity, action (done, read, unsubscribe), attempt count, last error, creation time.
- **Queue health**: Depth count, oldest item age, per-reason failure counts used to show stuck or poisoned state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users completing a 1000-item bulk triage see the response in under 2 seconds while write-back continues in the background.
- **SC-002**: A queue with 1500 pending items reports depth and pending status in under 500 milliseconds.
- **SC-003**: A permanently deleted thread stops being retried after one drain cycle and never reappears in later syncs.
- **SC-004**: Repeated offline retries of the same 50 threads never produce more than 50 queued rows.
- **SC-005**: Overlapping background and sync drains over the same 100 threads produce at most 100 remote write calls per cycle.
- **SC-006**: 95% of queued writebacks drain successfully on the next authenticated sync when the remote service is healthy.

## Assumptions

- Users run a single local process, so coordination within that process is sufficient and no external lock service is needed.
- Remote write calls are idempotent, so sending the same intent twice is wasteful rather than corrupting.
- Maximum 10 attempts is the default cap for retryable failures unless product feedback says otherwise.
- Thread deleted and gone responses are treated as terminal, while auth, rate-limited, and network failures remain retryable.
- Existing local-first behavior is unchanged: local state hides immediately, remote write-back stays best-effort with sync as the retry net.
- Offline test suite with the local GitHub stand-in remains the verification path, with no live GitHub contact.
