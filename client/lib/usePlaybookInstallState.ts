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

/** The "state nothing" value. Every failure path resolves to this. */
export const UNKNOWN_INSTALL_STATE: PlaybookInstallState = {
  status: "unknown",
  directoryLabel: "",
  installedSkills: new Set(),
  installedCommands: new Set(),
};

const EMPTY = UNKNOWN_INSTALL_STATE;

/** Project label for the badge. Exported so the labelling rule is testable. */
export function projectLabel(directory: string): string {
  const trimmed = directory.replace(/\/+$/u, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

/**
 * Reduce a catalogue response into install state.
 *
 * Split out of the hook so the fail-closed rules can be unit tested without a
 * DOM: a blank directory, or a catalogue that could not be read, must produce
 * `unknown` rather than an empty "not installed" claim.
 */
export function installStateFrom(directory: string, catalogue: CatalogResponse | null): PlaybookInstallState {
  if (!directory || !catalogue) return UNKNOWN_INSTALL_STATE;
  return {
    status: "ready",
    directoryLabel: projectLabel(directory),
    installedSkills: new Set(catalogue.skills.map((skill) => skill.name)),
    installedCommands: new Set(catalogue.commands.map((command) => command.name)),
  };
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
        if (!cancelled) setState(installStateFrom(directory, catalogue));
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
