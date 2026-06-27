# VlogCut 🎬

A simple, **browser-based vertical video editor** for making vlog-style clips for
TikTok and Instagram Reels. Built to stitch several phone clips into one polished
video — trim, reorder, pick a format, export.

Everything runs **locally on your machine**. Your footage never gets uploaded
anywhere, so there's no file-size limit to worry about.

## What it does

- 📥 Import multiple clips at once (drag & drop or browse)
- ✂️ Trim each clip (set a start and end second)
- 🔀 Reorder clips (move up / down)
- 📱 Pick a format: **9:16** (TikTok/Reels), **1:1** (square), or **16:9** (wide)
- 🎞️ Export one combined **MP4**, auto-fit to your chosen format
- 🔇 Clips without audio get a silent track so everything stitches cleanly

## How to run

You need Python 3 (already on most Macs/Linux; on Windows install from python.org).

```bash
python3 serve.py
```

Your browser opens to `http://localhost:8000`. That's the editor.

> Tip: the **first export** downloads the video engine (~30 MB) one time, then
> it's cached. Use a Chromium-based browser (Chrome/Edge/Brave) for best speed.

## How to make your vlog

1. Drop in your clips (add all of them).
2. Click a clip's thumbnail to preview it.
3. Set **Start** / **End** seconds to keep just the good parts.
4. Reorder with ▲ / ▼ until the story flows.
5. Pick your format (TikTok/Reels is the default).
6. Hit **Export Vlog 🚀** — the finished MP4 saves to your Downloads.

Then post it straight to TikTok / Reels.

## Notes & limits

- This is a lightweight editor. It re-encodes in your browser, so **keep clips
  reasonably short** (the engine works in memory). For 6 short vlog clips it's fine.
- No text captions or background music yet — see "Roadmap".
- It's not a replacement for CapCut/DaVinci for heavy edits, but it's perfect for
  fast "stitch my clips into one vertical video" jobs with nothing to install but Python.

## Roadmap (easy next steps)

- On-screen text captions / titles per clip
- Background music track with volume control
- Fade transitions between clips
- Drag-to-reorder timeline

## Tech

Plain HTML/CSS/JS + [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm).
No build step, no framework, no backend.
