// Formats a pet's onboarding baseline (the same `pet_onboarding` row
// BaselineSection.jsx reads/writes) into a short, human-readable line for
// AI prompt context (spec 0031). Omits any field the owner never set
// instead of guessing, so a partially-completed baseline degrades
// gracefully rather than showing blank/misleading fields.
import {
  HEALTH_OPTIONS, APPETITE_OPTIONS, WATER_OPTIONS, ENERGY_OPTIONS,
  getMobilityOptions, getBathroomOptions,
} from '@/lib/onboardingConfig';

const labelFor = (options, value) => options.find((o) => o.value === value)?.label;

export function formatBaselineForAI(baseline, petName, species) {
  if (!baseline) return null;

  const parts = [
    baseline.health_status && labelFor(HEALTH_OPTIONS(petName), baseline.health_status),
    baseline.appetite_baseline && `Appetite: ${labelFor(APPETITE_OPTIONS, baseline.appetite_baseline)}`,
    baseline.water_baseline && `Water intake: ${labelFor(WATER_OPTIONS, baseline.water_baseline)}`,
    baseline.energy_baseline && `Energy: ${labelFor(ENERGY_OPTIONS, baseline.energy_baseline)}`,
    baseline.mobility_baseline && `Mobility: ${labelFor(getMobilityOptions(species), baseline.mobility_baseline)}`,
    baseline.bathroom_baseline && `Bathroom habits: ${labelFor(getBathroomOptions(species), baseline.bathroom_baseline)}`,
  ].filter(Boolean);

  return parts.length ? parts.join('; ') : null;
}
