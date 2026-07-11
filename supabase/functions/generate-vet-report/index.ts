// Supabase Edge Function: generate-vet-report
//
// Client-callable (user JWT, not service-role — see Vet Export Feature
// Spec §5.1). Assembles a clinic-ready PDF health report for one pet and
// returns it as a binary stream. The caller's own JWT is used to create
// the Supabase client below, so every query is subject to normal RLS
// (`is_pet_owner()`) — a user can only ever generate a report for a pet
// they own or co-own. There is no separate "check the user owns this
// pet" step because RLS makes that structurally true: a `pets` fetch for
// a pet the caller doesn't own simply returns no row.
//
// Request body: { petId: string, format?: 'pdf' }
//   - format is optional and currently only 'pdf' is supported (DOCX was
//     scoped out of v1 — see spec discussion; no DOCX-with-charts library
//     exists in this project yet). Any other value is a 400.
// Response: 200 with a `application/pdf` binary body, or a structured
//   JSON error ({ error: { code, message } }) on 400/403/500.
//
// Data sources and why (Data Model_V2.md is the source of truth here,
// not the original spec's table names, some of which don't exist):
//   - Wellness Overview uses `wellness_scores.health_score` (V2, 0-10,
//     migrations 0021/0022) — the score the app itself surfaces today —
//     not the legacy 0-100 `score` column the original spec described.
//   - "owner_profile" in the spec maps to `profiles` (name + email only;
//     there is no phone/emergency-contact column on profiles today).
//   - Weight comes from `symptom_logs.weight_grams` — there is no
//     `weight_observations` table; weight is still legacy-only
//     (Data Model_V2.md §7).
//   - `pet_baselines` is queried but is expected to be empty today
//     (nothing in the app writes to it yet) — the section renders a
//     plain "not yet available" note rather than fabricating data.
//
// Observations and food logs are capped to the last 180 days (spec §9
// performance guidance); a note is added to the report when older data
// exists but isn't shown.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const DAYS_WINDOW = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonError(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── PDF layout helper ──────────────────────────────────────────────────
// Tracks the current write position across pages so every section
// (tables, headings, charts) can just ask for vertical space and get a
// new page automatically when the current one runs out — pdf-lib itself
// has no page-flow concept, so this is the minimum needed to assemble a
// multi-page document by hand.
const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

class ReportBuilder {
  doc: any;
  font: any;
  bold: any;
  page: any;
  y: number;

  constructor(doc: any, font: any, bold: any) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensureSpace(height: number) {
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  text(str: string, { size = 10, font = this.font, color = rgb(0.1, 0.1, 0.1), x = MARGIN, gap = 4 } = {}) {
    this.ensureSpace(size + gap);
    this.page.drawText(str, { x, y: this.y - size, size, font, color });
    this.y -= size + gap;
  }

  wrapText(str: string, maxWidth: number, size: number, font: any): string[] {
    const words = (str || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  paragraph(str: string, { size = 10, font = this.font, color = rgb(0.15, 0.15, 0.15), x = MARGIN } = {}) {
    for (const line of this.wrapText(str, CONTENT_WIDTH - (x - MARGIN), size, font)) {
      this.text(line, { size, font, color, x });
    }
  }

  heading(str: string) {
    this.ensureSpace(28);
    this.y -= 10;
    this.text(str, { size: 15, font: this.bold, color: rgb(0.05, 0.05, 0.05) });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 1,
      color: rgb(0.75, 0.75, 0.75),
    });
    this.y -= 10;
  }

  // Simple left-aligned column table. `columns` is [{ header, width }],
  // `rows` is an array of string arrays matching column count. Cell text
  // wraps within its column width (leaving a small gutter so adjacent
  // columns never visually collide — e.g. a long medication name used to
  // overrun into the Dosage column) and each row's height grows to fit
  // its tallest cell rather than a fixed single line.
  table(columns: { header: string; width: number }[], rows: string[][]) {
    const lineHeight = 12;
    const cellGutter = 8;
    const headerRowHeight = 16;

    this.ensureSpace(headerRowHeight + 4);
    let x = MARGIN;
    for (const col of columns) {
      this.page.drawText(col.header, { x, y: this.y - 10, size: 9, font: this.bold, color: rgb(0.35, 0.35, 0.35) });
      x += col.width;
    }
    this.y -= headerRowHeight;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 4 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y + 4 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    for (const row of rows) {
      const cellLines = columns.map((col, i) => this.wrapText(row[i] ?? '—', col.width - cellGutter, 9, this.font));
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + 4;

      this.ensureSpace(rowHeight);
      x = MARGIN;
      for (let i = 0; i < columns.length; i++) {
        let lineY = this.y - 10;
        for (const line of cellLines[i]) {
          this.page.drawText(line, { x, y: lineY, size: 9, font: this.font, color: rgb(0.15, 0.15, 0.15) });
          lineY -= lineHeight;
        }
        x += columns[i].width;
      }
      this.y -= rowHeight;
    }
    this.y -= 6;
  }

  // Minimal hand-drawn line chart — no canvas/chart library available in
  // this Deno runtime, so points are scaled directly into a bounding box
  // using pdf-lib's own vector primitives (spec §7 "charts generated
  // server-side," fulfilled without a raster/image dependency).
  lineChart(points: { label: string; value: number }[], { height = 120, min = null as number | null, max = null as number | null } = {}) {
    if (points.length < 2) {
      this.paragraph('Not enough data yet to chart a trend.', { color: rgb(0.5, 0.5, 0.5) });
      return;
    }
    this.ensureSpace(height + 30);
    const chartWidth = CONTENT_WIDTH;
    const top = this.y;
    const bottom = this.y - height;
    const values = points.map((p) => p.value);
    const lo = min ?? Math.min(...values);
    const hi = max ?? Math.max(...values);
    const span = hi - lo || 1;

    this.page.drawRectangle({
      x: MARGIN, y: bottom, width: chartWidth, height,
      borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1,
    });

    const stepX = chartWidth / (points.length - 1);
    const toXY = (i: number) => ({
      x: MARGIN + i * stepX,
      y: bottom + ((points[i].value - lo) / span) * height,
    });

    for (let i = 0; i < points.length - 1; i++) {
      const a = toXY(i);
      const b = toXY(i + 1);
      this.page.drawLine({ start: a, end: b, thickness: 1.5, color: rgb(0.15, 0.45, 0.85) });
    }
    for (let i = 0; i < points.length; i++) {
      const p = toXY(i);
      this.page.drawCircle({ x: p.x, y: p.y, size: 1.6, color: rgb(0.1, 0.35, 0.7) });
    }

    this.page.drawText(`${lo}`, { x: MARGIN, y: bottom - 12, size: 8, font: this.font, color: rgb(0.5, 0.5, 0.5) });
    this.page.drawText(`${hi}`, { x: MARGIN, y: top + 4, size: 8, font: this.font, color: rgb(0.5, 0.5, 0.5) });
    this.page.drawText(points[0].label, { x: MARGIN, y: bottom - 12, size: 8, font: this.font, color: rgb(0.5, 0.5, 0.5) });
    const lastLabel = points[points.length - 1].label;
    this.page.drawText(lastLabel, {
      x: PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(lastLabel, 8), y: bottom - 12, size: 8, font: this.font, color: rgb(0.5, 0.5, 0.5),
    });

    this.y = bottom - 24;
  }

  finalize() {
    const pages = this.doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      p.drawText(`Generated by Wysker Watch · ${formatDate(new Date().toISOString())} · Page ${i + 1} of ${pages.length}`, {
        x: MARGIN, y: 24, size: 8, font: this.font, color: rgb(0.55, 0.55, 0.55),
      });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('unauthorized', 'Missing Authorization header', 401);

    const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) return jsonError('unauthorized', 'Unauthorized', 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError('invalid_request', 'Request body must be valid JSON', 400);
    }

    const petId = body.petId;
    const format = (body.format as string) || 'pdf';
    if (typeof petId !== 'string' || !UUID_RE.test(petId)) {
      return jsonError('invalid_pet_id', 'A valid petId is required', 400);
    }
    if (format !== 'pdf') {
      return jsonError('unsupported_format', 'Only "pdf" is supported at this time', 400);
    }

    // RLS (is_pet_owner()) means this returns no row if the caller
    // doesn't own/co-own the pet — treated as 403 rather than 404 so we
    // don't reveal whether the id exists at all.
    const { data: pet, error: petError } = await supabaseClient.from('pets').select('*').eq('id', petId).maybeSingle();
    if (petError) throw petError;
    if (!pet) return jsonError('forbidden', 'You do not have access to this pet', 403);

    const sinceDate = new Date(Date.now() - DAYS_WINDOW * MS_PER_DAY).toISOString().slice(0, 10);

    const [
      { data: profile },
      { data: wellnessScores },
      { data: baselines },
      { data: observations, count: observationsTotalCount },
      { data: observationTypes },
      { data: medications },
      { data: vaccinations },
      { data: foodLogs, count: foodLogsTotalCount },
      { data: symptomLogs },
      { data: bloodwork },
    ] = await Promise.all([
      supabaseClient.from('profiles').select('first_name, last_name, email').eq('id', userData.user.id).maybeSingle(),
      supabaseClient.from('wellness_scores').select('check_in_date, health_score, health_score_version, score_reason_summary')
        .eq('pet_id', petId).order('check_in_date', { ascending: false }).limit(90),
      supabaseClient.from('pet_baselines').select('*').eq('pet_id', petId).is('effective_to', null),
      supabaseClient.from('observations').select('observed_at, observation_type_id, value, numeric_value, notes', { count: 'exact' })
        .eq('pet_id', petId).gte('observed_at', sinceDate).order('observed_at', { ascending: false }).limit(500),
      supabaseClient.from('observation_types').select('id, code, label'),
      supabaseClient.from('medications').select('*').eq('pet_id', petId).order('active', { ascending: false }).order('start_date', { ascending: false }),
      supabaseClient.from('vaccinations').select('*').eq('pet_id', petId).order('date_given', { ascending: false }),
      supabaseClient.from('food_logs').select('*', { count: 'exact' }).eq('pet_id', petId).gte('date', sinceDate).order('date', { ascending: false }).limit(500),
      supabaseClient.from('symptom_logs').select('date, weight_grams').eq('pet_id', petId).not('weight_grams', 'is', null).gte('date', sinceDate).order('date', { ascending: true }),
      supabaseClient.from('bloodwork').select('*').eq('pet_id', petId).order('date', { ascending: false }),
    ]);

    const typeLabelById = new Map((observationTypes || []).map((t: any) => [t.id, t.label]));

    // ── Assemble PDF ──────────────────────────────────────────────────
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const r = new ReportBuilder(doc, font, bold);

    // Cover / header
    r.text(pet.name || 'Unnamed Pet', { size: 24, font: bold, gap: 6 });
    r.text(`${pet.species || ''}${pet.breed ? ` · ${pet.breed}` : ''}`, { size: 11, color: rgb(0.4, 0.4, 0.4) });
    const identityBits = [
      pet.sex ? `Sex: ${pet.sex}` : null,
      pet.altered_status ? `Altered: ${pet.altered_status}` : null,
      pet.birth_date ? `DOB: ${formatDate(pet.birth_date)}` : null,
      pet.microchip_number ? `Microchip: ${pet.microchip_number}` : null,
    ].filter(Boolean).join('   ');
    if (identityBits) r.text(identityBits, { size: 9, color: rgb(0.45, 0.45, 0.45) });
    if (pet.conditions?.length) r.paragraph(`Conditions: ${pet.conditions.join(', ')}`, { size: 9 });

    const ownerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Owner';
    r.text(`Prepared for: ${ownerName}${profile?.email ? ` (${profile.email})` : ''}`, { size: 9, color: rgb(0.45, 0.45, 0.45) });
    r.text(`Report generated: ${formatDate(new Date().toISOString())}`, { size: 9, color: rgb(0.45, 0.45, 0.45), gap: 10 });

    // Wellness Overview
    r.heading('Wellness Overview');
    const v2Scores = (wellnessScores || []).filter((w: any) => w.health_score_version === 'health_score_v2' && w.health_score != null);
    if (v2Scores.length > 0) {
      const latest = v2Scores[0];
      r.text(`Current Health Score: ${latest.health_score} / 10 (as of ${formatDate(latest.check_in_date)})`, { size: 11, font: bold });
      if (latest.score_reason_summary) r.paragraph(`Recent factors: ${latest.score_reason_summary}`, { size: 9, color: rgb(0.45, 0.45, 0.45) });
      const chartPoints = [...v2Scores].reverse().map((w: any) => ({ label: formatDate(w.check_in_date), value: w.health_score }));
      r.lineChart(chartPoints, { min: 0, max: 10 });
    } else {
      r.paragraph('No Health Score data has been recorded for this pet yet.', { color: rgb(0.5, 0.5, 0.5) });
    }

    // Baselines & Deviations
    r.heading('Baselines & Deviations');
    if ((baselines || []).length > 0) {
      r.table(
        [{ header: 'Metric', width: 150 }, { header: 'Baseline', width: 150 }, { header: 'Confidence', width: 100 }, { header: 'Source', width: 100 }],
        baselines.map((b: any) => [
          typeLabelById.get(b.observation_type_id) || '—',
          b.baseline_value || (b.baseline_numeric_value != null ? String(b.baseline_numeric_value) : '—'),
          b.confidence_level || '—',
          b.source || '—',
        ]),
      );
    } else {
      r.paragraph('No baseline has been established for this pet yet.', { color: rgb(0.5, 0.5, 0.5) });
    }

    // Daily Observations Timeline
    r.heading('Daily Observations');
    const scorableObservations = (observations || []).filter((o: any) => o.value && o.value !== 'normal' && o.value !== 'none');
    if (scorableObservations.length > 0) {
      r.table(
        [{ header: 'Date', width: 80 }, { header: 'Category', width: 110 }, { header: 'Observation', width: 180 }, { header: 'Notes', width: 130 }],
        scorableObservations.slice(0, 150).map((o: any) => [
          formatDate(o.observed_at),
          typeLabelById.get(o.observation_type_id) || '—',
          o.value || (o.numeric_value != null ? String(o.numeric_value) : '—'),
          o.notes || '—',
        ]),
      );
      if ((observationsTotalCount || 0) > (observations || []).length || scorableObservations.length > 150) {
        r.paragraph(`Showing observations from the last ${DAYS_WINDOW} days (data truncated). Older records are not included in this report.`, { size: 8, color: rgb(0.55, 0.55, 0.55) });
      }
    } else {
      r.paragraph(`No notable observations logged in the last ${DAYS_WINDOW} days.`, { color: rgb(0.5, 0.5, 0.5) });
    }

    // Weight Trend
    r.heading('Weight Trend');
    if ((symptomLogs || []).length > 0) {
      const weightPoints = symptomLogs.map((s: any) => ({ label: formatDate(s.date), value: Math.round((s.weight_grams / 453.59237) * 10) / 10 }));
      r.lineChart(weightPoints);
      r.table(
        [{ header: 'Date', width: 150 }, { header: 'Weight (lbs)', width: 150 }],
        [...symptomLogs].reverse().slice(0, 60).map((s: any) => [formatDate(s.date), `${(s.weight_grams / 453.59237).toFixed(1)}`]),
      );
    } else {
      r.paragraph(`No weight entries recorded in the last ${DAYS_WINDOW} days.`, { color: rgb(0.5, 0.5, 0.5) });
    }

    // Medications
    r.heading('Medications');
    if ((medications || []).length > 0) {
      r.table(
        [{ header: 'Name', width: 110 }, { header: 'Dosage', width: 90 }, { header: 'Frequency', width: 90 }, { header: 'Prescribing Vet', width: 100 }, { header: 'Status', width: 90 }],
        medications.map((m: any) => [m.name, m.dosage || '—', m.frequency || '—', m.prescribing_vet || '—', m.active ? 'Active' : 'Inactive']),
      );
    } else {
      r.paragraph('No medications on file.', { color: rgb(0.5, 0.5, 0.5) });
    }

    // Vaccinations
    r.heading('Vaccinations');
    if ((vaccinations || []).length > 0) {
      r.table(
        [{ header: 'Vaccine', width: 130 }, { header: 'Date Given', width: 100 }, { header: 'Next Due', width: 100 }, { header: 'Notes', width: 150 }],
        vaccinations.map((v: any) => [v.vaccine_name, formatDate(v.date_given), formatDate(v.next_due_date), v.notes || '—']),
      );
    } else {
      r.paragraph('No vaccination records on file.', { color: rgb(0.5, 0.5, 0.5) });
    }

    // Diet & Food Logs
    r.heading('Diet & Food Logs');
    if ((foodLogs || []).length > 0) {
      r.table(
        [{ header: 'Date', width: 80 }, { header: 'Food', width: 150 }, { header: 'Amount Eaten', width: 110 }, { header: 'Notes', width: 130 }],
        foodLogs.slice(0, 150).map((f: any) => [formatDate(f.date), `${f.food_name}${f.brand ? ` (${f.brand})` : ''}`, f.amount_eaten || '—', f.notes || '—']),
      );
      if ((foodLogsTotalCount || 0) > foodLogs.length || foodLogs.length > 150) {
        r.paragraph(`Showing food logs from the last ${DAYS_WINDOW} days (data truncated). Older records are not included in this report.`, { size: 8, color: rgb(0.55, 0.55, 0.55) });
      }
    } else {
      r.paragraph(`No food logs recorded in the last ${DAYS_WINDOW} days.`, { color: rgb(0.5, 0.5, 0.5) });
    }

    // Bloodwork
    r.heading('Bloodwork');
    if ((bloodwork || []).length > 0) {
      const panels: { title: string; fields: [string, string][] }[] = [
        { title: 'Renal', fields: [['bun', 'BUN'], ['creatinine', 'Creatinine'], ['sdma', 'SDMA']] },
        { title: 'Liver', fields: [['alt', 'ALT'], ['ast', 'AST'], ['alkaline_phosphatase', 'ALP'], ['total_bilirubin', 'Total Bilirubin']] },
        { title: 'Endocrine', fields: [['glucose', 'Glucose'], ['t4', 'T4']] },
        { title: 'Other', fields: [['phosphorus', 'Phosphorus'], ['potassium', 'Potassium'], ['sodium', 'Sodium'], ['calcium', 'Calcium'], ['hematocrit', 'Hematocrit'], ['hemoglobin', 'Hemoglobin'], ['total_protein', 'Total Protein'], ['albumin', 'Albumin']] },
      ];
      for (const record of bloodwork) {
        r.text(`${formatDate(record.date)}${record.lab_name ? ` · ${record.lab_name}` : ''}${record.vet_name ? ` · ${record.vet_name}` : ''}`, { size: 10, font: bold, gap: 6 });
        for (const panel of panels) {
          const present = panel.fields.filter(([key]) => record[key] != null);
          if (present.length === 0) continue;
          r.text(panel.title, { size: 9, font: bold, x: MARGIN + 8, color: rgb(0.35, 0.35, 0.35) });
          r.paragraph(present.map(([key, label]) => `${label}: ${record[key]}`).join('   ·   '), { size: 9, x: MARGIN + 8 });
        }
        r.y -= 6;
      }
    } else {
      r.paragraph('No bloodwork on file.', { color: rgb(0.5, 0.5, 0.5) });
    }

    r.finalize();
    const pdfBytes = await doc.save();

    const filename = `${(pet.name || 'pet').replace(/[^a-z0-9]+/gi, '-')}-vet-report.pdf`;
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('generate-vet-report error:', err);
    return jsonError('report_generation_failed', 'Something went wrong generating this report', 500);
  }
});
