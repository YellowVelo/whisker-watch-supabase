Technical Standards

Purpose

These standards define how Whisker Watch is engineered. They ensure reliability, maintainability, security, and consistency across the entire system—from frontend to backend to AI integrations.

Whisker Watch is built for long-term stability and rapid iteration. These standards serve as the foundation for every engineer and AI agent contributing to the codebase.

1. Architecture Overview

Whisker Watch uses a modern, modular architecture:

Frontend: React + Vite

Backend: Supabase (Postgres, Auth, Storage, Edge Functions)

AI: Claude via Supabase Edge Functions

Mobile: Capacitor wrapper for iOS/Android

Version Control: GitHub

Principles

Keep frontend thin and declarative

Keep backend logic in Edge Functions

Keep database schema clean, relational, and RLS‑secured

2. Code Standards

Languages & Frameworks

TypeScript for all frontend and backend code

React with functional components and hooks

Supabase JS SDK for data access

Style Guidelines

Use ESLint + Prettier

Prefer pure functions

Avoid side effects in UI components

Use descriptive variable names (e.g., petId, not id)

Folder Structure

src/
  api/
  components/
  hooks/
  pages/
  lib/
  styles/

3. Data Access Standards

Supabase Client Usage

All data access goes through entityClient.js and entities.js

Never call Supabase directly inside UI components

Always handle errors explicitly

Row Level Security (RLS)

Every table must enforce owner‑scoped RLS

Policies must use auth.uid()

No table should allow anonymous access

Foreign Keys

All relationships must use real foreign keys

Use ON DELETE CASCADE consistently

4. Edge Function Standards

General Rules

All backend logic lives in Edge Functions

Functions must require authentication

Secrets must be stored in Supabase’s encrypted secret store

AI Function (ask-vet-assistant)

Must validate session before processing

Must branch on file type (image vs PDF)

Must never expose API keys to the client

Error Handling

Return structured JSON errors

Never leak stack traces to the client

5. Storage Standards

Bucket Structure

uploads/{userId}/...

Public read, restricted write

File Types

Images: JPG/PNG

Documents: PDF

Naming

Use UUIDs for filenames

Avoid user‑provided names

6. Authentication Standards

Auth Provider

Supabase Auth (email/password + magic link + Google OAuth)

Rules

Require email confirmation

Never store passwords client‑side

Use context provider (AuthContext.jsx) for session state

7. Mobile Standards (Capacitor)

Native Plugins

Notifications

File system

Camera

Guidelines

Keep native code minimal

Use Capacitor APIs instead of platform‑specific code

8. Performance Standards

Frontend

Use React Suspense for async boundaries

Lazy‑load heavy components

Avoid unnecessary re-renders

Backend

Use indexed queries

Avoid N+1 queries

Cache AI results when possible

9. Security Standards

Data Protection

Enforce RLS on all tables

Store secrets only in Supabase

Never log sensitive data

API Security

Validate all inputs

Reject unauthenticated requests

Use HTTPS everywhere

10. Testing Standards

Unit Tests

Test pure functions

Test entity clients

Integration Tests

Test Edge Functions

Test database migrations

Manual QA

Test daily check‑in flow

Test multi‑pet logging

Test AI document extraction

11. Deployment Standards

Supabase

Deploy migrations via CLI

Deploy Edge Functions via CLI

Frontend

Use Vite build

Deploy to modern hosting (Netlify/Vercel)

Mobile

Build via Capacitor

Submit through App Store / Play Store pipelines

Summary

These technical standards ensure Whisker Watch is stable, secure, maintainable, and ready to scale. They provide a shared foundation for all engineering work and guarantee that every feature aligns with the product’s long‑term vision.