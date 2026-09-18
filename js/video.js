// FlapCast video export: renders the board into a canvas at an exact resolution
// (1080p / 4K) with real falling-flap animation and records it with the board audio.
(() => {
  const FC = window.FC;
  const { board, audio } = FC;
  const $ = id => document.getElementById(id);

  let canvas = null;
  let ctx = null;
  let rafId = 0;
  let recorder = null;
  let recording = false;
  let audioTap = null;
  let startedAt = 0;
  let timer = null;
  let options = { height: 1080, includeTitle: true };
  const stopListeners = new Set();

  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function pickMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  // =========================================================================
  // === FRAME RENDERING ===
  // =========================================================================
  function computeLayout(W, H) {
    const cols = board.cols;
    const rows = board.rows;
    const margin = H * 0.045;
    const titleH = options.includeTitle ? H * 0.075 : 0;
    const gap = Math.max(2, W * 0.004);
    const inner = H * 0.025; // chassis padding
    const availW = W - 2 * margin - 2 * inner;
    const availH = H - 2 * margin - 2 * inner - titleH;
    const tileW = Math.min((availW - gap * (cols - 1)) / cols, ((availH - gap * (rows - 1)) / rows) / 1.35);
    const tileH = tileW * 1.35;
    const gridW = tileW * cols + gap * (cols - 1);
    const gridH = tileH * rows + gap * (rows - 1);
    const chassisW = gridW + 2 * inner;
    const chassisH = gridH + 2 * inner + titleH;
    const cx = (W - chassisW) / 2;
    const cy = (H - chassisH) / 2;
    return { cols, rows, gap, inner, titleH, tileW, tileH, gridX: cx + inner, gridY: cy + inner + titleH, cx, cy, chassisW, chassisH };
  }

  function drawGlyph(char, x, seamY, L, colors) {
    if (!char || char === ' ') return;
    const fontPx = L.tileW * FC.glyphEm();
    ctx.font = `700 ${fontPx}px "Barlow Condensed", sans-serif`;
    ctx.fillStyle = colors.glyph;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const capH = ctx.measureText('H').actualBoundingBoxAscent;
    ctx.save();
    ctx.translate(x + L.tileW / 2, seamY + FC.markShift(char) / 100 * fontPx);
    ctx.scale(FC.GLYPH_SCALE_X, 1);
    ctx.fillText(char, 0, capH / 2);
    ctx.restore();
  }

  // Draws the top or bottom half of a character, optionally folded toward the seam (flap animation)
  function drawHalf(char, half, x, y, L, colors, fold = 1, shade = 0) {
    const seamY = y + L.tileH / 2;
    const top = half === 'top';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top ? y : seamY, L.tileW, L.tileH / 2);
    ctx.clip();
    if (fold !== 1) {
      ctx.translate(0, seamY);
      ctx.scale(1, Math.max(0.001, fold));
      ctx.translate(0, -seamY);
    }
    ctx.fillStyle = top ? colors.top : colors.bottom;
    ctx.fillRect(x, top ? y : seamY, L.tileW, L.tileH / 2);
    drawGlyph(char, x, seamY, L, colors);
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(x, top ? y : seamY, L.tileW, L.tileH / 2);
    }
    ctx.restore();
  }

  function drawTile(tile, x, y, L, colors, now) {
    const radius = L.tileW * 0.035;
    ctx.save();
    roundRect(x, y, L.tileW, L.tileH, radius);
    ctx.clip();

    const p = tile.flipAt ? (now - tile.flipAt) / tile.flipDur : 1;
    if (p >= 0 && p < 1 && tile.next !== undefined) {
      const prev = tile.prev;
      const next = tile.next;
      drawHalf(next, 'top', x, y, L, colors);      // new character revealed behind
      drawHalf(prev, 'bottom', x, y, L, colors);   // old lower half until the flap lands
      if (p < 0.5) {
        drawHalf(prev, 'top', x, y, L, colors, 1 - 2 * p, p * 0.5);       // old upper flap falling
      } else {
        drawHalf(next, 'bottom', x, y, L, colors, 2 * p - 1, (1 - p) * 0.5); // new lower flap landing
      }
    } else {
      drawHalf(tile.current, 'top', x, y, L, colors);
      drawHalf(tile.current, 'bottom', x, y, L, colors);
    }

    // Seam and hinge notches
    const seamH = Math.max(1, L.tileH * 0.012);
    ctx.fillStyle = colors.seam;
    ctx.fillRect(x, y + L.tileH / 2 - seamH / 2, L.tileW, seamH);
    ctx.restore();
  }

  function drawFrame() {
    const W = canvas.width;
    const H = canvas.height;
    const colors = {
      page: cssVar('--fc-page') || '#050607',
      chassis: cssVar('--fc-chassis') || '#0c0e11',
      top: cssVar('--fc-top') || '#171a20',
      bottom: cssVar('--fc-bottom') || '#14161b',
      glyph: cssVar('--fc-glyph') || '#e2e2e6',
      seam: cssVar('--fc-seam') || '#08090c',
      accent: cssVar('--fc-accent') || '#ffddb8'
    };
    const L = computeLayout(W, H);
    const now = performance.now();

    ctx.fillStyle = colors.page;
    ctx.fillRect(0, 0, W, H);

    // Chassis with soft shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = H * 0.03;
    ctx.shadowOffsetY = H * 0.01;
    ctx.fillStyle = colors.chassis;
    roundRect(L.cx, L.cy, L.chassisW, L.chassisH, H * 0.015);
    ctx.fill();
    ctx.restore();

    if (options.includeTitle) {
      const title = ($('boardTitle').textContent || '').toUpperCase();
      const fontPx = L.titleH * 0.42;
      ctx.save();
      ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.letterSpacing = `${fontPx * 0.18}px`;
      ctx.fillStyle = colors.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, L.cx + L.chassisW / 2, L.cy + L.inner + L.titleH * 0.42, L.chassisW - 2 * L.inner);
      ctx.restore();
    }

    // Small signature in the bottom-right corner (e.g. GRAND MUSIC EVENTS)
    const settings = FC.settings.get();
    if (settings.brandOn && settings.brand.trim()) {
      const fontPx = H * 0.019;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.letterSpacing = `${fontPx * 0.3}px`;
      ctx.fillStyle = colors.accent;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`♪ ${settings.brand.toUpperCase()}`, W - W * 0.022, H - H * 0.018);
      ctx.restore();
    }

    board.tiles.forEach((tile, i) => {
      const r = Math.floor(i / L.cols);
      const c = i % L.cols;
      drawTile(tile, L.gridX + c * (L.tileW + L.gap), L.gridY + r * (L.tileH + L.gap), L, colors, now);
    });
  }

  function loop() {
    drawFrame();
    rafId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // === RECORDING ===
  // =========================================================================
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const stamp = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };

  function showOverlay(show) {
    const overlay = $('recOverlay');
    overlay.classList.toggle('hidden', !show);
    overlay.classList.toggle('flex', show);
    document.body.classList.toggle('fc-recording', show);
  }

  async function start(opts = {}) {
    if (recording) return false;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      alert('Browserul nu poate înregistra video. Folosește Chrome sau Edge pe calculator.');
      return false;
    }
    options = { ...options, ...opts };
    const height = options.height;
    const width = Math.round(height * 16 / 9);

    await document.fonts.load(`700 100px "Barlow Condensed"`).catch(() => {});
    await document.fonts.load(`600 40px "JetBrains Mono"`).catch(() => {});

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { alpha: false });
    loop();

    const tracks = [...canvas.captureStream(30).getVideoTracks()];
    audioTap = audio.createRecordStream();
    if (audioTap) tracks.push(...audioTap.stream.getAudioTracks());

    const mimeType = pickMimeType();
    const bitrate = height >= 2160 ? 35_000_000 : 12_000_000;
    const chunks = [];
    recorder = new MediaRecorder(new MediaStream(tracks), mimeType
      ? { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 }
      : { videoBitsPerSecond: bitrate });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      clearInterval(timer);
      if (audioTap) audioTap.release();
      audioTap = null;
      recording = false;
      showOverlay(false);
      const type = recorder.mimeType || mimeType || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      if (chunks.length) downloadBlob(new Blob(chunks, { type }), `flapcast-${height}p-${stamp()}.${ext}`);
      stopListeners.forEach(fn => fn(chunks.length > 0, ext));
      canvas = null;
      ctx = null;
    };

    recorder.start(1000);
    recording = true;
    startedAt = Date.now();
    showOverlay(true);
    $('recInfo').textContent = `${height === 2160 ? '4K' : 'Full HD'} • nu schimba fila cât înregistrează`;
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      $('recTime').textContent = `REC ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    return true;
  }

  function stop() {
    if (!recording || !recorder) return;
    if (recorder.state !== 'inactive') recorder.stop();
  }

  $('recStopBtn').addEventListener('click', stop);

  // Frames only render while the tab is visible; warn if the user switches away
  document.addEventListener('visibilitychange', () => {
    if (recording && document.hidden) $('recInfo').textContent = 'ATENȚIE: fila e ascunsă – video-ul se oprește din randare!';
  });

  FC.video = {
    start,
    stop,
    isRecording: () => recording,
    onStop(fn) { stopListeners.add(fn); },
    // Renders a single frame (used for previews / tests)
    snapshot(height = 1080, includeTitle = true) {
      options = { ...options, height, includeTitle };
      canvas = document.createElement('canvas');
      canvas.height = height;
      canvas.width = Math.round(height * 16 / 9);
      ctx = canvas.getContext('2d', { alpha: false });
      drawFrame();
      const url = canvas.toDataURL('image/png');
      canvas = null;
      ctx = null;
      return url;
    }
  };
})();
