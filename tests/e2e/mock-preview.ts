import { createServer } from "node:http";

const port = Number(process.argv[2] || 4600);
let detailRequests = 0;
let mergeBody: unknown = null;
createServer((req, res) => {
  if (req.url === "/test/forge-reset" && req.method === "POST") {
    detailRequests = 0;
    mergeBody = null;
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/test/forge-state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detailRequests, mergeBody }));
    return;
  }
  if (req.url === "/repos/acme/demo/pulls/7") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ title: "Mock pull request", body: "## Review notes\n\nReady to ship.", number: 7, state: "open", mergeable: true, user: { login: "octocat" }, head: { sha: "abc123" } }));
    return;
  }
  if (req.url === "/repos/acme/demo/commits/abc123/check-runs") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ check_runs: [{ conclusion: "success" }] }));
    return;
  }
  if (req.url === "/repos/acme/demo/commits/abc123/check-runs?per_page=50") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ check_runs: [{ name: "test", status: "completed", conclusion: "success", html_url: "https://github.com/acme/demo/actions/1" }] }));
    return;
  }
  if (req.url === "/repos/acme/demo/issues/7/comments?per_page=51&page=1") {
    detailRequests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{ id: 1, user: { login: "reviewer" }, body: "Looks good.", created_at: "2026-08-21T10:00:00Z" }]));
    return;
  }
  if (req.url === "/repos/acme/demo/pulls/7/reviews?per_page=26&page=1") {
    detailRequests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{ id: 2, user: { login: "maintainer" }, state: "APPROVED", body: "Approved.", submitted_at: "2026-08-21T10:01:00Z" }]));
    return;
  }
  if (req.url === "/repos/acme/demo/commits/abc123/check-runs?per_page=100&page=1") {
    detailRequests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ total_count: 1, check_runs: [{ id: 3, name: "test", status: "completed", conclusion: "failure", details_url: "https://github.com/acme/demo/actions/3", started_at: "2026-08-21T10:00:00Z", completed_at: "2026-08-21T10:01:15Z" }] }));
    return;
  }
  if (req.url === "/repos/acme/demo/commits/abc123/status?per_page=100&page=1") {
    detailRequests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ total_count: 0, statuses: [] }));
    return;
  }
  if (req.url === "/repos/acme/demo/pulls/7/merge" && req.method === "PUT") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      mergeBody = raw ? JSON.parse(raw) : null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ merged: true }));
    });
    return;
  }
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "/target" }).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json", "X-Unsafe": "must-not-forward" });
  res.end(JSON.stringify({
    path: req.url,
    authorization: req.headers.authorization ?? null,
    cookie: req.headers.cookie ?? null,
    host: req.headers.host ?? null,
  }));
}).listen(port, "127.0.0.1", () => console.log(`[mock-preview] listening on ${port}`));
