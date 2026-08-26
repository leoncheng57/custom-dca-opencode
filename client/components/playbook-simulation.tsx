import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import type { Simulation } from "../../agent-skills/src/lib/simulation.js";
import { frameDelayMs, nextFrame, previousFrame, SPEEDS, type Speed } from "../../agent-skills/src/lib/simulationPlayback.js";
import { Button } from "../ds/button.js";
import { Markdown } from "../ds/markdown.js";

const ROLE_STYLE = {
  user: "border-[var(--color-border-focus)] bg-[var(--color-background-surface-info-muted)]",
  assistant: "border-[var(--color-border-default)] bg-[var(--color-background-surface-success-muted)]",
  tool: "border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)]",
  note: "border-[var(--color-border-default)] bg-[var(--color-background-surface-warning-muted)]",
} as const;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PlaybookSimulation({ simulation }: { simulation: Simulation }) {
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(() => !reducedMotion() && simulation.turns.length > 1);

  useEffect(() => {
    if (!playing || frame >= simulation.turns.length - 1) return;
    const timer = window.setTimeout(() => {
      const next = nextFrame(frame, simulation.turns.length);
      setFrame(next);
      if (next >= simulation.turns.length - 1) setPlaying(false);
    }, frameDelayMs(speed));
    return () => window.clearTimeout(timer);
  }, [frame, playing, simulation.turns.length, speed]);

  const move = (next: number) => {
    setPlaying(false);
    setFrame(next);
  };

  return (
    <section aria-label="Simulation playback" className="space-y-4" data-testid="opencode-playbook-simulation">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={reducedMotion() || frame >= simulation.turns.length - 1} onClick={() => setPlaying((value) => !value)} size="sm" type="button" variant="secondary">
          {playing ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
          <span className="ml-1">{playing ? "Pause" : "Play"}</span>
        </Button>
        <Button disabled={frame === 0} onClick={() => move(previousFrame(frame))} size="sm" type="button" variant="ghost"><ChevronLeft aria-hidden="true" size={14} /> Previous</Button>
        <Button disabled={frame >= simulation.turns.length - 1} onClick={() => move(nextFrame(frame, simulation.turns.length))} size="sm" type="button" variant="ghost">Next <ChevronRight aria-hidden="true" size={14} /></Button>
        <Button onClick={() => move(0)} size="sm" type="button" variant="ghost"><RotateCcw aria-hidden="true" size={14} /> Reset</Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          Speed
          <select className="rounded border border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-2 py-1 text-[var(--color-text-default)]" onChange={(event) => setSpeed(Number(event.target.value) as Speed)} value={speed}>
            {SPEEDS.map((option) => <option key={option} value={option}>{option}x</option>)}
          </select>
        </label>
      </div>
      <p aria-live="polite" className="text-xs text-[var(--color-text-muted)]">Turn {frame + 1} of {simulation.turns.length}</p>
      <ol className="space-y-3">
        {simulation.turns.slice(0, frame + 1).map((turn, index) => (
          <li className={`rounded-lg border-l-4 p-4 ${ROLE_STYLE[turn.role]}`} key={`${turn.role}-${index}`}>
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">{turn.role}{turn.label ? ` / ${turn.label}` : ""}</p>
            <Markdown source={turn.body} />
          </li>
        ))}
      </ol>
      <p className="border-l-4 border-[var(--color-border-default)] pl-3 text-xs leading-relaxed text-[var(--color-text-muted)]"><strong>Caveat:</strong> {simulation.caveat}</p>
    </section>
  );
}
