// FlapCast Playbook: turns a pasted script into board pages + sound cues,
// plays it back, shows it full-screen for event displays and records it to video.
(() => {
  const FB = window.FlapBoard;
  if (!FB) return;

  const { ROWS, COLS } = FB;
  const isDesktop = !!document.querySelector('aside');
  const STORAGE_KEY = 'flapcast.playbook.v1';
  const SOUND_LINE = /^[*\s]*(sunet|sound|gong|ding|semnal)[*\s.!]*$/i;

  const DEFAULT_SCRIPT = `****sunet

Doamnelor și domnilor ,
Stimați pasageri,
compania Gabriela & Alin Airlines
Are onoarea, de a va ura bun venit , la bordul acestui zbor special .
Cu destinația “ O viață împreună “ .

****sunet

Vă invităm ,să vă ocupați locurile și să vă pregătiți pentru decolare .
Intr-o atmosfera elegantă ,plină de emoție si bucurie .
Astăzi , celebrăm începutul unei călătorii unice , unde iubirea este pilotul principal iar fiecare dintre dvs , face parte din echipajul nostru de suflet !

*** sunet

La bordul acestui zbor se află alături de noi : însoțitorii de bord , părinții Luminița & George , Maria & Nelu și piloții :nași Ștefania & Cristi .

** sunet

Echipajul,va mulțumește ca ați ales să le fiți alături și vă invită să vă bucurați , de fiecare moment al acestei experiențe de neuitat .

*** sunet

În câteva clipe , v-om începe călătoria noastră .

*** sunet

Vă dorim un zbor lin , plin de eleganță , emoție și iubire .`;

  // =========================================================================
  // === SCRIPT PARSING: text -> [{type:'sound'} | {type:'page', lines:[]}] ===
  // =========================================================================
  function cleanPhrase(raw) {
    return FB.sanitize(raw)
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?:])/g, '$1')        // "venit ," -> "venit,"
      .replace(/([,:])(?=[^\s\d])/g, '$1 ')  // ",plina" -> ", plina" (keeps 12:40)
      .replace(/"\s*([^"]*?)\s*"/g, '"$1"')  // “ text “ -> "text"
      .trim();
  }

  function wrapWords(text) {
    const lines = [];
    let line = '';
    text.split(' ').filter(Boolean).forEach(word => {
      while (word.length > COLS) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, COLS));
        word = word.slice(COLS);
      }
      if (!word) return;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= COLS) line += ' ' + word;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Split a sentence into pages of at most ROWS lines: as few pages as possible,
  // breaking after punctuation when we can and avoiding near-empty pages.
  function sentenceBlocks(sentence) {
    const words = sentence.split(' ').filter(Boolean);
    const n = words.length;
    const best = new Array(n + 1).fill(null);
    best[n] = { cost: 0, next: n };
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j <= n; j++) {
        const lines = wrapWords(words.slice(i, j).join(' ')).length;
        if (lines > ROWS && j > i + 1) break;
        const cleanBreak = j === n || /[,:.!?]$/.test(words[j - 1]);
        const cost = 10 + (cleanBreak ? 0 : 4) + (lines === 1 && n > j - i ? 3 : 0) + best[j].cost;
        if (!best[i] || cost < best[i].cost) best[i] = { cost, next: j };
      }
    }
    const blocks = [];
    for (let i = 0; i < n; i = best[i].next) {
      blocks.push(wrapWords(words.slice(i, best[i].next).join(' ')));
    }
    return blocks;
  }

  function parseScript(text) {
    const steps = [];
    let paragraph = [];

    const flush = () => {
      let page = [];
      paragraph.forEach(sourceLine => {
        const phrase = cleanPhrase(sourceLine);
        if (!phrase) return;
        phrase.split(/(?<=[.!?])\s+/).forEach(sentence => {
          const blocks = sentenceBlocks(sentence);
          blocks.forEach(block => {
            // Only a sentence that fits entirely may share a page with the previous one
            if (page.length && (blocks.length > 1 || page.length + block.length > ROWS)) {
              steps.push({ type: 'page', lines: page });
              page = [];
            }
            page = page.concat(block);
          });
        });
      });
      if (page.length) steps.push({ type: 'page', lines: page });
      paragraph = [];
    };

    String(text).replace(/\r\n?/g, '\n').split('\n').forEach(raw => {
      const line = raw.trim();
      if (SOUND_LINE.test(line)) { flush(); steps.push({ type: 'sound' }); }
      else if (!line || /^\*+$/.test(line)) flush();
      else paragraph.push(line);
    });
    flush();
    return steps;
  }

  // =========================================================================
  // === AUDIO: airport "ding-dong-ding" announcement chime ===
  // =========================================================================
  const CHIME_MS = 2800;

  function playChime() {
    FB.unlockAudio();
    const eng = FB.audio;
    const ctx = eng.ctx;
    if (!ctx || !eng.masterGain || eng.isMuted) return;
    const t0 = ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99].forEach((freq, k) => {
      const t = t0 + k * 0.45;
      // Bell-like partials: fundamental + soft overtones
      [[1, 1], [2, 0.3], [3.01, 0.1], [4.2, 0.04]].forEach(([mult, gain]) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.4 * gain, t + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 1.9 / Math.sqrt(mult));
        osc.connect(env);
        env.connect(eng.masterGain);
        osc.start(t);
        osc.stop(t + 2);
      });
    });
  }

  // =========================================================================
  // === UI ===
  // =========================================================================
  const style = document.createElement('style');
  style.textContent = `
    body.fc-present { overflow: hidden !important; cursor: none; }
    body.fc-present.fc-cursor:not(.fc-recording) { cursor: default; }
    body.fc-present #sec-board {
      position: fixed !important; inset: 0; z-index: 9998; margin: 0 !important;
      padding: 2vh 2vw !important; background: #050607;
      display: flex; align-items: center; justify-content: center;
    }
    body.fc-present #sec-board > div { width: min(96vw, calc((96vh - 150px) * 2.5)); max-width: none; }
    #fc-present-bar { display: none; }
    body.fc-present #fc-present-bar {
      display: flex; position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
      z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .25s;
    }
    body.fc-present.fc-cursor:not(.fc-recording) #fc-present-bar { opacity: 1; pointer-events: auto; }
    #fc-steps::-webkit-scrollbar { display: block; width: 6px; }
    #fc-steps::-webkit-scrollbar-thumb { background: #534434; border-radius: 3px; }
  `;
  document.head.appendChild(style);

  const btn = 'h-10 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center gap-1.5 font-label-md text-label-md uppercase tracking-wider transition-colors border border-outline-variant/20 disabled:opacity-40';
  const icon = name => `<span class="material-symbols-outlined text-[20px]">${name}</span>`;

  const panel = document.createElement('div');
  panel.id = 'sec-playbook';
  panel.className = isDesktop ? 'w-full' : 'px-margin-mobile mt-space-md';
  panel.style.scrollMarginTop = isDesktop ? '24px' : '80px';
  panel.innerHTML = `
<div class="p-5 rounded-xl bg-surface-container-low border border-outline-variant/30 shadow-[0_8px_24px_rgba(0,0,0,0.6)] flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined text-primary text-[24px]">playlist_play</span>
      <div class="flex flex-col">
        <span class="font-label-md text-label-md uppercase text-primary tracking-widest font-semibold">PLAYBOOK EVENIMENT</span>
        <span class="font-label-sm text-label-sm text-outline" id="fc-summary">—</span>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="hidden font-label-md text-label-md text-error tracking-wider items-center gap-1.5" id="fc-rec-indicator"><span class="w-2.5 h-2.5 rounded-full bg-error animate-pulse"></span><span id="fc-rec-time">REC 00:00</span></span>
      <span class="font-label-sm text-label-sm text-secondary uppercase tracking-wider" id="fc-status">GATA</span>
    </div>
  </div>

  <div class="grid grid-cols-1 ${isDesktop ? 'xl:grid-cols-2' : ''} gap-4">
    <!-- Script editor -->
    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex items-center justify-between">
        <span class="font-label-sm text-label-sm uppercase text-outline tracking-wider">TEXT / SCENARIU</span>
        <span class="font-label-sm text-label-sm text-outline-variant truncate ml-2" id="fc-interim"></span>
      </div>
      <textarea id="fc-script" rows="14" spellcheck="false"
        class="w-full bg-surface-container-lowest rounded-lg p-3 font-body-sm text-body-sm text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary/60 resize-y select-text"
        placeholder="Scrie sau lipește textul aici.&#10;Un rând gol = pagină nouă.&#10;Un rând „*** sunet” = semnal sonor de anunț."></textarea>
      <div class="flex flex-wrap gap-2">
        <button class="${btn}" id="fc-dictate" title="Dictează text în editor">${icon('mic')}<span id="fc-dictate-label">Dictează</span></button>
        <button class="${btn}" id="fc-load" title="Încarcă un fișier .txt">${icon('upload_file')}<span>Încarcă .txt</span></button>
        <button class="${btn}" id="fc-save" title="Salvează textul ca .txt">${icon('download')}<span>Salvează .txt</span></button>
        <button class="${btn}" id="fc-sound-insert" title="Inserează un semnal sonor la cursor">${icon('notifications_active')}<span>+ Sunet</span></button>
        <button class="${btn}" id="fc-example" title="Încarcă textul exemplu">${icon('auto_stories')}<span>Exemplu</span></button>
        <input type="file" id="fc-file" accept=".txt,text/plain" class="hidden"/>
      </div>
    </div>

    <!-- Steps list + controls -->
    <div class="flex flex-col gap-3 min-w-0">
      <span class="font-label-sm text-label-sm uppercase text-outline tracking-wider">PAȘI (CLICK PENTRU AFIȘARE)</span>
      <div id="fc-steps" class="flex flex-col gap-1.5 overflow-y-auto pr-1 bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/30" style="max-height: 300px"></div>

      <div class="flex flex-wrap items-center gap-2">
        <button class="${btn}" id="fc-prev" title="Pasul anterior (←)">${icon('skip_previous')}</button>
        <button class="h-10 px-5 rounded-lg bg-primary text-on-primary hover:bg-primary-fixed flex items-center gap-1.5 font-headline-sm text-headline-sm uppercase tracking-wider shadow-md active:scale-95 transition-all" id="fc-play" title="Pornește / Pauză (Spațiu)">${icon('play_arrow')}<span id="fc-play-label">PORNEȘTE</span></button>
        <button class="${btn}" id="fc-next" title="Pasul următor (→)">${icon('skip_next')}</button>
        <button class="${btn}" id="fc-stop" title="Oprește și golește tabela">${icon('stop')}</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="${btn} flex-1" id="fc-present" title="Afișează doar tabela, pe tot ecranul (F)">${icon('fit_screen')}<span>Ecran mare</span></button>
        <button class="${btn} flex-1 text-error" id="fc-record" title="Înregistrează playbook-ul ca video">${icon('radio_button_checked')}<span id="fc-record-label">Înregistrează video</span></button>
      </div>

      <div class="flex flex-col gap-2 bg-surface-container-lowest rounded-lg p-3 border border-outline-variant/30">
        <div class="flex items-center justify-between text-outline">
          <span class="font-label-sm text-label-sm uppercase tracking-wider">DURATĂ AFIȘARE PAGINĂ</span>
          <span class="font-label-sm text-label-sm text-primary font-bold" id="fc-hold-label">×1.0</span>
        </div>
        <input type="range" id="fc-hold" min="0.5" max="2.5" step="0.1" value="1" class="w-full accent-primary h-1.5 cursor-pointer"/>
        <div class="flex flex-wrap gap-4 pt-1">
          <label class="flex items-center gap-2 font-label-sm text-label-sm uppercase text-on-surface-variant cursor-pointer"><input type="checkbox" id="fc-center" checked class="accent-primary"/> Centrează textul</label>
          <label class="flex items-center gap-2 font-label-sm text-label-sm uppercase text-on-surface-variant cursor-pointer"><input type="checkbox" id="fc-loop" class="accent-primary"/> Repetă în buclă</label>
        </div>
      </div>
    </div>
  </div>
  <p class="font-body-sm text-body-sm text-outline leading-snug">
    Taste: <b class="text-on-surface">Spațiu</b> pornește / pauză • <b class="text-on-surface">← →</b> pas anterior / următor • <b class="text-on-surface">F</b> ecran mare • <b class="text-on-surface">Esc</b> ieșire.
    La înregistrare alege <b class="text-on-surface">„Această filă”</b>. Video-ul pornește automat, cuprinde tot playbook-ul cu sunet și se salvează în Descărcări.
  </p>
</div>`;

  const board = document.getElementById('sec-board');
  board.insertAdjacentElement('afterend', panel);

  const presentBar = document.createElement('div');
  presentBar.id = 'fc-present-bar';
  presentBar.className = 'items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low/95 border border-outline-variant/30 shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur';
  presentBar.innerHTML = `
    <button class="${btn}" data-act="prev">${icon('skip_previous')}</button>
    <button class="${btn} text-primary" data-act="play"><span class="material-symbols-outlined text-[20px]" id="fc-bar-play-icon">play_arrow</span></button>
    <button class="${btn}" data-act="next">${icon('skip_next')}</button>
    <span class="font-label-md text-label-md text-outline px-2 tracking-wider" id="fc-bar-counter">—</span>
    <button class="${btn}" data-act="exit">${icon('close_fullscreen')}<span>Ieșire</span></button>`;
  document.body.appendChild(presentBar);

  // Add a "Playbook" entry to the bottom nav (mobile) / sidebar (desktop)
  const navSource = document.querySelector('[data-path="presets-history"]');
  if (navSource) {
    const navItem = navSource.cloneNode(true);
    navItem.dataset.path = 'playbook';
    navItem.classList.remove('text-primary', 'bg-surface-container-high');
    navItem.classList.add('text-on-surface-variant');
    navItem.removeAttribute('aria-current');
    const spans = navItem.querySelectorAll('span');
    spans[0].textContent = 'playlist_play';
    spans[1].textContent = 'Playbook';
    navSource.insertAdjacentElement('afterend', navItem);
  }

  const $ = id => document.getElementById(id);
  const scriptEl = $('fc-script');
  const stepsEl = $('fc-steps');
  const statusEl = $('fc-status');
  const summaryEl = $('fc-summary');
  const holdEl = $('fc-hold');
  const centerEl = $('fc-center');
  const loopEl = $('fc-loop');

  // =========================================================================
  // === STATE & RENDERING ===
  // =========================================================================
  let steps = [];
  let current = -1;
  let playing = false;
  let runToken = 0;

  const setStatus = text => { statusEl.textContent = text; };
  const pageCount = () => steps.filter(s => s.type === 'page').length;
  const counterText = () => current >= 0 ? `${current + 1} / ${steps.length}` : `— / ${steps.length}`;

  function holdMs(step) {
    const letters = step.lines.join('').replace(/\s/g, '').length;
    return Math.max(2200, 1600 + letters * 85) * parseFloat(holdEl.value);
  }

  function estimateSeconds() {
    return steps.reduce((sum, s) => sum + (s.type === 'sound' ? CHIME_MS : holdMs(s) + 1800), 0) / 1000;
  }

  function renderSteps() {
    stepsEl.innerHTML = '';
    steps.forEach((step, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.index = i;
      item.className = 'fc-step w-full text-left flex items-start gap-2 p-2 rounded-lg border transition-colors';
      if (step.type === 'sound') {
        item.innerHTML = `<span class="font-label-sm text-label-sm text-outline w-6 shrink-0 pt-0.5">${i + 1}</span>
          <span class="flex items-center gap-2 font-label-md text-label-md text-secondary uppercase tracking-wider">
            <span class="material-symbols-outlined text-[18px]">notifications_active</span>SEMNAL SONOR</span>`;
      } else {
        const preview = step.lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n');
        item.innerHTML = `<span class="font-label-sm text-label-sm text-outline w-6 shrink-0 pt-0.5">${i + 1}</span>
          <pre class="font-label-md text-label-md text-on-surface leading-tight whitespace-pre m-0">${preview}</pre>`;
      }
      item.addEventListener('click', () => jumpTo(i));
      stepsEl.appendChild(item);
    });
    highlightCurrent();
    const secs = Math.round(estimateSeconds());
    const sounds = steps.length - pageCount();
    summaryEl.textContent = steps.length
      ? `${pageCount()} PAGINI • ${sounds} SEMNALE • ~${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} MIN`
      : 'PLAYBOOK GOL – SCRIE UN TEXT';
  }

  function highlightCurrent() {
    stepsEl.querySelectorAll('.fc-step').forEach(el => {
      const active = Number(el.dataset.index) === current;
      el.classList.toggle('bg-primary/15', active);
      el.classList.toggle('border-primary/60', active);
      el.classList.toggle('border-transparent', !active);
      el.classList.toggle('hover:bg-surface-container', !active);
      if (active) el.scrollIntoView({ block: 'nearest' });
    });
    $('fc-bar-counter').textContent = counterText();
  }

  function setCurrent(i) {
    current = i;
    highlightCurrent();
  }

  function setPlaying(value) {
    playing = value;
    $('fc-play-label').textContent = value ? 'PAUZĂ' : 'PORNEȘTE';
    $('fc-play').querySelector('.material-symbols-outlined').textContent = value ? 'pause' : 'play_arrow';
    $('fc-bar-play-icon').textContent = value ? 'pause' : 'play_arrow';
  }

  function boardRows(lines) {
    if (!centerEl.checked) return lines;
    const top = Math.floor((ROWS - lines.length) / 2);
    return Array(top).fill('').concat(lines.map(l => ' '.repeat(Math.floor((COLS - l.length) / 2)) + l));
  }

  function showStep(step) {
    if (step.type === 'sound') playChime();
    else FB.showLines(boardRows(step.lines));
  }

  // =========================================================================
  // === PLAYBACK ENGINE ===
  // =========================================================================
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function sleepChecked(ms, token) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (token !== runToken) return false;
      await wait(Math.min(100, end - Date.now()));
    }
    return token === runToken;
  }

  async function waitBoardIdle(token) {
    await wait(400); // renderBoard staggers the first flips by up to ~300ms
    while (!FB.isIdle()) {
      if (token !== runToken) return false;
      await wait(80);
    }
    return token === runToken;
  }

  async function performStep(i, token) {
    setCurrent(i);
    const step = steps[i];
    setStatus(step.type === 'sound' ? 'SEMNAL SONOR' : `PAGINA ${steps.slice(0, i + 1).filter(s => s.type === 'page').length} / ${pageCount()}`);
    showStep(step);
    if (step.type === 'sound') return sleepChecked(CHIME_MS, token);
    if (!await waitBoardIdle(token)) return false;
    return sleepChecked(holdMs(step), token);
  }

  async function play(from = 0) {
    if (!steps.length) { setStatus('PLAYBOOK GOL'); return; }
    FB.unlockAudio();
    const token = ++runToken;
    setPlaying(true);
    let i = from;
    for (;;) {
      if (i >= steps.length) {
        if (loopEl.checked && !recording) { i = 0; continue; }
        break;
      }
      if (!await performStep(i, token)) return;
      i++;
    }
    if (token !== runToken) return;
    setPlaying(false);
    setCurrent(-1);
    setStatus('FINAL PLAYBOOK');
    if (recording) finishRecording();
  }

  function pause() {
    runToken++;
    setPlaying(false);
    setStatus('PAUZĂ');
  }

  function togglePlay() {
    if (playing) pause();
    else play(current >= 0 ? current : 0);
  }

  function jumpTo(i) {
    if (!steps.length) return;
    i = Math.max(0, Math.min(steps.length - 1, i));
    if (playing) { play(i); return; }
    runToken++;
    FB.unlockAudio();
    setCurrent(i);
    setStatus('PREVIZUALIZARE');
    showStep(steps[i]);
  }

  function stop() {
    runToken++;
    setPlaying(false);
    setCurrent(-1);
    setStatus('OPRIT');
    FB.showLines([]);
  }

  // =========================================================================
  // === PRESENTATION MODE (big screens) ===
  // =========================================================================
  let cursorTimer = null;
  let presentUsesFullscreen = false;

  function enterPresent(requestFullscreen = true) {
    document.body.classList.add('fc-present');
    if (requestFullscreen && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => { presentUsesFullscreen = true; })
        .catch(() => {});
    }
  }

  function exitPresent() {
    document.body.classList.remove('fc-present', 'fc-cursor');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    presentUsesFullscreen = false;
  }

  document.addEventListener('fullscreenchange', () => {
    // Leaving browser fullscreen (Esc / F11) also leaves presentation mode
    if (!document.fullscreenElement && presentUsesFullscreen && !recording) exitPresent();
  });

  document.addEventListener('mousemove', () => {
    if (!document.body.classList.contains('fc-present')) return;
    document.body.classList.add('fc-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.remove('fc-cursor'), 2500);
  });

  presentBar.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'prev') jumpTo(current - 1);
    if (act === 'next') jumpTo(current + 1);
    if (act === 'play') togglePlay();
    if (act === 'exit') exitPresent();
  });

  // =========================================================================
  // === VIDEO RECORDING (tab capture + board audio) ===
  // =========================================================================
  let recording = false;
  let recorder = null;
  let recTimer = null;
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);

  function pickMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

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

  function updateRecordUI() {
    $('fc-record-label').textContent = recording ? 'Oprește înregistrarea' : 'Înregistrează video';
    const indicator = $('fc-rec-indicator');
    indicator.classList.toggle('hidden', !recording);
    indicator.classList.toggle('flex', recording);
    document.body.classList.toggle('fc-recording', recording);
  }

  async function startRecording() {
    if (!steps.length) { setStatus('PLAYBOOK GOL'); return; }
    FB.unlockAudio();
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude'
      });
    } catch (err) {
      setStatus('ÎNREGISTRARE ANULATĂ');
      return;
    }

    // Record the board's own audio directly (clacks + chimes), no tab-audio checkbox needed
    const eng = FB.audio;
    const tracks = [...display.getVideoTracks()];
    let audioDest = null;
    if (eng.ctx && eng.masterGain) {
      audioDest = eng.ctx.createMediaStreamDestination();
      eng.masterGain.connect(audioDest);
      tracks.push(...audioDest.stream.getAudioTracks());
    }

    const mimeType = pickMimeType();
    const chunks = [];
    recorder = new MediaRecorder(new MediaStream(tracks), mimeType
      ? { mimeType, videoBitsPerSecond: 8_000_000 }
      : { videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      display.getTracks().forEach(t => t.stop());
      if (audioDest) { try { eng.masterGain.disconnect(audioDest); } catch (e) { /* already disconnected */ } }
      clearInterval(recTimer);
      recording = false;
      updateRecordUI();
      exitPresent();
      const type = recorder.mimeType || mimeType || 'video/webm';
      if (chunks.length) {
        downloadBlob(new Blob(chunks, { type }), `playbook-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
        setStatus('VIDEO SALVAT ÎN DESCĂRCĂRI');
      } else {
        setStatus('ÎNREGISTRARE GOALĂ');
      }
    };
    display.getVideoTracks()[0].addEventListener('ended', () => stopRecording());

    recording = true;
    updateRecordUI();
    enterPresent(false);
    runToken++;
    setPlaying(false);
    FB.showLines([]);
    setStatus('PREGĂTIRE ÎNREGISTRARE...');
    await wait(2000); // let the blank board settle and the share prompt disappear
    if (!recording) return;

    recorder.start(1000);
    const started = Date.now();
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      $('fc-rec-time').textContent = `REC ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    await wait(1200);
    if (recording) play(0);
  }

  async function finishRecording() {
    await wait(2500); // hold on the last page a moment before cutting
    stopRecording();
  }

  function stopRecording() {
    if (!recording) return;
    runToken++;
    setPlaying(false);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else { recording = false; updateRecordUI(); exitPresent(); }
  }

  // =========================================================================
  // === EDITOR: dictation, file load/save, persistence ===
  // =========================================================================
  let saveTimer = null;
  function onScriptChanged() {
    steps = parseScript(scriptEl.value);
    if (current >= steps.length) current = -1;
    renderSteps();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, scriptEl.value); } catch (e) { /* storage unavailable */ }
    }, 400);
  }

  function insertAtCursor(text) {
    const start = scriptEl.selectionStart ?? scriptEl.value.length;
    const end = scriptEl.selectionEnd ?? start;
    scriptEl.value = scriptEl.value.slice(0, start) + text + scriptEl.value.slice(end);
    scriptEl.selectionStart = scriptEl.selectionEnd = start + text.length;
    onScriptChanged();
  }

  scriptEl.addEventListener('input', onScriptChanged);

  $('fc-sound-insert').addEventListener('click', () => {
    insertAtCursor('\n\n*** sunet\n\n');
    scriptEl.focus();
  });

  $('fc-example').addEventListener('click', () => {
    if (scriptEl.value.trim() && scriptEl.value !== DEFAULT_SCRIPT &&
        !confirm('Înlocuiești textul curent cu exemplul?')) return;
    scriptEl.value = DEFAULT_SCRIPT;
    onScriptChanged();
  });

  $('fc-load').addEventListener('click', () => $('fc-file').click());
  $('fc-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      scriptEl.value = String(reader.result);
      onScriptChanged();
      setStatus('FIȘIER ÎNCĂRCAT');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  });

  $('fc-save').addEventListener('click', () => {
    downloadBlob(new Blob([scriptEl.value], { type: 'text/plain;charset=utf-8' }), `playbook-${stamp()}.txt`);
  });

  // Voice dictation straight into the editor
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const DICTATION_ERRORS = {
    'not-allowed': 'MICROFON BLOCAT – PERMITE ACCESUL',
    'service-not-allowed': 'DICTARE INDISPONIBILĂ',
    'network': 'DICTAREA NECESITĂ INTERNET',
    'audio-capture': 'NICIUN MICROFON DETECTAT'
  };
  let dictation = null;
  let dictating = false;

  function setDictating(value) {
    dictating = value;
    $('fc-dictate-label').textContent = value ? 'Oprește dictarea' : 'Dictează';
    $('fc-dictate').classList.toggle('text-primary', value);
    $('fc-dictate').classList.toggle('border-primary/60', value);
    if (!value) $('fc-interim').textContent = '';
  }

  if (Recognition) {
    dictation = new Recognition();
    dictation.lang = 'ro-RO';
    dictation.continuous = true;
    dictation.interimResults = true;
    dictation.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          const needsSpace = scriptEl.value && !/\s$/.test(scriptEl.value);
          scriptEl.value += (needsSpace ? ' ' : '') + text.charAt(0).toUpperCase() + text.slice(1);
          onScriptChanged();
        } else {
          interim += text + ' ';
        }
      }
      $('fc-interim').textContent = interim ? `„${interim.trim()}…”` : '';
    };
    dictation.onerror = event => {
      if (DICTATION_ERRORS[event.error]) {
        setStatus(DICTATION_ERRORS[event.error]);
        setDictating(false);
      }
    };
    // Chrome ends the session after silence; restart while the user still wants to dictate
    dictation.onend = () => {
      if (dictating) { try { dictation.start(); } catch (e) { setDictating(false); } }
    };
  } else {
    $('fc-dictate').disabled = true;
    $('fc-dictate').title = 'Dictarea vocală funcționează în Chrome sau Edge';
  }

  $('fc-dictate').addEventListener('click', () => {
    if (!dictation) return;
    if (dictating) {
      setDictating(false);
      dictation.stop();
    } else {
      setDictating(true);
      setStatus('DICTARE ACTIVĂ – VORBEȘTE');
      try { dictation.start(); } catch (e) { /* already running */ }
    }
  });

  // =========================================================================
  // === CONTROLS & KEYBOARD ===
  // =========================================================================
  $('fc-play').addEventListener('click', togglePlay);
  $('fc-prev').addEventListener('click', () => jumpTo(current - 1));
  $('fc-next').addEventListener('click', () => jumpTo(current + 1));
  $('fc-stop').addEventListener('click', stop);
  $('fc-present').addEventListener('click', () => enterPresent(true));

  const recordBtn = $('fc-record');
  if (canRecord) {
    recordBtn.addEventListener('click', () => (recording ? stopRecording() : startRecording()));
  } else {
    recordBtn.disabled = true;
    recordBtn.title = 'Înregistrarea video funcționează în Chrome sau Edge pe calculator';
  }

  holdEl.addEventListener('input', () => {
    $('fc-hold-label').textContent = `×${parseFloat(holdEl.value).toFixed(1)}`;
    renderSteps();
  });
  centerEl.addEventListener('change', () => {
    if (current >= 0 && steps[current].type === 'page') showStep(steps[current]);
  });

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || e.target.isContentEditable) return;
    const presenting = document.body.classList.contains('fc-present');
    if (e.key === 'Escape') {
      if (recording) stopRecording();
      else if (presenting) exitPresent();
      return;
    }
    // Space / arrows only drive the playbook while it's active or on the big screen
    const active = presenting || playing || current >= 0;
    if (e.key === ' ' && active) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' && active) { e.preventDefault(); jumpTo(current + 1); }
    else if (e.key === 'ArrowLeft' && active) { e.preventDefault(); jumpTo(current - 1); }
    else if (e.key === 'f' || e.key === 'F') { presenting ? exitPresent() : enterPresent(true); }
  });

  // =========================================================================
  // === INIT ===
  // =========================================================================
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
  scriptEl.value = saved !== null ? saved : DEFAULT_SCRIPT;
  onScriptChanged();
  updateRecordUI();

  // Test hook
  window.FlapPlaybook = { parse: parseScript, get steps() { return steps; }, play, stop, jumpTo, enterPresent, exitPresent };
})();
