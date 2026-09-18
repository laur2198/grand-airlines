// FlapCast Playbook: script -> board pages + sound cues + pauses, with voice-over,
// custom sounds, background music, portable project files and video export.
(() => {
  const FC = window.FC;
  if (FC.isDisplay) return; // the projector window only mirrors the board
  const { board, audio } = FC;
  const $ = id => document.getElementById(id);

  const SCRIPT_KEY = 'flapcast.playbook.v1';
  const OPTIONS_KEY = 'flapcast.playbook.options.v2';
  const CHIME_MS = 2800;

  const DEFAULT_SCRIPT = `****sunet

Doamnelor și domnilor ,
Stimați pasageri,
compania Gabriela & Alin Airlines
Are onoarea, de a va ura bun venit , la bordul acestui zbor special .
Cu destinația “ O viață împreună “ . [7s]

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

[pauză 2]

*** sunet

Vă dorim un zbor lin , plin de eleganță , emoție și iubire . [8s]`;

  // =========================================================================
  // === SCRIPT PARSING ===
  // steps: {type:'page', lines, speech, hold?} | {type:'sound', name} | {type:'pause', seconds}
  // =========================================================================
  const SOUND_LINE = /^[*\s]*(?:sunet|sound|gong|ding|semnal)\b\s*:?\s*([^*]*?)[*\s.!]*$/i;
  const PAUSE_LINE = /^\[\s*(?:pauz[aă]|gol|blank|pause)\s*(\d+(?:[.,]\d+)?)?\s*(?:s|sec|secunde)?\s*\]$/i;
  const HOLD_TAG = /\[\s*(\d+(?:[.,]\d+)?)\s*(?:s|sec|secunde)?\s*\]/gi;

  const num = s => parseFloat(String(s).replace(',', '.'));

  function cleanOriginal(raw) {
    return String(raw).normalize('NFC')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?:;])/g, '$1')         // "venit ," -> "venit,"
      .replace(/([,:;])(?=[^\s\d])/g, '$1 ')   // ",plina" -> ", plina" (keeps 12:40)
      .replace(/["“”„«»]\s*([^"“”„«»]*?)\s*["“”„«»]/g, '„$1”')
      .trim();
  }

  // Words carry the original text (for the voice) and the board text (for layout)
  function toWords(text) {
    return text.split(' ').map(orig => ({ orig, disp: FC.sanitize(orig).replace(/\s+/g, '') })).filter(w => w.disp);
  }

  function wrapWordObjects(words) {
    const cols = board.cols;
    const lines = [];
    let line = '';
    words.forEach(w => {
      let d = w.disp;
      while (d.length > cols) {
        if (line) { lines.push(line); line = ''; }
        lines.push(d.slice(0, cols));
        d = d.slice(cols);
      }
      if (!d) return;
      if (!line) line = d;
      else if (line.length + 1 + d.length <= cols) line += ' ' + d;
      else { lines.push(line); line = d; }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Split one sentence into as few pages as possible, preferring breaks after punctuation
  function sentenceBlocks(words) {
    const n = words.length;
    const rows = board.rows;
    const best = new Array(n + 1).fill(null);
    best[n] = { cost: 0, next: n };
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j <= n; j++) {
        const lines = wrapWordObjects(words.slice(i, j)).length;
        if (lines > rows && j > i + 1) break;
        const cleanBreak = j === n || /[,:.!?]$/.test(words[j - 1].disp);
        const cost = 10 + (cleanBreak ? 0 : 4) + (lines === 1 && n > j - i ? 3 : 0) + best[j].cost;
        if (!best[i] || cost < best[i].cost) best[i] = { cost, next: j };
      }
    }
    const blocks = [];
    for (let i = 0; i < n; i = best[i].next) blocks.push(words.slice(i, best[i].next));
    return blocks;
  }

  function parseScript(text) {
    const steps = [];
    let paragraph = [];

    const flush = () => {
      let hold = null;
      const words = [];
      paragraph.forEach(line => {
        const stripped = line.replace(HOLD_TAG, (m, s) => { hold = num(s); return ' '; });
        words.push(...toWords(cleanOriginal(stripped)));
      });
      paragraph = [];

      // Sentences end on . ! ?
      const sentences = [];
      let cur = [];
      words.forEach(w => {
        cur.push(w);
        if (/[.!?]["']?$/.test(w.disp)) { sentences.push(cur); cur = []; }
      });
      if (cur.length) sentences.push(cur);

      let page = [];
      const pushPage = () => {
        if (!page.length) return;
        steps.push({ type: 'page', lines: wrapWordObjects(page), speech: page.map(w => w.orig).join(' '), hold });
        page = [];
      };
      sentences.forEach(sentence => {
        const blocks = sentenceBlocks(sentence);
        blocks.forEach(block => {
          // Only a sentence that fits entirely may share a page with the previous one
          const combined = wrapWordObjects(page.concat(block)).length;
          if (page.length && (blocks.length > 1 || combined > board.rows)) pushPage();
          page = page.concat(block);
        });
      });
      pushPage();
    };

    String(text).replace(/\r\n?/g, '\n').split('\n').forEach(raw => {
      const line = raw.trim();
      let m;
      if ((m = line.match(SOUND_LINE))) { flush(); steps.push({ type: 'sound', name: m[1].trim() }); }
      else if ((m = line.match(PAUSE_LINE))) { flush(); steps.push({ type: 'pause', seconds: m[1] ? num(m[1]) : 3 }); }
      else if (!line || /^\*+$/.test(line)) flush();
      else paragraph.push(line);
    });
    flush();
    return steps;
  }

  // =========================================================================
  // === SOUND LIBRARY (IndexedDB, falls back to memory) ===
  // =========================================================================
  const soundKey = name => String(name).normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const library = {
    db: null,
    items: [],          // {id, name, type, data: ArrayBuffer}
    decoded: new Map(), // id -> AudioBuffer

    async init() {
      try {
        this.db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('flapcast', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('sounds', { keyPath: 'id' });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        this.items = await new Promise((resolve, reject) => {
          const req = this.db.transaction('sounds').objectStore('sounds').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        this.db = null; // e.g. private window: keep sounds for this session only
      }
      this.items.sort((a, b) => a.name.localeCompare(b.name));
    },

    async add(name, type, data) {
      const base = soundKey(name) || 'sunet';
      let key = base;
      for (let i = 2; this.items.some(s => s.name === key); i++) key = `${base}-${i}`;
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: key, type, data };
      this.items.push(item);
      this.items.sort((a, b) => a.name.localeCompare(b.name));
      if (this.db) {
        await new Promise(resolve => {
          const tx = this.db.transaction('sounds', 'readwrite');
          tx.objectStore('sounds').put(item);
          tx.oncomplete = tx.onerror = resolve;
        });
      }
      return item;
    },

    async remove(id) {
      this.items = this.items.filter(s => s.id !== id);
      this.decoded.delete(id);
      if (this.db) {
        await new Promise(resolve => {
          const tx = this.db.transaction('sounds', 'readwrite');
          tx.objectStore('sounds').delete(id);
          tx.oncomplete = tx.onerror = resolve;
        });
      }
    },

    find(name) {
      const key = soundKey(name);
      if (!key) return null;
      return this.items.find(s => s.name === key) || this.items.find(s => s.name.startsWith(key)) || null;
    },

    async buffer(item) {
      if (!item) return null;
      if (this.decoded.has(item.id)) return this.decoded.get(item.id);
      try {
        const buf = await audio.decode(item.data);
        this.decoded.set(item.id, buf);
        return buf;
      } catch (e) {
        return null;
      }
    }
  };

  // =========================================================================
  // === VOICE-OVER (speech synthesis) ===
  // =========================================================================
  const synth = window.speechSynthesis;
  let voices = [];

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().slice().sort((a, b) => {
      const ra = a.lang.toLowerCase().startsWith('ro') ? 0 : 1;
      const rb = b.lang.toLowerCase().startsWith('ro') ? 0 : 1;
      return ra - rb || a.name.localeCompare(b.name);
    });
    const select = $('fc-voice-select');
    const wanted = options.voiceName;
    select.innerHTML = '';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.lang.toLowerCase().startsWith('ro') ? '🇷🇴 ' : ''}${v.name} (${v.lang})`;
      select.appendChild(opt);
    });
    if (!voices.length) {
      select.innerHTML = '<option value="">Nicio voce disponibilă</option>';
    }
    const hasRo = voices.some(v => v.lang.toLowerCase().startsWith('ro'));
    $('fc-voice-note').textContent = hasRo
      ? 'Vocea folosește vocile instalate în Windows / browser. Nu intră în înregistrarea video.'
      : 'Nu am găsit o voce românească. În Windows: Setări → Timp și limbă → Vorbire → Adaugă voci → Română. Vocea nu intră în înregistrarea video.';
    select.value = voices.some(v => v.name === wanted) ? wanted : (voices[0] ? voices[0].name : '');
  }

  function speak(text) {
    return new Promise(resolve => {
      if (!synth || !text) { resolve(); return; }
      const utter = new SpeechSynthesisUtterance(text);
      const voice = voices.find(v => v.name === $('fc-voice-select').value);
      if (voice) { utter.voice = voice; utter.lang = voice.lang; } else utter.lang = 'ro-RO';
      utter.rate = parseFloat($('fc-voice-rate').value);
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(safety); resolve(); } };
      const safety = setTimeout(finish, 4000 + text.length * 140);
      utter.onend = finish;
      utter.onerror = finish;
      synth.speak(utter);
    });
  }

  // =========================================================================
  // === OPTIONS (persisted) ===
  // =========================================================================
  const options = {
    speed: 1, center: true, loop: false,
    voiceOn: false, voiceName: '', voiceRate: 0.9,
    musicOn: false, musicName: '', musicVolume: 0.35,
    recHeight: 1080, recTitle: true
  };
  try { Object.assign(options, JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}')); } catch (e) { /* ignore */ }

  function saveOptions() {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch (e) { /* ignore */ }
  }

  function syncOptionControls() {
    $('fc-hold').value = options.speed;
    const sp = Number(options.speed);
    $('fc-hold-label').textContent = `×${sp.toFixed(1)} ${sp === 1 ? 'normal' : sp > 1 ? 'mai rapid' : 'mai lent'}`;
    $('fc-center').checked = options.center;
    $('fc-loop').checked = options.loop;
    $('fc-voice-on').checked = options.voiceOn;
    $('fc-voice-rate').value = options.voiceRate;
    $('fc-voice-rate-label').textContent = `×${Number(options.voiceRate).toFixed(2)}`;
    $('fc-music-on').checked = options.musicOn;
    $('fc-music-volume').value = options.musicVolume;
    $('fc-music-volume-label').textContent = `${Math.round(options.musicVolume * 100)}%`;
    $('fc-rec-title').checked = options.recTitle;
    document.querySelectorAll('#fc-rec-res .fc-seg').forEach(b => b.classList.toggle('is-active', Number(b.dataset.res) === Number(options.recHeight)));
  }

  // =========================================================================
  // === STATE & RENDERING ===
  // =========================================================================
  const scriptEl = $('fc-script');
  const stepsEl = $('fc-steps');
  let steps = [];
  let current = -1;
  let playing = false;
  let runToken = 0;
  let recordingRun = false;

  const setStatus = text => { $('fc-status').textContent = text; };
  const pageCount = () => steps.filter(s => s.type === 'page').length;

  function holdMs(step) {
    if (step.hold) return step.hold * 1000;
    const letters = step.lines.join('').replace(/\s/g, '').length;
    return Math.max(2200, 1600 + letters * 85) / options.speed;
  }

  function stepSeconds(step) {
    if (step.type === 'sound') {
      const item = step.name ? library.find(step.name) : null;
      const buf = item && library.decoded.get(item.id);
      return (buf ? buf.duration * 1000 + 300 : CHIME_MS) / 1000;
    }
    if (step.type === 'pause') return step.seconds;
    return (holdMs(step) + 1800 / options.speed) / 1000;
  }

  const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function renderSteps() {
    stepsEl.innerHTML = '';
    steps.forEach((step, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.index = i;
      item.className = 'fc-step w-full text-left flex items-start gap-2 p-2 rounded-lg border border-transparent transition-colors';
      const n = `<span class="font-label-sm text-label-sm text-outline w-6 shrink-0 pt-0.5">${i + 1}</span>`;
      if (step.type === 'sound') {
        const item2 = step.name ? library.find(step.name) : null;
        const label = step.name
          ? (item2 ? `SUNET: ${escapeHtml(item2.name)}` : `SUNET „${escapeHtml(step.name)}” NEGĂSIT → CLOPOȚEL`)
          : 'SEMNAL SONOR (CLOPOȚEL)';
        item.innerHTML = `${n}<span class="flex items-center gap-2 font-label-md text-label-md uppercase tracking-wider ${step.name && !item2 ? 'text-error' : 'text-secondary'}">
          <span class="material-symbols-outlined text-[18px]">notifications_active</span>${label}</span>`;
      } else if (step.type === 'pause') {
        item.innerHTML = `${n}<span class="flex items-center gap-2 font-label-md text-label-md uppercase tracking-wider text-outline">
          <span class="material-symbols-outlined text-[18px]">hourglass_empty</span>PAUZĂ – TABELĂ GOALĂ ${step.seconds}S</span>`;
      } else {
        const hold = step.hold ? `<span class="font-label-sm text-label-sm text-primary ml-auto shrink-0">${step.hold}s</span>` : '';
        item.innerHTML = `${n}<pre class="font-label-md text-label-md text-on-surface leading-tight whitespace-pre m-0 overflow-hidden">${escapeHtml(step.lines.join('\n'))}</pre>${hold}`;
      }
      item.addEventListener('click', () => jumpTo(i));
      stepsEl.appendChild(item);
    });
    highlightCurrent();
    const secs = Math.round(steps.reduce((sum, s) => sum + stepSeconds(s), 0));
    const sounds = steps.filter(s => s.type === 'sound').length;
    $('fc-summary').textContent = steps.length
      ? `${pageCount()} PAGINI • ${sounds} SEMNALE • ~${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} MIN • TABELĂ ${board.cols}×${board.rows}`
      : 'PLAYBOOK GOL – SCRIE UN TEXT';
  }

  function highlightCurrent() {
    stepsEl.querySelectorAll('.fc-step').forEach(el => {
      const active = Number(el.dataset.index) === current;
      el.classList.toggle('bg-primary/15', active);
      el.classList.toggle('!border-primary/60', active);
      el.classList.toggle('hover:bg-surface-container', !active);
      if (active) el.scrollIntoView({ block: 'nearest' });
    });
    $('fc-bar-counter').textContent = current >= 0 ? `${current + 1} / ${steps.length}` : `— / ${steps.length}`;
  }

  function setCurrent(i) { current = i; highlightCurrent(); }

  function setPlaying(value) {
    playing = value;
    $('fc-play-label').textContent = value ? 'Pauză' : 'Pornește';
    $('fc-play-icon').textContent = value ? 'pause' : 'play_arrow';
    $('fc-bar-play-icon').textContent = value ? 'pause' : 'play_arrow';
  }

  const boardRows = lines => (options.center ? FC.centerLines(lines) : lines);

  // =========================================================================
  // === AUDIO CUES & MUSIC ===
  // =========================================================================
  async function playSoundStep(step) {
    const item = step.name ? library.find(step.name) : null;
    const buf = await library.buffer(item);
    audio.duckMusic(true);
    const ms = buf ? audio.playBuffer(buf) : audio.playChime();
    return ms;
  }

  async function startMusic() {
    if (!options.musicOn) return;
    const item = library.items.find(s => s.name === options.musicName);
    const buf = await library.buffer(item);
    if (buf) audio.startMusic(buf, options.musicVolume);
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
    await wait(450); // the relay cascade delays the first flips
    while (!board.isIdle()) {
      if (token !== runToken) return false;
      await wait(80);
    }
    return token === runToken;
  }

  async function performStep(i, token) {
    setCurrent(i);
    const step = steps[i];
    if (step.type === 'sound') {
      setStatus('SEMNAL SONOR');
      const ms = await playSoundStep(step);
      const ok = await sleepChecked(ms + 300, token);
      audio.duckMusic(false);
      return ok;
    }
    if (step.type === 'pause') {
      setStatus(`PAUZĂ ${step.seconds}S`);
      board.clear();
      return sleepChecked(step.seconds * 1000, token);
    }
    const pageNo = steps.slice(0, i + 1).filter(s => s.type === 'page').length;
    setStatus(`PAGINA ${pageNo} / ${pageCount()}`);
    board.showLines(boardRows(step.lines));
    if (options.voiceOn && synth) {
      audio.duckMusic(true);
      const t0 = Date.now();
      await Promise.all([waitBoardIdle(token), speak(step.speech)]);
      audio.duckMusic(false);
      if (token !== runToken) return false;
      return sleepChecked(Math.max(900, holdMs(step) - (Date.now() - t0)), token);
    }
    if (!await waitBoardIdle(token)) return false;
    return sleepChecked(holdMs(step), token);
  }

  // A faster playbook also turns the drums faster; back to the normal setting when it stops
  function applyFlipSpeed(active) {
    const base = FC.settings.get().speed;
    board.flipIntervalMs = active ? Math.max(12, Math.round(base / options.speed)) : base;
  }

  function haltAudio() {
    applyFlipSpeed(false);
    if (synth) synth.cancel();
    audio.duckMusic(false);
    audio.stopMusic();
  }

  async function play(from = 0) {
    if (!steps.length) { setStatus('PLAYBOOK GOL'); return; }
    FC.unlockAudio();
    const token = ++runToken;
    if (synth) synth.cancel();
    setPlaying(true);
    applyFlipSpeed(true);
    if (!audio.music) startMusic();
    let i = from;
    for (;;) {
      if (i >= steps.length) {
        if (options.loop && !recordingRun) { i = 0; continue; }
        break;
      }
      if (!await performStep(i, token)) return;
      i++;
    }
    if (token !== runToken) return;
    setPlaying(false);
    setCurrent(-1);
    setStatus('FINAL PLAYBOOK');
    applyFlipSpeed(false);
    audio.stopMusic(2.5);
    if (recordingRun) {
      await wait(3000); // hold on the last page before cutting
      FC.video.stop();
    }
  }

  function pause() {
    runToken++;
    setPlaying(false);
    haltAudio();
    setStatus('PAUZĂ');
  }

  function togglePlay() {
    if (FC.video.isRecording()) return;
    if (playing) pause();
    else play(current >= 0 ? current : 0);
  }

  function jumpTo(i) {
    if (!steps.length || FC.video.isRecording()) return;
    i = Math.max(0, Math.min(steps.length - 1, i));
    if (playing) { if (synth) synth.cancel(); play(i); return; }
    runToken++;
    FC.unlockAudio();
    setCurrent(i);
    setStatus('PREVIZUALIZARE');
    const step = steps[i];
    if (step.type === 'sound') playSoundStep(step).then(ms => setTimeout(() => audio.duckMusic(false), ms));
    else if (step.type === 'pause') board.clear();
    else board.showLines(boardRows(step.lines));
  }

  function stop() {
    runToken++;
    setPlaying(false);
    setCurrent(-1);
    haltAudio();
    setStatus('OPRIT');
    board.clear();
  }

  // =========================================================================
  // === VIDEO RECORDING ===
  // =========================================================================
  async function record() {
    if (FC.video.isRecording()) { FC.video.stop(); return; }
    if (!steps.length) { setStatus('PLAYBOOK GOL'); return; }
    FC.unlockAudio();
    runToken++;
    setPlaying(false);
    haltAudio();
    board.clear();
    setStatus('PREGĂTIRE ÎNREGISTRARE...');
    // Pre-decode custom sounds so they start on time
    await Promise.all(steps.filter(s => s.type === 'sound' && s.name).map(s => library.buffer(library.find(s.name))));
    await waitBoardIdle(runToken);
    const started = await FC.video.start({ height: Number(options.recHeight), includeTitle: options.recTitle });
    if (!started) { setStatus('ÎNREGISTRARE INDISPONIBILĂ'); return; }
    recordingRun = true;
    $('fc-record-label').textContent = 'Oprește înregistrarea';
    await wait(1200);
    if (FC.video.isRecording()) play(0);
  }

  FC.video.onStop(saved => {
    recordingRun = false;
    runToken++;
    setPlaying(false);
    haltAudio();
    $('fc-record-label').textContent = 'Înregistrează video';
    setStatus(saved ? 'VIDEO SALVAT ÎN DESCĂRCĂRI' : 'ÎNREGISTRARE GOALĂ');
  });

  // =========================================================================
  // === EDITOR, FILES & PROJECTS ===
  // =========================================================================
  let saveTimer = null;
  function onScriptChanged() {
    steps = parseScript(scriptEl.value);
    if (current >= steps.length) current = -1;
    renderSteps();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(SCRIPT_KEY, scriptEl.value); } catch (e) { /* storage unavailable */ }
    }, 400);
  }

  function insertAtCursor(text) {
    const start = scriptEl.selectionStart ?? scriptEl.value.length;
    const end = scriptEl.selectionEnd ?? start;
    scriptEl.value = scriptEl.value.slice(0, start) + text + scriptEl.value.slice(end);
    scriptEl.selectionStart = scriptEl.selectionEnd = start + text.length;
    scriptEl.focus();
    onScriptChanged();
  }

  const stamp = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };

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

  const toDataUrl = (data, type) => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(new Blob([data], { type: type || 'audio/mpeg' }));
  });

  async function saveProject() {
    setStatus('SE SALVEAZĂ PROIECTUL...');
    const sounds = await Promise.all(library.items.map(async s => ({ name: s.name, type: s.type, data: await toDataUrl(s.data, s.type) })));
    const project = {
      app: 'flapcast', version: 2, saved: new Date().toISOString(),
      script: scriptEl.value, settings: FC.settings.get(), options, sounds
    };
    downloadBlob(new Blob([JSON.stringify(project)], { type: 'application/json' }), `proiect-${stamp()}.flapcast.json`);
    setStatus('PROIECT SALVAT ÎN DESCĂRCĂRI');
  }

  async function openProject(text) {
    const project = JSON.parse(text);
    if (project.app !== 'flapcast') throw new Error('not a flapcast project');
    if (project.settings) FC.settings.set(project.settings);
    if (project.options) { Object.assign(options, project.options); saveOptions(); }
    for (const s of project.sounds || []) {
      if (library.items.some(i => i.name === s.name)) continue;
      const data = await (await fetch(s.data)).arrayBuffer();
      await library.add(s.name, s.type, data);
    }
    scriptEl.value = project.script || '';
    renderLibrary();
    syncOptionControls();
    loadVoices();
    onScriptChanged();
  }

  scriptEl.addEventListener('input', onScriptChanged);
  $('fc-sound-insert').addEventListener('click', () => insertAtCursor('\n\n*** sunet\n\n'));
  $('fc-pause-insert').addEventListener('click', () => insertAtCursor('\n\n[pauză 3]\n\n'));
  $('fc-example').addEventListener('click', () => {
    if (scriptEl.value.trim() && scriptEl.value !== DEFAULT_SCRIPT && !confirm('Înlocuiești textul curent cu exemplul?')) return;
    scriptEl.value = DEFAULT_SCRIPT;
    onScriptChanged();
  });
  $('fc-save-txt').addEventListener('click', () => downloadBlob(new Blob([scriptEl.value], { type: 'text/plain;charset=utf-8' }), `playbook-${stamp()}.txt`));
  $('fc-save-project').addEventListener('click', saveProject);
  $('fc-open').addEventListener('click', () => $('fc-file').click());
  $('fc-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result);
      try {
        if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) {
          await openProject(text);
          setStatus('PROIECT DESCHIS');
        } else {
          scriptEl.value = text;
          onScriptChanged();
          setStatus('TEXT ÎNCĂRCAT');
        }
      } catch (err) {
        setStatus('FIȘIER INVALID');
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  // Dictation into the editor
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
    $('fc-dictate').classList.toggle('!text-primary', value);
    $('fc-dictate').classList.toggle('!border-primary/60', value);
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
      if (DICTATION_ERRORS[event.error]) { setStatus(DICTATION_ERRORS[event.error]); setDictating(false); }
    };
    // Chrome ends the session after silence; keep going while the user still dictates
    dictation.onend = () => { if (dictating) { try { dictation.start(); } catch (e) { setDictating(false); } } };
  } else {
    $('fc-dictate').disabled = true;
    $('fc-dictate').title = 'Dictarea vocală funcționează în Chrome sau Edge';
  }
  $('fc-dictate').addEventListener('click', () => {
    if (!dictation) return;
    if (dictating) { setDictating(false); dictation.stop(); return; }
    setDictating(true);
    setStatus('DICTARE ACTIVĂ – VORBEȘTE');
    try { dictation.start(); } catch (e) { /* already running */ }
  });

  // =========================================================================
  // === SOUND LIBRARY UI ===
  // =========================================================================
  function renderLibrary() {
    const list = $('fc-sound-list');
    list.innerHTML = '';
    if (!library.items.length) {
      list.innerHTML = '<p class="font-body-sm text-body-sm text-outline leading-snug">Niciun sunet încă. Adaugă mp3 / wav și folosește-l în text cu <code class="text-primary">*** sunet nume</code>.</p>';
    }
    library.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 px-2 py-1 rounded-lg bg-surface-container';
      row.innerHTML = `
        <span class="material-symbols-outlined text-[18px] text-secondary">music_note</span>
        <span class="font-label-md text-label-md text-on-surface truncate flex-1" title="Folosește în text: *** sunet ${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <button class="w-8 h-8 rounded hover:bg-surface-container-high text-primary flex items-center justify-center" data-act="play" title="Ascultă"><span class="material-symbols-outlined text-[18px]">play_arrow</span></button>
        <button class="w-8 h-8 rounded hover:bg-surface-container-high text-error flex items-center justify-center" data-act="del" title="Șterge"><span class="material-symbols-outlined text-[18px]">delete</span></button>`;
      row.querySelector('[data-act="play"]').addEventListener('click', async () => {
        FC.unlockAudio();
        const buf = await library.buffer(item);
        if (buf) audio.playBuffer(buf);
        else setStatus('FIȘIER AUDIO NESUPORTAT');
      });
      row.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (!confirm(`Ștergi sunetul „${item.name}”?`)) return;
        await library.remove(item.id);
        renderLibrary();
        renderSteps();
      });
      list.appendChild(row);
    });

    const select = $('fc-music-select');
    select.innerHTML = '<option value="">— alege muzica —</option>' +
      library.items.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
    select.value = library.items.some(s => s.name === options.musicName) ? options.musicName : '';
  }

  $('fc-sound-add').addEventListener('click', () => $('fc-sound-file').click());
  $('fc-sound-file').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const file of files) {
      await library.add(file.name, file.type, await file.arrayBuffer());
    }
    renderLibrary();
    renderSteps();
    setStatus(files.length ? `${files.length} SUNET(E) ADĂUGATE` : 'GATA');
  });

  // =========================================================================
  // === CONTROLS ===
  // =========================================================================
  $('fc-play').addEventListener('click', togglePlay);
  $('fc-prev').addEventListener('click', () => jumpTo(current - 1));
  $('fc-next').addEventListener('click', () => jumpTo(current + 1));
  $('fc-stop').addEventListener('click', () => { if (FC.video.isRecording()) FC.video.stop(); stop(); });
  $('fc-record').addEventListener('click', record);

  const bindOption = (id, key, parse, after) => $(id).addEventListener('input', e => {
    options[key] = parse(e.target);
    saveOptions();
    syncOptionControls();
    if (after) after();
  });
  bindOption('fc-hold', 'speed', t => parseFloat(t.value), () => { renderSteps(); if (playing) applyFlipSpeed(true); });
  bindOption('fc-center', 'center', t => t.checked, () => {
    if (current >= 0 && steps[current].type === 'page') board.showLines(boardRows(steps[current].lines));
  });
  bindOption('fc-loop', 'loop', t => t.checked);
  bindOption('fc-voice-on', 'voiceOn', t => t.checked);
  bindOption('fc-voice-rate', 'voiceRate', t => parseFloat(t.value));
  bindOption('fc-voice-select', 'voiceName', t => t.value);
  bindOption('fc-music-on', 'musicOn', t => t.checked, () => { if (!options.musicOn) audio.stopMusic(); else if (playing) startMusic(); });
  bindOption('fc-music-select', 'musicName', t => t.value, () => { if (playing && options.musicOn) startMusic(); });
  bindOption('fc-music-volume', 'musicVolume', t => parseFloat(t.value), () => audio.setMusicVolume(options.musicVolume));
  bindOption('fc-rec-title', 'recTitle', t => t.checked);
  document.querySelectorAll('#fc-rec-res .fc-seg').forEach(b => b.addEventListener('click', () => {
    options.recHeight = Number(b.dataset.res);
    saveOptions();
    syncOptionControls();
  }));

  $('fc-voice-test').addEventListener('click', () => {
    if (!synth) { setStatus('VOCE INDISPONIBILĂ ÎN ACEST BROWSER'); return; }
    synth.cancel();
    speak('Doamnelor și domnilor, bine ați venit la bord.');
  });

  // Re-paginate when the grid size changes
  FC.settings.onGridChange(() => {
    onScriptChanged();
    if (current >= 0 && steps[current] && steps[current].type === 'page') board.showLines(boardRows(steps[current].lines));
  });

  FC.playbook = {
    isActive: () => playing || current >= 0,
    command(act) {
      if (act === 'play') togglePlay();
      else if (act === 'next') jumpTo(current + 1);
      else if (act === 'prev') jumpTo(current - 1);
    },
    parse: parseScript,
    get steps() { return steps; },
    play, stop, jumpTo
  };

  // =========================================================================
  // === INIT ===
  // =========================================================================
  let saved = null;
  try { saved = localStorage.getItem(SCRIPT_KEY); } catch (e) { /* storage unavailable */ }
  scriptEl.value = saved !== null ? saved : DEFAULT_SCRIPT;
  syncOptionControls();
  onScriptChanged();
  if (synth) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
  } else {
    $('fc-voice-on').disabled = true;
    $('fc-voice-note').textContent = 'Browserul nu are sinteză vocală.';
  }
  library.init().then(() => { renderLibrary(); renderSteps(); });
})();
