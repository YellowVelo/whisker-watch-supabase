import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, UtensilsCrossed, Droplets, Zap, Rainbow } from 'lucide-react';
import { entities } from '@/api/entities';
import PageTransition from '../components/PageTransition';
import ObservationCard from '../components/trends/ObservationCard';
import VomitingNauseaCard from '../components/trends/VomitingNauseaCard';
import WeightCard from '../components/trends/WeightCard';
import InsightSummaryCard from '../components/trends/InsightSummaryCard';
import { RANGE_OPTIONS } from '@/lib/checkin/trendsClient';
import { getCategory, HEALTH_ATTRIBUTES, WELLBEING_ATTRIBUTES } from '@/lib/checkin/config';
import { getPetLabel } from '@/lib/speciesConfig';
import { track } from '@/lib/analytics';
import { PALETTE } from '@/lib/toneColors';
import { useAuth } from '@/lib/AuthContext';
import { detectTimezone } from '@/lib/timezone';

// Trends sub-tab: every Health/Wellbeing attribute gets its own chart here
// (unlike Overview, which only covers Appetite/Water/Energy/Weight/Insight
// Summary) — entry point picks which group loads first (Home's Health
// Attribute chips -> 'health', Pets'/Pet Profile's Wellbeing chips ->
// 'wellness'), and the in-page toggle lets the owner switch to the other
// group afterward so every attribute stays reachable. Vomiting and Nausea
// (both Health) render as one combined panel — the grouped-chart style the
// screen reverts to (spec: "Trends should revert to previous versions") —
// so `codes` for the health group omits them; VomitingNauseaCard renders
// separately alongside it.
const GROUPS = {
  health: { label: 'Health', codes: HEALTH_ATTRIBUTES.filter((c) => c !== 'vomiting' && c !== 'nausea'), includesVomitingNausea: true, includesWeight: true },
  wellness: { label: 'Wellness', codes: WELLBEING_ATTRIBUTES, includesVomitingNausea: false, includesWeight: false },
};

// "Trends" used to be a legacy sub-tab charting symptom_logs directly
// (previously PetProfileTabs' own "Trends" tab). That table stopped
// accumulating appetite/energy/stool/vomiting entries once Daily Check-In
// became the primary logging flow (Data Model_V2.md §7 — symptom_logs is
// now written to only for Weight), so that sub-tab was permanently stuck
// on "Need at least 2 logs to show trends" for any pet tracked purely
// through Daily Check-In, even when Overview (reading observations) had
// real trended data for the same pet. Fixed by rendering the same real,
// observations-backed cards for both "Overview" and "Trends" rather than
// maintaining a second, disconnected data path.
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'trends', label: 'Trends' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'compare', label: 'Compare' },
];

export default function PetTrends() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('section') || 'overview';
  const activeGroup = GROUPS[searchParams.get('group')] ? searchParams.get('group') : 'health';
  const metric = searchParams.get('metric');
  const cardRefs = useRef({});
  const [highlightedMetric, setHighlightedMetric] = useState(null);
  const { user } = useAuth();
  // Health Score Revision V2 — "today"/cutoff dates for every card on this
  // screen must agree with Home's, which uses the user's stored timezone
  // (spec §24). Without this, a check-in saved under the local evening
  // date would show as "not checked in today" here once UTC has already
  // rolled to the next calendar day.
  const timezone = user?.timezone || detectTimezone() || 'UTC';

  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [range, setRange] = useState('24H');
  // Debounced separately from the selected-range UI state so rapid
  // switching (spec edge case) doesn't fire a full query fan-out — and,
  // for InsightSummaryCard, a paid LLM call — per keystroke/tap.
  const [debouncedRange, setDebouncedRange] = useState('24H');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRange(range), 400);
    return () => clearTimeout(t);
  }, [range]);

  const loadPet = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const petData = await entities.Pet.get(petId);
      setPet(petData);
    } catch {
      setPet(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => { if (petId) loadPet(); }, [petId, loadPet]);

  useEffect(() => { if (pet) track('trends_viewed', { pet_id: pet.id }); }, [pet]);

  const setSection = (key) => {
    track('trends_section_changed', { pet_id: petId, section: key });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', key);
      next.delete('metric');
      return next;
    }, { replace: true });
  };

  const setGroup = (key) => {
    track('trends_group_changed', { pet_id: petId, group: key });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('group', key);
      next.delete('metric');
      return next;
    }, { replace: true });
  };

  // Deep-linked from Home/Pets chips via ?section=trends&group=...&metric=
  // — scroll to and briefly highlight the specific card the owner tapped
  // in from, same pattern as Pets.jsx's newly-added-pet highlight.
  useEffect(() => {
    if (activeSection !== 'trends' || !metric) return;
    const node = cardRefs.current[metric];
    if (!node) return;
    requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setHighlightedMetric(metric);
    const t = setTimeout(() => setHighlightedMetric((m) => (m === metric ? null : m)), 2500);
    return () => clearTimeout(t);
  }, [activeSection, activeGroup, metric]);

  // Tracked off the debounced value (not on every tap) so rapid range
  // switching doesn't write a burst of analytics_events rows — the same
  // mitigation already applied to the data fetches below.
  const isFirstRangeTrack = useRef(true);
  useEffect(() => {
    if (isFirstRangeTrack.current) { isFirstRangeTrack.current = false; return; }
    track('trends_range_changed', { pet_id: petId, range: debouncedRange });
  }, [debouncedRange, petId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{loadError ? 'Unable to load this pet.' : 'Pet not found.'}</p>
        {loadError && (
          <button onClick={loadPet} className="text-primary underline text-sm mt-2 block mx-auto">Retry</button>
        )}
        <Link to="/pets" className="text-primary underline text-sm mt-2 block">Go back</Link>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        {/* ── HEADER ── */}
        <header className="px-4 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0 px-3">
            <div className="h-11 w-11 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {pet.photo_url && <img src={pet.photo_url} alt={pet.name} className={`w-full h-full object-cover ${pet.is_memorial ? 'grayscale' : ''}`} />}
            </div>
            <div className="min-w-0">
              <p className="text-[20px] font-bold text-white truncate flex items-center gap-1.5">
                {pet.name}
                {pet.is_memorial && <Rainbow className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" aria-label="In memory" />}
              </p>
              <p className="text-[13px] text-white/45 truncate">
                {pet.is_memorial ? 'In Memory · ' : ''}{getPetLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}{pet.sex ? ` · ${pet.sex}` : ''}
              </p>
            </div>
          </div>
        </header>

        {/* ── SUB-TABS: Overview / Trends / Patterns / Compare ── */}
        <div role="tablist" aria-label="Trends sections" className="flex items-center gap-6 px-5 mt-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={activeSection === s.key}
              onClick={() => setSection(s.key)}
              className="pb-2.5 text-[15px] font-medium transition-colors"
              style={{
                color: activeSection === s.key ? PALETTE.sky : 'rgba(255,255,255,0.4)',
                borderBottom: activeSection === s.key ? `2px solid ${PALETTE.sky}` : '2px solid transparent',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <main className="max-w-2xl mx-auto px-4 pt-4">
          {activeSection === 'patterns' || activeSection === 'compare' ? (
            <div className="py-16 text-center">
              <p className="text-[15px] font-semibold text-white/60">{SECTIONS.find((s) => s.key === activeSection)?.label} coming soon</p>
              <p className="text-[13px] text-white/35 mt-1">This view isn't available yet.</p>
            </div>
          ) : (
            <>
              {/* ── TIME RANGE SELECTOR ── */}
              <div role="group" aria-label="Time range" className="flex rounded-full p-1 mb-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                    className="flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
                    style={range === r ? { background: PALETTE.sky, color: 'hsl(var(--background))' } : { color: 'rgba(255,255,255,0.5)' }}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {activeSection === 'trends' ? (
                <>
                  {/* ── HEALTH / WELLNESS GROUP TOGGLE ── */}
                  <div role="group" aria-label="Attribute group" className="flex rounded-full p-1 mb-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {Object.entries(GROUPS).map(([key, g]) => (
                      <button
                        key={key}
                        aria-pressed={activeGroup === key}
                        onClick={() => setGroup(key)}
                        className="flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
                        style={activeGroup === key ? { background: PALETTE.sky, color: 'hsl(var(--background))' } : { color: 'rgba(255,255,255,0.5)' }}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {GROUPS[activeGroup].codes.map((code) => {
                      const category = getCategory(code);
                      return (
                        <div
                          key={code}
                          ref={(el) => { cardRefs.current[code] = el; }}
                          className="rounded-2xl transition-shadow"
                          style={highlightedMetric === code ? { boxShadow: `0 0 0 2px ${PALETTE.sky}` } : undefined}
                        >
                          <ObservationCard petId={petId} range={debouncedRange} code={code} label={category?.label || code} icon={category?.icon} timezone={timezone} />
                        </div>
                      );
                    })}
                    {GROUPS[activeGroup].includesVomitingNausea && (
                      <div
                        ref={(el) => { cardRefs.current.vomiting = el; cardRefs.current.nausea = el; }}
                        className="rounded-2xl transition-shadow"
                        style={(highlightedMetric === 'vomiting' || highlightedMetric === 'nausea') ? { boxShadow: `0 0 0 2px ${PALETTE.sky}` } : undefined}
                      >
                        <VomitingNauseaCard petId={petId} range={debouncedRange} timezone={timezone} />
                      </div>
                    )}
                    {GROUPS[activeGroup].includesWeight && (
                      <div ref={(el) => { cardRefs.current.weight = el; }} className="rounded-2xl transition-shadow" style={highlightedMetric === 'weight' ? { boxShadow: `0 0 0 2px ${PALETTE.sky}` } : undefined}>
                        <WeightCard petId={petId} range={debouncedRange} timezone={timezone} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <ObservationCard petId={petId} range={debouncedRange} code="appetite" label="Appetite" icon={UtensilsCrossed} timezone={timezone} />
                  <ObservationCard petId={petId} range={debouncedRange} code="water_intake" label="Water Intake" icon={Droplets} timezone={timezone} />
                  <ObservationCard petId={petId} range={debouncedRange} code="energy" label="Energy" icon={Zap} timezone={timezone} />
                  <WeightCard petId={petId} range={debouncedRange} timezone={timezone} />
                  <InsightSummaryCard petId={petId} petName={pet.name} range={debouncedRange} timezone={timezone} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
