import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import type { Simulation } from "../../agent-skills/src/lib/simulation.js";
import { frameDelayMs, nextFrame, previousFrame, SPEEDS, type Speed } from "../../agent-skills/src/lib/simulationPlayback.js";
import { Markdown } from "../ds/markdown.js";
import styles from "../pages/playbooks.module.css";

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PlaybookSimulation({ simulation, sourceHref, sourcePath }: { simulation: Simulation; sourceHref: string; sourcePath: string }) {
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [reduced, setReduced] = useState(reducedMotion);
  const [playing, setPlaying] = useState(() => !reducedMotion() && simulation.turns.length > 1);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => { setReduced(event.matches); if (event.matches) setPlaying(false); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (!playing || reduced || frame >= simulation.turns.length - 1) return;
    const timer = window.setTimeout(() => { const next = nextFrame(frame, simulation.turns.length); setFrame(next); if (next >= simulation.turns.length - 1) setPlaying(false); }, frameDelayMs(speed));
    return () => window.clearTimeout(timer);
  }, [frame, playing, reduced, simulation.turns.length, speed]);

  const move = (next: number) => { setPlaying(false); setFrame(next); };
  const frameStatus = `frame ${frame + 1} of ${simulation.turns.length}`;
  return (
    <section className={styles.terminal} aria-label="Simulation playback" data-testid="opencode-playbook-simulation">
      <div className={styles.terminalBar}><i className={styles.light} /><i className={styles.light} /><i className={styles.light} /><span className={styles.terminalPath}>{sourcePath}</span><a className={styles.terminalSource} href={sourceHref} rel="noreferrer" target="_blank">source</a></div>
      <div className={styles.terminalControls} data-testid="opencode-playbook-simulation-controls"><button aria-label={playing ? "Pause simulation" : "Play simulation"} className={`${styles.terminalButton} ${styles.terminalButtonPrimary}`} data-testid="opencode-playbook-simulation-play" disabled={reduced || frame >= simulation.turns.length - 1} onClick={() => setPlaying((value) => !value)} type="button">{playing ? <Pause aria-hidden="true" size={12} /> : <Play aria-hidden="true" size={12} />} {playing ? "Pause" : "Play"}</button><button aria-label="Reset simulation" className={styles.terminalButton} data-testid="opencode-playbook-simulation-reset" disabled={frame === 0} onClick={() => move(0)} type="button"><RotateCcw aria-hidden="true" size={11} /> Reset</button><button aria-label="Previous frame" className={styles.terminalButton} data-testid="opencode-playbook-simulation-previous" disabled={frame === 0} onClick={() => move(previousFrame(frame))} type="button">‹ Previous</button><button aria-label="Next frame" className={styles.terminalButton} data-testid="opencode-playbook-simulation-next" disabled={frame >= simulation.turns.length - 1} onClick={() => move(nextFrame(frame, simulation.turns.length))} type="button">Next ›</button><label className={styles.terminalStatus}>speed <select aria-label="Playback speed" data-testid="opencode-playbook-simulation-speed" onChange={(event) => setSpeed(Number(event.target.value) as Speed)} value={speed}>{SPEEDS.map((option) => <option key={option} value={option}>{option}x</option>)}</select></label><span aria-live="polite" className={styles.terminalStatus} data-testid="opencode-playbook-simulation-status">{reduced ? "autoplay off" : frameStatus}</span></div>
      <progress aria-label="Simulation playback progress" className={styles.progress} data-testid="opencode-playbook-simulation-progress" max={simulation.turns.length - 1} value={frame} />
      <ol className={styles.terminalTurns}>{simulation.turns.slice(0, frame + 1).map((turn, index) => <li className={`${styles.turn} ${turn.role === "assistant" ? styles.turnAssistant : turn.role === "tool" ? styles.turnTool : turn.role === "note" ? styles.turnNote : ""}`} key={`${turn.role}-${index}`}><p className={styles.turnRole}>{turn.role}{turn.label ? ` / ${turn.label}` : ""}</p><Markdown source={turn.body} /></li>)}</ol>
      <p className={styles.terminalCaveat}><strong>Caveat:</strong> {simulation.caveat}</p>
    </section>
  );
}
