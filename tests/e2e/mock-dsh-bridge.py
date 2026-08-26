#!/usr/bin/env python3
import json
import sys
import threading
import time
import os


lock = threading.Lock()
cancelled = set()


def emit(value):
    with lock:
        sys.stdout.write(json.dumps(value, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def emit_event(session_id, seq, event_type, data, native_session_id=None, **envelope):
    emit({
        "type": "notification",
        "sessionId": session_id,
        "notification": {
            "method": "session.event",
            "payload": {
                "sessionId": native_session_id or session_id,
                "event": {"type": event_type, "seq": seq, "time": int(time.time() * 1000), "data": data, **envelope},
            },
        },
    })


def complete(session_id, slow=False):
    for _ in range(50 if slow else 1):
        time.sleep(0.05)
        if session_id in cancelled:
            cancelled.discard(session_id)
            return
    emit_event(session_id, 0, "agent/inbox/spliced", {"target": "next-step", "start": 0, "removedCount": 1, "inserted": []})
    emit_event(session_id, 1, "turn/start", {"turn": 1})
    emit_event(session_id, 2, "step/start", {"turn": 1, "step": 1})
    emit_event(session_id, 3, "request/header", {"reason": "initial", "header": {"config": {"provider": "fixture", "model": "mock-dsh"}, "system": "PRIVATE MOCK SYSTEM", "tools": [{"name": "read", "description": "PRIVATE TOOL DESCRIPTION", "parameters": {"type": "object"}}]}})
    emit_event(session_id, 4, "request/context", {"provider": "fixture", "model": "mock-dsh", "contextWindow": 64000})
    emit_event(session_id, 5, "assistant/chunk", {"turn": 1, "step": 1, "chunk": {"type": "text-delta", "index": 0, "text": "Hello from mock "}})
    time.sleep(0.05)
    emit_event(session_id, 6, "tool/call", {"turn": 1, "step": 1, "callId": "call-fixture", "name": "read", "arguments": "{\"path\":\"/private/mock-secret\"}"})
    emit_event(session_id, 7, "tool/result", {"turn": 1, "step": 1, "message": {"id": "tool-result-fixture", "role": "user", "source": {"kind": "tool", "callId": "call-fixture"}, "content": [{"type": "tool-result", "toolCallId": "call-fixture", "content": [{"type": "text", "text": "PRIVATE TOOL OUTPUT"}]}]}}, sourceEventSeqs=[6], surfaceOp="append")
    emit_event(session_id, 8, "assistant/chunk", {"turn": 1, "step": 1, "chunk": {"type": "text-delta", "index": 0, "text": "DSH"}})
    emit_event(session_id, 9, "assistant/message", {"turn": 1, "step": 1, "message": {"id": "assistant-fixture", "role": "assistant", "content": [{"type": "text", "text": "Hello from mock DSH"}], "source": {"kind": "model", "provider": "fixture", "model": "mock-dsh"}}, "usage": {"inputTokens": 40, "outputTokens": 5, "reasoningTokens": 2}}, sourceEventSeqs=[5, 8], surfaceOp="append")
    emit_event(session_id, 10, "compaction/start", {"compactionId": "compact-fixture", "turn": 1})
    emit_event(session_id, 11, "compaction/summary", {"compactionId": "compact-fixture", "summary": [{"type": "text", "text": "PRIVATE COMPACTION SUMMARY"}], "shadowedRange": {"start": 6, "end": 9}, "shadowedSeqs": [6, 7, 9], "shadowedTokenCount": 25, "provider": "mock", "model": "mock-dsh", "usage": {"inputTokens": 20, "outputTokens": 4}})
    emit_event(session_id, 12, "user/message", {"id": "compact-fixture-message", "role": "user", "content": [{"type": "text", "text": "PRIVATE SURFACE REPLACEMENT"}], "source": {"kind": "plugin", "plugin": "compact", "compactionId": "compact-fixture"}}, sourceEventSeqs=[10, 11, 6, 7, 9], surfaceOp={"op": "replace", "start": 6, "end": 9})
    emit_event(session_id, 13, "compaction/end", {"compactionId": "compact-fixture", "turn": 1})
    child_session_id = "dsh-child-fixture"
    emit({"type": "notification", "sessionId": session_id, "notification": {"method": "subagent.started", "payload": {"parentSessionId": session_id, "childSessionId": child_session_id, "provider": "spawn", "agentId": child_session_id}}})
    emit_event(session_id, 0, "subagent/descriptor", {"version": 2, "mode": "one-shot", "provider": "spawn", "label": "Fixture child"}, native_session_id=child_session_id)
    emit({"type": "notification", "sessionId": session_id, "notification": {"method": "subagent.finished", "payload": {"parentSessionId": session_id, "childSessionId": child_session_id, "provider": "spawn", "agentId": child_session_id, "status": "ok", "stopReason": "completed"}}})
    emit_event(session_id, 14, "step/end", {"turn": 1, "step": 1})
    emit_event(session_id, 15, "turn/end", {"turn": 1, "reason": {"kind": "completed"}})
    emit({"type": "finished", "sessionId": session_id, "finalResponse": "Hello from mock DSH", "finishReason": "completed"})


emit({"type": "ready", "protocol": 1, "sdkVersion": os.environ["DSH_BRIDGE_SDK_VERSION"]})
for line in sys.stdin:
    message = json.loads(line)
    request_id = message["id"]
    method = message["method"]
    params = message.get("params", {})
    if method == "prompt":
        threading.Thread(target=complete, args=(params["sessionId"], "stay running" in params.get("text", "")), daemon=True).start()
        emit({"id": request_id, "ok": True, "result": {"accepted": True}})
    elif method == "cancel":
        cancelled.add(params["sessionId"])
        emit({"id": request_id, "ok": True, "result": {"cancelled": True}})
    else:
        emit({"id": request_id, "ok": True, "result": {"protocol": 1}})
