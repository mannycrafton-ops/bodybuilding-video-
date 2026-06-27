/* VlogCut — a small browser video editor built on ffmpeg.wasm.
   Everything runs locally: clips never leave the user's machine. */

const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

// ---- App state -------------------------------------------------------------
const state = {
  clips: [],        // { id, file, url, name, duration, start, end, thumb }
  format: '9:16',
  selectedId: null,
  music: null,        // File | null
  musicVolume: 0.35,  // 0..1
};

const FORMATS = {
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

let ffmpeg = null;     // lazily loaded on first export
let ffmpegLoaded = false;
let fontReady = false;  // caption font written to the engine FS

// ---- Element refs ----------------------------------------------------------
const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const timeline = $('timeline');
const preview = $('preview');
const previewLabel = $('previewLabel');
const exportBtn = $('exportBtn');
const statusEl = $('status');
const clipCount = $('clipCount');
const totalDur = $('totalDur');
const progressWrap = $('progressWrap');
const progressBar = $('progressBar');
const progressLabel = $('progressLabel');

// ---- Import ----------------------------------------------------------------
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => addFiles(e.target.files));

['dragover', 'dragenter'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('video/'));
  if (!files.length) return;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const clip = {
      id: crypto.randomUUID(),
      file, url, name: file.name,
      duration: 0, start: 0, end: 0, thumb: '', caption: '',
    };
    state.clips.push(clip);
    // Probe duration + grab a thumbnail without blocking the loop.
    loadMetadata(clip).then(render);
  }
  render();
}

function loadMetadata(clip) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = clip.url;
    v.addEventListener('loadedmetadata', () => {
      clip.duration = v.duration || 0;
      clip.end = clip.duration;
      // Seek a touch in for a non-black thumbnail.
      v.currentTime = Math.min(0.5, clip.duration / 2);
    });
    v.addEventListener('seeked', () => {
      try {
        const c = document.createElement('canvas');
        c.width = 120; c.height = 120;
        const ratio = Math.min(120 / v.videoWidth, 120 / v.videoHeight);
        const dw = v.videoWidth * ratio, dh = v.videoHeight * ratio;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 120, 120);
        ctx.drawImage(v, (120 - dw) / 2, (120 - dh) / 2, dw, dh);
        clip.thumb = c.toDataURL('image/jpeg', 0.7);
      } catch (_) { /* cross-origin or decode issue — skip thumb */ }
      resolve();
    });
    v.addEventListener('error', resolve);
  });
}

// ---- Rendering -------------------------------------------------------------
function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmt(t) {
  if (!t || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function render() {
  clipCount.textContent = `(${state.clips.length} clip${state.clips.length === 1 ? '' : 's'})`;
  exportBtn.disabled = state.clips.length === 0;

  const total = state.clips.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
  totalDur.textContent = total ? `≈ ${fmt(total)} total` : '';

  if (!state.clips.length) {
    timeline.innerHTML = '<li class="empty">No clips yet. Drop your footage on the left to build your vlog.</li>';
    return;
  }

  timeline.innerHTML = '';
  state.clips.forEach((clip, i) => {
    const li = document.createElement('li');
    li.className = 'clip' + (clip.id === state.selectedId ? ' selected' : '');

    const trimmed = Math.max(0, clip.end - clip.start);
    li.innerHTML = `
      <img class="thumb" src="${clip.thumb || ''}" alt="" />
      <div class="meta">
        <div class="name" title="${clip.name}">${i + 1}. ${clip.name}</div>
        <div class="trim">
          <label>Start (s)
            <input type="number" min="0" step="0.1" value="${clip.start.toFixed(1)}" data-act="start" />
          </label>
          <label>End (s)
            <input type="number" min="0" step="0.1" value="${clip.end.toFixed(1)}" data-act="end" />
          </label>
        </div>
        <div class="dur">▶ ${fmt(trimmed)} used &middot; full clip ${fmt(clip.duration)}</div>
        <input class="caption" type="text" maxlength="120" data-act="caption"
               placeholder="On-screen caption (optional)" value="${escapeAttr(clip.caption)}" />
      </div>
      <div class="controls">
        <button data-act="up" title="Move up">▲</button>
        <button data-act="down" title="Move down">▼</button>
        <button class="del" data-act="del" title="Remove">✕</button>
      </div>`;

    li.querySelector('.thumb').addEventListener('click', () => selectClip(clip.id));
    li.querySelectorAll('[data-act]').forEach((el) => {
      const act = el.dataset.act;
      if (act === 'start' || act === 'end') {
        el.addEventListener('change', () => updateTrim(clip.id, act, parseFloat(el.value)));
      } else if (act === 'caption') {
        // Don't re-render on each keystroke (it would steal focus); just store.
        el.addEventListener('input', () => { clip.caption = el.value; });
      } else {
        el.addEventListener('click', () => clipAction(clip.id, act));
      }
    });
    timeline.appendChild(li);
  });
}

function selectClip(id) {
  state.selectedId = id;
  const clip = state.clips.find((c) => c.id === id);
  if (clip) {
    preview.src = clip.url;
    preview.currentTime = clip.start;
    previewLabel.textContent = `Previewing: ${clip.name}`;
    preview.play().catch(() => {});
  }
  render();
}

function updateTrim(id, key, val) {
  const clip = state.clips.find((c) => c.id === id);
  if (!clip || isNaN(val)) return;
  val = Math.max(0, Math.min(val, clip.duration || val));
  clip[key] = val;
  if (clip.end <= clip.start) clip.end = Math.min(clip.duration, clip.start + 0.1);
  render();
}

function clipAction(id, act) {
  const i = state.clips.findIndex((c) => c.id === id);
  if (i < 0) return;
  if (act === 'del') {
    URL.revokeObjectURL(state.clips[i].url);
    state.clips.splice(i, 1);
  } else if (act === 'up' && i > 0) {
    [state.clips[i - 1], state.clips[i]] = [state.clips[i], state.clips[i - 1]];
  } else if (act === 'down' && i < state.clips.length - 1) {
    [state.clips[i + 1], state.clips[i]] = [state.clips[i], state.clips[i + 1]];
  }
  render();
}

// ---- Format picker ---------------------------------------------------------
document.querySelectorAll('.fmt').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fmt').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.format = btn.dataset.fmt;
  });
});

// ---- Music controls --------------------------------------------------------
const musicBtn = $('musicBtn');
const musicInput = $('musicInput');
const musicName = $('musicName');
const musicClear = $('musicClear');
const musicVol = $('musicVol');
const volWrap = $('volWrap');
const volVal = $('volVal');

musicBtn.addEventListener('click', () => musicInput.click());
musicInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  state.music = f;
  musicName.textContent = f.name;
  musicClear.hidden = false;
  volWrap.hidden = false;
});
musicClear.addEventListener('click', () => {
  state.music = null;
  musicInput.value = '';
  musicName.textContent = 'No track added';
  musicClear.hidden = true;
  volWrap.hidden = true;
});
musicVol.addEventListener('input', () => {
  state.musicVolume = musicVol.value / 100;
  volVal.textContent = musicVol.value + '%';
});

// ---- Engine ----------------------------------------------------------------
async function ensureFFmpeg() {
  if (ffmpegLoaded) return;
  setStatus('Loading video engine (one-time, ~30 MB)…');
  ffmpeg = new FFmpeg();
  ffmpeg.on('progress', ({ progress }) => {
    // per-command progress; combined with stage weighting below
    if (exporting) setProgress(stageBase + (progress || 0) * stageSpan, progressLabel.textContent);
  });
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
  await ffmpeg.load({
    coreURL: `${base}/ffmpeg-core.js`,
    wasmURL: `${base}/ffmpeg-core.wasm`,
  });
  // Bundled caption font (local file, no network dependency).
  try {
    await ffmpeg.writeFile('font.ttf', await fetchFile('assets/Anton-Regular.ttf'));
    fontReady = true;
  } catch (_) {
    fontReady = false; // captions will be skipped, rest still works
  }
  ffmpegLoaded = true;
}

// ---- Export ----------------------------------------------------------------
let exporting = false;
let stageBase = 0, stageSpan = 0;

function setStatus(msg) { statusEl.textContent = msg; }
function setProgress(frac, label) {
  progressWrap.hidden = false;
  const pct = Math.max(0, Math.min(100, frac * 100));
  progressBar.style.width = pct.toFixed(1) + '%';
  if (label) progressLabel.textContent = label;
}

exportBtn.addEventListener('click', exportVlog);

async function exportVlog() {
  if (exporting || !state.clips.length) return;
  exporting = true;
  exportBtn.disabled = true;
  setProgress(0, 'Preparing…');

  try {
    await ensureFFmpeg();

    const { w, h } = FORMATS[state.format];
    const parts = [];
    const n = state.clips.length;

    // 1) Normalize each clip: trim, fit into the chosen canvas, uniform codec.
    for (let i = 0; i < n; i++) {
      const clip = state.clips[i];
      const inName = `in${i}.mp4`;
      const outName = `part${i}.mp4`;
      const dur = Math.max(0.1, clip.end - clip.start);

      stageBase = (i / n) * 0.85;
      stageSpan = (1 / n) * 0.85;
      setProgress(stageBase, `Processing clip ${i + 1} of ${n}…`);

      await ffmpeg.writeFile(inName, await fetchFile(clip.file));

      const hasAudio = await clipHasAudio(inName);
      let vf =
        `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`;

      // On-screen caption (TikTok-style bar near the bottom).
      const caption = (clip.caption || '').trim();
      if (caption && fontReady) {
        const capFile = `cap${i}.txt`;
        await ffmpeg.writeFile(capFile, new TextEncoder().encode(caption));
        const fontSize = Math.round(w / 15);
        vf += `,drawtext=fontfile=font.ttf:textfile=${capFile}` +
          `:fontcolor=white:fontsize=${fontSize}` +
          `:box=1:boxcolor=black@0.5:boxborderw=22` +
          `:x=(w-text_w)/2:y=h-text_h-${Math.round(h * 0.12)}` +
          `:line_spacing=10`;
      }

      const args = ['-ss', String(clip.start), '-t', String(dur), '-i', inName];
      if (!hasAudio) {
        // Add a silent track so every part has matching streams for concat.
        args.push('-f', 'lavfi', '-t', String(dur),
                  '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      }
      args.push(
        '-vf', vf,
        '-map', '0:v:0',
        '-map', hasAudio ? '0:a:0?' : '1:a:0',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100', '-ac', '2',
        '-shortest', outName,
      );

      await ffmpeg.exec(args);
      await ffmpeg.deleteFile(inName);
      parts.push(outName);
    }

    // 2) Concatenate the normalized parts (identical params -> stream copy).
    setProgress(0.85, 'Stitching clips together…');
    const list = parts.map((p) => `file ${p}`).join('\n');
    await ffmpeg.writeFile('list.txt', new TextEncoder().encode(list));
    const stitched = state.music ? 'combined.mp4' : 'output.mp4';
    await ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', 'list.txt',
      '-c', 'copy', stitched,
    ]);

    // 2b) Mix in background music (looped to cover the full length, ducked).
    if (state.music) {
      setProgress(0.92, 'Adding background music…');
      await ffmpeg.writeFile('music_in', await fetchFile(state.music));
      const vol = state.musicVolume.toFixed(2);
      await ffmpeg.exec([
        '-i', 'combined.mp4',
        '-stream_loop', '-1', '-i', 'music_in',
        '-filter_complex',
        `[1:a]volume=${vol}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[aout]`,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', 'output.mp4',
      ]);
      try { await ffmpeg.deleteFile('combined.mp4'); } catch (_) {}
      try { await ffmpeg.deleteFile('music_in'); } catch (_) {}
    }

    // 3) Hand the finished file to the user.
    setProgress(0.98, 'Wrapping up…');
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vlogcut-${state.format.replace(':', 'x')}-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    preview.src = url;
    previewLabel.textContent = 'Final vlog — preview & post 🎉';
    setProgress(1, 'Done! Saved to your downloads.');
    setStatus(`Exported ${state.format} video from ${n} clip${n === 1 ? '' : 's'}. Ready for TikTok / Reels.`);

    // Cleanup the virtual FS.
    for (const p of parts) { try { await ffmpeg.deleteFile(p); } catch (_) {} }
    for (let i = 0; i < n; i++) { try { await ffmpeg.deleteFile(`cap${i}.txt`); } catch (_) {} }
    try { await ffmpeg.deleteFile('list.txt'); } catch (_) {}
    try { await ffmpeg.deleteFile('output.mp4'); } catch (_) {}
  } catch (err) {
    console.error(err);
    setStatus('Export failed: ' + (err?.message || err) + '. Try shorter clips or fewer at once.');
    progressLabel.textContent = 'Failed';
  } finally {
    exporting = false;
    exportBtn.disabled = false;
  }
}

// Probe a file for an audio stream by scanning ffmpeg's log output.
async function clipHasAudio(name) {
  let found = false;
  const onLog = ({ message }) => { if (/Audio:/.test(message)) found = true; };
  ffmpeg.on('log', onLog);
  try {
    // `ffmpeg -i <file>` with no output errors out but prints stream info.
    await ffmpeg.exec(['-i', name]);
  } catch (_) { /* expected non-zero exit */ }
  ffmpeg.off('log', onLog);
  return found;
}

render();
