---
name: Grounded audio extraction pipeline
description: Non-obvious constraints behind extracting real song data (yt-dlp + captions + transcription) before the interpretive AI call.
---

# Grounded song-data extraction

The song dossier is generated in two phases on purpose: first extract REAL data, then let the AI
only interpret. This exists to stop the AI hallucinating audio facts (lyrics, timestamps, title).

## Managed OpenAI proxy transcription constraint
- The Replit managed OpenAI proxy **rejects `whisper-1`** ("Model not supported"), so there is **no
  native word/segment timestamp API** available.
- The proxy **does allow `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`**, but those return text with
  **no timestamps**.
- **Consequence:** to get grounded timestamps without captions, you must slice the audio yourself
  (ffmpeg fixed windows) and attach the known window offsets — the model can't give you timings.
  **Why:** picked the "managed" approach over installing local faster-whisper (large dep, slow CPU).

## Timestamp source priority
1. Real YouTube captions (manual preferred, else auto in the detected/base language), parsed from
   yt-dlp `--sub-format json3` (`events[].tStartMs/dDurationMs/segs[].utf8`).
2. Fallback: download audio, ffmpeg-slice into ~45s windows, transcribe each, attach real offsets.
- Captions are far cheaper/faster, so most songs never hit the audio path.

## yt-dlp / ffmpeg environment
- yt-dlp is a **Python tool tracked in the root `pyproject.toml`**, installed to
  `<workspaceRoot>/.pythonlibs/bin/yt-dlp` (resolve by walking up for `pnpm-workspace.yaml`; it is
  **not** on the server's PATH, so spawn by absolute path).
- `deno` is installed as a system dep to satisfy yt-dlp's JS runtime needs (improves format access).
- ffmpeg is on PATH (Nix), with libmp3lame available.

## SSRF guard (important)
- `classifyInput` uses a **loose substring regex**, so `https://evil.com/youtube.com/watch?v=x`
  classifies as "youtube". Passing that to yt-dlp would fetch an arbitrary host server-side (SSRF).
- **Always** host-allowlist YouTube URLs (`new URL().hostname` against an explicit set) before
  handing input to yt-dlp. Free-text "name" inputs are safe — they go through `ytsearch1:` (search),
  never a direct fetch.

## Name inputs are also grounded
- A free-text song name is resolved via yt-dlp `ytsearch1:<name>` to a real video, then runs the same
  extraction. The resolved video may be a cover/live version — this is flagged in the AI context.

## Resource bounds
- Audio-chunk fallback has a per-call timeout, an overall wall-clock deadline, and a max chunk cap;
  when it can't cover the whole track it sets a `truncated` flag that becomes an explicit "partial"
  note in the AI prompt (no silent fabrication beyond real data).
