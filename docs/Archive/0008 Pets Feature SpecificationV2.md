

\# \*\*0008 Pets Feature Specification V2\*\*  

\*\*Document:\*\* 01 Features/Pets/Pets.md  

\*\*Status:\*\* Ready for Implementation  

\*\*Owner:\*\* Product  

\*\*Audience:\*\* Claude Code (Engineering)  

\*\*Purpose:\*\*  

The Pets screen is the owner’s permanent overview of every pet in their care.  

Unlike Home, which answers \*\*“How are my pets today?”\*\*, the Pets screen answers:  

\*\*“Tell me about every pet I manage.”\*\*



It serves as the entry point into each pet’s long‑term health profile while providing a high‑level summary of \*\*today’s Wellbeing observations only\*\*.  

This screen also separates active pets from Rainbow Bridge pets and allows new pets to be added.



This feature aligns with Navigation \& Information Architecture by making \*\*Pets\*\* the central destination for long‑term pet management.



\---



\# \*\*Functional Requirements\*\*



\## \*\*1. Screen Header\*\*

Display:

\- Paw icon  

\- Title: \*\*My Pets\*\*  

\- Subtitle: \*All the pets in your care, in one place.\*



Top‑right action:

\- \*\*Add Pet\*\* (primary button, plus icon)  

\- Launches the existing Add Pet workflow.



\---



\## \*\*2. Active Pets Section\*\*

Header: \*\*ACTIVE PETS\*\*  

Supporting text: \*Pets you monitor every day\*



Show only pets where:

\- `is\_memorial = false`



Ordering:

\- Active pets first  

\- Then by `created\_at` descending



\---



\## \*\*3. Pet Card (Active Pets)\*\*



Each pet card contains:



\### \*\*Identity\*\*

\- Photo  

\- Name  

\- Breed  

\- Species  

\- Sex  

\- Age (calculated, never stored)



\### \*\*Status Chips\*\*

Diagnosis chips from the pet profile:

\- Healthy  

\- CKD Stage II  

\- IBD  

\- Behavior  

\- Diabetes  

\- Arthritis  

\- etc.



\### \*\*Medication Chip\*\*

Display:

\- \*\*1 Medication\*\*, \*\*2 Medications\*\*, \*\*3 Medications\*\*, etc.  

Hidden if count = 0.



\### \*\*Today’s Logs (Wellbeing Only)\*\*

The Pets screen shows \*\*only Wellbeing attributes\*\*, per the v5 model and surface‑area rules:



\*\*Wellbeing attributes shown on PETS:\*\*

\- Energy  

\- Mobility  

\- Breathing  

\- Skin/Itching  

\- Behavior  



Each chip displays:

\- Icon  

\- Category  

\- Today’s value



\### \*\*Value Rules\*\*

\- \*\*No check‑in yet today:\*\* show \*\*“No check‑in yet”\*\*  

\- \*\*Unknown:\*\* if today’s check‑in exists but no value was logged  

\- \*\*Not Observed:\*\* if explicitly selected during check‑in  

\- \*\*Never collapse Unknown or Not Observed into Normal\*\*  

&#x20; (Product Principle #6: \*Unknown ≠ Normal\*)



\### \*\*Chevron\*\*

A right‑chevron appears on the card.  

Selecting anywhere on the card navigates to \*\*Pet Profile\*\*.



\---



\## \*\*4. Rainbow Bridge Section\*\*

Displayed only when memorial pets exist.



Header: \*\*RAINBOW BRIDGE\*\*  

Supporting text: \*Pets who will always be with us\*



Memorial pet cards display:

\- Identity  

\- Status chips  

\- \*\*In Memory\*\* label with Rainbow Bridge icon



Do \*\*not\*\* display:

\- Today’s Logs  

\- Vibe  

\- Symptom count  

\- Any daily check‑in data



Selecting a memorial pet opens \*\*Pet Profile\*\*.



\---



\## \*\*5. Add Pet\*\*

Selecting \*\*Add Pet\*\* launches the existing Add Pet workflow.



After successful creation:

\- Return to Pets  

\- Refresh list  

\- Scroll newly created pet into view



\---



\# \*\*UI Components\*\*

\- Header  

\- Primary Button  

\- Section Header  

\- Pet Card  

\- Status Chips  

\- Today’s Log Chips (Wellbeing only)  

\- Chevron  

\- Rainbow Bridge Card  

\- Empty State  

\- Loading Skeleton  

\- Error Banner



\---



\# \*\*User Interactions\*\*

\### \*\*Tap Pet Card\*\*

Navigate:  

\*\*Pets → Pet Profile\*\*



\### \*\*Tap Add Pet\*\*

Launch Add Pet dialog.



\### \*\*Return from Add Pet\*\*

Reload pets.  

Highlight newly added pet.



\### \*\*Pull to Refresh\*\*

Refresh:

\- Pets list  

\- Today’s Wellbeing logs



\---



\# \*\*Navigation\*\*

Bottom Navigation:

\- Home  

\- \*\*Pets (active)\*\*  

\- Menu



Navigation Flow:

\- Home → Pet Profile  

\- Pets → Pet Profile  

\- Pets → Add Pet → Pet Onboarding → Pets



\---



\# \*\*Empty States\*\*



\### \*\*No Pets\*\*

Display:

\- Illustration  

\- Headline: \*\*No pets yet\*\*  

\- Body: \*Add your first pet to begin tracking their health.\*  

\- Primary CTA: \*\*Add Pet\*\*



Hide:

\- Active Pets section  

\- Rainbow Bridge section



\### \*\*No Rainbow Bridge Pets\*\*

Hide section entirely.



\### \*\*Pet Has No Medications\*\*

Hide medication chip.



\### \*\*No Logs Today\*\*

Display Wellbeing categories with:

\- \*\*Unknown\*\*  

Do not imply Normal when no data exists.



\---



\# \*\*Loading States\*\*

Display skeleton cards including:

\- Photo  

\- Name  

\- Status chips  

\- Today’s Log chips



Do not shift layout after loading.



\---



\# \*\*Error States\*\*



\### \*\*Unable to load pets\*\*

Display inline error.  

Primary button: \*\*Retry\*\*



\### \*\*Unable to load today’s logs\*\*

Display: \*\*Unavailable\*\*  

Pet remains selectable.



\---



\# \*\*Business Rules\*\*

\- Only active pets appear in Active Pets.  

\- Only memorial pets appear in Rainbow Bridge.  

\- Age is calculated dynamically.  

\- Life stage is calculated dynamically.  

\- Medication count includes only active medications.  

\- Today’s Logs summarize \*\*today’s Wellbeing observations only\*\*.  

\- PETS does \*\*not\*\* display Vibe.  

\- PETS does \*\*not\*\* display Health attributes or Weight.  

\- Entire pet card is tappable.  

\- Pet Profile is the single destination for long‑term management.  

\- No editing occurs from Pets.  

\- Delete Pet is not available on this screen.



\---



\# \*\*Validation Rules\*\*

Pet must have:

\- Name  

\- Species  

\- Sex  

\- Birth precision  



Photo optional.  

Breed optional.  

Medication chip hidden when count = 0.



Today’s Logs:

\- Show Wellbeing attributes only  

\- Follow Unknown / Not Observed / No check‑in rules



\---



\# \*\*Data Requirements\*\*



\### \*\*Pet\*\*

\- id  

\- photo\_url  

\- name  

\- species  

\- breed  

\- sex  

\- birth\_date  

\- birth\_date\_precision  

\- conditions  

\- is\_memorial  



\### \*\*Medication\*\*

\- active count  



\### \*\*Today’s Wellbeing Summary\*\*

\- energy  

\- mobility  

\- breathing  

\- skin\_itching  

\- behavior  



\### \*\*Computed\*\*

\- age  

\- life\_stage  



No additional database changes required.



\---



\# \*\*Acceptance Criteria\*\*

A user can:

\- ✓ View all active pets  

\- ✓ View today’s Wellbeing summary  

\- ✓ View diagnosis chips  

\- ✓ View medication count  

\- ✓ Navigate to Pet Profile  

\- ✓ Add a new pet  

\- ✓ Return to Pets after pet creation  

\- ✓ View Rainbow Bridge pets separately  

\- ✓ Open memorial pet profiles  

\- ✓ Refresh the screen  

\- ✓ Use screen readers to identify each card



\---



\# \*\*Edge Cases\*\*

\- Pet without photo  

\- Pet without breed  

\- Pet without medications  

\- Pet with multiple diagnoses  

\- Pet without today’s check‑in  

\- Pet without today’s Wellbeing logs  

\- Large number of pets  

\- Only Rainbow Bridge pets  

\- Only one pet  

\- No pets  

\- Very long names  

\- Deleted pet while screen open  

\- Network reconnect after failure



\---



\# \*\*Implementation Notes for Claude Code\*\*

\- Preserve the existing visual design shown in the approved screen mockup.  

\- Do not redesign spacing, hierarchy, colors, typography, or component placement.  

\- Follow the Design System for all cards, buttons, chips, spacing, and accessibility.  

\- Route all data access through the entity client/data layer.  

\- Do \*\*not\*\* query Supabase directly from UI components.  

\- PETS must \*\*not\*\* display Vibe or Health attributes.  

\- PETS must display \*\*only Wellbeing attributes\*\*.  

\- Calculate age and life stage dynamically.  

\- Medication count includes only active medications.  

\- Entire pet card is tappable.  

\- Refresh list automatically when returning from Add Pet.  

\- Keep Rainbow Bridge section read‑only.  

\- Ensure loading, error, and empty states preserve layout.



Before coding:

\- Inspect Add Pet, Pet Profile, Daily Check‑In, and data layer implementations.  

\- Identify reusable components.  

\- Propose the smallest clean implementation plan before writing code.



After coding:

\- Run lint/type checks/tests.  

\- Provide summary of files changed.  

\- Note any migrations created.  

\- Note follow‑up items or assumptions.



\---





