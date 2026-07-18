
# **Feature Specification — Trends v4, aligned to Vibe Model**  
**Document:** 01 Features/Trends/Trends.md  
**Owner:** Product  
**Audience:** Claude Code  
**Status:** Replaces Trends v3. Removes all scoring logic. Fully adopts Vibe + raw symptom counts.

---

## **Purpose**
Provide a dedicated screen for visualizing changes in a pet’s health and wellbeing over time using **raw symptom counts**, **explicit daily observations**, and **Vibe** as the owner‑reported context.  
This screen is **read‑only** and reflects the new unified Daily Check‑In model.

---

# **Core Model Alignment**
Trends v4 adopts the v5 Daily Check‑In model:

### **1. No scoring exists anywhere**
- Wellness Score V1 (0–100) → removed  
- Health Score V2 (0–10) → removed  
- N/100 blended score → removed  
- All deduction logic → removed  
- All severity weighting → removed  
- All baseline comparison → removed  

### **2. Two independent daily signals**
- **Vibe** (Great Day / Off Day / Tough Day / Skipped)  
- **Symptom Count** (raw count of distinct symptoms logged across 11 categories)

### **3. Charts display raw symptom counts only**
Per‑day, per‑attribute states:
- **Normal (0 symptoms)**  
- **1 Symptom**  
- **2+ Symptoms**  
- **Not Observed** (Water Intake, Bathroom only)  
- **Skipped**  
- **No Check‑In**

### **4. Updated attribute model**
**Health (6):** Appetite, Water Intake, Bathroom, Stool, Vomiting, **Nausea**  
**Wellbeing (5):** Energy, Mobility, Breathing, Skin/Itching, **Behavior**  
**Weight:** separate, not part of symptom counts

---

# **Functional Requirements**

## **1. Entry Points**
Users access Trends via:
- **Pet Profile → Trends tab**
- **Home → tapping a Health attribute chip**
- **Pets / Pet Profile → tapping a Wellbeing chip**

Navigation must preserve the selected pet.

Entry point determines:
- Active group (Health or Wellbeing)
- Initial scroll position (deep‑linked attribute)

---

## **2. Header**
Displays:
- Back button  
- Pet photo  
- Pet name  
- Breed  
- Sex  
- Calendar button  
- Overflow menu (existing component)

---

## **3. Chart Model (Rewritten)**
### **All charts use raw symptom counts. No numeric score. No 0–10 axis.**

### **Chart Types**
- **Bar charts** for all Health + Wellbeing attributes  
- **Line chart** for Weight only  
 

### **Tap Interaction**
Tapping a bar reveals:
- Specific observation values logged that day  
- For Nausea: multi‑select values  
- For Bathroom/Water Intake: “Not Observed” when applicable

---

## **4. Attribute Cards**
Each attribute card displays:
- Current day’s state  
- A bar chart of historical states  
- Legend reflecting the six supported states  
- Tap → opens detailed history (future)

### **Weight Card**
- Displays latest weight  
- Shows line graph of weight history  
- Trend annotation (up/down/equal) based on weight change  
- Weight is **not** part of symptom counts

---

## **5. Insight Summary Card**
Insights reference:
- Vibe  
- Symptom count  
- Attribute‑level changes  

Insights **must not** reference:
- Health Score  
- numeric scoring  
- severity  
- deductions  

Example (aligned to v5 model):  
> “Tribble showed fewer symptoms today in Appetite and Mobility. Water Intake was not observed.”

---

# **6. Trends Tab — Attribute Group Charts**
### **Updated Groups**
**Health (6):** Appetite, Water Intake, Bathroom, Stool, Vomiting, Nausea  
**Wellbeing (5):** Energy, Mobility, Breathing, Skin/Itching, Behavior  
**Weight:** separate card, not part of either group

### **Behavior changes**
- Behavior is now part of Wellbeing  
- Nausea is now part of Health  
- Weight removed from Health group

### **Group Toggle**
- Defaults based on entry point  
- Health is default when opening Trends tab directly  
- Switching groups updates visible charts only

### **Scrolling**
- Deep‑linked attribute is scrolled into view and briefly highlighted

---

# **7. User Interactions**
Users may:
- Change date range (24H, 7D, 30D, 90D, 1Y)  
- Switch attribute group  
- Scroll vertically  
- Tap bars for detail  
- Navigate back  
- Switch tabs  

No editing occurs on this screen.

---

# **8. Empty States**
### **No Symptom Data**
“ No health trends available yet.”  
Primary action: Complete today’s Daily Check‑In.

### **No Weight History**
“ No weight history available.”

### **No Insight**
“ Complete more check-ins to unlock AI insights.”

---

# **9. Loading & Error States**
- Skeleton cards while loading  
- Charts load independently  
- If one metric fails:  
  “Unable to load trend.”  
- Insight failure:  
  “Insights unavailable.”

---

# **10. Business Rules (Updated)**
- **No scoring exists anywhere.**  
- **Every symptom counts equally.**  
- **No severity weighting.**  
- **No deductions.**  
- **No baseline comparison.**  
- **Every completed day writes explicit rows for all 11 categories.**  
- **Not Observed is a real logged value, not a symptom.**  
- **Skipped days are visually distinct from missing days.**  
- **Raw observation data is never modified after logging.**  
- **Future dates never shown.**  
- **Weight uses recorded measurements only.**  
- **AI summaries describe observations only; never diagnose.**

---

# **11. Data Requirements (Updated)**
Retrieve:
- Pet  
- Daily Check‑Ins  
- Vibe  
- Symptom count (persisted integer)  
- Observations per attribute per day  
- Weight history  
- AI summary  

Remove:
- wellness_scores.health_score  
- any score‑based fields  
- deduction logic  
- severity_score usage (field remains unused)

Charts must respect:
- Selected time window  
- Attribute group  
- Deep‑link state in URL

---

# **12. Acceptance Criteria**
✓ No numeric score displayed anywhere  
✓ All charts show raw symptom counts  
✓ Attribute groups updated (Nausea added, Behavior moved, Weight separated)  
✓ Chart states include Not Observed, Skipped, No Check‑In  
✓ Deep‑linking scrolls to correct attribute  
✓ Insight summary references Vibe + symptoms only  
✓ Weight chart remains a line graph  
✓ Trends is fully read‑only  
✓ All data retrieved through entity layer  
✓ Charts update smoothly without page reload  
✓ Skipped vs missing days visually distinct  
✓ Multi‑select categories show 2+ Symptoms correctly  
✓ Nausea fully supported  
✓ Behavior fully supported  
✓ No scoring logic remains anywhere

---

# **13. Edge Cases**
- First Daily Check‑In completed today  
- Only one historical data point  
- All values identical  
- Missing days  
- Skipped days  
- Multi‑select symptoms (2+)  
- No weight history  
- No observations  
- AI summary unavailable  
- Extremely long histories  
- Deep‑link to nonexistent attribute → no crash  
- Migrated days with symptom count but no Vibe  
- Not Observed vs Normal must remain distinct

---

# **14. Implementation Notes for Claude Code**
- Remove all scoring code paths  
- Remove Health Score components  
- Use existing chart infrastructure (TrendChart / ObservationCard)  
- Attribute lists come from canonical config.js  
- Vibe icon not displayed on Trends  
- Use persisted symptom_count for direction calculations  
- Weight remains separate  
- Deep‑link state lives in URL  
- No Supabase queries directly from UI  
- No new chart implementation—configuration only  
- severity_score remains in schema but unused
