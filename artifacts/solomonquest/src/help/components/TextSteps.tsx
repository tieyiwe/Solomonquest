import type { GuideStep } from "../types";

/** Numbered, plain text steps with short tips (also the static fallback for animated guides). */
export function TextSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="space-y-4" data-testid="text-steps">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-sm font-semibold text-primary-foreground">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{s.title}</p>
            <p className="text-sm text-foreground/80 mt-0.5">{s.text}</p>
            {s.tip && (
              <p className="mt-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-foreground/80">
                Tip: {s.tip}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
