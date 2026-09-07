import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(new URL("..", import.meta.url))));
const port = Number.parseInt(process.env.FIXTURE_PORT || "4173", 10);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const requested = pathname === "/src/core.js" || pathname === "/src/content.js" || pathname === "/src/content.css"
    ? pathname.slice(1)
    : "test/fixture.html";
  const filePath = normalize(join(root, requested));

  if (!filePath.startsWith(root) || !statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Fixture: http://127.0.0.1:${port}/octo/repo/pull/123/changes`);
});
