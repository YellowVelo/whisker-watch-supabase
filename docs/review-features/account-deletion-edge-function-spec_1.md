# Spec: Account Deletion Edge Function

**For:** Wysker Watch (Supabase + React/Vite)
**Purpose:** Let a user permanently and fully delete their account, satisfying Apple App Store guideline 5.1.1(v) and the commitment already made in the Privacy Policy.
**Pattern reference:** Model this after the existing `ask-vet-assistant` Edge Function — same auth-check pattern, same secrets handling.

---

## 1. Why this needs its own Edge Function

A user's own session can delete their own data rows (RLS allows that), but it **cannot** delete the `auth.users` row itself — that requires the Supabase **service-role key**, which must never be exposed to the browser. So this has to run server-side, same reasoning as why AI calls run through an Edge Function instead of the client.

---

## 2. New Edge Function: `delete-account`

**Location:** `supabase/functions/delete-account/index.ts`

### Auth check (required first step)
- Reject any request without a valid `Authorization` header / active Supabase session — same check pattern as `ask-vet-assistant`.
- Extract the calling user's `auth.uid()` from the verified token. **The function only ever deletes the account of the authenticated caller — never accept a user ID from the request body.** This prevents anyone from ever deleting someone else's account by tampering with a request.

### What it needs to do, in order

1. **Look up pet ownership for this user.**
   Query `pets` (and `pet_co_owners`) for every pet where this user is an owner (either as original `created_by` or as a row in `pet_co_owners`).

2. **Handle each pet based on ownership (⚠️ decision point — see Section 3 below for the default I'm proposing):**
   - If the user is the **sole owner** (no co-owners, no other rows in `pet_co_owners` for that pet) → the pet and all its related records (logs, meds, vaccinations, bloodwork, food, symptom logs, sits, sitter access) delete via the existing `ON DELETE CASCADE` chain once the pet row goes.
   - If the user is **one of several co-owners** → do **not** delete the pet. Remove this user's row from `pet_co_owners` (or, if they were the *original* `created_by` owner rather than a co-owner row, reassign `created_by` to the remaining co-owner with the earliest `invited_at`/oldest tenure, so the pet doesn't become ownerless).

3. **Clean up Storage.**
   Postgres foreign keys don't reach into Supabase Storage. List and delete all objects under this user's folder in the `uploads` bucket (pet photos, scanned vaccine/lab documents) before or after the DB deletion. Do this explicitly — don't assume it's automatic.

4. **Delete any remaining owner-scoped rows** not already caught by cascade (e.g., the `profiles` row, if it's not already `ON DELETE CASCADE` from `auth.users` — check `0001_init_schema.sql` to confirm; it should be, but verify since this is the row that holds `role`).

5. **Finally, delete the `auth.users` row** using the service-role client:
   ```
   supabase.auth.admin.deleteUser(userId)
   ```
   This step must come *last*, after steps 1–4 succeed, so a partial failure doesn't leave an orphaned auth account with no data, or (worse) orphaned data with no owning account.

6. **Return a clear success/failure response.** If anything in steps 1–4 fails, don't proceed to step 5 — return an error so the frontend can show "something went wrong, please try again" rather than silently leaving the account half-deleted.

### Secrets / config
No new secrets needed — this reuses the same service-role key pattern your other server-side functions already use. Confirm `SUPABASE_SERVICE_ROLE_KEY` is available to Edge Functions in your project (it should be, as an auto-provided secret).

---

## 3. ✅ Confirmed: shared pets on deletion

**Decision:** if a co-owned pet's account is deleted, the pet **survives** and ownership transfers to the remaining co-owner. Data is never automatically deleted just because one household member's account is removed.

**Why:** the whole point of co-owner accounts (built for Amy) is shared, resilient access to the same pet history. If Lynn deleting her account nuked Tribble's entire medical history out from under Amy, that would violate the "source of truth for a pet's life" principle from your own roadmap — and would be a genuinely upsetting surprise for a co-owner to discover.

### 3a. In-app notification of the transfer (build now, no new infra)

When ownership transfers to a remaining co-owner as part of this function, write a row (e.g. a simple `notifications` table, or a flag on the pet/profile if you don't have a notifications table yet) that the remaining co-owner will see the next time they open the app — a banner or alert along the lines of:

> "[deleted user's email] deleted their account. You are now the sole owner of [pet name]."

This requires no email infrastructure — just a DB write during the transfer step, and a small UI check (e.g. on Home load) to surface any unread transfer notices.

### 3b. Real email notification (defer — bundle with invite emails)

Actual email notification of the ownership transfer should **not** be built as a one-off here. It depends on the same transactional email capability the sitter/co-owner *invite* emails already need and don't yet have (`Sitter + co-owner invite emails` is already on the backlog). When that email system gets built, add "ownership transferred to you" as one more template in it, rather than standing up a second, separate emailer just for this case.

---

## 4. Frontend changes (Settings page)

1. **Replace or update the current "Delete Account" button behavior** so it calls the new `delete-account` Edge Function instead of (or in addition to) whatever local data-wipe logic exists today.
2. **Add a real confirmation step**, since this is irreversible. Recommended pattern: a modal that requires typing the word "DELETE" (or re-entering their password) before the button becomes active — a single tap on a destructive, permanent action is too easy to hit by accident.
3. **Show a clear, specific warning** before confirmation — something like: *"This will permanently delete your account and remove your access to all pets. Pets you solely own will be permanently deleted along with all their health records. This cannot be undone."*
4. **On success:** sign the user out immediately and redirect to the login/landing screen with a simple confirmation message (not back into the now-nonexistent account).
5. **On failure:** show an error and do *not* sign the user out — leave them able to retry.

---

## 5. Testing checklist before shipping

- [ ] Delete an account that owns pets with **no co-owners** → pets and all related records gone, storage files gone, auth account gone.
- [ ] Delete an account that **co-owns** a pet with someone else → pet survives, remaining co-owner retains full access, deleted user's `pet_co_owners` row is gone.
- [ ] After that transfer, confirm the remaining co-owner sees an in-app notification of the transfer on their next login.
- [ ] Delete an account that has an active **pet sitter** relationship (as the pet owner) → sitter access record cleanly removed, sitter isn't left with a dangling reference.
- [ ] Attempt to call the function **without a valid session** → rejected.
- [ ] Attempt (via manual testing, e.g. editing the request) to pass a **different user's ID** → confirm the function ignores it and only ever acts on the authenticated caller.
- [ ] Confirm storage objects in the `uploads` bucket under the deleted user's folder are actually gone afterward (check Supabase Storage dashboard).
- [ ] Confirm the frontend confirmation step actually blocks accidental single-tap deletion.
- [ ] Confirm post-deletion redirect and sign-out behavior.

---

## 6. Once this ships

- The Privacy Policy's account deletion paragraph becomes fully accurate as written — no edits needed.
- This closes out the last Tier 1 App Store blocker alongside the privacy policy hosting and support email (already done).
