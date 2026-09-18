// FlapCast app shell: settings & themes, board controls, dictation, navigation,
// big-screen mode and the separate projector window.
(() => {
  const FC = window.FC;
  const { board, audio } = FC;
  const $ = id => document.getElementById(id);
  const isDisplay = location.hash === '#display';
  FC.isDisplay = isDisplay;

  // =========================================================================
  // === SETTINGS (persisted, mirrored to the projector window) ===
  // =========================================================================
  const SETTINGS_KEY = 'flapcast.settings.v2';
  const DEFAULTS = {
    title: '',
    footer: '',
    theme: 'solari',
    grid: '14x4',
    diacritics: false,
    speed: 45,
    volume: 0.85,
    muted: false,
    profile: 'solari',
    brand: 'GRAND MUSIC EVENTS',
    brandOn: true,
    v: 3
  };
  const DEFAULT_TITLE = 'CENTRAL DEPARTURES & VOICE DISPATCH';
  const DEFAULT_FOOTER = 'PATENTED SOLARI CASSETTE 1968-MOD';

  let settings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (saved.v !== 3) delete saved.diacritics; // v3: diacritics became opt-in (they shrink all letters)
    Object.assign(settings, saved, { v: 3 });
  } catch (e) { /* ignore */ }
  const settingsListeners = new Set();

  function saveSettings() {
    if (isDisplay) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }

  function applySettings(prev = {}) {
    document.documentElement.dataset.theme = settings.theme;
    $('boardTitle').textContent = settings.title || DEFAULT_TITLE;
    $('boardFooter').textContent = settings.footer || DEFAULT_FOOTER;
    $('brandText').textContent = settings.brand;
    $('brandMark').classList.toggle('is-hidden', !settings.brandOn || !settings.brand.trim());
    FC.setDiacritics(settings.diacritics);

    const [cols, rows] = settings.grid.split('x').map(Number);
    if (cols !== board.cols || rows !== board.rows || !board.tiles.length) board.build(cols, rows);
    $('sidebarGrid').textContent = `${cols} × ${rows}`;

    board.flipIntervalMs = settings.speed;
    audio.setVolume(settings.volume);
    audio.setProfile(settings.profile);
    if (isDisplay) audio.setMuted(true); // the control window plays all sound
    else audio.setMuted(settings.muted);

    syncControls();
    fitPresent();
    if (prev.grid && prev.grid !== settings.grid) settingsListeners.forEach(fn => fn('grid'));
  }

  FC.settings = {
    get: () => ({ ...settings }),
    set(patch) {
      const prev = { ...settings };
      Object.assign(settings, patch);
      saveSettings();
      applySettings(prev);
      projector.send({ type: 'settings', settings });
      if (prev.grid !== settings.grid) projector.sendBoard();
    },
    onGridChange(fn) { settingsListeners.add(fn); }
  };

  // =========================================================================
  // === CONTROLS SYNC ===
  // =========================================================================
  function syncControls() {
    if (isDisplay) return;
    if (document.activeElement !== $('setTitle')) $('setTitle').value = settings.title;
    if (document.activeElement !== $('setFooter')) $('setFooter').value = settings.footer;
    if (document.activeElement !== $('setBrand')) $('setBrand').value = settings.brand;
    $('setBrandOn').checked = settings.brandOn;
    $('setGrid').value = settings.grid;
    $('setDiacritics').checked = settings.diacritics;
    document.querySelectorAll('.fc-theme-btn').forEach(b => b.classList.toggle('is-active', b.dataset.theme === settings.theme));
    document.querySelectorAll('.sound-mode-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === settings.profile));

    const vol = Math.round(settings.volume * 100);
    $('masterVolumeSlider').value = vol;
    $('volumePercentDisplay').textContent = `${vol}%`;

    $('speedSlider').value = settings.speed;
    let descriptor = 'REALISTĂ';
    if (settings.speed < 30) descriptor = 'TURBO';
    else if (settings.speed > 70) descriptor = 'METODICĂ';
    $('speedValueLabel').textContent = `${descriptor} (${settings.speed}MS)`;

    const muted = settings.muted;
    const icon = muted ? 'volume_off' : 'volume_up';
    $('topSoundIcon').textContent = icon;
    $('audioConsoleMuteIcon').textContent = icon;
    $('topSoundToggleBtn').classList.toggle('text-primary', !muted);
    $('topSoundToggleBtn').classList.toggle('text-outline', muted);
    $('audioStatusLed').className = muted
      ? 'w-3 h-3 rounded-full bg-outline-variant'
      : 'w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_#ffc174]';
    $('sidebarSoundStatus').textContent = muted ? 'OPRIT' : 'ACTIV';
    $('sidebarSoundStatus').className = `font-label-sm text-label-sm ${muted ? 'text-outline' : 'text-primary'}`;
  }

  // Centered rows helper (shared with the playbook)
  FC.centerLines = lines => {
    const top = Math.max(0, Math.floor((board.rows - lines.length) / 2));
    return Array(top).fill('').concat(lines.map(l => ' '.repeat(Math.max(0, Math.floor((board.cols - l.length) / 2))) + l));
  };

  // Free text, word-wrapped and centered on the board
  FC.showText = text => {
    const lines = [];
    FC.sanitize(text).split(/[\n•]/).forEach(seg => lines.push(...FC.wrapWords(seg, board.cols)));
    board.showLines(FC.centerLines(lines.slice(0, board.rows)));
  };

  // =========================================================================
  // === BOARD STATUS & VU METER ===
  // =========================================================================
  board.on('flip', count => {
    if (count % 8 === 0) $('flipCountBadge').textContent = `CYCLE: ${count} FLAPS`;
  });
  board.on('busy', busy => {
    const label = $('matrixStateLabel');
    label.textContent = busy ? 'DISPATCH ROTATING...' : 'STATIONARY IDLE';
    label.className = busy
      ? 'font-label-sm text-label-sm tracking-wider text-primary animate-pulse shrink-0'
      : 'font-label-sm text-label-sm tracking-wider text-primary/70 shrink-0';
  });

  const vuBars = [1, 2, 3, 4, 5].map(i => $('vuBar' + i));
  let vuTimeout = null;
  FC.onClackVisual = () => {
    vuBars.forEach(bar => { bar.style.height = `${Math.floor(Math.random() * 16 + 4)}px`; });
    clearTimeout(vuTimeout);
    vuTimeout = setTimeout(() => vuBars.forEach((bar, i) => { bar.style.height = `${[3, 6, 10, 8, 4][i]}px`; }), 70);
  };

  // =========================================================================
  // === BIG-SCREEN (PRESENTATION) MODE ===
  // =========================================================================
  const chassis = document.querySelector('.fc-chassis');
  const matrix = $('splitFlapMatrix');
  let presentUsesFullscreen = false;
  let cursorTimer = null;

  // Size the board so the whole grid fits the screen at the tile aspect ratio
  function fitPresent() {
    if (!document.body.classList.contains('fc-present')) { chassis.style.width = ''; return; }
    chassis.style.width = '96vw';
    const chromeH = chassis.offsetHeight - matrix.offsetHeight;
    const chromeW = chassis.offsetWidth - matrix.offsetWidth;
    const rowGap = parseFloat(getComputedStyle(matrix).rowGap) || 0;
    const colGap = parseFloat(getComputedStyle(matrix.firstElementChild || matrix).columnGap) || 0;
    const availH = window.innerHeight * 0.95 - chromeH;
    const tileH = (availH - rowGap * (board.rows - 1)) / board.rows;
    const tileW = tileH / 1.35;
    const width = tileW * board.cols + colGap * (board.cols - 1) + chromeW;
    chassis.style.width = `${Math.min(window.innerWidth * 0.96, width)}px`;
  }
  window.addEventListener('resize', fitPresent);

  FC.present = {
    isOn: () => document.body.classList.contains('fc-present'),
    enter(requestFullscreen = true) {
      document.body.classList.add('fc-present');
      fitPresent();
      if (requestFullscreen && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen()
          .then(() => { presentUsesFullscreen = true; setTimeout(fitPresent, 100); })
          .catch(() => {});
      }
    },
    exit() {
      if (isDisplay) return;
      document.body.classList.remove('fc-present', 'fc-cursor');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      presentUsesFullscreen = false;
      fitPresent();
    },
    toggle() { this.isOn() ? this.exit() : this.enter(true); }
  };

  document.addEventListener('fullscreenchange', () => {
    setTimeout(fitPresent, 100);
    if (!document.fullscreenElement && presentUsesFullscreen && !(FC.video && FC.video.isRecording())) FC.present.exit();
  });

  document.addEventListener('mousemove', () => {
    if (!FC.present.isOn()) return;
    document.body.classList.add('fc-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.remove('fc-cursor'), 2500);
  });

  $('fc-present-bar').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'exit') FC.present.exit();
    else if (act && FC.playbook) FC.playbook.command(act);
  });

  // =========================================================================
  // === KEYBOARD (also forwarded from the projector window) ===
  // =========================================================================
  function handleKey(key) {
    if (key === 'Escape') {
      if (FC.video && FC.video.isRecording()) FC.video.stop();
      else FC.present.exit();
      return true;
    }
    if (key === 'f' || key === 'F') { FC.present.toggle(); return true; }
    const pb = FC.playbook;
    if (!pb || !(pb.isActive() || FC.present.isOn())) return false;
    if (key === ' ') { pb.command('play'); return true; }
    if (key === 'ArrowRight' || key === 'PageDown') { pb.command('next'); return true; }
    if (key === 'ArrowLeft' || key === 'PageUp') { pb.command('prev'); return true; }
    return false;
  }

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'select' || e.target.isContentEditable) return;
    if (isDisplay) {
      if (['Escape', 'f', 'F'].includes(e.key)) return; // local fullscreen handling
      projector.sendToControl({ type: 'key', key: e.key });
      if ([' ', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp'].includes(e.key)) e.preventDefault();
      return;
    }
    if (handleKey(e.key)) e.preventDefault();
  });

  // =========================================================================
  // === PROJECTOR WINDOW (second screen) ===
  // =========================================================================
  const projector = {
    win: null,
    lastPing: 0,
    connected: false,

    open() {
      if (this.win && !this.win.closed) { this.win.focus(); return; }
      const url = location.href.split('#')[0] + '#display';
      this.win = window.open(url, 'flapcast-projector', 'popup=yes,width=1280,height=720');
      if (!this.win) alert('Browserul a blocat fereastra. Permite ferestrele pop-up pentru această pagină.');
    },

    send(msg) {
      if (isDisplay || !this.win || this.win.closed) return;
      try { this.win.postMessage({ flapcast: true, ...msg }, '*'); } catch (e) { /* window gone */ }
    },

    sendToControl(msg) {
      if (!window.opener) return;
      try { window.opener.postMessage({ flapcast: true, ...msg }, '*'); } catch (e) { /* opener gone */ }
    },

    sendBoard() {
      this.send({ type: 'render', padded: board.currentLines().join(''), instant: true });
    },

    setConnected(connected) {
      if (this.connected === connected) return;
      this.connected = connected;
      $('projectorLed').className = `w-2 h-2 rounded-full ${connected ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`;
      $('projectorLabel').textContent = connected ? 'Proiector: conectat' : 'Proiector: nu';
      $('projectorStatus').classList.toggle('text-secondary', connected);
      $('sidebarProjector').textContent = connected ? 'CONECTAT' : 'NECONECTAT';
      $('sidebarProjector').className = `font-label-sm text-label-sm ${connected ? 'text-secondary' : 'text-outline'}`;
    }
  };
  FC.projector = projector;

  window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg || !msg.flapcast) return;
    if (isDisplay) {
      if (e.source !== window.opener) return;
      if (msg.type === 'settings') {
        const prev = { ...settings };
        settings = { ...DEFAULTS, ...msg.settings };
        applySettings(prev);
      } else if (msg.type === 'render') {
        if (msg.instant) {
          const lines = [];
          for (let r = 0; r < board.rows; r++) lines.push(msg.padded.slice(r * board.cols, (r + 1) * board.cols));
          board.setInstant(lines);
        } else {
          board.renderPadded(msg.padded);
        }
      }
      return;
    }
    // Re-adopt an already open projector window (e.g. after this page was reloaded)
    if ((!projector.win || projector.win.closed) && (msg.type === 'hello' || msg.type === 'ping')) {
      projector.win = e.source;
      if (msg.type === 'ping') { projector.send({ type: 'settings', settings }); projector.sendBoard(); }
    }
    if (e.source !== projector.win) return;
    if (msg.type === 'hello') {
      projector.send({ type: 'settings', settings });
      projector.sendBoard();
    }
    if (msg.type === 'hello' || msg.type === 'ping') {
      projector.lastPing = Date.now();
      projector.setConnected(true);
    }
    if (msg.type === 'bye') projector.setConnected(false);
    if (msg.type === 'key') handleKey(msg.key);
  });

  if (!isDisplay) {
    board.on('render', padded => projector.send({ type: 'render', padded }));
    setInterval(() => {
      if (projector.connected && (Date.now() - projector.lastPing > 4000 || !projector.win || projector.win.closed)) {
        projector.setConnected(false);
      }
    }, 1000);
    $('projectorBtn').addEventListener('click', () => projector.open());
  }

  // =========================================================================
  // === NAVIGATION (sidebar + bottom bar) with scroll spy ===
  // =========================================================================
  const mainScroll = $('mainScroll');
  const sections = [...document.querySelectorAll('.fc-section')];
  let navLockUntil = 0;

  function setActiveNav(id) {
    document.querySelectorAll('.fc-nav').forEach(b => b.classList.toggle('is-active', b.dataset.nav === id));
  }

  function updateActiveFromScroll() {
    if (Date.now() < navLockUntil) return;
    let active = sections[0];
    sections.forEach(s => { if (s.getBoundingClientRect().top < 180) active = s; });
    setActiveNav(active.id);
  }

  document.querySelectorAll('.fc-nav').forEach(btn => btn.addEventListener('click', () => {
    const target = $(btn.dataset.nav);
    if (!target) return;
    navLockUntil = Date.now() + 900;
    setActiveNav(btn.dataset.nav);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
  mainScroll.addEventListener('scroll', updateActiveFromScroll, { passive: true });

  // =========================================================================
  // === LOOK & SOUND CONTROLS ===
  // =========================================================================
  let textTimer = null;
  const setLater = patch => { clearTimeout(textTimer); textTimer = setTimeout(() => FC.settings.set(patch), 250); };
  $('setTitle').addEventListener('input', e => setLater({ title: e.target.value }));
  $('setFooter').addEventListener('input', e => setLater({ footer: e.target.value }));
  $('setBrand').addEventListener('input', e => setLater({ brand: e.target.value }));
  $('setBrandOn').addEventListener('change', e => FC.settings.set({ brandOn: e.target.checked }));
  $('setGrid').addEventListener('change', e => FC.settings.set({ grid: e.target.value }));
  $('setDiacritics').addEventListener('change', e => FC.settings.set({ diacritics: e.target.checked }));
  document.querySelectorAll('.fc-theme-btn').forEach(b => b.addEventListener('click', () => FC.settings.set({ theme: b.dataset.theme })));

  const toggleMute = () => {
    FC.settings.set({ muted: !settings.muted });
    if (!settings.muted) audio.playClack(true);
  };
  $('topSoundToggleBtn').addEventListener('click', toggleMute);
  $('audioConsoleMuteBtn').addEventListener('click', toggleMute);

  $('masterVolumeSlider').addEventListener('input', e => {
    const volume = parseInt(e.target.value, 10) / 100;
    FC.settings.set(volume > 0 && settings.muted ? { volume, muted: false } : { volume });
  });
  $('speedSlider').addEventListener('input', e => FC.settings.set({ speed: parseInt(e.target.value, 10) }));

  document.querySelectorAll('.sound-mode-btn').forEach(btn => btn.addEventListener('click', () => {
    FC.settings.set({ profile: btn.dataset.mode });
    audio.playClack(true);
  }));

  $('testSoundBtn').addEventListener('click', () => {
    audio.playClack(false);
    setTimeout(() => audio.playClack(false), 38);
    setTimeout(() => audio.playClack(true), 80);
  });

  $('clearBoardBtn').addEventListener('click', () => board.clear());
  $('presentBtn').addEventListener('click', () => FC.present.enter(true));

  // =========================================================================
  // === MANUAL MESSAGES & PRESETS ===
  // =========================================================================
  const manualInput = $('manualInput');
  const liveTranscriptDisplay = $('liveTranscriptDisplay');
  const speechConfidence = $('speechConfidence');

  function submitManual() {
    const val = manualInput.value.trim();
    if (!val) return;
    FC.showText(val);
    liveTranscriptDisplay.textContent = `"${val}"`;
    speechConfidence.textContent = 'MESAJ AFIȘAT';
  }
  $('dispatchManualBtn').addEventListener('click', submitManual);
  manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitManual(); });

  document.querySelectorAll('.preset-chip').forEach(chip => chip.addEventListener('click', () => {
    const preset = chip.dataset.text;
    manualInput.value = preset.replace(/•/g, ' ');
    FC.showText(preset);
    liveTranscriptDisplay.textContent = `"${chip.textContent.trim()}"`;
    speechConfidence.textContent = 'MESAJ RAPID AFIȘAT';
  }));

  // =========================================================================
  // === VOICE DICTATION STRAIGHT TO THE BOARD ===
  // =========================================================================
  const micIndicatorPip = $('micIndicatorPip');
  const micActivePulse = $('micActivePulse');
  const micIcon = $('micIcon');
  const micPrimaryText = $('micPrimaryText');
  const micSubText = $('micSubText');
  const micPulsarRing = $('micPulsarRing');
  const SPEECH_ERRORS = {
    'not-allowed': 'MICROFON BLOCAT – PERMITE ACCESUL',
    'service-not-allowed': 'RECUNOAȘTERE VOCALĂ INDISPONIBILĂ',
    'network': 'NECESITĂ CONEXIUNE LA INTERNET',
    'no-speech': 'NU S-A AUZIT NIMIC – ÎNCEARCĂ IAR',
    'audio-capture': 'NICIUN MICROFON DETECTAT',
    'aborted': 'DICTARE OPRITĂ'
  };
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let simInterval = null;
  let simIndex = 0;

  function setMicActive(active, primary, sub) {
    micIndicatorPip.className = active
      ? 'w-3 h-3 rounded-full bg-primary shadow-[0_0_12px_#f59e0b]'
      : 'w-3 h-3 rounded-full bg-outline-variant shadow-inner';
    micActivePulse.classList.toggle('hidden', !active);
    micIcon.textContent = active ? 'settings_voice' : 'mic';
    micPrimaryText.textContent = primary;
    micSubText.textContent = sub;
    micPulsarRing.classList.toggle('bg-primary/20', active);
    micPulsarRing.classList.toggle('animate-pulse', active);
    micPulsarRing.classList.toggle('bg-primary/0', !active);
  }

  function stopDictation() {
    isListening = false;
    clearInterval(simInterval);
    setMicActive(false, 'Apasă & vorbește', 'Română / English');
  }

  if (SpeechRecognition && !isDisplay) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'ro-RO';
    recognition.onstart = () => {
      isListening = true;
      setMicActive(true, 'Ascult acum...', 'Vorbește răspicat');
      speechConfidence.textContent = 'CAPTARE AUDIO ACTIVĂ';
      speechConfidence.className = 'font-label-sm text-label-sm text-primary uppercase text-right';
    };
    recognition.onresult = event => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      const shown = final || interim;
      if (!shown) return;
      liveTranscriptDisplay.textContent = `"${shown}"`;
      if (final) {
        speechConfidence.textContent = 'CONFIRMAT & AFIȘAT';
        speechConfidence.className = 'font-label-sm text-label-sm text-secondary uppercase text-right';
        FC.showText(final);
      }
    };
    recognition.onerror = event => {
      stopDictation();
      speechConfidence.textContent = SPEECH_ERRORS[event.error] || `EROARE: ${event.error.toUpperCase()}`;
      speechConfidence.className = 'font-label-sm text-label-sm text-error uppercase text-right';
    };
    recognition.onend = () => stopDictation();
  }

  const SIMULATIONS = [
    'Zborul RO301 către Frankfurt se îmbarcă la poarta 4',
    'Bine ați venit la aeroportul internațional București',
    'Ultimul apel pentru cursa Tarom 204 Timișoara'
  ];

  function simulateVoiceInput() {
    isListening = true;
    setMicActive(true, 'Simulare voce...', 'Browserul nu are dictare');
    speechConfidence.textContent = 'SIMULARE SPEECH-TO-TEXT';
    const chosen = SIMULATIONS[simIndex++ % SIMULATIONS.length];
    const words = chosen.split(' ');
    let step = 0;
    clearInterval(simInterval);
    simInterval = setInterval(() => {
      step++;
      liveTranscriptDisplay.textContent = `"${words.slice(0, step).join(' ')}"`;
      if (step >= words.length) {
        clearInterval(simInterval);
        speechConfidence.textContent = 'TRANSMIS PE TABELĂ';
        FC.showText(chosen);
        setTimeout(stopDictation, 600);
      }
    }, 280);
  }

  $('voiceDictateBtn').addEventListener('click', () => {
    if (isListening) {
      if (recognition) recognition.stop();
      stopDictation();
      return;
    }
    if (recognition) {
      try { recognition.start(); } catch (err) { recognition.stop(); }
    } else {
      simulateVoiceInput();
    }
  });

  // =========================================================================
  // === INIT ===
  // =========================================================================
  board.mount(matrix);
  applySettings();

  if (isDisplay) {
    document.documentElement.classList.add('fc-display');
    document.title = 'FlapCast – Proiector';
    FC.present.enter(false);
    const overlay = $('displayOverlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.addEventListener('click', () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      document.documentElement.requestFullscreen?.().catch(() => {});
    });
    document.addEventListener('dblclick', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    projector.sendToControl({ type: 'hello' });
    setInterval(() => projector.sendToControl({ type: 'ping' }), 1500);
    window.addEventListener('beforeunload', () => projector.sendToControl({ type: 'bye' }));
    if (!window.opener) {
      overlay.querySelector('span:nth-child(3)').textContent = 'Deschide această fereastră din butonul „Proiector” al aplicației.';
    }
  } else {
    setActiveNav('sec-board');
    setTimeout(() => FC.showText('FLAPCAST 01\nPLECĂRI LIVE\nRO642 12:40\nREADY TO SPEAK'), 400);
  }
})();
