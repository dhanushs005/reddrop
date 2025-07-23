const express = require("express");
const { spawn } = require("child_process");
const tmp = require("tmp");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = 1217;

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/download", (req, res) => {
  const { url, resolution } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  // Create a temporary file path with extension placeholder
  const tmpFile = tmp.tmpNameSync();
  const outputTemplate = `${tmpFile}.%(ext)s`;

  const args = resolution
    ? [
        "-f",
        `bv[height<=${resolution}]+ba/b[height<=${resolution}]`,
        "-o",
        outputTemplate,
        url,
      ]
    : ["-f", "best", "-o", outputTemplate, url];

  console.log("▶️ yt-dlp args:", args.join(" "));

  const downloader = spawn("yt-dlp", args);

  downloader.stderr.on("data", (data) => {
    console.log(data.toString());
  });

  downloader.on("close", (code) => {
    if (code !== 0) {
      console.error("yt-dlp failed with code", code);
      return res.status(500).json({ error: "Download failed" });
    }

    // Find downloaded file
    const dir = path.dirname(tmpFile);
    const base = path.basename(tmpFile);

    fs.readdir(dir, (err, files) => {
      if (err) return res.status(500).json({ error: "Could not read dir" });

      const downloadedFile = files.find((f) => f.startsWith(base));
      if (!downloadedFile) {
        return res.status(500).json({ error: "Downloaded file not found" });
      }

      const fullPath = path.join(dir, downloadedFile);
      const ext = path.extname(downloadedFile).substring(1);

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="video.${ext}"`,
      );
      res.setHeader("Content-Type", `video/${ext}`);

      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);

      stream.on("close", () => fs.unlink(fullPath, () => {}));
      stream.on("error", () => {
        fs.unlink(fullPath, () => {});
        res.status(500).send("Streaming error");
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
