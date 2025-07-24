const express = require("express");
const { spawn } = require("child_process");
const tmp = require("tmp");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 1217;
const YTDLP_PATH = "./yt-dlp";

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/download", (req, res) => {
    const { url, resolution } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: "URL is required" });
    }
    if (!resolution) {
        return res.status(400).json({ success: false, error: "Resolution is required" });
    }

    const tmpFile = tmp.tmpNameSync({ postfix: '.%(ext)s' });

    const args = [
        "-f",
        `bestvideo[height<=${resolution}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${resolution}][ext=mp4]/best`,
        "-o",
        tmpFile,
        url,
    ];

    console.log(`Spawning yt-dlp with args: ${args.join(" ")}`);
    const downloader = spawn(YTDLP_PATH, args);

    downloader.stdout.on("data", (data) => {
        console.log(`yt-dlp stdout: ${data}`);
    });

    downloader.stderr.on("data", (data) => {
        console.error(`yt-dlp stderr: ${data}`);
    });

    downloader.on("close", (code) => {
        if (code !== 0) {
            console.error(`yt-dlp process exited with code ${code}`);
            return res.status(500).json({ success: false, error: "Failed to download video." });
        }

        const downloadedFilePath = tmpFile.replace('.%(ext)s', '.mp4');

        if (fs.existsSync(downloadedFilePath)) {
            const stat = fs.statSync(downloadedFilePath);
            res.writeHead(200, {
                "Content-Type": "video/mp4",
                "Content-Length": stat.size,
                "Content-Disposition": `attachment; filename="video_${resolution}p.mp4"`
            });

            const readStream = fs.createReadStream(downloadedFilePath);
            readStream.pipe(res);

            readStream.on('close', () => {
                fs.unlink(downloadedFilePath, (err) => {
                    if (err) {
                        console.error("Failed to delete temp file:", err);
                    }
                });
            });
        } else {
            return res.status(500).json({ success: false, error: "Downloaded file not found." });
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
