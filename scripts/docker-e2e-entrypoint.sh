#!/usr/bin/env bash
#
# Container entrypoint for the isolated E2E lane (issue #204).
#
# Runs INSIDE the disposable container built by Dockerfile.e2e. Its only jobs are
# to guarantee the /artifacts tree exists, record what this run actually was, and
# hand over to Playwright.
#
# Argument handling is the security-relevant part: every argument the host
# launcher forwarded arrives as a separate element of "$@" and is passed straight
# through to Playwright. Nothing is ever interpolated into a `sh -c` string, so a
# spec name containing spaces, quotes or `;` is an argument and cannot become a
# command. `exec` also means Playwright inherits PID 1's signals from
# `docker run --init`, so `docker stop` reaches the test runner rather than a
# shell that would exit and orphan it.
set -euo pipefail

ARTIFACTS="${E2E_ARTIFACT_ROOT:-/artifacts}"
mkdir -p "$ARTIFACTS/test-results" "$ARTIFACTS/playwright-report" "$ARTIFACTS/logs"

# Provenance for the exported artifact bundle. The launcher validates and keeps
# this file, and it is what makes a stored report attributable to a source tree
# months later. Kept to plain `key=value` so it stays greppable.
{
  echo "run_id=${E2E_RUN_ID:-unknown}"
  echo "source_sha=${E2E_SOURCE_SHA:-unknown}"
  echo "image_tag=${E2E_IMAGE_TAG:-unknown}"
  echo "started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "container_hostname=$(hostname)"
  echo "user=$(id -un) uid=$(id -u) gid=$(id -g)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "git=$(git --version)"
  echo "playwright=$(node_modules/.bin/playwright --version 2>/dev/null || echo unknown)"
  echo "arch=$(uname -m)"
  echo "kernel=$(uname -sr)"
  echo "cpus_online=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo unknown)"
  # Proof for the PR body that the runtime really has no route off the box.
  echo "default_route=$(ip route show default 2>/dev/null || echo none)"
  echo "argv=$*"
} >"$ARTIFACTS/logs/container.txt" 2>&1

exec node_modules/.bin/playwright test --config playwright.docker.config.ts "$@"
