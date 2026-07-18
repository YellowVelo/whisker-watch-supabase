0007 Home Feature Specification V2
Feature Specification
Home

Document  
01 Features/Home/HomeV2.md

Status  
Ready for Implementation — Updated to Vibe & Symptom Count Model (v5)

Owner  
Product

Audience  
Claude Code

Purpose
The Home screen is the owner's daily destination.

It answers one question immediately:

"How are my pets today?"

The screen provides:

Today’s Vibe for every active pet

Today’s Daily Check-In status

Entry point into Daily Check-In

Reminder to complete missed check-ins

Notification entry point

The Home screen is intentionally focused on today’s health signals.

Long-term management belongs within Pet Profile and Trends.

Functional Requirements
1. Greeting
Display a personalized greeting.

Format:

Good morning, {First Name}

Greeting changes based on device local time:

Morning

Afternoon

Evening

If first name is unavailable:

Good morning

2. Notification Button
Display notification icon in upper-right corner.

Requirements:

Badge displayed when unread notifications exist

Badge hidden when none exist

Tapping opens Notifications screen

3. Pet Summary Cards (Updated Model)
Display one card for every active pet.

Do not display:

Memorial pets
(Shared pets do display.)

Cards display horizontally as designed.

Each card contains:
Pet icon/photo

Pet name

Vibe icon

Great Day → Sun

Off Day → CloudRainWind

Tough Day → CloudHail

Skipped / No check-in yet → BadgeHelp

Icon color: flat sky blue (PALETTE.sky / --accent-sky)

6 attribute chips

Appetite

Water Intake

Bathroom

Stool

Vomiting

Nausea

Weight displayed as a separate line (not a chip)

Chip Behavior
Each chip displays:

Direction (up / down / equal / unknown)

Derived via computeAttributeDirection comparing today vs. yesterday

Based on distinct symptom count per attribute, not scores

Tapping the Pet Summary Card
Navigates:

Home
↓
Pet Trends (now showing raw symptom counts)

4. Today’s Check-Ins Section
Display one card for every active pet.

Cards are ordered by:

Check-In incomplete

Check-In completed

Pet creation date

Each card displays:
Photo

Pet name

“Today’s Check-In”

Status summary

Completion time (if completed)

Completed Check-In
Display:

Success icon

Summary text

Completion time

Summary Text Rules (Updated)
Summary reflects:

Vibe (Great Day / Off Day / Tough Day)

Up to three observations (distinct symptoms logged)

“Not Observed” appears as a real logged value

Medication Exception is not shown

Examples:

Great Day

“Everything looked good today.”

Off Day / Tough Day

“A few things were noted today.”

Observations:

• Ate less than usual

• Lower energy

• Burping

If more than three observations exist:

+2 more

Incomplete Check-In
Display:

Warning icon

Message: “Today’s check-in hasn’t been completed.”

Primary CTA: Start Today’s Check-In

Selecting button launches Daily Check-In.

Return to Home on completion.

Refresh card immediately.

5. Catch-Up Reminder
Display only when:

Yesterday has no Daily Check-In

Message:

“Yesterday wasn’t logged for {Pet Name}.”

Action:

Catch up yesterday

Selecting launches Catch-Up Check-In.

Only the most recent missed day is surfaced on Home.

UI Components
Greeting

Notification icon

Vibe-based Pet Summary Cards

Today’s Check-Ins heading

Check-In cards

Primary button

Chevron

Catch-Up banner

Bottom navigation

Use existing Design System components.

Do not introduce new component styles.

User Interactions
Tap Pet Summary Card
Navigate:

Home
↓
Pet Trends (raw symptom counts)

Tap Completed Check-In Card
Navigate:

Home
↓
Pet Trends

Tap Start Today’s Check-In
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

Home routes:

Notification
↓
Notifications

Pet Summary Card
↓
Pet Trends

Completed Check-In
↓
Pet Trends

Incomplete Check-In
↓
Daily Check-In

Catch-Up
↓
Catch-Up Check-In

Bottom Navigation:

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
Let’s add your first pet.

Primary CTA:

Add Pet

Hide:

Pet Summary Cards

Check-In cards

Catch-Up

No Check-Ins Yet
Display one card per pet.

Status:

“Today’s check-in hasn’t been completed.”

Show:

Start Today’s Check-In

Loading States
While loading:

Show skeleton placeholders for:

Greeting

Pet Summary Cards

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

Unable to start today’s check-in.

Remain on Home.

Unable to Refresh
Display cached data.

Show:

Some information may be out of date.

Business Rules (Updated)
Only active pets appear

Memorial pets do not appear

Shared pets do appear

One Daily Check-In exists per pet per day

One Catch-Up reminder is shown per pet

Catch-Up reminders disappear after completion

Completed cards summarize Vibe + observations

Display a maximum of three observations

“Not Observed” is a real logged value

Vibe is never inferred from symptoms

Symptom count is persisted once per completed day

Attribute chips use direction, not scores

No numeric score or trend label exists anywhere

Validation Rules
Vibe
Must be one of:

great

off

tough

skipped

Symptom Count
Non-negative integer

Null for skipped/no-check-in day

Observation Summary
Maximum three displayed

Completion Timestamp
Display in local timezone

Pet Names
Maximum 100 characters

Data Requirements (Updated)
Retrieve:

User
First name

Pets
Active pets

Shared pets

Name

Species

Photo

Created date

Daily Check-In
Vibe

Symptom count

Completion time

Distinct observations (per attribute)

“Not Observed” values

Weight

Trends
Raw symptom counts

Attribute directions

Catch-Up
Determine if:

Yesterday has no Daily Check-In

Notifications
Unread count

Acceptance Criteria (Updated)
A user can:

Open Home

View one Vibe-based Pet Summary Card per active pet (including shared pets)

View one Check-In card per active pet

Launch Daily Check-In

Launch Catch-Up Check-In

Open Pet Trends (raw symptom counts)

Open Notifications

View today’s Vibe

View today’s attribute directions

View observation summaries after check-in

See reminder when yesterday was missed

See completed status immediately after finishing a check-in

Refresh Home without restarting the application

Edge Cases
Zero pets

One pet

Many pets

Shared pets

Pet without photo

Vibe unavailable (BadgeHelp)

Check-In started but abandoned

Yesterday skipped intentionally

Offline launch

Slow network

Notification count unavailable

First day after creating pet

Check-In completed on another device

Midnight rollover while Home remains open

Implementation Notes for Claude Code (Updated)
Treat the supplied screen design as the visual source of truth

Match layout, spacing, typography, sizing, and visual hierarchy

Reuse existing Daily Check-In, Catch-Up Check-In, and Bottom Navigation implementations

Replace Wellness Score card with Vibe icon + chips + weight

Route all data access through the entity layer

Load Home using asynchronous requests with skeleton placeholders

Refresh only the affected pet card after a Check-In completes

Display timestamps using local timezone

Keep Home focused exclusively on today’s Vibe + symptoms

Ensure accessibility labels and semantic roles conform to the Design System