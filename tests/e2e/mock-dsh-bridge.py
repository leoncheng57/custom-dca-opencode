#!/usr/bin/env python3
import json
import sys
import threading
import time


lock = threading.Lock()


def emit(value):
    with lock:
        sys.stdout.write(json.dumps(value, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def complete(session_id):
    time.sleep(0.05)
    emit({"type": "notification", "sessionId": session_id, "notification": {"method": "session.event", "payload": {"sessionId": session_id, "event": {"type": "assistant/chunk", "data": {"text": "Hello from mock "}}}}})
    time.sleep(0.05)
    emit({"type": "notification", "sessionId": session_id, "notification": {"method": "session.event", "payload": {"sessionId": session_id, "event": {"type": "assistant/chunk", "data": {"text": "DSH"}}}}})
    emit({"type": "finished", "sessionId": session_id, "finalResponse": "Hello from mock DSH", "finishReason": "completed"})


emit({"type": "ready", "protocol": 1})
for line in sys.stdin:
    message = json.loads(line)
    request_id = message["id"]
    method = message["method"]
    params = message.get("params", {})
    if method == "prompt":
        threading.Thread(target=complete, args=(params["sessionId"],), daemon=True).start()
        emit({"id": request_id, "ok": True, "result": {"accepted": True}})
    elif method == "cancel":
        emit({"id": request_id, "ok": True, "result": {"cancelled": True}})
    else:
        emit({"id": request_id, "ok": True, "result": {"protocol": 1}})
