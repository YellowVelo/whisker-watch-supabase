# Whisker Watch

Pet health tracking app — log symptoms, medications, vaccinations, bloodwork, and food for your pets; spot patterns; generate vet-ready reports; coordinate pet sitting.

Originally built on Base44, migrated to a self-owned stack (React + Vite frontend, Supabase backend, Claude via Anthropic API for AI features).

## Stack

- **Frontend:** React + Vite
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions)
- **AI:** Anthropic API (Claude), called server-side via a Supabase Edge Function — never exposed to the browser

## Local setup

```bash
npm install
```

Create a `.env` file in the project root (not committed — see `.gitignore`):

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then:

```bash
npm run dev
```

## Database

Schema lives in `supabase/migrations/`. Run these in order via the Supabase SQL Editor (or `supabase db push` if using the CLI) on a fresh project:

1. `0001_init_schema.sql` — tables, RLS policies, triggers
2. `0002_storage_bucket.sql` — file storage bucket + policies

**Important:** the `public` schema must be enabled under your Supabase project's **Data API** settings, or every table will return 403s even with correct RLS policies. This is a separate toggle from RLS itself and is easy to miss.

## AI features

Three AI features (vet chat, health insights, vaccine/bloodwork document scanning) are powered by one Edge Function: `supabase/functions/ask-vet-assistant/index.ts`.

To deploy:

```bash
supabase functions deploy ask-vet-assistant
```

Set your Anthropic API key as a Supabase secret (Dashboard → Edge Functions → Secrets, or via CLI):

```
ANTHROPIC_API_KEY=your-key-here
```

The function requires an authenticated Supabase session — it checks the request's Authorization header and will reject anonymous calls.

## Status / what's not done yet

See the fuller project summary doc for complete context, but in short:

- [ ] Deploy the `ask-vet-assistant` Edge Function (code is done, not yet deployed)
- [ ] Import real historical pet data from the original Base44 app
- [ ] Sitter invite emails (access records are created; no email is actually sent yet)
- [ ] True account deletion (currently wipes data + signs out, doesn't delete the auth account)
- [ ] Capacitor wrapping for iOS/Android app store distribution
- [ ] Fi/Tractive pet tracker integration
- [ ] Shared/co-owner accounts (e.g. both partners logging symptoms for the same pet)
- [ ] Native iOS reminders (calendar `.ics` export already works; native push reminders need Capacitor)

## Related repos

- This repo (`whisker-watch-supabase`) is the active Supabase-backed rebuild
- `whisker-watch` (original) is the untouched, still-functioning Base44 version, kept as a safety net

## Migrations

Schema changes live under `supabase/migrations/`. Apply them to the linked project with `supabase db push`.
