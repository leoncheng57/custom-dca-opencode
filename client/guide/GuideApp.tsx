import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Menu, Monitor, Smartphone, X } from "lucide-react";

import { Button } from "../ds/button.js";
import { findGuideScene, guideChapters, guideScenes, type GuideScene, type GuideTone } from "./scenes.js";
import "./guide.css";

type Viewport = "desktop" | "mobile";

const repository = "https://github.com/leoncheng57/custom-dca-opencode";

const sourceLinks = [
  ["Repository", repository],
  ["Contributor guide", `${repository}/blob/main/CONTRIBUTING.md`],
  ["Architecture", `${repository}/blob/main/docs/architecture.md`],
  ["Sub-agent derivation", `${repository}/blob/main/docs/subagents.md`],
  ["OpenCode API audit", `${repository}/blob/main/docs/opencode-1.18.21-api-audit.md`],
  ["Deployment and mobile", `${repository}/blob/main/deploy/README.md`],
] as const;

function initialSelection() {
  const fromHash = findGuideScene(window.location.hash.replace(/^#(?:simulation-)?/, ""));
  return fromHash ?? { chapter: guideChapters[0], scene: guideChapters[0].scenes[0], sceneIndex: 0 };
}

function TonePill({ tone = "neutral", children }: { tone?: GuideTone; children: React.ReactNode }) {
  return <span className={`guide-pill guide-tone-${tone}`}>{children}</span>;
}

function Simulation({ scene, viewport }: { scene: GuideScene; viewport: Viewport }) {
  const [feedback, setFeedback] = useState<string>();

  useEffect(() => setFeedback(undefined), [scene.id]);

  return (
    <div className={`guide-simulator guide-simulator-${viewport}`} data-testid="guide-simulator">
      <div className="guide-appbar">
        <div className="guide-brand">DCA</div>
        <div className="guide-project">
          <strong>orbit-parser</strong>
          <span>/Users/sam/Projects/orbit</span>
        </div>
        <div className="guide-appbar-status"><span aria-hidden="true" /> fixture simulation</div>
        <button className="guide-mobile-menu" type="button" aria-label="Open simulated menu" data-testid="guide-simulated-menu"><Menu size={17} /></button>
      </div>
      <div className="guide-sim-body">
        <main className="guide-transcript">
          <div className="guide-session-heading">
            <div>
              <p>SIMULATED SESSION</p>
              <h3>{scene.title}</h3>
            </div>
            {scene.mode && <TonePill tone={scene.mode === "Plan" ? "plan" : "build"}>{scene.mode}</TonePill>}
          </div>
          <div className="guide-status-line" role="status"><span aria-hidden="true" />{scene.status}</div>
          <div className="guide-rows">
            {scene.rows.map((row) => (
              <article className={`guide-row guide-row-${row.tone ?? "neutral"}`} key={`${scene.id}-${row.label}-${row.title}`}>
                <div className="guide-row-label">{row.label}</div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
                {row.code && <code>{row.code}</code>}
              </article>
            ))}
          </div>
          {scene.actions && (
            <div className="guide-sim-actions" aria-label="Simulated controls">
              {scene.actions.map((action, index) => (
                <Button
                  key={action}
                  size="sm"
                  variant={index === 0 ? "primary" : "secondary"}
                  type="button"
                  onClick={() => setFeedback(`${action}: simulated only`)}
                  data-testid={`guide-action-${scene.id}-${index}`}
                >
                  {action}
                </Button>
              ))}
            </div>
          )}
          {feedback && <p className="guide-feedback" role="status"><Check size={15} aria-hidden="true" /> {feedback}</p>}
        </main>
        <aside className="guide-inspector" aria-label="Simulated session details">
          <div className="guide-inspector-heading"><span>DETAILS</span><strong>{scene.inspectorTitle}</strong></div>
          <dl>
            {scene.inspector.map((item) => (
              <div key={`${item.label}-${item.value}`}>
                <dt>{item.label}</dt>
                <dd>{item.tone ? <TonePill tone={item.tone}>{item.value}</TonePill> : item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="guide-caveat"><strong>Boundary</strong><p>{scene.caveat}</p></div>
        </aside>
      </div>
    </div>
  );
}

export function GuideApp() {
  const initial = initialSelection();
  const [chapterId, setChapterId] = useState(initial.chapter.id);
  const [sceneId, setSceneId] = useState(initial.scene.id);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [navOpen, setNavOpen] = useState(false);
  const simulatorRef = useRef<HTMLElement>(null);
  const chapter = guideChapters.find((item) => item.id === chapterId) ?? guideChapters[0];
  const sceneIndex = Math.max(0, chapter.scenes.findIndex((item) => item.id === sceneId));
  const scene = chapter.scenes[sceneIndex];
  const globalIndex = guideScenes.findIndex((item) => item.id === scene.id);

  const selectScene = (nextChapterId: string, nextSceneId: string, updateHash = true) => {
    setChapterId(nextChapterId);
    setSceneId(nextSceneId);
    setNavOpen(false);
    if (updateHash) history.replaceState(null, "", `#simulation-${nextSceneId}`);
  };

  const selectGlobalScene = (index: number) => {
    const bounded = Math.max(0, Math.min(guideScenes.length - 1, index));
    const result = findGuideScene(guideScenes[bounded].id)!;
    selectScene(result.chapter.id, result.scene.id);
  };

  useEffect(() => {
    const onHashChange = () => {
      const result = findGuideScene(window.location.hash.replace(/^#(?:simulation-)?/, ""));
      if (result) selectScene(result.chapter.id, result.scene.id, false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const node = simulatorRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectGlobalScene(globalIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectGlobalScene(globalIndex + 1);
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [globalIndex]);

  return (
    <div className="guide-page" data-testid="opencode-guide">
      <header className="guide-topbar">
        <a href={repository} className="guide-wordmark" data-testid="guide-repository-home">CUSTOM DCA <span>/ OPENCODE</span></a>
        <nav aria-label="Guide links">
          <a href="#simulation-system-map" data-testid="guide-nav-simulation">Simulation</a>
          <a href="#sources" data-testid="guide-nav-sources">Sources</a>
          <a href={repository} target="_blank" rel="noreferrer" data-testid="guide-nav-github">GitHub <ExternalLink size={13} aria-hidden="true" /></a>
        </nav>
      </header>

      <main>
        <section className="guide-hero" aria-labelledby="guide-title">
          <div className="guide-hero-copy">
            <p className="guide-kicker">INTERACTIVE ARCHITECTURE GUIDE · FIXTURE DATA ONLY</p>
            <h1 id="guide-title">A coding-agent control plane that stays honest about its boundaries.</h1>
            <p className="guide-deck">Follow a fictional OpenCode session from prompt submission through Plan/Build safety, phone handoff, long transcripts, human gates, review, and delegated work.</p>
            <div className="guide-hero-actions">
              <a className="guide-primary-link" href="#simulation-system-map" data-testid="guide-start">Start the simulation <ArrowRight size={16} aria-hidden="true" /></a>
              <a className="guide-secondary-link" href={repository} target="_blank" rel="noreferrer" data-testid="guide-read-source">Read the source <ExternalLink size={15} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="guide-hero-facts" aria-label="Guide facts">
            <div><strong>{guideChapters.length}</strong><span>chapters</span></div>
            <div><strong>{guideScenes.length}</strong><span>stable scenes</span></div>
            <div><strong>0</strong><span>live API calls</span></div>
          </div>
        </section>

        <section className="guide-walkthrough" ref={simulatorRef} tabIndex={-1} aria-labelledby="simulation-title">
          <div className="guide-walkthrough-heading">
            <div>
              <p className="guide-kicker">CONTROL-PLANE WALKTHROUGH</p>
              <h2 id="simulation-title">See the decisions, not a polished fiction</h2>
              <p>Every scene names the evidence available and the claim the UI deliberately refuses to make.</p>
            </div>
            <button className="guide-nav-toggle" type="button" aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)} data-testid="guide-chapter-menu">
              {navOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />} Chapters
            </button>
          </div>

          <div className="guide-layout">
            <nav className={`guide-chapters ${navOpen ? "guide-chapters-open" : ""}`} aria-label="Guide chapters">
              {guideChapters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={item.id === chapter.id ? "step" : undefined}
                  onClick={() => selectScene(item.id, item.scenes[0].id)}
                  data-testid={`guide-chapter-${item.id}`}
                >
                  <span>{item.number}</span>
                  <strong>{item.shortTitle}</strong>
                </button>
              ))}
            </nav>

            <div className="guide-stage">
              <div className="guide-scene-copy">
                <div>
                  <p className="guide-scene-count">CHAPTER {chapter.number} · SCENE {sceneIndex + 1} OF {chapter.scenes.length}</p>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.description}</p>
                </div>
                <div className="guide-viewport-toggle" aria-label="Simulation viewport">
                  <button type="button" aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")} data-testid="guide-viewport-desktop"><Monitor size={15} aria-hidden="true" /> Desktop</button>
                  <button type="button" aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")} data-testid="guide-viewport-mobile"><Smartphone size={15} aria-hidden="true" /> Mobile</button>
                </div>
              </div>

              <div className="guide-scene-tabs" aria-label="Chapter scenes">
                {chapter.scenes.map((item, index) => (
                  <button key={item.id} type="button" aria-pressed={item.id === scene.id} onClick={() => selectScene(chapter.id, item.id)} data-testid={`guide-scene-${item.id}`}>
                    {index + 1}. {item.title}
                  </button>
                ))}
              </div>

              <Simulation scene={scene} viewport={viewport} />

              <div className="guide-caption" aria-live="polite">
                <div><span>{globalIndex + 1} / {guideScenes.length}</span><strong>{scene.title}</strong><p>{scene.summary}</p></div>
                <div className="guide-step-controls">
                  <Button variant="secondary" size="sm" type="button" disabled={globalIndex === 0} onClick={() => selectGlobalScene(globalIndex - 1)} aria-label="Previous simulation scene" data-testid="guide-previous"><ArrowLeft size={15} aria-hidden="true" /> Previous</Button>
                  <Button variant="primary" size="sm" type="button" disabled={globalIndex === guideScenes.length - 1} onClick={() => selectGlobalScene(globalIndex + 1)} aria-label="Next simulation scene" data-testid="guide-next">Next <ArrowRight size={15} aria-hidden="true" /></Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="guide-principles" aria-labelledby="principles-title">
          <p className="guide-kicker">DESIGN CONTRACT</p>
          <h2 id="principles-title">Safety is visible in the failure path</h2>
          <div className="guide-principle-grid">
            <article><span>01</span><h3>Fail closed</h3><p>Mode activation must succeed before prompt submission. A control-plane error cannot silently become a less restricted turn.</p></article>
            <article><span>02</span><h3>Preserve uncertainty</h3><p>Interrupted turns and background children can remain unknown. The Runner does not convert missing evidence into completion.</p></article>
            <article><span>03</span><h3>Keep decisions separate</h3><p>Permission replies, question answers, notification resolution, and review approval each retain their own state.</p></article>
            <article><span>04</span><h3>Refetch after events</h3><p>Classic SSE has no replay cursor. Events trigger reconciliation instead of becoming an unrepeatable source of truth.</p></article>
          </div>
        </section>

        <section className="guide-sources" id="sources" aria-labelledby="sources-title">
          <div>
            <p className="guide-kicker">CONTINUE IN THE REPOSITORY</p>
            <h2 id="sources-title">The maintained source is one click away</h2>
            <p>This guide summarizes verified contracts and deliberate exclusions. Contributor documentation contains the implementation details, commands, and current operational caveats.</p>
          </div>
          <div className="guide-source-links">
            {sourceLinks.map(([label, href], index) => <a key={label} href={href} target="_blank" rel="noreferrer" data-testid={`guide-source-${index}`}><span>{label}</span><ExternalLink size={15} aria-hidden="true" /></a>)}
          </div>
        </section>
      </main>

      <footer className="guide-footer">
        <span>Fixture-only simulation · no LLM, repository mutation, or private conversation</span>
        <a href={`${repository}/issues/53`} data-testid="guide-issue">Guide issue #53 <ExternalLink size={13} aria-hidden="true" /></a>
      </footer>
    </div>
  );
}
