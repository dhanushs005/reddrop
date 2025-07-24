const express = require("express");
const { spawn } = require("child_process");
const tmp = require("tmp");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 1217;
const YTDLP_PATH = "./yt-dlp"; // Path from the postinstall script

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

    // Create a temporary file path with a guaranteed .mp4 extension
    const tmpFile = tmp.tmpNameSync({ postfix: '.mp4' });

    // A more robust yt-dlp command
    // -f: Selects the best video and audio up to the chosen resolution, or the best available single file.
    // --merge-output-format: Ensures the final, merged file is an MP4.
    // -o: Specifies the exact output file path.
    const args = [
        "-f",
        `bestvideo[height<=${resolution}]+bestaudio/best[height<=${resolution}]/best`,
        "--merge-output-format", "mp4",
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
            // Clean up the empty/failed file if it exists
             if (fs.existsSync(tmpFile)) {
                fs.unlink(tmpFile, (err) => {
                    if (err) console.error("Failed to delete failed temp file:", err);
                });
            }
            return res.status(500).json({ success: false, error: "Failed to process video. The format may be unavailable or the URL is invalid." });
        }

        // Check if the file was successfully created
        if (fs.existsSync(tmpFile)) {
            const stat = fs.statSync(tmpFile);
            res.writeHead(200, {
                "Content-Type": "video/mp4",
                "Content-Length": stat.size,
                "Content-Disposition": `attachment; filename="RedDrop_${resolution}p.mp4"`
            });

            const readStream = fs.createReadStream(tmpFile);
            
            // Pipe the file stream to the response
            readStream.pipe(res);

            // Delete the file after it has been sent
            readStream.on('close', () => {
                fs.unlink(tmpFile, (err) => {
                    if (err) {
                        console.error("Failed to delete temp file:", err);
                    } else {
                        console.log("Temp file deleted successfully.");
                    }
                });
            });

            readStream.on('error', (err) => {
                console.error('Stream error:', err);
                res.status(500).send({error: 'Error streaming the file.'});
            });

        } else {
            return res.status(500).json({ success: false, error: "Downloaded file not found after processing." });
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
