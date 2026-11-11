"""Assay model outage pass-through: a mitmproxy add-on in front of Bifrost.

Run from backend/ (8080 is Bifrost, 8082 is this):
    uv run mitmdump -s assay/outage.py --mode reverse:http://127.0.0.1:8080 --listen-port 8082

Behavior (PRD section 6, "Model outage"):
- Agents call /r/<run_id>/<rest>. Each run's first 3 calls get 503 and are not forwarded
  (3, not 2, because the OpenAI SDK retries a 503 twice). Call 4+ goes upstream as /<rest>.
- Paths without the /r/<run_id>/ prefix get 400 and are not forwarded.
"""
import json
import re
import traceback
from collections import Counter

from mitmproxy import ctx, http

FAILS = 3
TAG = re.compile(r"^/r/([^/?]+)(/.*)$")


def error(status, message, kind):
    return http.Response.make(
        status, json.dumps({"error": {"message": message, "type": kind}}), {"Content-Type": "application/json"})


class Outage:
    def __init__(self):
        self.calls = Counter()

    def running(self):
        modes = list(ctx.options.mode)
        if len(modes) != 1 or not modes[0].startswith("reverse:"):
            ctx.log.error("assay outage must run with a single --mode reverse:<bifrost url>, refusing to start")
            ctx.master.shutdown()

    def request(self, flow: http.HTTPFlow):
        # mitmproxy swallows hook exceptions and forwards the flow upstream, so fail closed.
        try:
            m = TAG.match(flow.request.path)
            if not m:
                flow.response = error(400, "missing run tag", "invalid_request_error")
                return
            run_id, rest = m.groups()
            self.calls[run_id] += 1
            if self.calls[run_id] <= FAILS:
                flow.response = error(503, "Service temporarily unavailable", "server_error")
                return
            flow.request.path = rest
        except Exception:
            ctx.log.error(traceback.format_exc())
            flow.response = http.Response.make(500, b"assay outage error")

    def responseheaders(self, flow: http.HTTPFlow):
        # ponytail: streaming (SSE) pass-through is checked in the live run only.
        flow.response.stream = True


addons = [Outage()]
