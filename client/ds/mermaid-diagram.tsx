import { useEffect, useRef, useState } from "react";

let diagramID = 0;
let renderQueue = Promise.resolve();

function themeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--color-background-surface").trim(),
    primaryColor: style.getPropertyValue("--color-background-surface-neutral-muted").trim(),
    primaryBorderColor: style.getPropertyValue("--color-border-default").trim(),
    primaryTextColor: style.getPropertyValue("--color-text-default").trim(),
    lineColor: style.getPropertyValue("--color-text-muted").trim(),
    secondaryColor: style.getPropertyValue("--color-background-surface-info-muted").trim(),
    tertiaryColor: style.getPropertyValue("--color-background-surface-success-muted").trim(),
  };
}

async function render(source: string): Promise<string> {
  const task = renderQueue.then(async () => {
    // Mermaid is intentionally fetched only after a repository-owned Mermaid
    // fence mounts. Its strict mode disables click callbacks and sanitizes SVG.
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      secure: ["securityLevel", "startOnLoad", "htmlLabels"],
      theme: "base",
      themeVariables: themeVariables(),
      flowchart: { htmlLabels: false },
    });
    await mermaid.parse(source, { suppressErrors: true });
    return (await mermaid.render(`dca-mermaid-${++diagramID}`, source)).svg;
  });
  renderQueue = task.then(() => undefined, () => undefined);
  return task;
}

function sanitizedSvg(markup: string): SVGSVGElement {
  // Mermaid's label markup is HTML-compatible but not always XML-compatible
  // (for example, a flowchart label may contain an unclosed <br>). Parsing it
  // inertly as HTML preserves the SVG tree without executing it.
  const documentElement = new DOMParser().parseFromString(markup, "text/html").body.firstElementChild;
  if (!documentElement || documentElement.localName !== "svg") throw new Error("Mermaid did not return an SVG.");

  // Defense in depth on top of Mermaid's strict mode: diagrams never retain
  // executable DOM, links, embedded resources, or CSS that can fetch a URL.
  for (const element of documentElement.querySelectorAll("script, foreignObject, iframe, object, embed, image, audio, video, link, a, use")) {
    element.remove();
  }
  for (const element of documentElement.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (/^on/iu.test(attribute.name) || /href$/iu.test(attribute.name)) element.removeAttribute(attribute.name);
      if (attribute.name === "style" && /(?:@import|url\s*\(|expression\s*\()/iu.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.localName === "style" && /(?:@import|url\s*\(|expression\s*\()/iu.test(element.textContent ?? "")) {
      element.remove();
    }
  }
  documentElement.setAttribute("role", "img");
  documentElement.setAttribute("aria-label", "Mermaid diagram");
  return documentElement as unknown as SVGSVGElement;
}

export function MermaidDiagram({ source }: { source: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [appearance, setAppearance] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setAppearance((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setState("loading");
    void render(source)
      .then((markup) => {
        if (!active || !target.current) return;
        target.current.replaceChildren(document.importNode(sanitizedSvg(markup), true));
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => { active = false; };
  }, [source, appearance]);

  const ready = state === "ready";
  return (
    <figure className="mermaid-diagram" data-testid={ready ? "opencode-mermaid-diagram" : "opencode-mermaid-fallback"}>
      {state === "error" && <figcaption role="alert">Diagram could not be rendered. Showing Mermaid source.</figcaption>}
      {!ready && <pre><code className="language-mermaid">{source}</code></pre>}
      <div ref={target} hidden={!ready} />
    </figure>
  );
}
