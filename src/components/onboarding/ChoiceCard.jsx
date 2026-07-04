// Single-question, single-select card used throughout Pet Onboarding.
// One question, large tappable options, one primary action per screen —
// per the Calm-inspired card wizard requirement.
export default function ChoiceCard({ eyebrow, title, question, options, value, onSelect, disabled }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">{eyebrow}</p>}
        <h2 className="font-serif text-2xl text-foreground leading-snug">{title}</h2>
        {question && <p className="text-base text-muted-foreground">{question}</p>}
      </div>
      <div className="flex flex-col gap-3" role="radiogroup" aria-label={question || title}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onSelect(opt.value)}
              className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-colors min-h-[60px] disabled:opacity-60 ${
                selected
                  ? 'bg-primary/15 border-primary text-foreground'
                  : 'bg-card border-border text-foreground hover:border-primary/50'
              }`}
            >
              <span className="text-base font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
