Terminology

Purpose

This document defines the official vocabulary of Wysker Watch. These terms ensure consistency across the product, documentation, AI reasoning, and communication with users, sitters, and veterinarians.

Wysker Watch uses clear, emotionally supportive language designed for pet owners managing chronic conditions.

1. Core Concepts

Pet

A cat or dog tracked in Wysker Watch. Each pet has a profile, baseline, daily logs, and insights.

Owner

The primary user responsible for the pet’s care. All data is scoped to the owner’s account.

Sitter

A temporary caregiver with limited access to a pet’s logs during a defined sitting period.

Co‑Owner

**Shipped, not future** (corrected 2026-07-18 — this document previously marked it as planned). A second full‑access caregiver who shares responsibility for daily logging, invited via email and linked on next login (`pet_co_owners` table, migration 0004). A co-owner has identical rights to the primary owner on every pet-scoped table.

2. Daily Logging Terms

**This section previously described the original (2026-07-05) Daily Check-In model, retired 2026-07-13. Corrected below to the current Vibe model.**

Daily Check‑In

The core daily action where the owner reports a subjective **Vibe** for the day, plus (optionally, for Off/Tough days) which specific symptoms they noticed. The two signals — Vibe and symptom count — are logged together but never blended into each other or into any score.

Vibe (`daily_check_ins.status`)

Great Day — Nothing to report; saves immediately, no follow-up questions.

Off Day — Something felt a little different; opens a follow-up picker for which attribute(s) changed.

Tough Day — Something felt clearly different or concerning; same follow-up picker as Off Day, distinguished only by the owner's own subjective read of the day, not by which symptoms were picked.

Skipped — No data provided; the day is marked as unknown, not "normal." A skipped day is itself a real, distinct answer (see Change-Based Logging below).

Symptom Count (`daily_check_ins.symptom_count`)

An objective, unweighted count of distinct symptoms logged that day across 11 counted categories (Appetite, Water Intake, Bathroom, Stool, Vomiting, Nausea, Energy, Mobility, Breathing, Skin/Itching, Behavior). Every symptom counts equally — there is no severity weighting and no deduction logic. Weight is tracked separately and is never part of this count.

Change‑Based Logging

A logging model where owners only record deviations from baseline — still the underlying philosophy, though "baseline" here means "yesterday," not a formally stored `pet_baselines` row (that table exists in the schema but is not yet populated or read by any current feature — see Data Model_V2.md §6).

Unknown Day

A day with no logs, or a day explicitly marked Skipped. Unknown ≠ Great Day — per Product Principle 6, "Missing Data Is Meaningful."

3. Baseline Terms

Baseline

The pet’s normal daily routine and health profile, defined once by the owner.

Baseline Includes

Diagnoses

Daily medications

Diet

Typical appetite

Typical energy

Typical water intake

Normal weight

Normal behaviors

Baseline Inheritance

Daily logs automatically assume baseline values unless the owner reports a change.

4. Health & Symptom Terms

Appetite

How much and how eagerly the pet eats. Logged via appetite score or notes.

Digestive / GI

Gastrointestinal observations including vomiting, diarrhea, constipation, or nausea.

Energy

Activity level, mobility, and engagement.

Weight

Measured weight or weight trend.

Symptom

Any observable change in behavior or health.

Symptom Log

A record of a specific symptom, including type, severity, and notes.

5. Medical Terms

Diagnosis

A chronic or ongoing condition (e.g., CKD, IBD, hyperthyroidism).

Medication

A prescribed treatment with dosage and frequency.

Vaccination

A record of administered vaccines.

Bloodwork

Lab results stored as structured data.

6. AI Terms

AI Assistant

Claude-powered conversational assistant for answering pet health questions.

AI Insights

Structured summaries generated from logs, trends, and baseline.

Document Extraction

AI-powered parsing of vaccination records or lab reports.

7. Trend Terms

**Corrected 2026-07-18.** This section previously listed "Health Score (future)" as a planned composite metric. It was actually built — twice — and then retired entirely: a 0–100 "Wellness Score V1" (2026-07-05), replaced by a 0–10 "Health Score V2" (2026-07-09), replaced by an equal-weight multi-select version (2026-07-11), then replaced for good by the Vibe + Symptom Count model (2026-07-13, see Daily Logging Terms above). There is no composite score of any kind in the current app, and none is planned — any new work should treat "Health Score" as a retired term, not an upcoming one.

Trend

A pattern over time, expressed today as a per-attribute **direction** (up/down/equal/unknown — fewer symptoms than yesterday = up, more = down), never as a single blended score or a Stable/Improving/Monitor/Declining label. Those labels belonged to the retired scoring systems above.

8. Access & Sharing Terms

Sitter Access

Limited access granted to a sitter for a specific pet.

Sitter Session

A defined period during which a sitter logs observations.

Sitter Log

A log created by a sitter during a session.

9. System Terms

RLS (Row Level Security)

Database rules ensuring each owner can only access their own data.

Edge Function

Supabase serverless function used for AI and backend logic.

Baseline Model

The conceptual framework defining how normal vs. changed data is stored.

Summary

This terminology ensures Wysker Watch communicates clearly, consistently, and compassionately. It provides a shared language for product design, engineering, AI reasoning, and user experience—forming the foundation of how the system thinks and speaks.