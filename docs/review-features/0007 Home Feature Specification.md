Feature Specification
Home

Document

01 Features/Home/Home.md

Status

Ready for Implementation

Owner

Product

Audience

Claude Code

Purpose

The Home screen is the owner's daily destination.

It answers one question immediately:

"How are my pets today?"

The screen provides:

Today's Wellness Score for every active pet
Today's Daily Check-In status
Entry point into Daily Check-In
Reminder to complete missed check-ins
Notification entry point

The Home screen is intentionally focused on today's health.

Long-term management belongs within Pet Profile.

Functional Requirements
1. Greeting

Display a personalized greeting.

Format:

Good morning, {First Name}

Greeting changes based on device local time.

Morning

Afternoon

Evening

If first name is unavailable:

Good morning
2. Notification Button

Display notification icon in upper-right corner.

Requirements

Badge displayed when unread notifications exist.
Badge hidden when none exist.
Tapping opens Notifications screen.
3. Wellness Summary Cards

Display one card for every active pet.

Do not display:

Memorial pets
Shared pets

Cards display horizontally as designed.

Each card contains:

Pet icon/photo
Pet name
Wellness Score
Trend label

Trend values:

Stable
Improving
Monitor
Declining
Unknown

Score range:

0–100

Tapping a Wellness card opens that pet's Trends screen.

4. Today's Check-Ins Section

Display one card for every active pet.

Cards are ordered by:

Check-In incomplete
Check-In completed
Pet creation date

Each card displays:

Photo
Pet name
"Today's Check-In"
Status summary
Completion time (if completed)
Completed Check-In

Display:

Success icon

Summary text

Completion time

Example

Everything looked normal today.

Completed 8:42 AM

If changes were logged:

Display up to three observations.

Examples

• Ate less than usual

• Lower energy

• Medication given

If more than three observations exist:

Display

+2 more
Incomplete Check-In

Display:

Warning icon

Message

Today's check-in hasn't been completed.

Display primary CTA

Start Today's Check-In

Selecting button launches Daily Check-In.

5. Catch-Up Reminder

Display only when:

Yesterday has no Daily Check-In.

Message:

Yesterday wasn't logged for {Pet Name}.

Display action:

Catch up yesterday

Selecting launches Catch-Up Check-In.

Only the most recent missed day is surfaced on Home.

UI Components
Greeting
Notification icon
Wellness Score cards
Today's Check-Ins heading
Check-In cards
Primary button
Chevron
Catch-Up banner
Bottom navigation

Use existing Design System components.

Do not introduce new component styles.

User Interactions
Tap Wellness Card

Navigate:

Home

↓

Pet Trends
Tap Completed Check-In Card

Navigate:

Home

↓

Pet Trends
Tap Start Today's Check-In

Launch Daily Check-In flow.

Return to Home on completion.

Refresh card immediately.

Tap Catch Up Yesterday

Launch Catch-Up Check-In.

Return Home.

Refresh card.

Tap Notification Icon

Open Notifications.

Bottom Navigation

Home

Pets

Menu

Maintain current selected state.

Navigation
App Launch

↓

Home

Home routes

Notification

↓

Notifications
Wellness Card

↓

Pet Trends
Completed Check-In

↓

Pet Trends
Incomplete Check-In

↓

Daily Check-In
Catch Up

↓

Catch-Up Check-In

Bottom Navigation

Pets

↓

Pets Screen
Menu

↓

Menu Screen
Empty States
No Pets

Display:

Welcome to Wysker Watch

Let's add your first pet.

Primary CTA

Add Pet

Hide:

Wellness cards
Check-In cards
Catch-Up
No Check-Ins Yet

Display one card per pet.

Status:

Today's check-in hasn't been completed.

Show

Start Today's Check-In
Loading States

While loading:

Show skeleton placeholders for:

Greeting
Wellness cards
Check-In cards

Maintain page layout.

Do not show spinner for the entire screen.

Error States
Unable to Load Pets

Display:

Unable to load your pets.

Pull down to try again.

Retry reloads Home.

Unable to Start Check-In

Display toast:

Unable to start today's check-in.

Remain on Home.

Unable to Refresh

Display cached data.

Show:

Some information may be out of date.
Business Rules

Only active pets appear.

Memorial pets do not appear.

One Wellness Score exists per pet per day.

One Daily Check-In exists per pet per day.

One Catch-Up reminder is shown per pet.

Catch-Up reminders disappear after completion.

Completed cards summarize today's observations.

Display a maximum of three observations.

Trend values originate from the existing Wellness Score calculation.

Validation Rules

Wellness Score

Must exist between:

0–100

Trend

Must match supported enum.

Observation summary

Maximum three displayed.

Completion timestamp

Display in local timezone.

Pet names

Maximum 100 characters.

Data Requirements

Retrieve:

User
First name
Pets
Active pets
Name
Species
Photo
Created date
Wellness
Score
Trend
Last updated
Daily Check-In
Status
Completion time
Observation summary
Catch-Up

Determine if:

Yesterday has no Daily Check-In.

Notifications

Unread count.

Acceptance Criteria

A user can:

Open Home.
View one Wellness card per active pet.
View one Check-In card per active pet.
Launch Daily Check-In.
Launch Catch-Up Check-In.
Open Pet Trends.
Open Notifications.
View today's Wellness Score.
View today's trend.
View observation summaries after check-in.
See reminder when yesterday was missed.
See completed status immediately after finishing a check-in.
Refresh Home without restarting the application.
Edge Cases
Zero pets
One pet
Many pets
Pet without photo
Wellness score unavailable
Check-In started but abandoned
Yesterday skipped intentionally
Offline launch
Slow network
Notification count unavailable
First day after creating pet
Check-In completed on another device
Midnight rollover while Home remains open
Implementation Notes for Claude Code
Treat the supplied screen design as the visual source of truth. Match layout, spacing, typography, sizing, and visual hierarchy without redesigning or introducing alternate layouts.
Reuse existing Wellness Score, Daily Check-In, Catch-Up Check-In, and Bottom Navigation implementations wherever possible. Extend existing components instead of creating parallel implementations.
Route all data access through the project's entity layer and existing client abstractions. Do not query Supabase directly from UI components.
Load the Home screen using asynchronous requests with skeleton placeholders rather than blocking the interface with a full-screen loader.
Refresh only the affected pet card after a Daily Check-In or Catch-Up Check-In completes instead of reloading the entire screen.
Preserve the existing Wellness Score calculation and trend logic. The Home screen is a consumer of those values and must not recalculate them.
Display timestamps using the user's local device timezone.
Keep the Home screen focused exclusively on today's health. Long-term health management, editing, and historical records belong in Pet Profile and Trends.
Ensure all touch targets, accessibility labels, and semantic roles conform to the Design System and Accessibility requirements.