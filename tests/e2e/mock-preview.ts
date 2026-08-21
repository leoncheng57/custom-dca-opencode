import { createServer } from "node:http";

const port = Number(process.argv[2] || 4600);
createServer((req, res) => {
  if (req.url === "/repos/acme/demo/pulls/7") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ title: "Mock pull request", state: "open", mergeable: true, user: { login: "octocat" }, head: { sha: "abc123" } }));
    return;
  }
  if (req.url === "/repos/acme/demo/commits/abc123/check-runs") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ check_runs: [{ conclusion: "success" }] }));
    return;
  }
  if (req.url === "/repos/acme/demo/pulls/7/merge" && req.method === "PUT") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ merged: true }));
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
