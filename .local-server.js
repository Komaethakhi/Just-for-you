const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    const file = path.resolve(root, "." + urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1");
