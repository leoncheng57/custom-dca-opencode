import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { api, type CatalogResponse } from "./api.js";
import { DIRECTORY_STORAGE_KEY, resolvePaletteDirectory } from "./palette.js";

/**
 * Which repository-owned playbooks are actually loaded by the OpenCode server
 * for the project the user last selected (issue #232).
 *
 * The Playbooks catalogue is a build-time, repository-owned inventory; whether
 * a skill is *installed* is a per-directory runtime fact from `/api/catalog`.
 * Playbooks routes carry no `?directory=`, so the last selected project is
 * resolved the same way the palette and notification centre resolve it.
 *
 * Because the answer is per-project but the page is global, `directoryLabel` is
 * not optional decoration: a bare "Installed" badge would be a lie in any other
 * project. Callers must render the label alongside the state.
 *
 * Every failure — no directory, an unreachable BFF, a directory the server
 * rejects — resolves to `status: "unknown"`, which renders no claim at all.
 */
export type PlaybookInstallStatus = "unknown" | "ready";

export interface PlaybookInstallState {
  status: PlaybookInstallStatus;
  /** Basename of the resolved project, for labelling the claim. */
  directoryLabel: string;
  installedSkills: ReadonlySet<string>;
  installedCommands: ReadonlySet<string>;
}

const EMPTY: PlaybookInstallState = {
  status: "unknown",
  directoryLabel: "",
  installedSkills: new Set(),
  installedCommands: new Set(),
};

function basename(directory: string): string {
  const trimmed = directory.replace(/\/+$/u, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

export function usePlaybookInstallState(): PlaybookInstallState {
  const location = useLocation();
  const [state, setState] = useState<PlaybookInstallState>(EMPTY);

  useEffect(() => {
    const directory = resolvePaletteDirectory(
      location.search,
      typeof localStorage === "undefined" ? null : localStorage.getItem(DIRECTORY_STORAGE_KEY),
    );
    if (!directory) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void api
      .catalog(directory, controller.signal)
      .then((catalogue: CatalogResponse) => {
        if (cancelled) return;
        setState({
          status: "ready",
          directoryLabel: basename(directory),
          installedSkills: new Set(catalogue.skills.map((skill) => skill.name)),
          installedCommands: new Set(catalogue.commands.map((command) => command.name)),
        });
      })
      .catch(() => {
        // Fail closed: an unreachable or rejected catalogue must state nothing,
        // not imply "not installed".
        if (!cancelled) setState(EMPTY);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [location.search]);

  return state;
}
