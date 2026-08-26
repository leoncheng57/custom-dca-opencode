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


def complete(session_id, slow=False):
    for _ in range(50 if slow else 1):
        time.sleep(0.05)
        if session_id in cancelled:
            cancelled.discard(session_id)
            return
    emit({"type": "notification", "sessionId": session_id, "notification": {"method": "session.event", "payload": {"sessionId": session_id, "event": {"type": "assistant/chunk", "data": {"text": "Hello from mock "}}}}})
    time.sleep(0.05)
    emit({"type": "notification", "sessionId": session_id, "notification": {"method": "session.event", "payload": {"sessionId": session_id, "event": {"type": "assistant/chunk", "data": {"text": "DSH"}}}}})
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
