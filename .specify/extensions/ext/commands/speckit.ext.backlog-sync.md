---
description: Sync local backlog items to Notion. Credentials: op://api-keys/spec-kit-extensions_db-coding-projects
arguments: "--dry-run --all"
---

## User Input

```text
$ARGUMENTS
```

## Outline

Push unsynced backlog items from `specs/BACKLOG.md` to Notion database. Keeps capture fast (local-only), syncs later on demand.

**Core Principle**: One-way sync (Local → Notion), hash-based deduplication.

### Execution Steps

#### Phase 1: Load Credentials

> **⚠️ SPECIFIC CREDENTIAL PATH**: Use ONLY `op://api-keys/spec-kit-extensions_db-coding-projects`. Do NOT search 1Password for other Notion-related items.

1. **Check for Notion Credentials**

Credentials are loaded from (checked in order):
1. 1Password CLI (`op`) - recommended, no credentials on disk
2. Environment variables - fallback for CI/automation

**Step 1a: Check for 1Password CLI**

Use Bash tool:
```bash
command -v op >/dev/null 2>&1 && echo "OP_AVAILABLE=true" || echo "OP_AVAILABLE=false"
```

**If OP_AVAILABLE=true**: Try to load from 1Password:

```bash
op read "op://api-keys/spec-kit-extensions_db-coding-projects/credential" 2>/dev/null && echo "---SEPARATOR---" && op read "op://api-keys/spec-kit-extensions_db-coding-projects/database_id" 2>/dev/null
```

If both values returned (separated by `---SEPARATOR---`): Store as `NOTION_API_KEY` and `NOTION_DATABASE_ID`. Report `Credentials loaded from 1Password`. Continue to Phase 2.

If 1Password read fails (not signed in, item not found, etc.): Fall through to env var check.

**Step 1b: Check Environment Variables**

Use Bash tool:
```bash
if [ -n "$NOTION_API_KEY" ] && [ -n "$NOTION_DATABASE_ID" ]; then
  echo "ENV_AVAILABLE=true"
else
  echo "ENV_AVAILABLE=false"
fi
```

**If ENV_AVAILABLE=true**: Use environment variables. Report `Credentials loaded from environment variables`. Continue to Phase 2.

**If no credentials found**: Report error and exit:
```
Error: Notion credentials not found.

Setup (choose one):

Option 1 - 1Password (recommended):
  1. Create item in 1Password:
     Vault: api-keys
     Item name: spec-kit-extensions_db-coding-projects
     Fields:
       credential: secret_xxx...
       database_id: 2c9ed9baa88a8065a5b2dde024c0a4fe

  2. Sign in to 1Password CLI:
     eval $(op signin)

Option 2 - Environment variables (for CI):
  export NOTION_API_KEY="secret_xxx..."
  export NOTION_DATABASE_ID="abc123..."

To get credential values:
1. API Key: https://www.notion.so/my-integrations → New integration → Copy secret
2. Database ID: Open database in Notion → Copy ID from URL

Then re-run /speckit.ext.backlog-sync
```

#### Phase 2: Validate API Connection

2. **Test Notion API Access**

Verify credentials work and database is accessible by querying the database metadata.

Use Bash tool (with the credentials from Phase 1):

```bash
curl -s -w "\n%{http_code}" -X GET "https://api.notion.com/v1/databases/{NOTION_DATABASE_ID}" \
  -H "Authorization: Bearer {NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28"
```

Parse the last line for HTTP status code.

- **200**: Success - API connection verified
  - Extract database title from response for confirmation
  - Report: `API connection verified. Database: {title}`

- **401 Unauthorized**:
  - Report error and **exit**:
    ```
    Error: Authentication failed (401 Unauthorized).

    Your API key is invalid or expired.
    1. Go to https://www.notion.so/my-integrations
    2. Check your integration is active
    3. Copy a fresh API key
    4. Update in 1Password or environment variable
    ```

- **403 Forbidden**:
  - Report error and **exit**:
    ```
    Error: Access denied (403 Forbidden).

    The database is not shared with your integration.
    1. Open the database in Notion
    2. Click "..." menu → "Connections"
    3. Add your integration (look for the integration name you created)
    4. Re-run /speckit.ext.backlog-sync
    ```

- **404 Not Found**:
  - Report error and **exit**:
    ```
    Error: Database not found (404).

    Check NOTION_DATABASE_ID is correct.
    Current value: {NOTION_DATABASE_ID}

    To find the correct ID:
    1. Open the database in Notion
    2. Copy the ID from the URL (the part after the workspace name)
    ```

- **Other errors**: Report and exit with the status code and response body.

#### Phase 3: Parse Arguments

3. **Check for Flags**

Parse `$ARGUMENTS` for flags:

- **`--dry-run`**: Set `DRY_RUN=true` - preview only, no API calls
- **`--all`**: Set `FORCE_ALL=true` - sync all items regardless of state

If neither flag is present, proceed with normal sync (unsynced items only).

Report mode:
```
Mode: [Normal sync | Dry run (preview only) | Force re-sync all]
```

#### Phase 4: Extract Project Key

4. **Get Repository Name from Git Remote**

Use Bash tool to extract project key:

```bash
git remote get-url origin 2>/dev/null || echo "NO_REMOTE"
```

**If "NO_REMOTE"**: Report error and exit:
```
Error: No git remote configured. Cannot determine Project Key.

Fix: Add a git remote:
  git remote add origin git@github.com:owner/repo.git
```

**Parse the URL** to extract just the repository name:
- From `git@github.com:stefanwalther/spec-kit-extensions.git` → `spec-kit-extensions`
- From `https://github.com/stefanwalther/spec-kit-extensions.git` → `spec-kit-extensions`
- From `https://github.com/stefanwalther/spec-kit-extensions` → `spec-kit-extensions`

Use Bash tool:
```bash
git remote get-url origin | sed 's/.*\///' | sed 's/\.git$//'
```

Store as `PROJECT_KEY`.

Report:
```
Project Key: {PROJECT_KEY}
```

#### Phase 5: Read Backlog

5. **Read Backlog File**

Use Glob tool to check for `specs/BACKLOG.md`.

**If missing**: Report and exit:
```
No backlog file found at specs/BACKLOG.md.
Run /speckit.ext.backlog --init-only to create it.
Nothing to sync.
```

Use Read tool to read `specs/BACKLOG.md`.

6. **Parse Backlog Items**

Extract all unchecked items matching pattern `- [ ]` (exclude `- [x]` checked items).

For each item, extract the description text after `- [ ] `.

Count total items found.

**If 0 items**: Report and exit:
```
No items in backlog. Nothing to sync.
```

Report:
```
Found {N} items in backlog.
```

#### Phase 6: Sync State Management

7. **Read Sync State**

Use Glob tool to check for `specs/.backlog-sync-state.json`.

**If exists**: Use Read tool to read it and parse JSON.

**If missing or invalid JSON**: Initialize empty state:
```json
{
  "version": 1,
  "project_key": "{PROJECT_KEY}",
  "synced_items": {}
}
```

8. **Compute Hashes and Identify Unsynced Items**

For each backlog item, compute a simple hash (MD5 of description text).

Use Bash tool to compute hash:
```bash
echo -n "item description here" | md5
```

Compare hash against `synced_items` in state file.

**If `--all` flag**: Mark all items as "to sync" regardless of hash.

**If hash exists in state**: Mark as "already synced" (skip).

**If hash not in state**: Mark as "to sync".

Report:
```
Items to sync: {count}
Items already synced: {count}
```

**If 0 items to sync** (and not `--all`): Report and exit:
```
All items already synced. Nothing new to sync.
```

#### Phase 7: Preview (Dry Run) or Sync

9. **Handle Dry Run Mode**

**If `--dry-run` flag is set**:

Display preview:
```
DRY RUN - Preview of items to sync:

1. {description_1}
2. {description_2}
...

Would create {N} pages in Notion database.
No changes made.
```

**Exit without making API calls or updating state.**

10. **Sync Items to Notion**

For each item marked "to sync":

a. **Build Request Body**:

```json
{
  "parent": { "database_id": "{NOTION_DATABASE_ID}" },
  "properties": {
    "Item name": {
      "title": [{ "text": { "content": "{description}" } }]
    },
    "Project Key": {
      "select": { "name": "{PROJECT_KEY}" }
    },
    "Status": {
      "status": { "name": "Backlog" }
    },
    "Priority": {
      "select": { "name": "1 ~ Medium" }
    },
    "Notes": {
      "rich_text": [{ "text": { "content": "{description} (from specs/BACKLOG.md)" } }]
    },
    "AI Tools Used": {
      "multi_select": [{ "name": "Claude Code" }]
    }
  }
}
```

Note: "Item name" is the title field in the Notion database. "Project Key" identifies the repository. "Status" uses the status type (not select).

b. **Make API Call**:

Use Bash tool to call Notion API:

```bash
curl -s -w "\n%{http_code}" -X POST 'https://api.notion.com/v1/pages' \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{request_body_json}'
```

c. **Handle Response**:

Parse the last line for HTTP status code.

- **200/201**: Success
  - Extract `id` from response JSON
  - Store in state: `synced_items[{hash}] = { description, synced_at, notion_page_id }`
  - Report: `+ Synced: {description}`

- **400 Bad Request**:
  - Report: `x Failed: {description} - Bad request (check field names)`
  - Continue to next item

- **401 Unauthorized**:
  - Report error and **stop sync**:
    ```
    Error: Authentication failed (401 Unauthorized).

    Your NOTION_API_KEY may be invalid or expired.
    1. Go to https://www.notion.so/my-integrations
    2. Check your integration is active
    3. Copy a fresh API key
    4. Update NOTION_API_KEY environment variable
    ```

- **403 Forbidden**:
  - Report error and **stop sync**:
    ```
    Error: Access denied (403 Forbidden).

    The database is not shared with your integration.
    1. Open the database in Notion
    2. Click "..." menu → "Connections"
    3. Add your integration
    4. Re-run /speckit.ext.backlog-sync
    ```

- **404 Not Found**:
  - Report error and **stop sync**:
    ```
    Error: Database not found (404).

    Check NOTION_DATABASE_ID is correct:
    Current value: {NOTION_DATABASE_ID}
    ```

- **429 Rate Limited**:
  - Wait 1 second, retry up to 3 times
  - If still failing after retries, report and continue:
    ```
    ! Rate limited: {description} - will retry on next sync
    ```

- **5xx Server Error**:
  - Wait 2 seconds, retry once
  - If still failing, report and continue:
    ```
    ! Server error: {description} - will retry on next sync
    ```

#### Phase 8: Update State File

11. **Save Sync State**

After processing all items, write updated state to `specs/.backlog-sync-state.json`.

Use Write tool to save:
```json
{
  "version": 1,
  "project_key": "{PROJECT_KEY}",
  "synced_items": {
    "{hash1}": {
      "description": "First item",
      "synced_at": "2026-01-17T10:30:00Z",
      "notion_page_id": "abc123"
    },
    "{hash2}": {
      ...
    }
  }
}
```

#### Phase 9: Summary Report

12. **Display Summary**

```
Backlog Sync Complete
---------------------
Project Key: {PROJECT_KEY}
Items synced: {count}
Items skipped (already synced): {count}
Errors: {count}

Run /speckit.ext.backlog-sync --dry-run to preview future syncs.
```

## Usage

```bash
/speckit.ext.backlog-sync           # Sync unsynced items
/speckit.ext.backlog-sync --dry-run # Preview without syncing
/speckit.ext.backlog-sync --all     # Force re-sync all items
```

## Notes

**One-way sync**: This extension only pushes from local to Notion. Changes in Notion are not synced back.

**Duplicate prevention**: Items are tracked by content hash. Same item text = same hash = skipped on subsequent syncs.

**Project Key**: Derived from git remote, identifies which repository items came from in the Notion database.

**State file**: `specs/.backlog-sync-state.json` tracks what's been synced. Delete this file to force re-sync of all items (or use `--all` flag).
