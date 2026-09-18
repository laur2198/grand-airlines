// FlapCast board engine: split-flap tile grid + Solari WebAudio synthesizer.
// Exposes window.FC.board, window.FC.audio and the text helpers.
(() => {
  const FC = (window.FC = window.FC || {});

  // Drum order on each cassette (Romanian letters sit next to their base letter)
  const CHARACTERS = " AĂÂBCDEFGHIÎJKLMNOPQRSȘTȚUVWXYZ0123456789•-:!?,./&'\"";
  const ALLOWED = new Set(CHARACTERS);
  const TOP_MARK = new Set(['Ă', 'Â', 'Î']);
  const BOTTOM_MARK = new Set(['Ș', 'Ț']);
  // Glyph size in tile widths. With diacritics every glyph is a bit smaller so the
  // accents fit inside the tile and all letters keep the same size.
  const GLYPH_EM_PLAIN = 1.78;
  const GLYPH_EM_DIACRITICS = 1.3;
  // Accented glyphs shift slightly (in % of the glyph box) to keep accent/comma inside the tile
  const markShift = ch => (TOP_MARK.has(ch) ? 6 : BOTTOM_MARK.has(ch) ? -6 : 0);

  const GLYPH_TOP_Y = 46;
  const GLYPH_BOTTOM_Y = -54;
  const GLYPH_TOP_TRANSFORM = `translateY(${GLYPH_TOP_Y}%)`;
  const GLYPH_BOTTOM_TRANSFORM = `translateY(${GLYPH_BOTTOM_Y}%)`;
  const GLYPH_SCALE_X = 0.8;

  let useDiacritics = false;

  // =========================================================================
  // === TEXT HELPERS ===
  // =========================================================================
  function stripMarks(ch) {
    return ch.normalize('NFD').replace(/\p{M}/gu, '');
  }

  // Maps any text onto characters that exist on the drums (unknown -> space).
  function sanitize(text) {
    const upper = String(text)
      .normalize('NFC')
      .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț')
      .replace(/[“”„«»″]/g, '"').replace(/[‘’‚′`]/g, "'").replace(/[–—]/g, '-').replace(/;/g, ',')
      .toUpperCase();
    let out = '';
    for (const ch of upper) {
      if (ch === '\n') { out += ch; continue; }
      if (ALLOWED.has(ch) && (useDiacritics || stripMarks(ch) === ch)) { out += ch; continue; }
      const base = stripMarks(ch);
      out += base.length === 1 && ALLOWED.has(base) ? base : ' ';
    }
    return out;
  }

  // Greedy word wrap to `cols`; words longer than a row are hard-split.
  function wrapWords(text, cols) {
    const lines = [];
    let line = '';
    String(text).split(/\s+/).filter(Boolean).forEach(word => {
      while (word.length > cols) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cols));
        word = word.slice(cols);
      }
      if (!word) return;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= cols) line += ' ' + word;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    return lines;
  }

  // =========================================================================
  // === SOLARI SPLIT-FLAP WEB AUDIO SYNTHESIZER ===
  // =========================================================================
  // Graph: sources -> masterGain (volume/mute) -> speakerGain -> speakers
  //                                           \-> recordDest (video recording)
  let userHasInteracted = false;

  class SolariAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.speakerGain = null;
      this.volume = 0.85;
      this.isMuted = false;
      this.speakersEnabled = true;
      this.soundProfile = 'solari';
      this.noiseBuffer = null;
      this.lastPlayTime = 0;
      this.listeners = new Set();
    }

    onChange(fn) { this.listeners.add(fn); }
    emit() { this.listeners.forEach(fn => fn(this)); }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        this.speakerGain = this.ctx.createGain();
        this.speakerGain.gain.value = this.speakersEnabled ? 1 : 0;
        this.masterGain.connect(this.speakerGain);
        this.speakerGain.connect(this.ctx.destination);

        // Pink-tinted noise cache for the phenolic flap snap
        const sampleRate = this.ctx.sampleRate;
        const bufferSize = Math.floor(sampleRate * 0.08);
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = lastOut * 0.6 + white * 0.4;
          lastOut = data[i];
        }
        this.emit();
      } catch (err) {
        console.warn('AudioContext init error:', err);
      }
    }

    // Browsers only allow audio after the first click/tap/key on the page
    unlock() {
      if (!userHasInteracted) return;
      this.init();
    }

    get ready() { return !!(this.ctx && this.ctx.state !== 'closed'); }

    setVolume(pct) {
      this.volume = Math.max(0, Math.min(1, pct));
      if (this.masterGain) this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.emit();
    }

    setMuted(mute) {
      this.isMuted = mute;
      if (this.masterGain) this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.emit();
    }

    // Silences local speakers but keeps feeding the recorder (used when a projector window plays the sound)
    setSpeakersEnabled(enabled) {
      this.speakersEnabled = enabled;
      if (this.speakerGain) this.speakerGain.gain.setValueAtTime(enabled ? 1 : 0, this.ctx.currentTime);
    }

    setProfile(profile) {
      this.soundProfile = profile;
      this.emit();
    }

    createRecordStream() {
      this.unlock();
      if (!this.ctx) return null;
      const dest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(dest);
      return {
        stream: dest.stream,
        release: () => { try { this.masterGain.disconnect(dest); } catch (e) { /* already gone */ } }
      };
    }

    playClack(isTargetLanding = false) {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx || !this.noiseBuffer) return;

      const now = this.ctx.currentTime;
      if (now - this.lastPlayTime < 0.008) return; // avoid clipping bursts
      this.lastPlayTime = now;
      FC.onClackVisual && FC.onClackVisual();

      let centerPitch = 90;
      let noiseBandFreq = 3100;
      let snapDecay = 0.012;
      let resonanceGainVal = 0.15;
      const pitchDropSpeed = 0.015;
      if (this.soundProfile === 'studio') {
        centerPitch = 120; noiseBandFreq = 3800; snapDecay = 0.009; resonanceGainVal = 0.12;
      } else if (this.soundProfile === 'soft') {
        centerPitch = 70; noiseBandFreq = 2200; snapDecay = 0.018; resonanceGainVal = 0.08;
      }

      // Humanizing variance (+/- 7% pitch, +/- 6% level)
      const pitchVariance = 1 + (Math.random() * 0.14 - 0.07);
      const volVariance = 1 + (Math.random() * 0.12 - 0.06);

      // 1. Low percussive body: flap striking the stop bar
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = this.soundProfile === 'soft' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(centerPitch * pitchVariance * (isTargetLanding ? 0.9 : 1.05), now);
      osc.frequency.exponentialRampToValueAtTime(42, now + pitchDropSpeed);
      oscGain.gain.setValueAtTime((isTargetLanding ? 0.45 : 0.28) * volVariance, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + snapDecay);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + snapDecay + 0.005);

      // 2. Plastic snap: band-passed noise
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(noiseBandFreq * pitchVariance, now);
      noiseFilter.Q.setValueAtTime(isTargetLanding ? 2.5 : 3.4, now);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime((isTargetLanding ? 0.52 : 0.38) * volVariance, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + (isTargetLanding ? 0.016 : 0.011));
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noiseSource.start(now);
      noiseSource.stop(now + 0.025);

      // 3. Cassette housing resonance
      const resFilter = this.ctx.createBiquadFilter();
      resFilter.type = 'peaking';
      resFilter.frequency.setValueAtTime(1450 * pitchVariance, now);
      resFilter.Q.setValueAtTime(5.0, now);
      resFilter.gain.setValueAtTime(6.0, now);
      const resGain = this.ctx.createGain();
      resGain.gain.setValueAtTime(resonanceGainVal * volVariance, now);
      resGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);
      noiseFilter.connect(resFilter);
      resFilter.connect(resGain);
      resGain.connect(this.masterGain);
    }

    // Airport "ding-dong-ding" announcement chime. Returns its duration in ms.
    playChime() {
      this.unlock();
      if (!this.ctx) return 2800;
      const t0 = this.ctx.currentTime + 0.05;
      [523.25, 659.25, 783.99].forEach((freq, k) => {
        const t = t0 + k * 0.45;
        [[1, 1], [2, 0.3], [3.01, 0.1], [4.2, 0.04]].forEach(([mult, gain]) => {
          const osc = this.ctx.createOscillator();
          const env = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq * mult;
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(0.4 * gain, t + 0.012);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 1.9 / Math.sqrt(mult));
          osc.connect(env);
          env.connect(this.masterGain);
          osc.start(t);
          osc.stop(t + 2);
        });
      });
      return 2800;
    }

    async decode(arrayBuffer) {
      this.unlock();
      if (!this.ctx) throw new Error('audio locked');
      return this.ctx.decodeAudioData(arrayBuffer.slice(0));
    }

    // One-shot sample (custom announcement sounds). Returns duration in ms.
    playBuffer(buffer, gain = 1) {
      this.unlock();
      if (!this.ctx || !buffer) return 0;
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.buffer = buffer;
      src.connect(g);
      g.connect(this.masterGain);
      src.start();
      return buffer.duration * 1000;
    }

    // Looping background music with fade + ducking
    startMusic(buffer, volume = 0.35) {
      this.unlock();
      if (!this.ctx || !buffer) return;
      this.stopMusic(0.1);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      src.buffer = buffer;
      src.loop = true;
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), this.ctx.currentTime + 1.5);
      src.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.music = { src, gain: g, volume, ducked: false };
    }

    setMusicVolume(volume) {
      if (!this.music) return;
      this.music.volume = volume;
      const target = Math.max(0.0001, this.music.ducked ? volume * 0.3 : volume);
      this.music.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
    }

    duckMusic(ducked) {
      if (!this.music || this.music.ducked === ducked) return;
      this.music.ducked = ducked;
      this.setMusicVolume(this.music.volume);
    }

    stopMusic(fadeSeconds = 1.5) {
      if (!this.music || !this.ctx) return;
      const { src, gain } = this.music;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
      try { src.stop(now + fadeSeconds + 0.05); } catch (e) { /* already stopped */ }
      this.music = null;
    }
  }

  const audio = new SolariAudioEngine();

  const unlockEvents = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'];
  const globalUnlock = () => {
    userHasInteracted = true;
    audio.unlock();
    unlockEvents.forEach(evt => document.removeEventListener(evt, globalUnlock, true));
  };
  unlockEvents.forEach(evt => document.addEventListener(evt, globalUnlock, { capture: true, passive: true }));

  // =========================================================================
  // === SPLIT-FLAP BOARD ===
  // =========================================================================
  const board = {
    rows: 4,
    cols: 14,
    flipIntervalMs: 45,
    tiles: [],
    flipCount: 0,
    container: null,
    listeners: { render: new Set(), flip: new Set(), busy: new Set() },
    busy: false,

    on(event, fn) { this.listeners[event].add(fn); },
    emit(event, arg) { this.listeners[event].forEach(fn => fn(arg)); },

    mount(container) {
      this.container = container;
      this.build(this.cols, this.rows);
    },

    // (Re)builds the tile grid; keeps whatever text fits the new size.
    build(cols, rows) {
      const previous = this.currentLines();
      this.cols = cols;
      this.rows = rows;
      this.tiles = [];
      const c = this.container;
      c.innerHTML = '';
      c.style.setProperty('--fc-cols', cols);
      c.style.setProperty('--fc-rows', rows);
      for (let r = 0; r < rows; r++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'fc-row grid w-full';
        rowEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        for (let col = 0; col < cols; col++) {
          const index = r * cols + col;
          const tile = this.createTile(index);
          rowEl.appendChild(tile.el);
          this.tiles.push(tile);
        }
        c.appendChild(rowEl);
      }
      if (previous.some(l => l.trim())) {
        this.setInstant(previous.map(l => l.slice(0, cols)));
      }
    },

    createTile(index) {
      const el = document.createElement('div');
      el.className = 'fc-tile relative flex flex-col select-none overflow-hidden cursor-pointer';
      el.dataset.index = index;

      const topHalf = document.createElement('div');
      topHalf.className = 'fc-top relative w-full h-1/2 overflow-hidden flex items-end justify-center';
      const topChar = document.createElement('span');
      topChar.className = 'fc-glyph';
      topChar.style.transform = `${GLYPH_TOP_TRANSFORM} scaleX(${GLYPH_SCALE_X})`;
      topChar.textContent = ' ';
      topHalf.appendChild(topChar);

      const bottomHalf = document.createElement('div');
      bottomHalf.className = 'fc-bottom relative w-full h-1/2 overflow-hidden flex items-start justify-center';
      const bottomChar = document.createElement('span');
      bottomChar.className = 'fc-glyph';
      bottomChar.style.transform = `${GLYPH_BOTTOM_TRANSFORM} scaleX(${GLYPH_SCALE_X})`;
      bottomChar.textContent = ' ';
      bottomHalf.appendChild(bottomChar);

      const seam = document.createElement('div');
      seam.className = 'fc-seam absolute top-1/2 left-0 w-full z-20 pointer-events-none flex justify-between items-center';
      seam.innerHTML = '<div class="fc-notch"></div><div class="fc-notch"></div>';

      el.append(topHalf, bottomHalf, seam);

      const tile = {
        el, topHalf, bottomHalf, topChar, bottomChar,
        current: ' ', target: ' ', isFlipping: false,
        prev: ' ', flipAt: 0, flipDur: 0
      };
      el.addEventListener('click', () => {
        audio.unlock();
        this.flipOnce(tile, getNextChar(tile.current), true);
      });
      return tile;
    },

    setGlyph(tile, char) {
      tile.current = char;
      tile.topChar.textContent = char;
      tile.bottomChar.textContent = char;
      const shift = markShift(char);
      tile.topChar.style.transform = `translateY(${GLYPH_TOP_Y + shift}%) scaleX(${GLYPH_SCALE_X})`;
      tile.bottomChar.style.transform = `translateY(${GLYPH_BOTTOM_Y + shift}%) scaleX(${GLYPH_SCALE_X})`;
    },

    flipOnce(tile, nextChar, isFinal) {
      const half = Math.max(12, this.flipIntervalMs * 0.5);
      tile.topHalf.style.transition = `transform ${Math.max(12, this.flipIntervalMs * 0.45)}ms ease-in`;
      tile.topHalf.style.transform = 'perspective(300px) rotateX(-20deg)';
      tile.prev = tile.current;
      tile.next = nextChar;
      tile.flipAt = performance.now();
      tile.flipDur = Math.max(30, this.flipIntervalMs * 0.9);
      audio.playClack(isFinal);
      this.flipCount++;
      this.emit('flip', this.flipCount);
      setTimeout(() => {
        this.setGlyph(tile, nextChar);
        tile.topHalf.style.transform = 'none';
      }, half);
    },

    flipToTarget(tile, targetChar) {
      tile.target = ALLOWED.has(targetChar) ? targetChar : ' ';
      if (tile.current === tile.target || tile.isFlipping) return;
      tile.isFlipping = true;
      this.setBusy(true);
      const step = () => {
        if (tile.current === tile.target) {
          tile.isFlipping = false;
          if (!this.tiles.some(t => t.isFlipping)) this.setBusy(false);
          return;
        }
        const next = getNextChar(tile.current);
        this.flipOnce(tile, next, next === tile.target);
        setTimeout(step, this.flipIntervalMs);
      };
      step();
    },

    setBusy(busy) {
      if (this.busy === busy) return;
      this.busy = busy;
      this.emit('busy', busy);
    },

    // padded: exactly rows*cols characters
    renderPadded(padded) {
      audio.unlock();
      const tiles = this.tiles;
      const cols = this.cols;
      this.emit('render', padded);
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const targetChar = padded[i] || ' ';
        const delay = (i % cols) * 16 + Math.floor(i / cols) * 28; // relay cascade
        setTimeout(() => {
          if (tiles !== this.tiles) return; // grid was rebuilt meanwhile
          this.flipToTarget(tile, targetChar);
        }, delay);
      }
    },

    padLines(lines) {
      return lines.slice(0, this.rows)
        .map(l => sanitize(l).replace(/\n/g, ' ').slice(0, this.cols).padEnd(this.cols, ' '))
        .join('')
        .padEnd(this.rows * this.cols, ' ');
    },

    // Rows exactly as given (leading spaces kept for centering)
    showLines(lines) {
      this.renderPadded(this.padLines(lines));
    },

    // Free text: word-wrapped; "•" or a newline forces a new row
    broadcast(text) {
      const lines = [];
      sanitize(text).split(/[\n•]/).forEach(segment => lines.push(...wrapWords(segment, this.cols)));
      this.showLines(lines);
    },

    // Jump straight to text without flipping (used after a resize)
    setInstant(lines) {
      const padded = this.padLines(lines);
      this.tiles.forEach((tile, i) => {
        tile.target = padded[i];
        this.setGlyph(tile, padded[i]);
      });
    },

    clear() { this.showLines([]); },

    isIdle() { return !this.tiles.some(t => t.isFlipping); },

    currentLines() {
      const lines = [];
      for (let r = 0; r < this.rows; r++) {
        lines.push(this.tiles.slice(r * this.cols, (r + 1) * this.cols).map(t => t.current).join(''));
      }
      return this.tiles.length ? lines : [];
    }
  };

  function getNextChar(currentChar) {
    const idx = CHARACTERS.indexOf(currentChar);
    return idx === -1 || idx === CHARACTERS.length - 1 ? CHARACTERS[0] : CHARACTERS[idx + 1];
  }

  Object.assign(FC, {
    CHARACTERS,
    TOP_MARK,
    BOTTOM_MARK,
    markShift,
    glyphEm: () => (useDiacritics ? GLYPH_EM_DIACRITICS : GLYPH_EM_PLAIN),
    GLYPH_SCALE_X,
    sanitize,
    wrapWords,
    audio,
    board,
    setDiacritics(enabled) {
      useDiacritics = enabled;
      document.documentElement.style.setProperty('--fc-glyph-size', `${(enabled ? GLYPH_EM_DIACRITICS : GLYPH_EM_PLAIN) * 100}cqw`);
    },
    unlockAudio() { userHasInteracted = true; audio.unlock(); }
  });
})();
