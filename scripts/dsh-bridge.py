#!/usr/bin/env python3
"""Pinned DCA-to-DSH bridge. Stdout is JSON-lines protocol only."""

from __future__ import annotations

import json
import os
import sys
import threading
from importlib.metadata import version
from typing import Any

sdk_version = version("deepseek-harness-sdk")
expected_sdk_version = os.environ["DSH_BRIDGE_SDK_VERSION"]
if sdk_version != expected_sdk_version:
    raise RuntimeError(f"DeepSeek Harness SDK version mismatch: expected {expected_sdk_version}, received {sdk_version}")

from deepseek_harness import DeepSeekHarness  # noqa: E402


write_lock = threading.Lock()
harness_lock = threading.Lock()
harness: DeepSeekHarness | None = None
busy_session: str | None = None
cancelled: set[str] = set()
state_lock = threading.Lock()
run_thread: threading.Thread | None = None


def emit(value: dict[str, Any]) -> None:
    with write_lock:
        sys.stdout.write(json.dumps(value, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def make_harness() -> DeepSeekHarness:
    global harness
    with harness_lock:
        if harness is None:
            options: dict[str, Any] = {
                "provider": os.environ["DSH_BRIDGE_PROVIDER"],
                "model": os.environ["DSH_BRIDGE_MODEL"],
                "cordis": os.environ["DSH_BRIDGE_CORDIS"],
                "cwd": os.environ["DSH_BRIDGE_WORKSPACE"],
                "session_root": os.environ["DSH_BRIDGE_SESSION_ROOT"],
            }
            if os.environ.get("DSH_BRIDGE_MAX_TOKENS"):
                options["max_tokens"] = int(os.environ["DSH_BRIDGE_MAX_TOKENS"])
            harness = DeepSeekHarness(**options)
        return harness


def run_prompt(session_id: str, text: str) -> None:
    global busy_session
    try:
        runtime = make_harness()
        with state_lock:
            if session_id in cancelled:
                return
        runtime.start()
        with state_lock:
            if session_id in cancelled:
                runtime.close()
                return

        def notify(notification: Any) -> None:
            emit({
                "type": "notification",
                "sessionId": session_id,
                "notification": {"method": notification.method, "payload": notification.payload},
            })

        result = runtime.run(text, session_id=session_id, on_notification=notify)
        with state_lock:
            should_finish = session_id not in cancelled
            if busy_session == session_id:
                busy_session = None
        if should_finish:
            emit({
                "type": "finished",
                "sessionId": session_id,
                "finalResponse": result.final_response,
                "finishReason": result.finish_reason,
            })
    except Exception as error:  # runtime diagnostics are intentionally bounded by Node
        with state_lock:
            should_fail = session_id not in cancelled
        if should_fail:
            print(f"DSH runtime failed: {type(error).__name__}", file=sys.stderr, flush=True)
            emit({"type": "failed", "sessionId": session_id, "error": "DSH runtime failed; inspect local bridge logs"})
    finally:
        with state_lock:
            if busy_session == session_id:
                busy_session = None
            cancelled.discard(session_id)


def handle(message: dict[str, Any]) -> None:
    global harness, busy_session, run_thread
    request_id = str(message.get("id") or "")
    method = message.get("method")
    params = message.get("params") if isinstance(message.get("params"), dict) else {}
    try:
        if method == "ping":
            emit({"id": request_id, "ok": True, "result": {"protocol": 1, "busySession": busy_session}})
            return
        if method == "prompt":
            session_id = str(params.get("sessionId") or "")
            text = str(params.get("text") or "")
            if not session_id or not text.strip():
                raise ValueError("sessionId and non-empty text are required")
            with state_lock:
                if busy_session is not None:
                    raise RuntimeError("this DSH preset/workspace bridge is already running a turn")
                busy_session = session_id
                run_thread = threading.Thread(target=run_prompt, args=(session_id, text), daemon=True)
                run_thread.start()
            emit({"id": request_id, "ok": True, "result": {"accepted": True}})
            return
        if method == "cancel":
            session_id = str(params.get("sessionId") or "")
            with state_lock:
                if busy_session != session_id:
                    emit({"id": request_id, "ok": True, "result": {"cancelled": False}})
                    return
                cancelled.add(session_id)
                active_thread = run_thread
            with harness_lock:
                if harness is not None:
                    harness.close()
                    harness = None
            if active_thread is not None:
                active_thread.join(timeout=5)
                if active_thread.is_alive():
                    emit({"type": "failed", "sessionId": session_id, "error": "DSH cancellation forced a bridge restart"})
                    emit({"id": request_id, "ok": True, "result": {"cancelled": True}})
                    os._exit(2)
            emit({"id": request_id, "ok": True, "result": {"cancelled": True}})
            return
        raise ValueError("unknown bridge method")
    except Exception as error:
        emit({"id": request_id, "ok": False, "error": str(error)[:2000]})


emit({"type": "ready", "protocol": 1, "sdkVersion": sdk_version})
for line in sys.stdin:
    try:
        parsed = json.loads(line)
        if isinstance(parsed, dict):
            handle(parsed)
    except Exception as error:
        emit({"id": "", "ok": False, "error": str(error)[:2000]})

with harness_lock:
    if harness is not None:
        harness.close()
