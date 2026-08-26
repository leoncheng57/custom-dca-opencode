import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RESOURCE_PREFIX,
  containerName,
  createRunID,
  dockerCreateArgs,
  exportArtifacts,
  imageTag,
  resolveArtifactRoot,
} from "./e2e-docker.js";

// Two-container isolation proof for the Docker E2E lane (issue #204).
//
// The single-container lane only demonstrates that the suite RUNS in a
// container. The claim that actually justifies the lane is stronger and needs
// evidence: two simultaneous runs, using byte-identical internal paths, ports,
// fixture names and session ids, cannot see or damage each other — and neither
// can reach the host.
//
// So this harness does not test a path helper. It starts two real full-suite
// containers and then attacks one of them:
//
//   1. identity      distinct container ids, hostnames and PID/network/mount
//                    namespace inodes
//   2. ports         both bind 3410/4599/4600 at the same time, and nothing is
//                    published to the host
//   3. fixtures      both own a private /tmp/mock-project with its own .git
//   4. corruption    container A's fixture is destroyed mid-run; B's index and
//                    HEAD must be bit-identical afterwards
//   5. host safety   the host worktree and any host-side /tmp/mock-project must
//                    be unchanged across the whole exercise
//   6. survival      A is killed outright; B must still finish and exit 0
//   7. artifacts     each run exports only into its own directory
//
// Every check prints PASS or FAIL and the script exits non-zero if any failed,
// because a proof that reports success on a partial result is worse than no
// proof. Deliberately NOT claimed here: that one favourable pair licenses
// removing the external serialization lock. That needs repeated runs; see the
// pull request body.

// The acceptance criterion is two FULL suites concurrently, so the lanes take no
// spec filter. It also gives the attack phase below a comfortable window: a
// single-spec run can finish before the harness has finished inspecting it.
const PROOF_ARGS: string[] = [];
const FIXTURE = "/tmp/mock-project";
const INTERNAL_PORTS = [3410, 4599, 4600];
const FIXTURE_WAIT_MS = 240_000;

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

let checks: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

/**
 * How many pairs to run. One green pair shows the mechanism works; repetition is
 * what turns that into evidence, because a state-isolation bug is usually a race
 * and a race that loses once in twenty runs still corrupts a fixture.
 */
export function parseRepeat(argv: readonly string[]): number {
  const index = argv.indexOf("--repeat");
  if (index === -1) return 1;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error(`--repeat must be an integer between 1 and 50, received ${JSON.stringify(argv[index + 1])}`);
  }
  return value;
}

/** Percentile over a small sample, nearest-rank so it always names a real run. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1]!;
}

function docker(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function inside(container: string, script: string): { status: number; stdout: string } {
  // `sh -c` with a FIXED script authored in this file. No caller-supplied or
  // container-supplied value is ever interpolated here.
  const result = docker(["exec", container, "sh", "-c", script]);
  return { status: result.status, stdout: result.stdout.trim() };
}

function attempt(args: readonly string[]): void {
  spawnSync("docker", args, { stdio: "ignore" });
}

/** Index + HEAD of a fixture repository: changes if any tracked content moves. */
function fixtureState(container: string): string {
  const result = inside(
    container,
    `cd ${FIXTURE} && git rev-parse HEAD && git ls-files -s && git status --porcelain=v1 --untracked-files=all`,
  );
  return result.status === 0 ? result.stdout : `unavailable:${String(result.status)}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/**
 * The host-side resource a container could plausibly reach.
 *
 * `/tmp/mock-project` is genuinely shared: the host lane writes it, and it is
 * the thing two concurrent runs used to corrupt. If a container ever escaped its
 * namespace, this is where it would show. Held to a hard assertion.
 *
 * Absent on a machine that has never run the host lane, which is fine — the
 * claim is only that the value does not CHANGE.
 */
function hostFixtureState(): string {
  const head = spawnSync("git", ["-C", FIXTURE, "rev-parse", "HEAD"], { encoding: "utf8" });
  const status = spawnSync("git", ["-C", FIXTURE, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
  });
  return [
    `hostFixtureHead=${(head.stdout || "").trim() || "absent"}`,
    `hostFixtureStatus=${digest(status.stdout || "")}`,
  ].join("\n");
}

/**
 * The repository worktree's commit and dirty set.
 *
 * Compared across the tight window around the container damage, where any
 * change really would be alarming. It is deliberately NOT asserted across the
 * whole run: a stress run takes many minutes, and the operator editing or
 * committing during it is ordinary activity that this snapshot cannot
 * distinguish from an escape. Asserting it over that span produced exactly one
 * false failure in a ten-pair run — the harness reporting the author's own
 * commit as a containment breach. A check that cries wolf about normal work
 * teaches people to ignore it, which costs more than the coverage was worth.
 */
function hostWorktreeState(repoRoot: string): string {
  const head = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  const status = spawnSync("git", ["-C", repoRoot, "status", "--porcelain=v1"], { encoding: "utf8" });
  return [`head=${(head.stdout || "").trim()}`, `status=${digest(status.stdout || "")}`].join("\n");
}

/** Both, for the tight window where neither may move. */
function hostState(repoRoot: string): string {
  return `${hostWorktreeState(repoRoot)}\n${hostFixtureState()}`;
}

/** Synchronous sleep with no subprocess, so the poll loop stays cheap. */
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Wait until every lane has produced its own Git fixture.
 *
 * Three states have to be told apart, and conflating them is what made the first
 * version of this harness report a false failure: `created` means `docker start`
 * has not taken effect yet and we must keep waiting, `running` means we can
 * inspect, and `exited` means the suite finished before we looked — which is a
 * real setup failure for this harness, not evidence about isolation.
 *
 * Lanes are polled together rather than one after the other so a fast lane is
 * not fully drained before the other is even examined.
 */
function waitForFixtures(containers: readonly string[], deadline: number): Record<string, string> {
  const ready: Record<string, string> = {};
  while (Date.now() < deadline && Object.keys(ready).length < containers.length) {
    for (const container of containers) {
      if (container in ready) continue;
      const status = docker(["inspect", "-f", "{{.State.Status}}", container]).stdout.trim();
      if (status === "created") continue;
      if (status !== "running") {
        ready[container] = `container reached "${status}" before a fixture was observed`;
        continue;
      }
      const head = inside(container, `test -d ${FIXTURE}/.git && git -C ${FIXTURE} rev-parse HEAD`);
      if (head.status === 0) ready[container] = `ok:${head.stdout.slice(0, 12)}`;
    }
    if (Object.keys(ready).length < containers.length) sleep(500);
  }
  for (const container of containers) {
    ready[container] ??= "timed out waiting for a fixture";
  }
  return ready;
}

function runProof(): { proofID: string; checks: Check[]; failures: number; timings: Record<string, number> } {
  checks = [];
  const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const proofID = createRunID();
  const tag = imageTag(proofID);
  const artifactRoot = resolveArtifactRoot(undefined, repoRoot);
  const lanes = ["a", "b"].map((suffix) => {
    const runID = createRunID(new Date(), `proof${suffix}00`);
    return {
      label: suffix.toUpperCase(),
      runID,
      container: containerName(runID),
      destination: path.join(artifactRoot, runID),
      staging: path.join(artifactRoot, `${runID}.staging`),
      logs: path.join(artifactRoot, `${runID}.stdout.log`),
    };
  });
  const [laneA, laneB] = lanes as [(typeof lanes)[0], (typeof lanes)[0]];

  console.log(`[proof] image ${tag}`);
  console.log(`[proof] lane A ${laneA.container}`);
  console.log(`[proof] lane B ${laneB.container}`);

  const timings: Record<string, number> = {};
  const hostBefore = hostState(repoRoot);
  const fixtureBefore = hostFixtureState();
  const worktreeBefore = hostWorktreeState(repoRoot);
  let failures = 0;

  try {
    const buildStarted = Date.now();
    const build = docker(["build", "-f", path.join(repoRoot, "Dockerfile.e2e"), "-t", tag, repoRoot]);
    if (build.status !== 0) {
      console.error(build.stderr);
      throw new Error("docker build failed");
    }
    timings.buildMs = Date.now() - buildStarted;

    // Identical create arguments except the generated name/label: same image,
    // same command, same internal ports, same fixture paths.
    for (const lane of lanes) {
      const create = docker(
        dockerCreateArgs({
          runID: lane.runID,
          tag,
          sourceSHA: "proof",
          playwrightArgs: PROOF_ARGS,
        }),
      );
      if (create.status !== 0) {
        console.error(create.stderr);
        throw new Error(`docker create failed for lane ${lane.label}`);
      }
    }

    // Detached `docker start` rather than `start --attach`: the harness body is
    // synchronous, so a piped attach would buffer output that never gets read
    // until the event loop turns. Container output is recovered with
    // `docker logs` below, which is also the only copy that survives if this
    // process is interrupted.
    const makespanStarted = Date.now();
    for (const lane of lanes) {
      const started = docker(["start", lane.container]);
      if (started.status !== 0) {
        console.error(started.stderr);
        throw new Error(`docker start failed for lane ${lane.label}`);
      }
    }

    // --- 1. namespace and container identity ---------------------------------
    const ready = waitForFixtures(
      lanes.map((lane) => lane.container),
      Date.now() + FIXTURE_WAIT_MS,
    );
    const bothReady = lanes.every((lane) => ready[lane.container]?.startsWith("ok:"));
    record(
      "both containers reach a private Git fixture",
      bothReady,
      lanes.map((lane) => `${lane.label}=${ready[lane.container] ?? "?"}`).join(" "),
    );
    if (!bothReady) throw new Error("containers never produced a fixture; cannot prove isolation");

    const idA = docker(["inspect", "-f", "{{.Id}}", laneA.container]).stdout.trim();
    const idB = docker(["inspect", "-f", "{{.Id}}", laneB.container]).stdout.trim();
    record("distinct container identities", idA !== "" && idA !== idB, `A=${idA.slice(0, 12)} B=${idB.slice(0, 12)}`);

    const hostnameA = inside(laneA.container, "hostname").stdout;
    const hostnameB = inside(laneB.container, "hostname").stdout;
    record("distinct UTS namespaces", hostnameA !== hostnameB, `A=${hostnameA} B=${hostnameB}`);

    for (const namespace of ["pid", "net", "mnt"]) {
      const nsA = inside(laneA.container, `readlink /proc/self/ns/${namespace}`).stdout;
      const nsB = inside(laneB.container, `readlink /proc/self/ns/${namespace}`).stdout;
      record(
        `distinct ${namespace} namespace`,
        nsA !== "" && nsA !== nsB,
        `A=${nsA || "unreadable"} B=${nsB || "unreadable"}`,
      );
    }

    // --- 2. identical internal ports, nothing published ----------------------
    // /proc/net/tcp writes the local port as FOUR upper-case hex digits, so 3410
    // is `0D52`, not `D52`. Getting that padding wrong is what made the first
    // run of this harness report two false failures.
    const portProbe =
      `${INTERNAL_PORTS.map(
        (port) => `grep -q ":${port.toString(16).toUpperCase().padStart(4, "0")} " /proc/net/tcp`,
      ).join(" && ")} && echo all-bound`;

    // Playwright brings the services up in order and the BFF on 3410 is last,
    // so this waits instead of sampling once.
    const portDeadline = Date.now() + 120_000;
    const bound: Record<string, string> = {};
    while (Date.now() < portDeadline && Object.keys(bound).length < lanes.length) {
      for (const lane of lanes) {
        if (lane.container in bound) continue;
        if (inside(lane.container, portProbe).stdout === "all-bound") bound[lane.container] = "all-bound";
      }
      if (Object.keys(bound).length < lanes.length) sleep(500);
    }
    for (const lane of lanes) {
      record(
        `lane ${lane.label} binds ${INTERNAL_PORTS.join("/")} internally`,
        bound[lane.container] === "all-bound",
        bound[lane.container] ?? "not all listeners present before the deadline",
      );
    }
    record(
      "both lanes hold the same three ports simultaneously",
      lanes.every((lane) => bound[lane.container] === "all-bound"),
      `ports ${INTERNAL_PORTS.join("/")} bound inside both namespaces at once`,
    );
    for (const lane of lanes) {
      const ports = docker(["inspect", "-f", "{{json .NetworkSettings.Ports}}", lane.container]).stdout.trim();
      const published = docker(["port", lane.container]).stdout.trim();
      record(
        `lane ${lane.label} publishes no host port`,
        (ports === "{}" || ports === "null") && published === "",
        `Ports=${ports} docker-port=${JSON.stringify(published)}`,
      );
      const route = inside(lane.container, "ip route show default || echo none").stdout;
      record(`lane ${lane.label} has no default route`, route === "" || route === "none", `route=${route || "none"}`);
    }

    // --- 3/4. corruption containment -----------------------------------------
    const beforeA = fixtureState(laneA.container);
    const beforeB = fixtureState(laneB.container);
    record(
      "each lane owns a separate fixture instance",
      beforeA !== "" && beforeB !== "",
      `A=${digest(beforeA)} B=${digest(beforeB)}`,
    );

    // Destroy A's repository as violently as the runtime user can: remove the
    // whole .git directory AND a tracked working file.
    const damage = inside(
      laneA.container,
      `rm -rf ${FIXTURE}/.git && rm -f ${FIXTURE}/README.md && echo corrupted && ls -a ${FIXTURE} | head -20`,
    );
    record("lane A fixture was really destroyed", damage.stdout.includes("corrupted"), damage.stdout.split("\n")[0] ?? "");

    const afterA = fixtureState(laneA.container);
    record(
      "lane A now reports a broken repository",
      afterA !== beforeA,
      `before=${digest(beforeA)} after=${digest(afterA)}`,
    );

    const afterB = fixtureState(laneB.container);
    record(
      "lane B fixture is bit-identical after lane A was destroyed",
      afterB === beforeB,
      `before=${digest(beforeB)} after=${digest(afterB)}`,
    );

    const hostAfterDamage = hostState(repoRoot);
    record(
      "host worktree and host fixture unchanged by container damage",
      hostAfterDamage === hostBefore,
      hostAfterDamage === hostBefore ? "identical" : `before=${digest(hostBefore)} after=${digest(hostAfterDamage)}`,
    );

    // --- 6. sibling survives a kill ------------------------------------------
    attempt(["kill", laneA.container]);
    const stateA = docker(["inspect", "-f", "{{.State.Running}}", laneA.container]).stdout.trim();
    record("lane A is dead", stateA !== "true", `Running=${stateA}`);

    const runningB = docker(["inspect", "-f", "{{.State.Running}}", laneB.container]).stdout.trim();
    record("lane B still running immediately after the kill", runningB === "true", `Running=${runningB}`);

    // Wait for B on its own terms.
    const waitB = docker(["wait", laneB.container]);
    const exitB = Number(waitB.stdout.trim());
    timings.makespanMs = Date.now() - makespanStarted;
    record("lane B completed its suite with exit 0 after its sibling was killed", exitB === 0, `exit=${String(exitB)}`);

    // `docker logs` is read before the containers are removed; it is the only
    // copy of the runner's own output, including the worker count.
    let workerDetail = "unknown";
    for (const lane of lanes) {
      const logs = docker(["logs", lane.container]);
      writeFileSync(lane.logs, `${logs.stdout}\n${logs.stderr}`);
      const workers = /using (\d+) worker/u.exec(`${logs.stdout}\n${logs.stderr}`);
      if (lane.label === "B") workerDetail = workers?.[1] ?? "unknown";
    }
    record(
      "lane B worker count recorded",
      workerDetail !== "unknown",
      `workers=${workerDetail} shm=1g pids-limit=4096 network=none`,
    );

    // Hard: the shared fixture must be untouched end to end. This is the
    // resource a container escape would actually reach.
    const fixtureFinal = hostFixtureState();
    record(
      "host fixture unchanged across the whole exercise",
      fixtureFinal === fixtureBefore,
      fixtureFinal === fixtureBefore ? "identical" : `before=${digest(fixtureBefore)} after=${digest(fixtureFinal)}`,
    );

    // Informational only, and not a check. See hostWorktreeState for why: over a
    // multi-minute run the operator's own edits are indistinguishable from an
    // escape, and the tight window around the damage above already covers the
    // case that matters.
    const worktreeFinal = hostWorktreeState(repoRoot);
    if (worktreeFinal !== worktreeBefore) {
      console.log(
        "      note: repository worktree changed during this run (a commit or edit by you). " +
          "Not treated as a containment failure; the damage-window check above is the one that is.",
      );
    }

    // --- 7. disjoint artifacts ------------------------------------------------
    for (const lane of lanes) {
      mkdirSync(lane.staging, { recursive: true });
      attempt(["cp", `${lane.container}:/artifacts/.`, lane.staging]);
      const report = exportArtifacts(lane.staging, lane.destination);
      rmSync(lane.staging, { recursive: true, force: true });
      record(
        `lane ${lane.label} exported into its own directory`,
        report.files.length > 0 && report.rejected.length === 0,
        `${String(report.files.length)} files, ${String(report.totalBytes)} bytes -> ${lane.destination}`,
      );
    }
    const disjoint =
      laneA.destination !== laneB.destination &&
      !laneA.destination.startsWith(`${laneB.destination}${path.sep}`) &&
      !laneB.destination.startsWith(`${laneA.destination}${path.sep}`);
    record("artifact destinations are disjoint", disjoint, `${laneA.destination} vs ${laneB.destination}`);
  } catch (error) {
    record("harness completed without an internal error", false, String(error));
  } finally {
    for (const lane of lanes) attempt(["rm", "-f", lane.container]);
    attempt(["rmi", tag]);

    failures = checks.filter((check) => !check.passed).length;
    const summary = {
      proofID,
      spec: PROOF_ARGS.length === 0 ? "full suite" : PROOF_ARGS.join(" "),
      internalPorts: INTERNAL_PORTS,
      timings,
      checks,
      failures,
    };
    writeFileSync(path.join(artifactRoot, `proof-${proofID}.json`), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`\n[proof] ${String(checks.length - failures)}/${String(checks.length)} checks passed`);
    console.log(`[proof] timings ${JSON.stringify(timings)}`);
    console.log(`[proof] summary ${path.join(artifactRoot, `proof-${proofID}.json`)}`);
    // Stray-resource sweep is by exact generated name only, never by prefix glob.
    console.log(`[proof] resource prefix ${RESOURCE_PREFIX}`);
  }

  return { proofID, checks: [...checks], failures, timings };
}

function main(): void {
  const repeat = parseRepeat(process.argv.slice(2));
  const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const artifactRoot = resolveArtifactRoot(undefined, repoRoot);
  const iterations: { proofID: string; failures: number; checks: number; makespanMs: number }[] = [];

  for (let index = 0; index < repeat; index += 1) {
    console.log(`\n================ pair ${String(index + 1)}/${String(repeat)} ================`);
    const result = runProof();
    iterations.push({
      proofID: result.proofID,
      failures: result.failures,
      checks: result.checks.length,
      makespanMs: result.timings.makespanMs ?? 0,
    });
  }

  const makespans = iterations.map((iteration) => iteration.makespanMs).filter((value) => value > 0);
  const failedPairs = iterations.filter((iteration) => iteration.failures > 0);
  // A pair that leaves a container or tag behind has failed at cleanup even if
  // every isolation check passed, so the sweep is part of the verdict.
  const strayContainers = docker(["ps", "-a", "--filter", `name=${RESOURCE_PREFIX}`, "--format", "{{.Names}}"]).stdout.trim();
  const strayImages = docker(["images", RESOURCE_PREFIX, "--format", "{{.Repository}}:{{.Tag}}"]).stdout.trim();

  const aggregate = {
    pairs: repeat,
    failedPairs: failedPairs.length,
    makespanMs: {
      min: makespans.length ? Math.min(...makespans) : 0,
      p50: percentile(makespans, 0.5),
      p95: percentile(makespans, 0.95),
      max: makespans.length ? Math.max(...makespans) : 0,
    },
    strayContainers: strayContainers ? strayContainers.split("\n") : [],
    strayImages: strayImages ? strayImages.split("\n") : [],
    iterations,
  };
  writeFileSync(path.join(artifactRoot, `proof-stress-${createRunID()}.json`), `${JSON.stringify(aggregate, null, 2)}\n`);

  console.log(`\n================ stress summary ================`);
  console.log(`[proof] ${String(repeat - failedPairs.length)}/${String(repeat)} pairs fully passed`);
  console.log(`[proof] makespan ms ${JSON.stringify(aggregate.makespanMs)}`);
  console.log(`[proof] stray containers ${JSON.stringify(aggregate.strayContainers)}`);
  console.log(`[proof] stray images ${JSON.stringify(aggregate.strayImages)}`);
  for (const iteration of failedPairs) {
    console.error(`[proof] pair ${iteration.proofID} had ${String(iteration.failures)} failed checks`);
  }

  const clean = failedPairs.length === 0 && aggregate.strayContainers.length === 0 && aggregate.strayImages.length === 0;
  process.exit(clean ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
