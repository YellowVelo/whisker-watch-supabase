Terminology

Purpose

This document defines the official vocabulary of Whisker Watch. These terms ensure consistency across the product, documentation, AI reasoning, and communication with users, sitters, and veterinarians.

Whisker Watch uses clear, emotionally supportive language designed for pet owners managing chronic conditions.

1. Core Concepts

Pet

A cat or dog tracked in Whisker Watch. Each pet has a profile, baseline, daily logs, and insights.

Owner

The primary user responsible for the pet’s care. All data is scoped to the owner’s account.

Sitter

A temporary caregiver with limited access to a pet’s logs during a defined sitting period.

Co‑Owner (future)

A second full‑access caregiver who shares responsibility for daily logging.

2. Daily Logging Terms

Daily Check‑In

The core daily action where the owner reports whether the day was normal or if something changed.

Options

Today was normal — No deviations from baseline.

Something changed — One or more observations differ from baseline.

Skip today — No data provided; the day is marked as unknown.

Change‑Based Logging

A logging model where owners only record deviations from baseline.

Unknown Day

A day with no logs. Unknown ≠ normal.

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

7. Trend & Scoring Terms

Trend

A pattern over time (e.g., appetite improving, weight stable).

Stability Indicator

A measure of how consistent a metric has been over a period.

Health Score (future)

A composite metric summarizing overall well-being.

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

This terminology ensures Whisker Watch communicates clearly, consistently, and compassionately. It provides a shared language for product design, engineering, AI reasoning, and user experience—forming the foundation of how the system thinks and speaks.