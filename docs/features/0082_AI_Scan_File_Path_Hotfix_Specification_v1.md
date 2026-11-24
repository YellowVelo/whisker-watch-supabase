# 0082_AI_Scan_File_Path_Hotfix_Specification_v1

**Status:** Draft, waiting for Lynn's review. No code written yet. Lynn chose "hotfix now" on 2026-11-24, separate from spec 0080.
**Date:** 2026-11-24
**Branch:** `claude/hotfix-0082-ai-file-path` (off `main`)
**Migration:** none
**Punch list:** none yet; `doc-updater` adds a PA number. Found in spec 0080's T5 review.
**Process:** `/ship-feature`. Type: **PROTECTED** (file storage rules, a service-role Edge Function). Lynn's OK is needed before merge.
**Related files:** `supabase/functions/ask-vet-assistant/index.ts`, `supabase/tests/private_uploads.test.ts`, `docs/testing/QA_Test_Plan.md`

## Lynn — what I need from you

1. **Review this spec and say "approved" (or tell me what to change).** This blocks the fix.
2. **Later, before merge:** OK the PROTECTED merge after review passes.
3. Nothing to promote in Cloudflare: this is a backend-only fix. I deploy the function to dev, staging and prod myself.

## Before You Approve This

1. **This is a live security hole.** Since spec 0071 (2026-11-15), anyone signed in who knows a scanned document's file path can get Ask Wysker's scan feature to read someone else's private vet document. The scan result shows what's in the document: vaccines, dates, bloodwork values and the vet's name. The realistic case is a removed co-owner who saw the path while they had access, or anyone who has seen a signed link, since the link contains the path. It was found by reading the code and tracing it to the exact download request. **Nobody has tried it against a real server**, and there's no sign it has been used.
2. **How it works:** the server only refuses a path containing a plain `..` ("go up one folder"). Disguised versions slip past: `%2e%2e`, or a backslash. The server then downloads the file with its master key, which skips the storage rules that would normally refuse it.
3. **The fix closes it two ways.** It refuses any path that isn't in the exact shape the app itself creates. It also downloads the file with the person's own access instead of the master key, so the storage rules from spec 0071 decide, even if a future bad path slipped through.
4. **Nothing changes for owners.** Paths the app creates (`<your id>/<number>-<letters>.<ext>`) keep working, and every scan screen works as today. No app or wording changes.
5. Spec 0080, still in progress, gets the same fix in its rewritten function before it ships.
6. Self-review: no conflicts with locked rules. The new shape check is stricter than today's, so a file stored under some older, unusual path name could no longer be scanned. Scans only ever read files uploaded since spec 0071, which all use the app's shape. Pet photos are never scanned.

## Functional Requirements

1. The scan feature only accepts a file path in the shape the app's uploader creates: a folder name, a slash, then a file name made only of letters, numbers, `-`, `_` and one `.` before the extension. Anything else gets the existing "Invalid file reference" refusal. That includes `%`, a backslash, `.` or `..` segments, extra folders, and leading or trailing slashes.
2. The existing access rule stays: your own folder, or a document linked to a pet you own or co-own.
3. The file is downloaded with the person's own access, never the server's master key, so storage's own rules (migration 0054) also have to allow it.
4. Everything else in the function is unchanged, including the temporary `file_url` path from spec 0071. That's removed separately in spec 0080.

## Acceptance Criteria

1. **AC1:** A path using `%2e%2e`, `..\`, `./`, a double-encoded `%252e`, extra folders, or a backslash anywhere gets 400 `invalid_file`, and nothing is downloaded or sent to the AI.
2. **AC2:** A stranger, a removed co-owner, and a sitter asking to scan another person's document by its real path get 403 `forbidden_file`, as today.
3. **AC3:** An owner scanning a file they just uploaded, and a co-owner scanning a document linked to their pet, still work.
4. **AC4:** No service-role download remains in `ask-vet-assistant`.

## Test Plan

- AC1, AC2 → **Deno integration tests** in `supabase/tests/private_uploads.test.ts`, against dev after deploying there: the disguised paths (including traversal into a real victim document's folder) get 400; the stranger, removed co-owner and sitter get 403. None reach the AI.
- AC3 → the existing e2e scan tests keep passing (they stub the AI), plus a **manual** scan of one vaccine photo on dev with a real AI answer. The integration test can't do this without calling the AI.
- AC4 → code review, plus a check in `function_hygiene.test.ts` that `ask-vet-assistant` never calls `.storage...download` with the admin client.
- **Seeding:** the existing household fixture in `private_uploads.test.ts` (owner, stranger, sitter, a linked document) is reused, plus a removed co-owner.

## Technical Spec

- **`ask-vet-assistant/index.ts`:**
  - `requestedPath()` keeps its current inputs. Its final check becomes an allow-list: `/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$/`, applied to the path exactly as received (no decoding, except for the existing `file_url` branch's one `decodeURIComponent`, whose result must also pass the allow-list).
  - The download uses `supabaseClient` (the caller's client), not `adminClient`. The service-role client stays only for the rate-limit call.
- **Tests:** `private_uploads.test.ts`, `function_hygiene.test.ts`.
- **Deploy:** `ask-vet-assistant` to dev, then CI, then staging and prod, then `scripts/check-functions-start.sh` on each.
- **Design System compliance:** no UI changes.
- **Constraints:** spec 0071's storage rules (migration 0054) are relied on as the second lock; spec 0078's error helpers are unchanged.

## Repo Findings & Risks

- **Duplicate functionality:** none. No other function downloads a user-supplied path with the service role (grep of `supabase/functions`).
- **Technical debt nearby:** the spec 0071 `file_url` compatibility code is still here; spec 0080 removes it.
- **Orphaned code:** none.
- **Punch list:** none in this area.

## Non-Goals

- Spec 0080's rewrite, the daily cap, and the `file_url` removal.
- Checking whether the hole was ever used. There are no download logs per path for us to search, so this can't be answered from here.

## Open Questions

None.
