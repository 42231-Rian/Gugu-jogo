/* ==========================================================================
   LEFT 4 MIAMI 2 // RETRO BLOODLINE - GAME ENGINE  (v2)

   ÍNDICE
   1.  Áudio (synthwave procedural + SFX)
   2.  Utilitários (RNG com seed)
   3.  Banco de dados: munição, armas, granadas, sobreviventes, ícones
   4.  Gerador procedural de mapas (MapGen) + navegação (Nav)
   5.  Geometrias/materiais compartilhados e modelos 3D (armas, itens)
   6.  Estado do jogo (Game) e UI
   7.  Carregamento de fase, mapa e zona central fixa
   8.  Player (slots, munição, animações de golpe/arremesso)
   9.  Zombie (comum, Hunter, Esmagador, Tank, etc.)
   10. Director AI
   11. Combate: projéteis, efeitos, granadas, explosões
   12. Itens no chão, loot e interação
   13. Combo, HUD, radar, vitória
   14. Loop principal e entrada
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. WEB AUDIO SYNTHESIZER ENGINE
   ========================================================================== */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.initialized = false;

    this.isPlayingMusic = false;
    this.bpm = 126;
    this.step = 0;
    this.nextNoteTime = 0;
    this.isHorde = false;
    this.isTank = false;
    this.scale = [146.83, 164.81, 174.61, 196.00, 220.00, 261.63, 293.66, 329.63];
    this.bassPattern = [0, 0, 0, 0, 3, 3, 3, 3, 4, 4, 4, 4, 2, 2, 1, 1];
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.master);

      this.initialized = true;
      this.startMusic();
    } catch (e) {
      console.warn("Web Audio:", e);
    }
  }

  startMusic() {
    if (!this.initialized || this.isPlayingMusic) return;
    this.isPlayingMusic = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.scheduleLoop();
  }

  scheduleLoop() {
    if (!this.isPlayingMusic) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextNoteTime);
      const tempo = this.isTank ? 150 : (this.isHorde ? 142 : 124);
      this.nextNoteTime += (60.0 / tempo) / 4.0;
      this.step = (this.step + 1) % 16;
    }
    setTimeout(() => this.scheduleLoop(), 40);
  }

  /* ---- helpers de síntese ---- */
  _osc(type, f0, f1, rampT, vol, gainT, dest, time, linear = false) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, time);
    if (f1 !== f0) {
      if (linear) o.frequency.linearRampToValueAtTime(f1, time + rampT);
      else o.frequency.exponentialRampToValueAtTime(f1, time + rampT);
    }
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + gainT);
    o.connect(g);
    g.connect(dest);
    o.start(time);
    o.stop(time + gainT + 0.02);
  }

  _noise(dur, vol, hp, time, dest) {
    const size = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    if (hp > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      src.connect(f);
      f.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(dest);
    src.start(time);
    src.stop(time + dur + 0.01);
  }

  _s(fn) { if (this.initialized) fn(this.ctx.currentTime); }

  /* ---- música ---- */
  playStep(step, time) {
    if (!this.ctx) return;
    if (step % 4 === 0) this.synthKick(time);
    if (step % 8 === 4) this.synthSnare(time);
    this.synthHiHat(time, step % 2 === 0 ? 0.08 : 0.04);

    const rootIndex = this.bassPattern[step % this.bassPattern.length];
    const freq = (this.isTank ? 55.0 : 73.42) * Math.pow(1.059463, rootIndex * 2);
    this.synthBass(time, freq, (60.0 / this.bpm) / 4.0 * 0.8);

    if (this.isHorde || this.isTank || step % 4 === 2) {
      const leadNote = this.scale[(step * 3) % this.scale.length] * (this.isTank ? 1.5 : 2.0);
      this._osc('sawtooth', leadNote, leadNote, 0, 0.2, 0.12, this.musicGain, time);
    }
  }

  synthKick(t) { this._osc('sine', 140, 32, 0.08, 0.9, 0.14, this.musicGain, t); }
  synthSnare(t) { this._noise(0.12, 0.7, 800, t, this.musicGain); }
  synthHiHat(t, vol = 0.05) { this._osc('square', 8000, 8000, 0, vol, 0.04, this.musicGain, t); }

  synthBass(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = this.isTank ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.isHorde ? 1400 : 700, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + dur);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur);
  }

  /* ---- efeitos ---- */
  playPistol()  { this._s(t => this._osc('triangle', 450, 60, 0.08, 0.8, 0.09, this.sfxGain, t)); }
  playRifle()   { this._s(t => this._osc('sawtooth', 600, 80, 0.11, 0.7, 0.12, this.sfxGain, t)); }
  playShotgun() {
    this._s(t => {
      this._osc('sawtooth', 180, 25, 0.22, 1.0, 0.25, this.sfxGain, t);
      this._noise(0.2, 0.9, 0, t, this.sfxGain);
    });
  }
  playPanClang() {
    this._s(t => {
      this._osc('sine', 880, 880, 0, 1.0, 0.5, this.sfxGain, t);
      this._osc('triangle', 1420, 1420, 0, 1.0, 0.5, this.sfxGain, t);
    });
  }
  playExplosion() {
    this._s(t => {
      this._osc('sine', 90, 20, 0.6, 1.2, 0.7, this.sfxGain, t);
      this._noise(0.5, 0.6, 0, t, this.sfxGain);
    });
  }
  playZombieHit()    { this._s(t => this._osc('triangle', 180, 40, 0.09, 0.5, 0.1, this.sfxGain, t)); }
  playPipeBombBeep() { this._s(t => this._osc('sine', 1800, 1800, 0, 0.4, 0.05, this.sfxGain, t)); }
  playBileSplash()   { this._s(t => this._osc('sawtooth', 240, 90, 0.25, 0.8, 0.3, this.sfxGain, t, true)); }
  playShove()        { this._s(t => this._osc('triangle', 120, 40, 0.12, 0.7, 0.14, this.sfxGain, t)); }
  playPunch()        { this._s(t => this._osc('triangle', 160, 30, 0.1, 0.8, 0.12, this.sfxGain, t)); }
  playDryClick()     { this._s(t => this._osc('square', 1400, 1400, 0, 0.25, 0.03, this.sfxGain, t)); }
  playPickup()       { this._s(t => this._osc('sine', 440, 880, 0.09, 0.4, 0.11, this.sfxGain, t)); }
  playSwoosh()       { this._s(t => this._noise(0.16, 0.28, 1400, t, this.sfxGain)); }
  playHiss()         { this._s(t => this._noise(0.45, 0.22, 2500, t, this.sfxGain)); }
  playImpact()       { this._s(t => this._osc('triangle', 320, 90, 0.05, 0.25, 0.06, this.sfxGain, t)); }
  playHit() {
    this._s(t => {
      this._osc('triangle', 140, 35, 0.1, 0.9, 0.14, this.sfxGain, t);
      this._noise(0.08, 0.4, 600, t, this.sfxGain);
    });
  }

  playSpecialAlert(type) {
    this._s(t => {
      if (type === 'tank') this._osc('sawtooth', 60, 120, 0.4, 0.9, 0.8, this.sfxGain, t, true);
      else if (type === 'witch') this._osc('sawtooth', 800, 1200, 0.5, 0.7, 0.6, this.sfxGain, t, true);
      else this._osc('sawtooth', 300, 150, 0.3, 0.6, 0.35, this.sfxGain, t);
    });
  }
}

const audio = new AudioManager();

/* ==========================================================================
   2. UTILITÁRIOS - RNG COM SEED (mesma seed => mesmo mapa)
   ========================================================================== */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

class SeededRNG {
  constructor(seed) {
    this.a = xmur3(String(seed))();
  }
  next() {
    this.a = (this.a + 0x6D2B79F5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
}

/* ==========================================================================
   3. BANCO DE DADOS
   ========================================================================== */

/* ---- MUNIÇÃO: cada tipo tem sua reserva, máximo e quantidade por caixa ----
   Para criar um novo tipo: adicione aqui e use o id em `ammo:` de uma arma. */
const AMMO = {
  '9mm':  { name: '9MM',     max: 120, give: 30, color: 0xd9b23a },
  '44':   { name: '.44 MAG', max: 36,  give: 12, color: 0xe6e6fa },
  'smg':  { name: 'SMG 9MM', max: 200, give: 60, color: 0xff9f43 },
  '12ga': { name: '12 GA',   max: 48,  give: 16, color: 0xff3b3b },
  '556':  { name: '5.56',    max: 210, give: 60, color: 0x4aa3ff },
  '762':  { name: '7.62',    max: 150, give: 45, color: 0xc77d2e },
  '308':  { name: '.308',    max: 30,  give: 10, color: 0x9be564 }
};

/* ---- ARMAS ----
   slot: 1 = arma longa | 2 = pistola | 3 = corpo a corpo
   kind: gun | shotgun | melee
   speed: velocidade do projétil (u/s) | range: alcance máximo | muzzle: distância do cano
   Para adicionar uma arma nova: crie a entrada aqui e um `model` em buildWeaponModel(). */
const WEAPONS = {
  /* SLOT 1 - ARMAS LONGAS */
  m16:     { name: "FUZIL M16",     slot: 1, kind: "gun", model: "rifle",   icon: "rifle",   ammo: "556",  dmg: 38,  rate: 0.10, clip: 30, reload: 1.8, spread: 0.05, speed: 78,  range: 46, muzzle: 2.0, tlen: 2.2, color: 0x2c3e50, tracer: 0xffe27a, sound: "rifle" },
  ak47:    { name: "AK-47",         slot: 1, kind: "gun", model: "ak",      icon: "ak",      ammo: "762",  dmg: 52,  rate: 0.13, clip: 30, reload: 1.9, spread: 0.08, speed: 72,  range: 44, muzzle: 2.0, tlen: 2.4, color: 0x2a2a2a, tracer: 0xffb347, sound: "rifle" },
  pump:    { name: "ESCOPETA",      slot: 1, kind: "shotgun", model: "shotgun", icon: "shotgun", ammo: "12ga", dmg: 22, pellets: 8,  rate: 0.75, clip: 8,  reload: 2.0, spread: 0.16, speed: 56,  range: 24, muzzle: 2.1, tlen: 1.1, color: 0x555555, tracer: 0xffd27a, sound: "shotgun" },
  spas:    { name: "SPAS-12 AUTO",  slot: 1, kind: "shotgun", model: "shotgun", icon: "shotgun", ammo: "12ga", dmg: 20, pellets: 10, rate: 0.28, clip: 10, reload: 2.2, spread: 0.15, speed: 58,  range: 24, muzzle: 2.1, tlen: 1.1, color: 0xff007f, tracer: 0xff7ab8, sound: "shotgun" },
  uzi:     { name: "SMG UZI",       slot: 1, kind: "gun", model: "smg",     icon: "smg",     ammo: "smg",  dmg: 25,  rate: 0.08, clip: 40, reload: 1.5, spread: 0.09, speed: 70,  range: 34, muzzle: 1.5, tlen: 1.8, color: 0x444455, tracer: 0xffe27a, sound: "pistol" },
  hunting: { name: "RIFLE DE CAÇA", slot: 1, kind: "gun", model: "sniper",  icon: "sniper",  ammo: "308",  dmg: 105, rate: 0.38, clip: 10, reload: 2.2, spread: 0.01, speed: 110, range: 70, muzzle: 2.4, tlen: 3.4, color: 0x566573, tracer: 0x9be564, sound: "rifle" },

  /* SLOT 2 - PISTOLAS */
  p220:    { name: "PISTOLA P220",  slot: 2, kind: "gun", model: "pistol",  icon: "pistol",  ammo: "9mm",  dmg: 32,  rate: 0.22, clip: 15, reload: 1.2, spread: 0.04, speed: 64,  range: 36, muzzle: 1.4, tlen: 1.6, color: 0xbfc5c9, tracer: 0xfff0a0, sound: "pistol" },
  glock:   { name: "GLOCK",         slot: 2, kind: "gun", model: "pistol",  icon: "pistol",  ammo: "9mm",  dmg: 26,  rate: 0.14, clip: 17, reload: 1.1, spread: 0.06, speed: 64,  range: 34, muzzle: 1.4, tlen: 1.6, color: 0x333333, tracer: 0xfff0a0, sound: "pistol" },
  magnum:  { name: "MAGNUM .44",    slot: 2, kind: "gun", model: "magnum",  icon: "magnum",  ammo: "44",   dmg: 95,  rate: 0.42, clip: 6,  reload: 2.0, spread: 0.02, speed: 88,  range: 44, muzzle: 1.6, tlen: 2.4, color: 0xe6e6fa, tracer: 0xe6d8ff, sound: "shotgun" },

  /* SLOT 3 - CORPO A CORPO */
  fireaxe: { name: "MACHADO",       slot: 3, kind: "melee", model: "axe", icon: "axe", dmg: 125, specialDmg: 140, instakill: true,  rate: 0.60, range: 3.1, knock: 22, color: 0xc0392b, sound: "melee" },
  bat:     { name: "PORRETE",       slot: 3, kind: "melee", model: "bat", icon: "bat", dmg: 90,  specialDmg: 90,  instakill: false, rate: 0.44, range: 2.9, knock: 28, color: 0xd9a15b, sound: "melee" }
};

/* ---- GRANADAS ----
   Para criar a granada "F" (ou outra) basta editar/adicionar uma entrada aqui.
   fuse: segundos após POUSAR até onEnd | lure: atrai zumbis comuns enquanto ativa
   onLand / onTick / onEnd são os ganchos de comportamento. */
const GRENADES = {
  G: {
    id: 'G', name: 'GRANADA G', desc: 'ATRAI COMUNS + EXPLODE', max: 4, speed: 17,
    body: 0x55632b, band: 0xff2a2a, hud: '#ff4d6d',
    fuse: 5.0, lure: true, lureRadius: 55,
    onTick(g, dt) {
      g.beep = (g.beep || 0) + dt;
      const rate = (g.def.fuse - g.t) < 1.3 ? 0.12 : 0.45;
      if (g.beep > rate) { g.beep = 0; g.blink = !g.blink; audio.playPipeBombBeep(); }
    },
    onEnd(g) { Game.spawnExplosion(g.x, g.z, 320, { killCommons: true, radius: 7, big: true }); }
  },
  T: {
    id: 'T', name: 'GRANADA T', desc: 'FUMAÇA VERDE (20s) ATRAI COMUNS', max: 3, speed: 17,
    body: 0x2e7d32, band: 0x39ff14, hud: '#39ff14',
    fuse: 20, lure: true, lureRadius: 55,
    onLand(g) { audio.playHiss(); },
    onTick(g, dt) { Game.emitSmoke(g, dt); },
    onEnd(g) { audio.playHiss(); }
  },
  F: {
    id: 'F', name: 'GRANADA F', desc: 'COQUETEL INCENDIÁRIO', max: 3, speed: 17,
    body: 0xc0561a, band: 0xffe600, hud: '#ffae00',
    fuse: 0.25, lure: false,
    onEnd(g) { audio.playBileSplash(); Game.spawnFirePool(g.x, g.z); }
  }
};
const GRENADE_ORDER = ['G', 'T', 'F'];

const SURVIVORS = {
  coach:    { name: "COACH",    maxHp: 125, speed: 7.2, passive: "+25 HP & DANO CORPO A CORPO", shirtColor: 0x2471a3, skinColor: 0x5d4037, hairColor: 0x111111, pantsColor: 0x1a252f, hat: "cap" },
  ellis:    { name: "ELLIS",    maxHp: 100, speed: 8.5, passive: "+18% VELOCIDADE & RECARGA RÁPIDA", shirtColor: 0xf1c40f, skinColor: 0xffd1b3, hairColor: 0x8b5a2b, pantsColor: 0x2874a6, hat: "cap" },
  nick:     { name: "NICK",     maxHp: 100, speed: 7.6, passive: "+20% CADÊNCIA & PONTUAÇÃO EXTRA", shirtColor: 0xecf0f1, skinColor: 0xf5cba7, hairColor: 0x1c2833, pantsColor: 0xd5dbdb, hat: "none" },
  rochelle: { name: "ROCHELLE", maxHp: 100, speed: 7.8, passive: "+50% ADRENALINA & IMUNIDADE JOCKEY", shirtColor: 0xe91e63, skinColor: 0x8d5b4c, hairColor: 0x17202a, pantsColor: 0x212f3d, hat: "none" }
};

const COSMETICS = {
  hats: [
    { id: "none", name: "Sem Chapéu", cost: 0 },
    { id: "cap", name: "Boné Retro", cost: 500 },
    { id: "helmet", name: "Capacete Tático", cost: 1200 },
    { id: "cowboy", name: "Chapéu de Cowboy", cost: 2000 },
    { id: "mask_rooster", name: "Máscara de Galo (Richard)", cost: 3500 },
    { id: "mask_horse", name: "Máscara de Cavalo (Don)", cost: 4000 },
    { id: "mask_tiger", name: "Máscara de Tigre (Tony)", cost: 5000 }
  ],
  skins: [
    { id: "default", name: "Padrão", cost: 0, tint: 0xffffff },
    { id: "gold", name: "Ouro Puro", cost: 2500, tint: 0xffd700 },
    { id: "neon", name: "Cyber Neon", cost: 3000, tint: 0x00f3ff },
    { id: "bloodbath", name: "Banho de Sangue", cost: 4500, tint: 0xff0044 }
  ]
};

/* ---- ÍCONES (SVG) usados na barra de slots ---- */
const svgIcon = (inner) => `<svg viewBox="0 0 64 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const ICONS = {
  pistol:  svgIcon('<rect x="10" y="7" width="38" height="8" rx="1"/><path d="M16 15h11l-3 14h-9z"/><rect x="44" y="9" width="8" height="3"/>'),
  magnum:  svgIcon('<rect x="4" y="8" width="54" height="6" rx="1"/><rect x="12" y="5" width="11" height="12" rx="3"/><path d="M10 15h10l-3 14H8z"/>'),
  rifle:   svgIcon('<rect x="1" y="12" width="14" height="8"/><rect x="15" y="11" width="25" height="8"/><rect x="40" y="13" width="23" height="3"/><rect x="24" y="19" width="6" height="11"/><rect x="17" y="7" width="12" height="4"/>'),
  ak:      svgIcon('<path d="M1 11h13l3 10H1z"/><rect x="14" y="11" width="22" height="8"/><rect x="36" y="12" width="26" height="4"/><path d="M24 19h7l5 11h-7z"/><rect x="36" y="9" width="14" height="3"/>'),
  shotgun: svgIcon('<path d="M1 12h14l2 8H1z"/><rect x="15" y="11" width="48" height="4"/><rect x="24" y="16" width="26" height="4"/><rect x="26" y="15" width="12" height="7"/>'),
  smg:     svgIcon('<rect x="8" y="9" width="36" height="10"/><rect x="44" y="12" width="16" height="3"/><rect x="20" y="19" width="6" height="12"/><rect x="1" y="12" width="7" height="3"/>'),
  sniper:  svgIcon('<path d="M1 12h16l2 9H1z"/><rect x="17" y="13" width="46" height="3"/><rect x="26" y="7" width="18" height="5" rx="2"/><rect x="24" y="16" width="6" height="8"/>'),
  axe:     svgIcon('<rect x="6" y="15" width="48" height="4" transform="rotate(-28 32 17)"/><path d="M42 2l15 5-5 12-11-8z"/>'),
  bat:     svgIcon('<path d="M3 27L50 7l5 7L9 31z"/>'),
  gren_G:  svgIcon('<circle cx="32" cy="19" r="10"/><rect x="28" y="4" width="8" height="7"/><rect x="34" y="3" width="15" height="3" rx="1"/>'),
  gren_T:  svgIcon('<rect x="23" y="9" width="18" height="21" rx="3"/><rect x="27" y="4" width="10" height="5"/><circle cx="46" cy="6" r="4"/><circle cx="52" cy="11" r="3"/>'),
  gren_F:  svgIcon('<path d="M27 30V15l3-5V4h4v6l3 5v15z"/><path d="M32 0c4 3 4 5 0 8-4-3-4-5 0-8z"/>'),
  med:     svgIcon('<rect x="10" y="7" width="44" height="23" rx="3"/><rect x="24" y="3" width="16" height="5" rx="2"/><rect x="29" y="11" width="6" height="15" fill="#1a0f2a"/><rect x="24" y="15.5" width="16" height="6" fill="#1a0f2a"/>')
};
/* ==========================================================================
   4. GERADOR PROCEDURAL DE MAPAS (MapGen) + NAVEGAÇÃO (Nav)

   Código 100% independente do Three.js (só dados) => testável fora do navegador.

   GARANTIAS DE JOGABILIDADE (jogabilidade > aleatoriedade):
   - A zona central (CENTER_HALF) NUNCA recebe estruturas e ganha um anel livre extra.
   - Cada estrutura candidata só é aceita se, DEPOIS de colocada, TODAS as células
     livres do mapa continuam conectadas ao centro (teste de flood-fill / BFS).
     => nunca existe bolsão fechado, sala sem saída, centro isolado ou região inacessível.
   - Estruturas respeitam um espaçamento mínimo (GAP) entre si => corredores largos
     o bastante até para o Tank.
   - Nada é colocado fora dos limites, em cima de outra coisa ou dentro de paredes.
   - Itens só nascem em células livres e alcançáveis.
   - Ao final, validate() reconfere tudo do zero; se falhar, regenera com outra "sub-seed"
     determinística (e em último caso usa um mapa vazio seguro).
   ========================================================================== */
const MapGen = {
  CELL: 2,            // tamanho da célula da grade de navegação
  AGENT_R: 0.8,       // raio do "agente" usado para inflar obstáculos
  CENTER_HALF: 14,    // meia-largura da zona central fixa
  CENTER_RING: 4,     // anel livre ao redor da zona central
  GAP: 4,             // espaço mínimo entre estruturas
  EDGE: 6,            // margem das bordas do mapa

  generate(seed, cfg) {
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const s = attempt === 0 ? seed : `${seed}~${attempt}`;
      const map = this._build(s, cfg, false);
      const v = this.validate(map);
      if (v.ok) { map.attempt = attempt; return map; }
      lastErr = v.errors;
      console.warn(`[MAPGEN] seed "${s}" inválida (${v.errors.slice(0, 2).join(' | ')}) → regenerando`);
    }
    console.warn('[MAPGEN] usando mapa vazio seguro', lastErr);
    const m = this._build(seed, cfg, true);
    m.attempt = -1;
    return m;
  },

  /* ----------------------------------------------------------------------
     Construção
     ---------------------------------------------------------------------- */
  _build(seed, cfg, empty) {
    const rng = new SeededRNG(seed);
    const C = this.CELL;
    const dim = v => Math.max(72, Math.round((v * cfg.scale + rng.range(-4, 8)) / 4) * 4);
    const w = dim(cfg.base.w), h = dim(cfg.base.h);
    const hw = w / 2, hh = h / 2, cols = w / C, rows = h / C;

    const map = {
      seed, w, h, hw, hh, cols, rows, cell: C,
      solids: [],
      items: { weapons: [], ammo: [], grenades: [], meds: [], witch: null },
      spawnCells: [], walk: null, blocked: null, attempt: 0
    };

    const blocked = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const cx = -hw + (i + 0.5) * C, cz = -hh + (j + 0.5) * C;
        if (Math.abs(cx) > hw - 1.6 || Math.abs(cz) > hh - 1.6) blocked[j * cols + i] = 1;
      }
    }

    const ctx = { rng, map, blocked, placed: [], cars: 0 };

    if (!empty) {
      const s = (w * h) / 12100;
      const n = k => Math.max(0, Math.round((cfg.gen[k] || 0) * s));
      for (let k = 0; k < n('building'); k++) this._placeBuilding(ctx);
      for (let k = 0; k < n('lshape'); k++)   this._placeL(ctx);
      for (let k = 0; k < n('long'); k++)     this._placeLong(ctx);
      for (let k = 0; k < n('barriers'); k++) this._placeBarrier(ctx);
      for (let k = 0; k < n('carRows'); k++)  this._placeCarRow(ctx);
      for (let k = 0; k < n('cars'); k++)     this._placeCar(ctx);
      for (let k = 0; k < n('blocks'); k++)   this._placeBlock(ctx);
      this._placeExplosives(ctx, n('explosives'));
    }

    map.blocked = ctx.blocked;
    map.walk = new Uint8Array(cols * rows);
    for (let i = 0; i < map.walk.length; i++) map.walk[i] = ctx.blocked[i] ? 0 : 1;

    this._placeItems(ctx);

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (!ctx.blocked[j * cols + i]) {
          const cx = -hw + (i + 0.5) * C, cz = -hh + (j + 0.5) * C;
          if (Math.hypot(cx, cz) >= 24) map.spawnCells.push({ x: cx, z: cz });
        }
      }
    }
    return map;
  },

  _R(x0, z0, x1, z1, type, extra) {
    return Object.assign({ type, x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 }, extra || {});
  },

  _snap(v, map, axis) {
    const o = axis === 'x' ? map.hw : map.hh;
    return Math.round((v + o) / this.CELL) * this.CELL - o;
  },

  /* Cabe dentro dos limites, fora da zona central e respeitando o espaçamento? */
  _fits(ctx, r, gap) {
    const { hw, hh } = ctx.map;
    const E = this.EDGE;
    if (r.x - r.hw < -hw + E || r.x + r.hw > hw - E || r.z - r.hd < -hh + E || r.z + r.hd > hh - E) return false;
    const Z = this.CENTER_HALF + this.CENTER_RING;
    if (Math.abs(r.x) - r.hw < Z && Math.abs(r.z) - r.hd < Z) return false;
    for (const s of ctx.placed) {
      if (Math.abs(r.x - s.x) < r.hw + s.hw + gap && Math.abs(r.z - s.z) < r.hd + s.hd + gap) return false;
    }
    return true;
  },

  _raster(grid, map, r) {
    const C = map.cell, R = this.AGENT_R;
    const i0 = Math.max(0, Math.floor((r.x - r.hw - R + map.hw) / C));
    const i1 = Math.min(map.cols - 1, Math.floor((r.x + r.hw + R + map.hw) / C));
    const j0 = Math.max(0, Math.floor((r.z - r.hd - R + map.hh) / C));
    const j1 = Math.min(map.rows - 1, Math.floor((r.z + r.hd + R + map.hh) / C));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = -map.hw + (i + 0.5) * C, cz = -map.hh + (j + 0.5) * C;
        if (Math.abs(cx - r.x) < r.hw + R && Math.abs(cz - r.z) < r.hd + R) grid[j * map.cols + i] = 1;
      }
    }
  },

  _flood(grid, cols, rows, start) {
    const vis = new Uint8Array(cols * rows), q = new Int32Array(cols * rows);
    let head = 0, tail = 0, count = 0;
    if (grid[start]) return { vis, count: 0 };
    vis[start] = 1; q[tail++] = start;
    while (head < tail) {
      const c = q[head++]; count++;
      const i = c % cols, j = (c / cols) | 0;
      if (i > 0 && !grid[c - 1] && !vis[c - 1]) { vis[c - 1] = 1; q[tail++] = c - 1; }
      if (i < cols - 1 && !grid[c + 1] && !vis[c + 1]) { vis[c + 1] = 1; q[tail++] = c + 1; }
      if (j > 0 && !grid[c - cols] && !vis[c - cols]) { vis[c - cols] = 1; q[tail++] = c - cols; }
      if (j < rows - 1 && !grid[c + cols] && !vis[c + cols]) { vis[c + cols] = 1; q[tail++] = c + cols; }
    }
    return { vis, count };
  },

  /* TODAS as células livres precisam estar ligadas ao centro. */
  _connected(grid, map) {
    let free = 0;
    for (let i = 0; i < grid.length; i++) if (!grid[i]) free++;
    const start = (map.rows / 2) * map.cols + map.cols / 2;
    return this._flood(grid, map.cols, map.rows, start).count === free;
  },

  /* Aplica um grupo de retângulos; só confirma se o mapa continua 100% conectado. */
  _tryCommit(ctx, rects) {
    const tmp = ctx.blocked.slice();
    for (const r of rects) this._raster(tmp, ctx.map, r);
    if (!this._connected(tmp, ctx.map)) return false;
    ctx.blocked = tmp;
    for (const r of rects) { ctx.placed.push(r); ctx.map.solids.push(r); }
    return true;
  },

  /* ---------------- estruturas ---------------- */
  _placeBuilding(ctx) {
    const { rng, map } = ctx, C = this.CELL, T = 2, dw = 6;
    for (let t = 0; t < 40; t++) {
      const W = rng.int(8, 12) * C, D = rng.int(7, 11) * C;
      if (W > map.w - 2 * this.EDGE - 4 || D > map.h - 2 * this.EDGE - 4) continue;
      const x0 = this._snap(rng.range(-map.hw + this.EDGE, map.hw - this.EDGE - W), map, 'x');
      const z0 = this._snap(rng.range(-map.hh + this.EDGE, map.hh - this.EDGE - D), map, 'z');
      const x1 = x0 + W, z1 = z0 + D;
      const door = rng.int(0, 3);
      const door2 = rng.chance(0.5) ? (door + 2) % 4 : -1;
      const has = k => door === k || door2 === k;
      const rects = [];
      const seg = (xa, za, xb, zb) => { if (xb - xa > 0.01 && zb - za > 0.01) rects.push(this._R(xa, za, xb, zb, 'wall')); };
      const hSide = (zA, zB, d) => {
        if (!d) return seg(x0, zA, x1, zB);
        const a = rng.int(1, (W - dw) / C - 1) * C;
        seg(x0, zA, x0 + a, zB); seg(x0 + a + dw, zA, x1, zB);
      };
      const vSide = (xA, xB, d) => {
        if (!d) return seg(xA, z0 + T, xB, z1 - T);
        const L = D - 2 * T, a = rng.int(1, (L - dw) / C - 1) * C;
        seg(xA, z0 + T, xB, z0 + T + a); seg(xA, z0 + T + a + dw, xB, z1 - T);
      };
      hSide(z0, z0 + T, has(0)); hSide(z1 - T, z1, has(1));
      vSide(x0, x0 + T, has(2)); vSide(x1 - T, x1, has(3));
      if (rects.every(r => this._fits(ctx, r, this.GAP)) && this._tryCommit(ctx, rects)) return true;
    }
    return false;
  },

  _placeL(ctx) {
    const { rng, map } = ctx, C = this.CELL;
    for (let t = 0; t < 40; t++) {
      const lenH = rng.int(5, 10) * C, lenV = rng.int(5, 10) * C;
      const x0 = this._snap(rng.range(-map.hw + this.EDGE, map.hw - this.EDGE - lenH), map, 'x');
      const z0 = this._snap(rng.range(-map.hh + this.EDGE, map.hh - this.EDGE - lenV), map, 'z');
      const right = rng.chance(0.5), flip = rng.chance(0.5);
      const vx = right ? x0 + lenH - 2 : x0;
      const rects = flip
        ? [this._R(x0, z0 + lenV - 2, x0 + lenH, z0 + lenV, 'wall'), this._R(vx, z0, vx + 2, z0 + lenV - 2, 'wall')]
        : [this._R(x0, z0, x0 + lenH, z0 + 2, 'wall'), this._R(vx, z0 + 2, vx + 2, z0 + lenV, 'wall')];
      if (rects.every(r => this._fits(ctx, r, this.GAP)) && this._tryCommit(ctx, rects)) return true;
    }
    return false;
  },

  _placeLong(ctx) {
    const { rng, map } = ctx, C = this.CELL;
    for (let t = 0; t < 40; t++) {
      const horiz = rng.chance(0.5), len = rng.int(5, 14) * C;
      const w = horiz ? len : 2, d = horiz ? 2 : len;
      const x0 = this._snap(rng.range(-map.hw + this.EDGE, map.hw - this.EDGE - w), map, 'x');
      const z0 = this._snap(rng.range(-map.hh + this.EDGE, map.hh - this.EDGE - d), map, 'z');
      const r = this._R(x0, z0, x0 + w, z0 + d, 'wall');
      if (this._fits(ctx, r, this.GAP) && this._tryCommit(ctx, [r])) return true;
    }
    return false;
  },

  _placeBlock(ctx) {
    const { rng, map } = ctx;
    for (let t = 0; t < 40; t++) {
      const [sw, sd] = rng.pick([[2, 2], [4, 4], [4, 2], [2, 4], [3, 3]]);
      const x0 = this._snap(rng.range(-map.hw + this.EDGE, map.hw - this.EDGE - sw), map, 'x');
      const z0 = this._snap(rng.range(-map.hh + this.EDGE, map.hh - this.EDGE - sd), map, 'z');
      const r = this._R(x0, z0, x0 + sw, z0 + sd, 'block', { variant: rng.int(0, 2) });
      if (this._fits(ctx, r, this.GAP) && this._tryCommit(ctx, [r])) return true;
    }
    return false;
  },

  _placeBarrier(ctx) {
    const { rng, map } = ctx;
    for (let t = 0; t < 40; t++) {
      const n = rng.int(3, 5), horiz = rng.chance(0.5), step = 10;
      const spanX = horiz ? (n - 1) * step + 4 : 2, spanZ = horiz ? 2 : (n - 1) * step + 4;
      const ox = this._snap(rng.range(-map.hw + this.EDGE, map.hw - this.EDGE - spanX), map, 'x');
      const oz = this._snap(rng.range(-map.hh + this.EDGE, map.hh - this.EDGE - spanZ), map, 'z');
      const rects = [];
      for (let k = 0; k < n; k++) {
        rects.push(horiz ? this._R(ox + k * step, oz, ox + k * step + 4, oz + 2, 'barrier')
                         : this._R(ox, oz + k * step, ox + 2, oz + k * step + 4, 'barrier'));
      }
      if (rects.every(r => this._fits(ctx, r, this.GAP)) && this._tryCommit(ctx, rects)) return true;
    }
    return false;
  },

  _car(x, z, rot, alarm, rng) {
    return { type: 'car', x, z, hw: rot ? 2.4 : 1.2, hd: rot ? 1.2 : 2.4, rot, hasAlarm: alarm, tint: rng.int(0, 4) };
  },

  _placeCar(ctx) {
    const { rng, map } = ctx;
    for (let t = 0; t < 40; t++) {
      const rot = rng.chance(0.5);
      const alarm = ctx.cars === 0 || rng.chance(0.3);
      const hw = rot ? 2.4 : 1.2, hd = rot ? 1.2 : 2.4;
      const x = Math.round(rng.range(-map.hw + this.EDGE + hw, map.hw - this.EDGE - hw));
      const z = Math.round(rng.range(-map.hh + this.EDGE + hd, map.hh - this.EDGE - hd));
      const r = this._car(x, z, rot, alarm, rng);
      if (this._fits(ctx, r, 3) && this._tryCommit(ctx, [r])) { ctx.cars++; return true; }
    }
    return false;
  },

  _placeCarRow(ctx) {
    const { rng, map } = ctx;
    for (let t = 0; t < 40; t++) {
      const n = rng.int(2, 4), rot = rng.chance(0.5), pitch = 3.6;
      const ox = Math.round(rng.range(-map.hw + this.EDGE + 4, map.hw - this.EDGE - 4 - (rot ? 0 : n * pitch)));
      const oz = Math.round(rng.range(-map.hh + this.EDGE + 4, map.hh - this.EDGE - 4 - (rot ? n * pitch : 0)));
      const rects = [];
      for (let k = 0; k < n; k++) {
        rects.push(this._car(rot ? ox : ox + k * pitch, rot ? oz + k * pitch : oz, rot, ctx.cars === 0 && k === 0, rng));
      }
      if (rects.every(r => this._fits(ctx, r, 3)) && this._tryCommit(ctx, rects)) { ctx.cars += n; return true; }
    }
    return false;
  },

  _placeExplosives(ctx, count) {
    const { rng, map } = ctx;
    const kinds = [['barrel', 0.7], ['gas_can', 0.3], ['propane', 0.5]];
    let placed = 0;
    for (let t = 0; t < count * 14 && placed < count; t++) {
      const cx = rng.range(-map.hw + this.EDGE + 3, map.hw - this.EDGE - 3);
      const cz = rng.range(-map.hh + this.EDGE + 3, map.hh - this.EDGE - 3);
      const n = rng.int(1, 3);
      for (let k = 0; k < n && placed < count; k++) {
        const [type, a] = rng.pick(kinds);
        const r = { type, x: cx + rng.range(-2.5, 2.5), z: cz + rng.range(-2.5, 2.5), hw: a, hd: a };
        if (this._fits(ctx, r, 1.6) && this._tryCommit(ctx, [r])) placed++;
      }
    }
  },

  /* Itens só em células livres, com folga 3x3, fora da zona central. */
  _placeItems(ctx) {
    const { rng, map, blocked } = ctx;
    const { cols, rows, cell: C } = map;
    const free = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && !blocked[j * cols + i];
    const spots = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let ok = true;
        for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1 && ok; di++) if (!free(i + di, j + dj)) ok = false;
        if (!ok) continue;
        const cx = -map.hw + (i + 0.5) * C, cz = -map.hh + (j + 0.5) * C;
        if (Math.abs(cx) > this.CENTER_HALF + 2 || Math.abs(cz) > this.CENTER_HALF + 2) spots.push({ x: cx, z: cz });
      }
    }
    rng.shuffle(spots);
    const taken = [];
    const take = (minSep) => {
      for (let k = 0; k < spots.length; k++) {
        const s = spots[k];
        if (taken.every(t => Math.hypot(t.x - s.x, t.z - s.z) >= minSep)) { taken.push(s); spots.splice(k, 1); return s; }
      }
      return null;
    };
    const sc = (map.w * map.h) / 12100;
    const nW = Math.max(4, Math.round(6 * sc)), nA = Math.max(4, Math.round(6 * sc));
    const nG = Math.max(3, Math.round(4 * sc)), nM = Math.max(2, Math.round(3 * sc));

    const wpool = rng.shuffle(['m16', 'ak47', 'pump', 'spas', 'uzi', 'hunting', 'glock', 'magnum', 'bat', 'p220', 'fireaxe']);
    for (let k = 0; k < nW; k++) { const s = take(14); if (s) map.items.weapons.push({ key: wpool[k % wpool.length], x: s.x, z: s.z }); }
    const apool = rng.shuffle(Object.keys(AMMO));
    for (let k = 0; k < nA; k++) { const s = take(10); if (s) map.items.ammo.push({ id: apool[k % apool.length], x: s.x, z: s.z }); }
    for (let k = 0; k < nG; k++) { const s = take(10); if (s) map.items.grenades.push({ id: GRENADE_ORDER[k % GRENADE_ORDER.length], x: s.x, z: s.z }); }
    for (let k = 0; k < nM; k++) { const s = take(12); if (s) map.items.meds.push({ x: s.x, z: s.z }); }
    const far = spots.filter(s => Math.hypot(s.x, s.z) >= 30);
    if (far.length) { const s = rng.pick(far); map.items.witch = { x: s.x, z: s.z }; }
  },

  /* ----------------------------------------------------------------------
     Validação independente (refaz tudo do zero)
     ---------------------------------------------------------------------- */
  validate(map) {
    const errors = [];
    const Z = this.CENTER_HALF + 2;
    const S = map.solids;

    for (const s of S) {
      if (s.x - s.hw < -map.hw + 3 || s.x + s.hw > map.hw - 3 || s.z - s.hd < -map.hh + 3 || s.z + s.hd > map.hh - 3) errors.push(`${s.type} fora dos limites`);
      if (Math.abs(s.x) - s.hw < Z && Math.abs(s.z) - s.hd < Z) errors.push(`${s.type} invade a zona central`);
    }
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        if (Math.abs(S[i].x - S[j].x) < S[i].hw + S[j].hw - 1e-6 && Math.abs(S[i].z - S[j].z) < S[i].hd + S[j].hd - 1e-6) {
          errors.push(`sobreposição ${S[i].type}/${S[j].type}`);
        }
      }
    }

    const grid = new Uint8Array(map.cols * map.rows);
    for (let j = 0; j < map.rows; j++) {
      for (let i = 0; i < map.cols; i++) {
        const cx = -map.hw + (i + 0.5) * map.cell, cz = -map.hh + (j + 0.5) * map.cell;
        if (Math.abs(cx) > map.hw - 1.6 || Math.abs(cz) > map.hh - 1.6) grid[j * map.cols + i] = 1;
      }
    }
    for (const s of S) this._raster(grid, map, s);

    const start = (map.rows / 2) * map.cols + map.cols / 2;
    if (grid[start]) errors.push('centro bloqueado');
    if (!this._connected(grid, map)) errors.push('região inacessível / bolsão isolado');

    const { vis } = this._flood(grid, map.cols, map.rows, start);
    const cellOf = (x, z) => Math.floor((z + map.hh) / map.cell) * map.cols + Math.floor((x + map.hw) / map.cell);
    const all = [].concat(map.items.weapons, map.items.ammo, map.items.grenades, map.items.meds, map.items.witch ? [map.items.witch] : []);
    for (const it of all) {
      if (!vis[cellOf(it.x, it.z)]) errors.push('item em local inacessível');
      for (const s of S) if (Math.abs(it.x - s.x) < s.hw + 0.5 && Math.abs(it.z - s.z) < s.hd + 0.5) { errors.push('item dentro de parede'); break; }
    }
    return { ok: errors.length === 0, errors };
  }
};

/* ==========================================================================
   NAVEGAÇÃO EM GRADE (campo de distâncias a partir de um alvo)
   Zumbis usam linha reta quando há visão livre e o campo (BFS) quando não há.
   ========================================================================== */
const Nav = {
  cellIndex(map, x, z) {
    const i = Math.min(map.cols - 1, Math.max(0, Math.floor((x + map.hw) / map.cell)));
    const j = Math.min(map.rows - 1, Math.max(0, Math.floor((z + map.hh) / map.cell)));
    return j * map.cols + i;
  },

  nearestFree(map, idx) {
    if (map.walk[idx]) return idx;
    const ci = idx % map.cols, cj = (idx / map.cols) | 0;
    for (let r = 1; r <= 4; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= map.cols || j >= map.rows) continue;
          if (map.walk[j * map.cols + i]) return j * map.cols + i;
        }
      }
    }
    return -1;
  },

  computeField(map, x, z, field) {
    const f = field || new Int16Array(map.cols * map.rows);
    f.fill(-1);
    const start = this.nearestFree(map, this.cellIndex(map, x, z));
    if (start < 0) return f;
    const { cols, rows, walk } = map;
    const q = new Int32Array(cols * rows);
    let head = 0, tail = 0;
    f[start] = 0; q[tail++] = start;
    while (head < tail) {
      const c = q[head++];
      const i = c % cols, j = (c / cols) | 0, d = f[c] + 1;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          const n = nj * cols + ni;
          if (!walk[n] || f[n] >= 0) continue;
          if (di && dj && (!walk[j * cols + ni] || !walk[nj * cols + i])) continue; // sem cortar quinas
          f[n] = d; q[tail++] = n;
        }
      }
    }
    return f;
  },

  _best(map, field, c) {
    const { cols, rows } = map;
    const i = c % cols, j = (c / cols) | 0;
    let best = -1, bv = field[c] >= 0 ? field[c] : 32767;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni, v = field[n];
        if (v >= 0 && v < bv) { bv = v; best = n; }
      }
    }
    return best;
  },

  /* Preenche out {x,z} com a direção normalizada. Retorna false se não houver caminho. */
  dir(map, field, x, z, out) {
    let c = this.cellIndex(map, x, z);
    let n = this._best(map, field, c);
    if (n < 0) return false;
    const n2 = this._best(map, field, n);
    if (n2 >= 0) n = n2;
    const tx = -map.hw + ((n % map.cols) + 0.5) * map.cell;
    const tz = -map.hh + (((n / map.cols) | 0) + 0.5) * map.cell;
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    if (d < 0.001) return false;
    out.x = dx / d; out.z = dz / d;
    return true;
  },

  lineClear(map, x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / 1.0);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!map.walk[this.cellIndex(map, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)]) return false;
    }
    return true;
  }
};

/* ==========================================================================
   5. GEOMETRIAS / MATERIAIS COMPARTILHADOS (ZERO ALLOC) E MODELOS 3D
   ========================================================================== */
const SHARED = {
  geos: {},
  mats: {},
  _c: {},
  flag(o) { o.userData.isShared = true; return o; },

  init() {
    const g = this.geos, f = o => this.flag(o);
    g.head = f(new THREE.SphereGeometry(0.28, 8, 8));
    g.neck = f(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 6));
    g.torso = f(new THREE.BoxGeometry(0.68, 0.72, 0.42));
    g.pelvis = f(new THREE.BoxGeometry(0.6, 0.3, 0.38));
    g.upperLimb = f(new THREE.CylinderGeometry(0.11, 0.1, 0.45, 6));
    g.lowerLimb = f(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6));
    g.foot = f(new THREE.BoxGeometry(0.18, 0.12, 0.32));
    g.hand = f(new THREE.SphereGeometry(0.1, 6, 6));
    g.tankTorso = f(new THREE.BoxGeometry(1.8, 1.6, 1.2));
    g.boomerBelly = f(new THREE.SphereGeometry(0.9, 10, 10));
    g.casing = f(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6));
    g.unitBox = f(new THREE.BoxGeometry(1, 1, 1));
    g.unitSphere = f(new THREE.SphereGeometry(1, 10, 8));
    g.unitPlane = f(new THREE.PlaneGeometry(1, 1));
    g.cone = f(new THREE.ConeGeometry(0.22, 1, 6));
    g.ring = f(new THREE.RingGeometry(0.86, 1, 28));
    g.disc = f(new THREE.CylinderGeometry(1, 1, 0.04, 20));
    g.tracer = f(new THREE.BoxGeometry(0.13, 0.13, 1));
    g.torus = f(new THREE.TorusGeometry(0.05, 0.012, 6, 10));

    this.mats.casing = f(new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    this.mats.bloodDecal = f(new THREE.MeshBasicMaterial({ color: 0x770011, transparent: true, opacity: 0.82 }));
    this.mats.zombieEyes = f(new THREE.MeshBasicMaterial({ color: 0xff2200 }));
  },

  box(w, h, d) { const k = `b${w},${h},${d}`; return this._c[k] || (this._c[k] = this.flag(new THREE.BoxGeometry(w, h, d))); },
  cyl(rt, rb, h, s = 8) { const k = `c${rt},${rb},${h},${s}`; return this._c[k] || (this._c[k] = this.flag(new THREE.CylinderGeometry(rt, rb, h, s))); },
  sph(r, s = 8) { const k = `s${r},${s}`; return this._c[k] || (this._c[k] = this.flag(new THREE.SphereGeometry(r, s, s))); },
  lambert(c) { const k = `l${c}`; return this._c[k] || (this._c[k] = this.flag(new THREE.MeshLambertMaterial({ color: c }))); },
  basic(c, o) {
    o = o || {};
    const k = `m${c}${o.add ? 'a' : ''}${o.op || ''}`;
    return this._c[k] || (this._c[k] = this.flag(new THREE.MeshBasicMaterial({
      color: c, transparent: !!(o.add || o.op), opacity: o.op == null ? 1 : o.op,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add
    })));
  }
};

function disposeHierarchy(obj) {
  if (!obj) return;
  obj.traverse(child => {
    if (child.isMesh) {
      if (child.geometry && !(child.geometry.userData && child.geometry.userData.isShared)) child.geometry.dispose();
      const m = child.material;
      if (m) {
        if (Array.isArray(m)) m.forEach(x => { if (!x.userData.isShared) x.dispose(); });
        else if (!m.userData.isShared) m.dispose();
      }
    }
  });
}

function part(parent, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.rotation.set(rx || 0, ry || 0, rz || 0);
  parent.add(m);
  return m;
}

/* ---- Modelos de armas: eixo +Z = frente do cano, +Y = cima, origem = empunhadura ---- */
function buildWeaponModel(key, tint) {
  const w = WEAPONS[key], g = new THREE.Group();
  const metal = SHARED.lambert(tint || w.color), dark = SHARED.lambert(0x16161c);
  const wood = SHARED.lambert(0x8b5a2b), steel = SHARED.lambert(0xbfc5c9);
  const B = (a, b, c) => SHARED.box(a, b, c), C = (a, b, c, d) => SHARED.cyl(a, b, c, d), H = Math.PI / 2;
  const P = (geo, mat, x, y, z, rx, ry, rz) => part(g, geo, mat, x, y, z, rx, ry, rz);

  switch (w.model) {
    case 'pistol':
      P(B(0.1, 0.13, 0.44), metal, 0, 0.08, 0.14);
      P(B(0.075, 0.24, 0.12), dark, 0, -0.07, -0.02, -0.25);
      P(B(0.04, 0.1, 0.14), dark, 0, -0.01, 0.12);
      P(C(0.028, 0.028, 0.12, 6), dark, 0, 0.08, 0.4, H);
      break;
    case 'magnum':
      P(B(0.09, 0.13, 0.32), metal, 0, 0.08, 0.06);
      P(C(0.035, 0.035, 0.6, 6), steel, 0, 0.08, 0.48, H);
      P(C(0.085, 0.085, 0.13, 8), steel, 0, 0.06, 0.02, H);
      P(B(0.075, 0.26, 0.12), wood, 0, -0.08, -0.04, -0.3);
      break;
    case 'smg':
      P(B(0.14, 0.17, 0.5), metal, 0, 0.06, 0.18);
      P(C(0.028, 0.028, 0.3, 6), dark, 0, 0.08, 0.58, H);
      P(B(0.07, 0.3, 0.1), dark, 0, -0.17, 0.12);
      P(B(0.03, 0.03, 0.34), steel, 0, 0.06, -0.2);
      P(B(0.05, 0.06, 0.08), dark, 0, 0.18, 0.2);
      break;
    case 'rifle': // M16
      P(B(0.12, 0.17, 0.5), metal, 0, 0.06, 0.1);
      P(B(0.1, 0.1, 0.5), dark, 0, 0.05, 0.6);
      P(C(0.025, 0.025, 0.45, 6), steel, 0, 0.06, 1.1, H);
      P(B(0.04, 0.08, 0.32), metal, 0, 0.19, 0.12);
      P(B(0.03, 0.1, 0.03), steel, 0, 0.13, 0.95);
      P(B(0.08, 0.28, 0.12), dark, 0, -0.14, 0.18, 0.12);
      P(B(0.09, 0.15, 0.42), metal, 0, 0.0, -0.32);
      P(B(0.1, 0.2, 0.05), dark, 0, 0.0, -0.55);
      P(B(0.07, 0.2, 0.08), dark, 0, -0.12, -0.02, -0.2);
      break;
    case 'ak': // AK-47: madeira + carregador curvo
      P(B(0.12, 0.16, 0.5), metal, 0, 0.06, 0.1);
      P(B(0.13, 0.11, 0.44), wood, 0, 0.03, 0.58);
      P(C(0.028, 0.028, 0.5, 6), steel, 0, 0.13, 0.62, H);
      P(C(0.022, 0.022, 0.4, 6), metal, 0, 0.05, 1.05, H);
      P(B(0.04, 0.08, 0.04), steel, 0, 0.1, 1.2);
      P(B(0.08, 0.2, 0.12), dark, 0, -0.17, 0.2, 0.1);
      P(B(0.08, 0.2, 0.12), dark, 0, -0.34, 0.3, 0.45);
      P(B(0.09, 0.18, 0.45), wood, 0, -0.01, -0.36, 0.1);
      P(B(0.07, 0.2, 0.08), wood, 0, -0.12, -0.02, -0.2);
      break;
    case 'shotgun':
      P(B(0.12, 0.16, 0.42), metal, 0, 0.04, 0.02);
      P(C(0.045, 0.045, 1.1, 8), steel, 0, 0.07, 0.8, H);
      P(C(0.04, 0.04, 0.8, 8), metal, 0, -0.04, 0.62, H);
      P(B(0.11, 0.1, 0.34), wood, 0, -0.04, 0.5);
      P(B(0.09, 0.16, 0.5), wood, 0, -0.01, -0.4, 0.1);
      P(B(0.025, 0.04, 0.025), steel, 0, 0.12, 1.3);
      break;
    case 'sniper':
      P(B(0.11, 0.16, 0.5), metal, 0, 0.05, 0.1);
      P(C(0.03, 0.03, 1.4, 6), dark, 0, 0.07, 1.05, H);
      P(B(0.1, 0.17, 0.7), wood, 0, 0.0, 0.4);
      P(B(0.09, 0.2, 0.5), wood, 0, -0.02, -0.38, 0.12);
      P(C(0.055, 0.055, 0.45, 8), dark, 0, 0.22, 0.15, H);
      P(B(0.04, 0.06, 0.05), steel, 0, 0.16, 0.0);
      P(B(0.04, 0.06, 0.05), steel, 0, 0.16, 0.32);
      P(B(0.03, 0.03, 0.12), steel, 0.08, 0.1, 0.05);
      break;
    case 'axe':
      P(C(0.04, 0.04, 1.4, 6), SHARED.lambert(0xd35400), 0, 0, 0.45, H);
      P(B(0.08, 0.3, 0.2), SHARED.lambert(0xc0392b), 0, 0.1, 1.08);
      P(B(0.035, 0.46, 0.32), steel, 0, 0.14, 1.22);
      P(B(0.05, 0.14, 0.1), steel, 0, 0.1, 0.94);
      P(C(0.05, 0.05, 0.08, 6), dark, 0, 0, -0.28, H);
      break;
    case 'bat':
      P(C(0.07, 0.03, 1.15, 8), SHARED.lambert(0xd9a15b), 0, 0, 0.55, H);
      P(SHARED.sph(0.045, 6), SHARED.lambert(0xd9a15b), 0, 0, -0.03);
      for (let i = 0; i < 4; i++) P(B(0.02, 0.02, 0.06), steel, (i % 2 ? 0.065 : -0.065), 0.02 * i, 0.8 + i * 0.07, 0, 0, i % 2 ? -0.5 : 0.5);
      break;
    default:
      P(B(0.15, 0.2, 0.8), metal, 0, 0.05, 0.3);
  }
  return g;
}

function buildGrenadeModel(id) {
  const d = GRENADES[id], g = new THREE.Group();
  const body = SHARED.lambert(d.body), band = SHARED.basic(d.band), steel = SHARED.lambert(0xbfc5c9);
  if (id === 'T') {
    part(g, SHARED.cyl(0.1, 0.1, 0.3, 10), body, 0, 0, 0);
    part(g, SHARED.cyl(0.103, 0.103, 0.07, 10), band, 0, 0.04, 0);
    part(g, SHARED.cyl(0.06, 0.07, 0.07, 8), steel, 0, 0.18, 0);
    part(g, SHARED.box(0.02, 0.02, 0.14), steel, 0.05, 0.23, 0);
  } else if (id === 'F') {
    part(g, SHARED.cyl(0.09, 0.1, 0.28, 10), body, 0, 0, 0);
    part(g, SHARED.cyl(0.035, 0.05, 0.14, 8), body, 0, 0.2, 0);
    part(g, SHARED.cyl(0.103, 0.103, 0.04, 10), band, 0, -0.02, 0);
    part(g, SHARED.geos.cone, SHARED.basic(0xff9a1f, { add: true }), 0, 0.38, 0).scale.set(0.8, 0.5, 0.8);
  } else {
    part(g, SHARED.sph(0.13, 10), body, 0, 0, 0);
    part(g, SHARED.cyl(0.135, 0.135, 0.05, 10), band, 0, 0.02, 0);
    part(g, SHARED.cyl(0.05, 0.06, 0.07, 8), steel, 0, 0.15, 0);
    part(g, SHARED.box(0.02, 0.02, 0.14), steel, 0.05, 0.2, 0);
    part(g, SHARED.geos.torus, SHARED.lambert(0xffd700), -0.06, 0.18, 0, Math.PI / 2, 0, 0);
  }
  return g;
}

function buildMedkitModel() {
  const g = new THREE.Group();
  const white = SHARED.lambert(0xf4f4f4), red = SHARED.lambert(0xe31b3d), gray = SHARED.lambert(0x888888);
  part(g, SHARED.box(0.5, 0.3, 0.34), white, 0, 0, 0);
  part(g, SHARED.box(0.26, 0.02, 0.07), red, 0, 0.16, 0);
  part(g, SHARED.box(0.07, 0.02, 0.26), red, 0, 0.16, 0);
  part(g, SHARED.box(0.26, 0.07, 0.02), red, 0, 0.02, 0.175);
  part(g, SHARED.box(0.07, 0.26, 0.02), red, 0, 0.02, 0.175);
  part(g, SHARED.box(0.2, 0.05, 0.06), gray, 0, 0.19, -0.1);
  part(g, SHARED.box(0.08, 0.06, 0.03), gray, 0, 0.06, 0.18);
  return g;
}

function buildAmmoBoxModel(ammoKey) {
  const a = AMMO[ammoKey], g = new THREE.Group();
  part(g, SHARED.box(0.6, 0.28, 0.4), SHARED.lambert(0x4b5320), 0, 0, 0);
  part(g, SHARED.box(0.62, 0.08, 0.42), SHARED.basic(a.color), 0, 0.08, 0);
  const shell = ammoKey === '12ga';
  const h = shell ? 0.16 : (ammoKey === '9mm' || ammoKey === 'smg' || ammoKey === '44') ? 0.12 : 0.22;
  for (let i = -1; i <= 1; i++) {
    part(g, SHARED.cyl(shell ? 0.06 : 0.035, shell ? 0.06 : 0.035, h, 8), SHARED.lambert(shell ? 0xe03a3a : 0xd4a73a), i * 0.15, 0.14 + h / 2, 0);
  }
  return g;
}

function buildCarModel(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  part(g, SHARED.box(2.4, 0.8, 4.8), bodyMat, 0, 0.75, 0);
  part(g, SHARED.box(2.0, 0.7, 2.5), SHARED.lambert(0x1c2833), 0, 1.45, -0.3);
  for (const sx of [-1, 1]) for (const sz of [-1.5, 1.5]) part(g, SHARED.cyl(0.42, 0.42, 0.3, 10), SHARED.lambert(0x111111), sx * 1.2, 0.42, sz, 0, 0, Math.PI / 2);
  for (const sx of [-0.8, 0.8]) {
    part(g, SHARED.box(0.5, 0.2, 0.1), SHARED.basic(0xfff3a0), sx, 0.85, 2.41);
    part(g, SHARED.box(0.5, 0.2, 0.1), SHARED.basic(0xff2a2a), sx, 0.85, -2.41);
  }
  g.userData.bodyMat = bodyMat;
  return g;
}

/* Exibição no chão: disco brilhante + modelo girando e flutuando */
function makeGroundDisplay(model, color, scale) {
  const g = new THREE.Group();
  const pad = part(g, SHARED.geos.disc, SHARED.basic(color, { add: true, op: 0.3 }), 0, 0.03, 0);
  pad.scale.set(1.2, 1, 1.2);
  const ring = part(g, SHARED.geos.ring, SHARED.basic(color, { add: true, op: 0.9 }), 0, 0.05, 0, -Math.PI / 2, 0, 0);
  ring.scale.set(1.25, 1.25, 1);
  const holder = new THREE.Group();
  holder.scale.setScalar(scale || 1.5);
  holder.position.y = 0.55;
  holder.add(model);
  g.add(holder);
  g.userData.holder = holder;
  return g;
}

/* ==========================================================================
   6. GAME STATE & SINGLETON ENGINE
   ========================================================================== */
const Game = {
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  width: window.innerWidth,
  height: window.innerHeight,

  points: 0,
  selectedSurvivor: "coach",
  selectedHat: "cap",
  selectedSkin: "default",
  unlockedItems: ["coach", "ellis", "nick", "rochelle", "none", "cap", "default"],

  seed: "",
  map: null,
  nav: { field: null, timer: 0 },

  isRunning: false,
  isPaused: false,
  gameMode: "campaign",
  currentStageIdx: 0,
  stageStartTime: 0,
  stageClock: 0,

  kills: 0,
  damageTaken: 0,
  combo: 1,
  comboTimer: 0,
  maxCombo: 1,
  score: 0,

  hitStopTimer: 0,

  player: null,
  zombies: [],
  corpses: [],
  gibPieces: [],
  casings: [],
  bullets: [],
  projectiles: [],
  grenades: [],
  lures: [],
  effects: [],
  droppedWeapons: [],
  pickups: [],
  props: [],
  particles: [],
  pools: [],
  bloodDecals: [],

  keys: {},
  mousePos: { x: 0, y: 0 },
  mouseWorldPos: new THREE.Vector3(),
  mouseDown: false,
  mouseClicked: false,
  mouseRightDown: false,

  director: { intensity: 0, state: "PEACE", timer: 0, hordeDuration: 0, specialTimer: 0, tankSpawned: false },
  cameraShake: 0,
  _uiTimer: 0,
  _lastPrompt: "",

  /* ---------- SEED ---------- */
  randomSeed() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  readSeedInput() {
    const el = document.getElementById('seed-input');
    const v = ((el && el.value) || '').trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '');
    return v || this.randomSeed();
  },

  rollSeedInput() {
    const el = document.getElementById('seed-input');
    if (el) el.value = this.randomSeed();
  },

  copySeed() {
    try { navigator.clipboard.writeText(this.seed); this.showPopup("SEED COPIADA: " + this.seed, "#39ff14"); } catch (e) { /* ignore */ }
  },

  newSeedRestart() {
    this.seed = this.randomSeed();
    this.hideAllModals();
    this.loadStage(this.currentStageIdx);
  },

  /* ---------- MENUS ---------- */
  startCampaign() {
    audio.init();
    this.seed = this.readSeedInput();
    this.gameMode = "campaign";
    this.currentStageIdx = 0;
    this.hideAllModals();
    this.loadStage(this.currentStageIdx);
  },

  startSurvival() {
    audio.init();
    this.seed = this.readSeedInput();
    this.gameMode = "survival";
    this.hideAllModals();
    this.loadStage(-1);
  },

  openShop() { this.renderShop(); this.showModal('modal-shop'); },
  openControls() { this.showModal('modal-controls'); },
  closeModal(id) { document.getElementById(id).classList.remove('visible'); },
  showModal(id) { document.getElementById(id).classList.add('visible'); },
  hideAllModals() { document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('visible')); },

  togglePause() {
    if (!this.isRunning || (this.player && this.player.isDead)) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) { document.getElementById('pause-seed-val').innerText = this.seed; this.showModal('modal-pause'); }
    else this.closeModal('modal-pause');
  },

  returnToTitle() {
    this.isRunning = false;
    this.isPaused = false;
    this.mouseDown = false;
    this.hideAllModals();
    document.getElementById('title-points').innerText = this.points.toLocaleString();
    this.showModal('modal-title');
  },

  restartStage() {
    this.hideAllModals();
    this.loadStage(this.currentStageIdx);
  },

  nextStage() {
    this.hideAllModals();
    this.currentStageIdx++;
    if (this.currentStageIdx > 4) {
      alert("PARABÉNS! VOCÊ ESCAPOU DA QUARENTENA E SOBREVIVEU A TODAS AS 5 FASES!");
      this.returnToTitle();
    } else {
      this.loadStage(this.currentStageIdx);
    }
  },

  applyHitStop(duration = 0.045) { this.hitStopTimer = duration; },

  renderShop() {
    document.getElementById('shop-points-val').innerText = this.points.toLocaleString();

    const sGrid = document.getElementById('grid-survivors');
    sGrid.innerHTML = '';
    Object.keys(SURVIVORS).forEach(k => {
      const s = SURVIVORS[k];
      const isEquipped = (this.selectedSurvivor === k);
      const div = document.createElement('div');
      div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
      div.innerHTML = `
        <div class="shop-item-name" style="color: ${isEquipped ? 'var(--neon-green)' : 'var(--neon-cyan)'}">${s.name}</div>
        <div class="shop-item-cost">${s.passive}</div>`;
      div.onclick = () => { this.selectedSurvivor = k; this.renderShop(); };
      sGrid.appendChild(div);
    });

    const build = (gridId, list, selKey) => {
      const grid = document.getElementById(gridId);
      grid.innerHTML = '';
      list.forEach(it => {
        const owned = this.unlockedItems.includes(it.id);
        const isEquipped = (this[selKey] === it.id);
        const div = document.createElement('div');
        div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
        div.innerHTML = `
          <div class="shop-item-name">${it.name}</div>
          <div class="shop-item-cost">${owned ? (isEquipped ? 'EQUIPADO' : 'USAR') : it.cost + ' PTS'}</div>`;
        div.onclick = () => {
          if (owned) {
            this[selKey] = it.id;
          } else if (this.points >= it.cost) {
            this.points -= it.cost;
            this.unlockedItems.push(it.id);
            this[selKey] = it.id;
          } else {
            alert("Pontos insuficientes!");
          }
          this.renderShop();
        };
        grid.appendChild(div);
      });
    };
    build('grid-hats', COSMETICS.hats, 'selectedHat');
    build('grid-skins', COSMETICS.skins, 'selectedSkin');
  }
};

/* ==========================================================================
   7. FASES, MAPA PROCEDURAL E ZONA CENTRAL FIXA
   ========================================================================== */
const STAGES_DATA = [
  { name: "STAGE 1: LIBERTY SHOPPING MALL", base: { w: 90, h: 90 }, scale: 1.2, floorColor: 0x1a1528, wallColor: 0x3d1c5a,
    gen: { building: 3, lshape: 3, long: 6, barriers: 2, carRows: 1, cars: 5, blocks: 9, explosives: 10 } },
  { name: "STAGE 2: MERCY HOSPITAL", base: { w: 80, h: 100 }, scale: 1.2, floorColor: 0x102028, wallColor: 0x1f455b,
    gen: { building: 2, lshape: 2, long: 9, barriers: 1, carRows: 0, cars: 2, blocks: 4, explosives: 8 } },
  { name: "STAGE 3: DOWNTOWN CAR ALARMS", base: { w: 100, h: 80 }, scale: 1.2, floorColor: 0x181820, wallColor: 0x403525,
    gen: { building: 2, lshape: 2, long: 3, barriers: 3, carRows: 3, cars: 8, blocks: 4, explosives: 10 } },
  { name: "STAGE 4: WHISPERING MANSION", base: { w: 85, h: 85 }, scale: 1.2, floorColor: 0x241410, wallColor: 0x5a2d22,
    gen: { building: 4, lshape: 4, long: 3, barriers: 0, carRows: 0, cars: 1, blocks: 6, explosives: 8 } },
  { name: "STAGE 5: THE RIVER HIGHWAY BRIDGE", base: { w: 60, h: 140 }, scale: 1.2, floorColor: 0x111118, wallColor: 0x303038,
    gen: { building: 0, lshape: 0, long: 0, barriers: 6, carRows: 2, cars: 9, blocks: 3, explosives: 10 } }
];
const SURVIVAL_STAGE = {
  name: "MODO SOBREVIVÊNCIA // ONDAS INFINITAS", base: { w: 100, h: 100 }, scale: 1.2, floorColor: 0x1c0f24, wallColor: 0x5c1b48,
  gen: { building: 3, lshape: 3, long: 5, barriers: 2, carRows: 2, cars: 6, blocks: 7, explosives: 10 }
};
const CAR_COLORS = [0x224466, 0x556b2f, 0x6b6b7a, 0x6b3e26, 0x2e3a59];
const BLOCK_COLORS = [0x5c3a21, 0x3a4a5c, 0x4a3a5c];

/* ---- Zona central FIXA: idêntica em qualquer seed ---- */
const CENTER_LAYOUT = {
  weapons: [['bat', -9, -9], ['m16', -5.5, -9], ['ak47', -2, -9], ['pump', 1.5, -9], ['glock', 5, -9], ['hunting', 8.5, -9]],
  ammo: [['9mm', -9], ['smg', -6], ['44', -3], ['12ga', 0], ['556', 3], ['762', 6], ['308', 9]],   // z = +9
  grenades: [['G', -10, -3], ['T', -10, 0], ['F', -10, 3]],
  meds: [[10, -3], [10, 0], [10, 3]]
};

Game.loadStage = function (stageIdx) {
  while (this.scene.children.length > 0) {
    const obj = this.scene.children[0];
    this.scene.remove(obj);
    disposeHierarchy(obj);
  }
  this.zombies = []; this.corpses = []; this.gibPieces = []; this.casings = [];
  this.bullets = []; this.projectiles = []; this.grenades = []; this.lures = [];
  this.effects = []; this.droppedWeapons = []; this.pickups = []; this.props = [];
  this.particles = []; this.pools = []; this.bloodDecals = [];

  this.stageStartTime = performance.now();
  this.stageClock = 0;
  this.kills = 0; this.damageTaken = 0; this.combo = 1; this.comboTimer = 0;
  this.maxCombo = 1; this.score = 0; this.hitStopTimer = 0; this.cameraShake = 0;
  this.mouseDown = false;
  const d = this.director;
  d.intensity = 0; d.state = "PEACE"; d.timer = 0; d.specialTimer = 4.0; d.tankSpawned = false;
  audio.isHorde = false; audio.isTank = false;

  const isSurvival = (stageIdx === -1);
  const info = isSurvival ? SURVIVAL_STAGE : STAGES_DATA[stageIdx];
  this.stageInfo = info;

  document.getElementById('ui-stage-title').innerText = info.name;
  document.getElementById('ui-director-banner').classList.remove('active');
  document.getElementById('ui-reload-fill').style.width = '0%';

  this.scene.add(new THREE.AmbientLight(0x403055, 1.2));
  const dirLight = new THREE.DirectionalLight(0xff007f, 0.6);
  dirLight.position.set(20, 40, 20);
  this.scene.add(dirLight);
  const cyanLight = new THREE.DirectionalLight(0x00f3ff, 0.5);
  cyanLight.position.set(-20, 40, -20);
  this.scene.add(cyanLight);

  /* ---- mapa procedural (mesma seed + mesma fase => mesmo mapa) ---- */
  const mapSeed = `${this.seed}|${isSurvival ? 'S' : stageIdx}`;
  this.map = MapGen.generate(mapSeed, info);
  const map = this.map;
  console.log(`[MAPGEN] seed=${this.seed} fase=${isSurvival ? 'SURVIVAL' : stageIdx + 1} tamanho=${map.w}x${map.h} estruturas=${map.solids.length} tentativa=${map.attempt}`);
  document.getElementById('ui-seed').innerText = this.seed;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshLambertMaterial({ color: info.floorColor }));
  floor.rotation.x = -Math.PI / 2;
  this.scene.add(floor);

  const grid = new THREE.GridHelper(Math.max(map.w, map.h), Math.round(Math.max(map.w, map.h) / 2.5), 0xff007f, 0x221133);
  grid.position.y = 0.02;
  this.scene.add(grid);

  const wallMat = SHARED.lambert(info.wallColor);
  const T = 1.5, H = 4.5;
  this.createWall(0, -map.hh, map.w + T, T, H, wallMat);
  this.createWall(0, map.hh, map.w + T, T, H, wallMat);
  this.createWall(-map.hw, 0, T, map.h + T, H, wallMat);
  this.createWall(map.hw, 0, T, map.h + T, H, wallMat);

  for (const s of map.solids) this.addSolid(s, wallMat);
  this.buildCenterZone();

  this.player = new Player(0, 0, SURVIVORS[this.selectedSurvivor]);
  this.scene.add(this.player.mesh);

  this.scatterItems();
  if (stageIdx === 3 && map.items.witch) this.spawnZombie(map.items.witch.x, map.items.witch.z, 'witch');

  this.nav.field = new Int16Array(map.cols * map.rows);
  this.nav.timer = 0;
  Nav.computeField(map, this.player.x, this.player.z, this.nav.field);

  this.isRunning = true;
  this.isPaused = false;
  this.updateHUD();
};

Game.createWall = function (x, z, w, d, h, mat) {
  const mesh = new THREE.Mesh(SHARED.box(w, h, d), mat);
  mesh.position.set(x, h / 2, z);
  this.scene.add(mesh);
  this.props.push({ type: 'wall', solid: true, x, z, halfW: w / 2, halfD: d / 2, mesh });
};

/* Converte um sólido do gerador em malha + colisor */
Game.addSolid = function (s, wallMat) {
  const t = s.type;
  let mesh, hp = 0, damageable = false;
  if (t === 'wall') {
    mesh = new THREE.Mesh(SHARED.box(s.hw * 2, 4, s.hd * 2), wallMat);
    mesh.position.set(s.x, 2, s.z);
  } else if (t === 'block') {
    mesh = new THREE.Mesh(SHARED.box(s.hw * 2, 2.2, s.hd * 2), SHARED.lambert(BLOCK_COLORS[s.variant || 0]));
    mesh.position.set(s.x, 1.1, s.z);
  } else if (t === 'barrier') {
    mesh = new THREE.Mesh(SHARED.box(s.hw * 2, 1.3, s.hd * 2), SHARED.lambert(0x77778a));
    mesh.position.set(s.x, 0.65, s.z);
  } else if (t === 'car') {
    mesh = buildCarModel(s.hasAlarm ? 0x990022 : CAR_COLORS[s.tint % CAR_COLORS.length]);
    mesh.position.set(s.x, 0, s.z);
    if (s.rot) mesh.rotation.y = Math.PI / 2;
    hp = 300; damageable = true;
  } else if (t === 'barrel') {
    mesh = new THREE.Mesh(SHARED.cyl(0.7, 0.7, 1.5, 10), SHARED.lambert(0xcc2222));
    mesh.position.set(s.x, 0.75, s.z);
    part(mesh, SHARED.cyl(0.72, 0.72, 0.12, 10), SHARED.lambert(0xffcc00), 0, 0.2, 0);
    hp = 25; damageable = true;
  } else if (t === 'gas_can') {
    mesh = new THREE.Mesh(SHARED.box(0.6, 0.9, 0.6), SHARED.lambert(0xffaa00));
    mesh.position.set(s.x, 0.45, s.z);
    hp = 25; damageable = true;
  } else { // propane
    mesh = new THREE.Mesh(SHARED.cyl(0.5, 0.5, 1.2, 10), SHARED.lambert(0xeeeeee));
    mesh.position.set(s.x, 0.6, s.z);
    part(mesh, SHARED.sph(0.3, 6), SHARED.lambert(0xdd3333), 0, 0.7, 0);
    hp = 25; damageable = true;
  }
  this.scene.add(mesh);
  this.props.push({
    type: t, solid: true, damageable, x: s.x, z: s.z, halfW: s.hw, halfD: s.hd,
    hasAlarm: !!s.hasAlarm, alarmTriggered: false, alarmTime: 0, hp, mesh,
    bodyMat: mesh.userData && mesh.userData.bodyMat
  });
};

/* Primeiro sólido que contém o ponto (círculo ~ quadrado de raio r) */
Game.solidAt = function (x, z, r) {
  for (let i = 0; i < this.props.length; i++) {
    const p = this.props[i];
    if (!p.solid || p.destroyed) continue;
    if (x + r > p.x - p.halfW && x - r < p.x + p.halfW && z + r > p.z - p.halfD && z - r < p.z + p.halfD) return p;
  }
  return null;
};
Game.checkWallCollision = function (x, z, r = 0.5) { return !!this.solidAt(x, z, r); };

Game.buildCenterZone = function () {
  const Z = MapGen.CENTER_HALF;
  const plate = new THREE.Mesh(SHARED.geos.unitPlane, SHARED.lambert(0x2b1d4a));
  plate.rotation.x = -Math.PI / 2; plate.scale.set(Z * 2, Z * 2, 1); plate.position.y = 0.03;
  this.scene.add(plate);

  const neon = SHARED.basic(0x39ff14);
  for (const [x, z, w, d] of [[0, -Z, Z * 2, 0.3], [0, Z, Z * 2, 0.3], [-Z, 0, 0.3, Z * 2], [Z, 0, 0.3, Z * 2]]) {
    const m = new THREE.Mesh(SHARED.box(w, 0.1, d), neon);
    m.position.set(x, 0.08, z);
    this.scene.add(m);
  }
  for (const [x, z] of [[-Z, -Z], [Z, -Z], [-Z, Z], [Z, Z]]) {
    const post = new THREE.Mesh(SHARED.cyl(0.18, 0.18, 3.2, 8), SHARED.lambert(0x333344));
    post.position.set(x, 1.6, z);
    part(post, SHARED.sph(0.4, 8), SHARED.basic(0x39ff14), 0, 1.8, 0);
    this.scene.add(post);
  }

  try {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, 512, 96);
    c.font = 'bold 54px monospace'; c.textAlign = 'center'; c.fillStyle = '#39ff14';
    c.fillText('SUPRIMENTOS', 256, 66);
    const sign = new THREE.Mesh(SHARED.geos.unitPlane, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
    sign.rotation.x = -Math.PI / 2; sign.scale.set(10, 1.9, 1); sign.position.set(0, 0.06, -12.2);
    this.scene.add(sign);
  } catch (e) { /* sem canvas: ignora o letreiro */ }

  for (const [k, x, z] of CENTER_LAYOUT.weapons) this.spawnGroundWeapon(x, z, k, null);
  for (const [id, x] of CENTER_LAYOUT.ammo) this.spawnPickup('ammo', id, x, 9, { respawn: 20, give: AMMO[id].give });
  for (const [id, x, z] of CENTER_LAYOUT.grenades) this.spawnPickup('grenade', id, x, z, { respawn: 25, give: 2 });
  for (const [x, z] of CENTER_LAYOUT.meds) this.spawnPickup('med', 'med', x, z, { respawn: 30, give: 1 });
};

/* Itens espalhados pelo mapa (posições vindas da seed, já validadas) */
Game.scatterItems = function () {
  const it = this.map.items;
  for (const w of it.weapons) this.spawnGroundWeapon(w.x, w.z, w.key, null);
  for (const a of it.ammo) this.spawnPickup('ammo', a.id, a.x, a.z, { give: AMMO[a.id].give });
  for (const g of it.grenades) this.spawnPickup('grenade', g.id, g.x, g.z, { give: 1 });
  for (const m of it.meds) this.spawnPickup('med', 'med', m.x, m.z, { give: 1 });
};

/* ==========================================================================
   8. PLAYER (SLOTS 1-5, MUNIÇÃO POR TIPO, ANIMAÇÕES PROCEDURAIS)
   ========================================================================== */
class Player {
  constructor(x, z, survivorData) {
    this.x = x; this.z = z;
    this.survivor = survivorData;
    this.hp = survivorData.maxHp;
    this.maxHp = survivorData.maxHp;
    this.tempHp = 0;
    this.speed = survivorData.speed;
    this.isDead = false;

    this.adrenalineTime = 0;
    this.bileTime = 0;
    this.jockeyTime = 0;

    /* Inventário rápido */
    this.slots = { 1: null, 2: { key: 'p220', mag: WEAPONS.p220.clip }, 3: { key: 'fireaxe' } };
    this.activeSlot = 2;
    this.lastWeaponSlot = 2;
    this.ammo = { '9mm': 45, '44': 0, 'smg': 0, '12ga': 16, '556': 90, '762': 60, '308': 0 };
    this.grenades = { G: 2, T: 1, F: 1 };
    this.grenadeType = 'G';
    this.medkits = 1;
    this.defibs = 0;

    this.lastFireTime = 0;
    this.lastThrowTime = 0;
    this.lastPunchTime = 0;
    this.lastShoveTime = 0;
    this.lastEmptyMsg = 0;

    this.isReloading = false;
    this.reloadProgress = 0;
    this.reloadSlot = 0;
    this.action = null;

    this.specialAmmoType = "PADRÃO";
    this.specialAmmoShots = 0;

    this.walkTime = 0;
    this.punchAnim = 0;
    this.punchArm = 'R';
    this.recoilAnim = 0;

    this.buildMesh();
    this.attachCosmeticHat(Game.selectedHat);
    this.updateWeaponMesh();
  }

  item() { return this.activeSlot <= 3 ? this.slots[this.activeSlot] : null; }
  wdata() { const it = this.item(); return it ? WEAPONS[it.key] : null; }
  totalGrenades() { return this.grenades.G + this.grenades.T + this.grenades.F; }

  buildMesh() {
    const L = c => SHARED.lambert(c);
    this.mesh = new THREE.Group();
    this.mesh.position.set(this.x, 0, this.z);

    const skinMat = L(this.survivor.skinColor), shirtMat = L(this.survivor.shirtColor);
    const pantsMat = L(this.survivor.pantsColor), hairMat = L(this.survivor.hairColor), shoeMat = L(0x111111);

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.85;
    this.mesh.add(this.pelvis);
    part(this.pelvis, SHARED.geos.pelvis, pantsMat);

    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.2;
    this.pelvis.add(this.torsoGroup);
    part(this.torsoGroup, SHARED.geos.torso, shirtMat, 0, 0.36, 0);
    part(this.torsoGroup, SHARED.geos.neck, skinMat, 0, 0.76, 0);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.95;
    this.torsoGroup.add(this.headGroup);
    part(this.headGroup, SHARED.geos.head, skinMat);
    part(this.headGroup, SHARED.box(0.58, 0.22, 0.58), hairMat, 0, 0.18, -0.05);
    const eyeMat = SHARED.basic(0x222222);
    part(this.headGroup, SHARED.box(0.1, 0.06, 0.08), eyeMat, 0.12, 0.02, 0.26);
    part(this.headGroup, SHARED.box(0.1, 0.06, 0.08), eyeMat, -0.12, 0.02, 0.26);

    const makeArm = (sx) => {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.42, 0.65, 0);
      this.torsoGroup.add(arm);
      part(arm, SHARED.geos.upperLimb, shirtMat, 0, -0.22, 0);
      const fore = new THREE.Group();
      fore.position.y = -0.42;
      arm.add(fore);
      part(fore, SHARED.geos.lowerLimb, skinMat, 0, -0.2, 0);
      part(fore, SHARED.geos.hand, skinMat, 0, -0.4, 0);
      return [arm, fore];
    };
    [this.armL, this.forearmL] = makeArm(-1);
    [this.armR, this.forearmR] = makeArm(1);

    /* Mount: eixo +Z do modelo => ao longo do antebraço; pose ajusta rotation.x */
    this.weaponMount = new THREE.Group();
    this.weaponMount.position.set(0, -0.4, 0);
    this.weaponMount.rotation.x = Math.PI / 2;
    this.forearmR.add(this.weaponMount);

    const makeLeg = (sx) => {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.2, -0.15, 0);
      this.pelvis.add(leg);
      part(leg, SHARED.geos.upperLimb, pantsMat, 0, -0.22, 0);
      const shin = new THREE.Group();
      shin.position.y = -0.42;
      leg.add(shin);
      part(shin, SHARED.geos.lowerLimb, pantsMat, 0, -0.2, 0);
      part(shin, SHARED.geos.foot, shoeMat, 0, -0.42, 0.08);
      return [leg, shin];
    };
    [this.legL, this.shinL] = makeLeg(-1);
    [this.legR, this.shinR] = makeLeg(1);

    this.spotLight = new THREE.SpotLight(0xffffff, 2.0, 30, Math.PI / 5, 0.35);
    this.spotLight.position.set(0, 1.4, 0);
    this.spotLight.target.position.set(0, 1.4, 10);
    this.mesh.add(this.spotLight);
    this.mesh.add(this.spotLight.target);
  }

  attachCosmeticHat(hatId) {
    if (this.hatMesh) { this.headGroup.remove(this.hatMesh); disposeHierarchy(this.hatMesh); this.hatMesh = null; }
    let geo, mat;
    if (hatId === "cap") { geo = SHARED.box(0.65, 0.18, 0.75); mat = SHARED.lambert(0x00f3ff); }
    else if (hatId === "helmet") { geo = SHARED.box(0.72, 0.32, 0.72); mat = SHARED.lambert(0x2e4053); }
    else if (hatId === "cowboy") { geo = SHARED.cyl(0.55, 0.8, 0.2, 8); mat = SHARED.lambert(0x8b4513); }
    else if (hatId && hatId.startsWith("mask")) {
      geo = SHARED.box(0.62, 0.62, 0.35);
      mat = SHARED.lambert(hatId.includes("rooster") ? 0xff0044 : (hatId.includes("horse") ? 0x995533 : 0xffaa00));
    } else return;
    this.hatMesh = new THREE.Mesh(geo, mat);
    this.hatMesh.position.set(0, 0.28, 0.06);
    this.headGroup.add(this.hatMesh);
  }

  clearMount() {
    while (this.weaponMount.children.length > 0) {
      const c = this.weaponMount.children[0];
      this.weaponMount.remove(c);
      disposeHierarchy(c);
    }
  }

  /* Modelo na mão: item do slot ativo (ou um modelo temporário durante arremesso/uso) */
  updateWeaponMesh(temp) {
    this.clearMount();
    let model = temp || null;
    if (!model) {
      const s = this.activeSlot;
      if (s <= 3 && this.slots[s]) {
        const skin = COSMETICS.skins.find(k => k.id === Game.selectedSkin);
        const tint = (skin && skin.tint !== 0xffffff) ? skin.tint : null;
        model = buildWeaponModel(this.slots[s].key, tint);
      } else if (s === 4) model = buildGrenadeModel(this.grenadeType);
      else if (s === 5) model = buildMedkitModel();
    }
    if (model) this.weaponMount.add(model);
  }

  /* ---------- slots ---------- */
  equipSlot(n) {
    if (this.isDead || this.action) return;
    if (n <= 3 && !this.slots[n]) { Game.showPopup(`SLOT ${n} VAZIO`, "#aaaaaa"); return; }
    if (n === 4) {
      if (this.totalGrenades() <= 0) { Game.showPopup("SEM GRANADAS", "#ff2a2a"); return; }
      if (this.activeSlot === 4) this.cycleGrenade(); else if (this.grenades[this.grenadeType] <= 0) this.cycleGrenade();
    }
    if (n === 5 && this.medkits <= 0) { Game.showPopup("SEM KIT MÉDICO", "#ff2a2a"); return; }
    this.cancelReload();
    this.activeSlot = n;
    if (n <= 3) this.lastWeaponSlot = n;
    this.updateWeaponMesh();
    audio.playDryClick();
    Game.updateHUD();
  }

  cycleGrenade() {
    const i = GRENADE_ORDER.indexOf(this.grenadeType);
    for (let k = 1; k <= GRENADE_ORDER.length; k++) {
      const t = GRENADE_ORDER[(i + k) % GRENADE_ORDER.length];
      if (this.grenades[t] > 0) { this.grenadeType = t; break; }
    }
    if (this.activeSlot === 4) this.updateWeaponMesh();
  }

  cycleSlot(dir) {
    if (this.action) return;
    for (let k = 1; k <= 5; k++) {
      const n = ((this.activeSlot - 1 + dir * k) % 5 + 5) % 5 + 1;
      const ok = n <= 3 ? !!this.slots[n] : (n === 4 ? this.totalGrenades() > 0 : this.medkits > 0);
      if (ok) { this.activeSlot = n; if (n <= 3) this.lastWeaponSlot = n; this.cancelReload(); this.updateWeaponMesh(); Game.updateHUD(); return; }
    }
  }

  fallbackSlot() {
    for (const n of [this.lastWeaponSlot, 2, 3, 1]) {
      if (this.slots[n]) { this.activeSlot = n; break; }
    }
    this.updateWeaponMesh();
  }

  cancelReload() {
    this.isReloading = false;
    this.reloadProgress = 0;
    document.getElementById('ui-reload-fill').style.width = '0%';
  }

  /* ---------- ações com animação (golpe, arremesso, uso) ---------- */
  startAction(kind, dur, impactAt, onImpact, tempModel) {
    this.action = { kind, t: 0, dur, impactAt, onImpact, done: false, temp: !!tempModel };
    if (tempModel) this.updateWeaponMesh(tempModel);
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) return;
    a.t += dt / a.dur;
    if (!a.done && a.t >= a.impactAt) { a.done = true; a.onImpact(); }
    if (a.t >= 1) {
      const temp = a.temp;
      this.action = null;
      if (temp) this.updateWeaponMesh();
    }
  }

  applyPose() {
    const w = this.wdata(), act = this.action;
    let kind = 'fists';
    if (act && (act.kind === 'throw' || act.kind === 'use')) kind = act.kind;
    else if (this.activeSlot === 4) kind = 'grenade';
    else if (this.activeSlot === 5) kind = 'med';
    else if (w) kind = w.kind === 'melee' ? 'melee' : 'gun';

    const aR = this.armR, fR = this.forearmR, aL = this.armL, fL = this.forearmL;
    const t = act ? act.t : 0, H = Math.PI / 2;
    const lerp = (a, b, k) => a + (b - a) * k, ease = k => k * k * (3 - 2 * k);
    let twist = 0, lunge = 0, delta = 0;

    switch (kind) {
      case 'gun':
        aR.rotation.set(-H + 0.1 - this.recoilAnim, 0, -0.1); fR.rotation.set(0.1, 0, 0);
        aL.rotation.set(-H + 0.25, 0, 0.5); fL.rotation.set(0.4, 0, 0);
        delta = -this.recoilAnim * 0.4;
        break;
      case 'melee': {
        let ax = -1.0, d = -0.9;
        if (act && act.kind === 'melee') {
          if (t < 0.32) { const k = ease(t / 0.32); twist = k; d = lerp(-0.9, -1.5, k); ax = lerp(-1.0, -1.4, k); }
          else if (t < 0.6) { const k = (t - 0.32) / 0.28; twist = lerp(1.0, -1.0, k); d = lerp(-1.5, 0.5, k); ax = lerp(-1.4, -1.5, k); lunge = k; }
          else { const k = ease(Math.min(1, (t - 0.6) / 0.4)); twist = lerp(-1.0, 0, k); d = lerp(0.5, -0.9, k); ax = lerp(-1.5, -1.0, k); lunge = 1 - k; }
        }
        aR.rotation.set(ax, 0, -0.05); fR.rotation.set(-0.5, 0, 0);
        aL.rotation.set(-0.7, 0, 0.3); fL.rotation.set(0.5, 0, 0);
        delta = d;
        break;
      }
      case 'throw': {
        let ax = -0.9;
        if (t < 0.4) { const k = ease(t / 0.4); ax = lerp(-0.9, -2.6, k); twist = k * 0.7; }
        else if (t < 0.65) { const k = (t - 0.4) / 0.25; ax = lerp(-2.6, -0.4, k); twist = lerp(0.7, -0.5, k); lunge = k; }
        else { const k = ease(Math.min(1, (t - 0.65) / 0.35)); ax = lerp(-0.4, -0.9, k); twist = lerp(-0.5, 0, k); lunge = 1 - k; }
        aR.rotation.set(ax, 0, -0.1); fR.rotation.set(-0.6, 0, 0);
        aL.rotation.set(-0.5, 0, 0.2); fL.rotation.set(0.3, 0, 0);
        break;
      }
      case 'grenade':
        aR.rotation.set(-0.9, 0, -0.1); fR.rotation.set(-1.0, 0, 0);
        aL.rotation.set(-0.5, 0, 0.2); fL.rotation.set(0.3, 0, 0);
        break;
      case 'med': case 'use':
        aR.rotation.set(-1.1 + (kind === 'use' ? Math.sin(t * Math.PI * 4) * 0.1 : 0), 0, -0.1); fR.rotation.set(-1.3, 0, 0);
        aL.rotation.set(-1.0, 0, 0.5); fL.rotation.set(-1.0, 0, 0);
        break;
      default: // desarmado
        if (this.punchAnim > 0) {
          const ext = Math.sin(this.punchAnim * Math.PI) * 0.8;
          if (this.punchArm === 'R') {
            aR.rotation.set(-H - ext * 0.3, 0, 0); fR.rotation.set(ext * 0.2, 0, 0); aL.rotation.set(-1.1, 0, 0.3); fL.rotation.set(0.6, 0, 0);
          } else {
            aL.rotation.set(-H - ext * 0.3, 0, 0); fL.rotation.set(ext * 0.2, 0, 0); aR.rotation.set(-1.1, 0, -0.3); fR.rotation.set(0.6, 0, 0);
          }
        } else {
          aR.rotation.set(-1.0, 0, -0.3); fR.rotation.set(0.6, 0, 0);
          aL.rotation.set(-1.0, 0, 0.3); fL.rotation.set(0.6, 0, 0);
        }
    }
    this.torsoGroup.rotation.y = twist;
    this.pelvis.position.z = lunge * 0.3;
    this.weaponMount.rotation.x = H + delta;
  }

  /* ---------- update ---------- */
  update(dt) {
    if (this.isDead) return;

    if (this.adrenalineTime > 0) { this.adrenalineTime -= dt; document.getElementById('adrenaline-overlay').style.opacity = '1'; }
    else document.getElementById('adrenaline-overlay').style.opacity = '0';

    if (this.bileTime > 0) {
      this.bileTime -= dt;
      document.getElementById('bile-overlay').style.opacity = Math.min(1, this.bileTime / 3).toString();
    } else document.getElementById('bile-overlay').style.opacity = '0';

    if (this.tempHp > 0) { this.tempHp -= dt * 0.8; if (this.tempHp < 0) this.tempHp = 0; }

    let curSpeed = this.speed;
    if (this.adrenalineTime > 0) curSpeed *= 1.45;

    let dx = 0, dz = 0;
    if (this.jockeyTime > 0) {
      this.jockeyTime -= dt;
      dx = (Math.random() - 0.5) * 1.5;
      dz = (Math.random() - 0.5) * 1.5;
    } else {
      const k = Game.keys;
      if (k['KeyW'] || k['ArrowUp']) dz -= 1;
      if (k['KeyS'] || k['ArrowDown']) dz += 1;
      if (k['KeyA'] || k['ArrowLeft']) dx -= 1;
      if (k['KeyD'] || k['ArrowRight']) dx += 1;
    }

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      dx = (dx / len) * curSpeed * dt;
      dz = (dz / len) * curSpeed * dt;
      if (!Game.checkWallCollision(this.x + dx, this.z, 0.55)) this.x += dx;
      if (!Game.checkWallCollision(this.x, this.z + dz, 0.55)) this.z += dz;

      this.walkTime += dt * curSpeed * 2.2;
      const legAngle = Math.sin(this.walkTime) * 0.65;
      this.legL.rotation.x = legAngle;
      this.legR.rotation.x = -legAngle;
      this.shinL.rotation.x = Math.max(0, -legAngle * 0.6);
      this.shinR.rotation.x = Math.max(0, legAngle * 0.6);
      this.torsoGroup.rotation.x = 0.14;
    } else {
      this.legL.rotation.x *= 0.82; this.legR.rotation.x *= 0.82;
      this.shinL.rotation.x *= 0.82; this.shinR.rotation.x *= 0.82;
      this.torsoGroup.rotation.x = 0;
      this.torsoGroup.position.y = 0.2 + Math.sin(performance.now() * 0.003) * 0.02;
    }

    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = Math.atan2(Game.mouseWorldPos.x - this.x, Game.mouseWorldPos.z - this.z);

    if (this.recoilAnim > 0) this.recoilAnim = Math.max(0, this.recoilAnim - dt * 4);
    if (this.punchAnim > 0) this.punchAnim = Math.max(0, this.punchAnim - dt * 3.5);

    this.updateAction(dt);
    this.applyPose();

    if (this.isReloading) {
      const w = this.wdata();
      if (!w || w.kind === 'melee' || this.activeSlot !== this.reloadSlot) this.cancelReload();
      else {
        const dur = w.reload * (this.survivor.name === "ELLIS" ? 0.72 : 1);
        this.reloadProgress += dt / dur;
        document.getElementById('ui-reload-fill').style.width = Math.min(100, this.reloadProgress * 100) + '%';
        if (this.reloadProgress >= 1.0) this.completeReload();
      }
    }

    if (Game.mouseDown && !this.isReloading) this.triggerAttack();
    else if (Game.mouseClicked && (this.activeSlot === 4 || this.activeSlot === 5)) this.triggerAttack();
    if (Game.mouseRightDown) this.triggerShove();
  }

  /* ---------- ataque ---------- */
  triggerAttack() {
    const slot = this.activeSlot;
    if (slot === 4) { if (Game.mouseClicked) this.throwGrenade(this.grenadeType); return; }
    if (slot === 5) { if (Game.mouseClicked) this.useMedkit(); return; }

    const w = this.wdata();
    if (!w) { this.attackUnarmedPunch(); return; }
    if (this.action) return;

    const now = performance.now() / 1000;
    let rate = w.rate;
    if (this.survivor.name === "NICK") rate *= 0.82;
    if (this.adrenalineTime > 0) rate *= 0.7;
    if (now - this.lastFireTime < rate) return;
    this.lastFireTime = now;

    if (w.kind === 'melee') { this.attackMelee(w, rate); return; }

    const it = this.item();
    if (it.mag <= 0) {
      audio.playDryClick();
      if (this.ammo[w.ammo] > 0) this.startReload();
      else if (now - this.lastEmptyMsg > 1.5) { this.lastEmptyMsg = now; Game.showPopup("SEM MUNIÇÃO! VOLTE AO CENTRO", "#ff2a2a"); }
      return;
    }

    it.mag--;
    this.recoilAnim = 0.25;
    Game.cameraShake = Math.min(Game.cameraShake + 4, 15);
    if (w.sound === "pistol") audio.playPistol(); else if (w.sound === "shotgun") audio.playShotgun(); else audio.playRifle();

    const a = this.mesh.rotation.y;
    const fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
    Game.spawnMuzzleFlash(this.x + fx * w.muzzle + rx * 0.28, 1.6, this.z + fz * w.muzzle + rz * 0.28, a, w);
    Game.spawnCasing(this.x + rx * 0.3, 1.5, this.z + rz * 0.3, a);

    const origin = new THREE.Vector3(this.x + fx * 0.5, 1.6, this.z + fz * 0.5);
    const count = w.kind === 'shotgun' ? (w.pellets || 8) : 1;
    for (let i = 0; i < count; i++) {
      const sa = a + (Math.random() - 0.5) * w.spread * (w.kind === 'shotgun' ? 2 : 1);
      Game.shootBullet(origin, new THREE.Vector3(Math.sin(sa), 0, Math.cos(sa)), w, this.specialAmmoType);
    }

    if (this.specialAmmoShots > 0 && --this.specialAmmoShots === 0) this.specialAmmoType = "PADRÃO";
    Game.updateHUD();
  }

  attackUnarmedPunch() {
    const now = performance.now() / 1000;
    if (now - this.lastPunchTime < 0.32) return;
    this.lastPunchTime = now;
    this.punchAnim = 0.22;
    this.punchArm = (this.punchArm === 'R' ? 'L' : 'R');
    audio.playPunch();
    const dmg = this.survivor.name === "COACH" ? 38 : 28;
    const a = this.mesh.rotation.y, fwd = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    let hit = false;
    Game.zombies.slice().forEach(z => {
      if (z.isDead) return;
      const to = new THREE.Vector3(z.x - this.x, 0, z.z - this.z), dist = to.length();
      if (dist <= 1.9 + z.radius * 0.4 && fwd.dot(to.normalize()) > 0.4) {
        z.takeDamage(dmg, fwd.clone().multiplyScalar(10));
        z.stunTimer = Math.max(z.stunTimer, 0.4);
        Game.spawnBlood(z.x, z.z, 4);
        hit = true;
      }
    });
    if (hit) { Game.cameraShake = 4; Game.applyHitStop(0.045); }
  }

  /* Golpe: personagem -> movimento da arma -> IMPACTO (no meio do arco) -> zumbi reage */
  attackMelee(w, rate) {
    audio.playSwoosh();
    this.startAction('melee', Math.max(0.3, rate * 0.95), 0.46, () => this.meleeImpact(w));
  }

  meleeImpact(w) {
    if (this.isDead) return;
    const a = this.mesh.rotation.y, fx = Math.sin(a), fz = Math.cos(a);
    const coach = this.survivor.name === "COACH" ? 1.35 : 1;
    let hitAny = false;

    Game.zombies.slice().forEach(z => {
      if (z.isDead) return;
      const tx = z.x - this.x, tz = z.z - this.z, dist = Math.hypot(tx, tz);
      if (dist > w.range + z.radius * 0.6) return;
      if (dist > 0.01 && (tx * fx + tz * fz) / dist < 0.42) return;
      const knock = new THREE.Vector3(fx, 0, fz).multiplyScalar(w.knock * (z.type === 'tank' ? 0.2 : 1));
      if (w.instakill && z.type === 'common') z.takeDamage(99999, knock);
      else z.takeDamage((z.type === 'common' ? w.dmg : w.specialDmg) * coach, knock);
      z.stunTimer = Math.max(z.stunTimer, z.type === 'tank' ? 0.1 : 0.55);
      z.hitReact = 0.25;
      Game.spawnBlood(z.x, z.z, 7);
      Game.spawnImpact(z.x, 1.3, z.z, 0xffffff);
      hitAny = true;
    });

    Game.props.forEach(p => {
      if (!p.damageable || p.destroyed) return;
      const tx = p.x - this.x, tz = p.z - this.z, dist = Math.hypot(tx, tz);
      if (dist < w.range + Math.max(p.halfW, p.halfD) && (tx * fx + tz * fz) / (dist || 1) > 0.42) {
        Game.damageProp(p, w.dmg); hitAny = true;
      }
    });

    Game.spawnSlashArc(this.x, this.z, a, w.range + 0.4, 2.3, w.color);
    if (hitAny) { audio.playHit(); Game.cameraShake = 8; Game.applyHitStop(0.055); }
  }

  triggerShove() {
    const now = performance.now() / 1000;
    if (now - this.lastShoveTime < 0.6) return;
    this.lastShoveTime = now;
    audio.playShove();
    const a = this.mesh.rotation.y, fwd = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const knockPower = this.survivor.name === "COACH" ? 22 : 16;
    Game.zombies.slice().forEach(z => {
      if (z.isDead) return;
      const to = new THREE.Vector3(z.x - this.x, 0, z.z - this.z);
      if (to.length() < 3.2 && fwd.dot(to.clone().normalize()) > 0.3) {
        z.takeDamage(15, fwd.clone().multiplyScalar(z.type === 'tank' ? 4 : knockPower));
        z.stunTimer = z.type === 'tank' ? 0.2 : 1.2;
      }
    });
    Game.cameraShake = 4;
  }

  /* ---------- granadas / medkit ---------- */
  throwGrenade(type) {
    const def = GRENADES[type];
    const now = performance.now() / 1000;
    if (this.action || now - this.lastThrowTime < 0.6) return;
    if (this.grenades[type] <= 0) { Game.showPopup(`SEM ${def.name}`, "#ff2a2a"); return; }
    this.lastThrowTime = now;
    audio.playSwoosh();
    this.startAction('throw', 0.55, 0.52, () => {
      if (this.grenades[type] <= 0) return;
      this.grenades[type]--;
      const a = this.mesh.rotation.y;
      let tx = Game.mouseWorldPos.x - this.x, tz = Game.mouseWorldPos.z - this.z;
      const d = Math.hypot(tx, tz) || 1, range = Math.min(d, 24);
      tx = this.x + (tx / d) * range; tz = this.z + (tz / d) * range;
      Game.spawnGrenade(def, this.x + Math.sin(a) * 0.9, this.z + Math.cos(a) * 0.9, tx, tz);
      if (this.grenades[this.grenadeType] <= 0) this.cycleGrenade();
      if (this.activeSlot === 4 && this.totalGrenades() <= 0) this.fallbackSlot();
      Game.updateHUD();
    }, buildGrenadeModel(type));
  }

  useMedkit() {
    if (this.action || this.isDead) return;
    if (this.medkits <= 0) { Game.showPopup("SEM KIT MÉDICO", "#ff2a2a"); return; }
    if (this.hp >= this.maxHp) { Game.showPopup("VIDA CHEIA", "#aaaaaa"); return; }
    this.startAction('use', 0.8, 0.7, () => {
      this.hp = Math.min(this.maxHp, this.hp + 80);
      this.medkits--;
      audio.playPickup();
      Game.showPopup("VIDA RESTAURADA! +80 HP", "#39ff14");
      if (this.activeSlot === 5 && this.medkits <= 0) this.fallbackSlot();
      Game.updateHUD();
    }, buildMedkitModel());
  }

  throwHeldWeapon() {
    const now = performance.now() / 1000;
    const it = this.item(), w = this.wdata();
    if (!it || this.action || now - this.lastThrowTime < 0.4) return;
    this.lastThrowTime = now;
    this.cancelReload();
    const a = this.mesh.rotation.y;
    Game.spawnThrownWeapon(this.x, this.z, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), it.key, it.mag);
    this.slots[this.activeSlot] = null;
    this.fallbackSlot();
    Game.showPopup("ARMA ARREMESSADA!", "#ff007f");
    Game.updateHUD();
  }

  /* ---------- recarga (usa a reserva do TIPO de munição da arma) ---------- */
  startReload() {
    const w = this.wdata(), it = this.item();
    if (!w || w.kind === 'melee' || this.isReloading || this.action) return;
    if (it.mag >= w.clip || this.ammo[w.ammo] <= 0) return;
    this.isReloading = true;
    this.reloadProgress = 0;
    this.reloadSlot = this.activeSlot;
  }

  completeReload() {
    const it = this.slots[this.reloadSlot];
    this.cancelReload();
    if (!it) return;
    const w = WEAPONS[it.key];
    const amount = Math.min(w.clip - it.mag, this.ammo[w.ammo]);
    it.mag += amount;
    this.ammo[w.ammo] -= amount;
    Game.updateHUD();
  }

  addAmmo(type, n) {
    const max = AMMO[type].max;
    if (this.ammo[type] >= max) return false;
    this.ammo[type] = Math.min(max, this.ammo[type] + n);
    return true;
  }

  takeDamage(amount, source = "Zumbi") {
    if (this.isDead) return;
    Game.damageTaken += amount;
    Game.cameraShake = Math.min(Game.cameraShake + 12, 30);
    audio.playZombieHit();

    const ov = document.getElementById('damage-overlay');
    ov.style.opacity = '1';
    setTimeout(() => { ov.style.opacity = '0'; }, 150);

    if (this.tempHp > 0) {
      if (this.tempHp >= amount) { this.tempHp -= amount; amount = 0; }
      else { amount -= this.tempHp; this.tempHp = 0; }
    }
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.die(source); }
    Game.updateHUD();
  }

  die(cause) {
    if (this.defibs > 0) {
      this.defibs--;
      this.hp = 60;
      Game.showPopup("DESFIBRILADOR! VOCÊ REVIVEU!", "#00f3ff");
      audio.playSpecialAlert('horde');
      Game.cameraShake = 20;
      Game.updateHUD();
      return;
    }
    this.isDead = true;
    document.getElementById('death-cause').innerText = `DEVORADO POR: ${String(cause).toUpperCase()}`;
    Game.showModal('modal-death');
  }
}

/* ==========================================================================
   9. ZOMBIE CLASS
   ========================================================================== */
const _dirTmp = { x: 0, z: 0 };

class Zombie {
  constructor(x, z, type = 'common') {
    this.x = x; this.z = z;
    this.type = type;
    this.isDead = false;
    this.vx = 0; this.vz = 0;
    this.stunTimer = 0;
    this.hitReact = 0;
    this.attackCooldown = 0;
    this.specialStateTimer = 0;

    this.hp = 50; this.maxHp = 50;
    this.speed = 5.5 + Math.random() * 2.0;
    this.dmg = 12;
    this.radius = 0.55;
    this.scoreVal = 100;
    this.fireResistant = false;
    this.baseLean = 0.24;
    this.lureOff = null;

    this.walkTime = Math.random() * 10;
    this.variant = 'civilian';
    if (type === 'common') {
      const r = Math.random();
      if (r < 0.25) this.variant = 'police';
      else if (r < 0.5) this.variant = 'worker';
      else if (r < 0.65) this.variant = 'hazmat';
    }

    this.initTypeAttributes();
    this.colR = Math.min(this.radius, 1.1);
    this.mesh = this.buildMesh();
    this.mesh.position.set(x, 0, z);
    Game.scene.add(this.mesh);
  }

  initTypeAttributes() {
    const set = (hp, speed, dmg, score) => { this.hp = hp; this.speed = speed; this.dmg = dmg; this.scoreVal = score; };
    switch (this.type) {
      case 'smoker': set(250, 5.0, 15, 600); break;
      case 'hunter': set(260, 7.5, 24, 700); this.radius = 0.75; this.baseLean = 0.95; break;
      case 'boomer': set(180, 3.8, 5, 500); break;
      case 'spitter': set(200, 5.8, 10, 650); break;
      case 'charger': set(600, 4.8, 35, 900); this.radius = 1.15; this.baseLean = 0.15; break;
      case 'jockey': set(220, 8.2, 12, 550); break;
      case 'witch': set(1000, 1.0, 999, 2500); this.witchAnger = 0; this.isWitchEnraged = false; break;
      case 'tank': set(2500, 5.2, 45, 5000); this.radius = 1.4; break;
      default:
        if (this.variant === 'hazmat') this.fireResistant = true;
        if (this.variant === 'police') this.hp = 85;
    }
    this.maxHp = this.hp;
  }

  /* ------------------------------------------------------------------ */
  buildMesh() {
    if (this.type === 'tank') return this.buildTank();
    if (this.type === 'boomer') return this.buildBoomer();
    if (this.type === 'hunter') return this.buildHunter();
    if (this.type === 'charger') return this.buildCharger();
    return this.buildCommon();
  }

  buildCommon() {
    const L = c => SHARED.lambert(c);
    const group = new THREE.Group();
    let skinCol = 0x5a7a5a, clothCol = 0x334455, pantsCol = 0x222233;
    if (this.variant === 'police') { clothCol = 0x1b2631; pantsCol = 0x151d24; skinCol = 0x6e826e; }
    else if (this.variant === 'worker') { clothCol = 0xd35400; pantsCol = 0x3e2723; }
    else if (this.variant === 'hazmat') { clothCol = 0xf4d03f; pantsCol = 0xf4d03f; skinCol = 0xf4d03f; }
    else if (this.type === 'smoker') { clothCol = 0x5b2c6f; skinCol = 0x4a5d4e; }
    else if (this.type === 'spitter') { clothCol = 0x1e8449; skinCol = 0x52be80; }
    else if (this.type === 'witch') { clothCol = 0xecf0f1; skinCol = 0xd5dbdb; }
    const clothMat = L(clothCol), pantsMat = L(pantsCol), skinMat = L(skinCol);

    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.85;
    this.torsoGroup.rotation.x = this.baseLean;
    group.add(this.torsoGroup);
    part(this.torsoGroup, SHARED.geos.torso, clothMat, 0, 0.36, 0);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.92;
    this.torsoGroup.add(this.headGroup);
    part(this.headGroup, SHARED.geos.head, skinMat);
    part(this.headGroup, SHARED.box(0.08, 0.08, 0.08), SHARED.mats.zombieEyes, 0.12, 0.02, 0.25);
    part(this.headGroup, SHARED.box(0.08, 0.08, 0.08), SHARED.mats.zombieEyes, -0.12, 0.02, 0.25);

    this.armL = new THREE.Group(); this.armL.position.set(-0.4, 0.65, 0); this.torsoGroup.add(this.armL);
    part(this.armL, SHARED.geos.upperLimb, clothMat, 0, -0.22, 0);
    part(this.armL, SHARED.geos.lowerLimb, skinMat, 0, -0.55, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.4, 0.65, 0); this.torsoGroup.add(this.armR);
    part(this.armR, SHARED.geos.upperLimb, clothMat, 0, -0.22, 0);
    part(this.armR, SHARED.geos.lowerLimb, skinMat, 0, -0.55, 0);
    this.armL.rotation.x = -1.3; this.armR.rotation.x = -1.3;

    this.legL = new THREE.Group(); this.legL.position.set(-0.2, 0.75, 0); group.add(this.legL);
    part(this.legL, SHARED.geos.lowerLimb, pantsMat, 0, -0.35, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.2, 0.75, 0); group.add(this.legR);
    part(this.legR, SHARED.geos.lowerLimb, pantsMat, 0, -0.35, 0);

    if (this.type === 'witch') part(this.headGroup, SHARED.box(0.65, 0.7, 0.4), L(0xffffff), 0, 0.1, 0.1);
    else if (this.type === 'jockey') group.scale.set(0.7, 0.65, 0.7);
    else if (this.type === 'smoker') group.scale.set(0.85, 1.25, 0.85);
    return group;
  }

  /* HUNTER: baixo, largo e horizontal, sempre agachado, moletom azul, garras */
  buildHunter() {
    const L = c => SHARED.lambert(c);
    const group = new THREE.Group();
    const hood = L(0x1f5fbf), hoodD = L(0x143f80), pants = L(0x16202c), skin = L(0x6f8a78), claw = L(0xe0e6e8);
    const yEye = SHARED.basic(0xffe600);

    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.72;
    this.torsoGroup.rotation.x = this.baseLean;
    group.add(this.torsoGroup);
    part(this.torsoGroup, SHARED.box(1.15, 0.5, 0.62), hood, 0, 0.25, 0);          // peito largo
    part(this.torsoGroup, SHARED.box(0.9, 0.32, 0.5), hoodD, 0, 0.55, -0.12);      // corcunda
    for (let i = -1; i <= 1; i++) part(this.torsoGroup, SHARED.box(0.1, 0.22, 0.1), claw, i * 0.28, 0.76, -0.2, 0.5); // espinhos

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.62, 0.22);
    this.torsoGroup.add(this.headGroup);
    part(this.headGroup, SHARED.geos.head, skin);
    part(this.headGroup, SHARED.box(0.62, 0.42, 0.56), hoodD, 0, 0.1, -0.06);      // capuz
    part(this.headGroup, SHARED.box(0.1, 0.07, 0.08), yEye, 0.12, 0.0, 0.26);
    part(this.headGroup, SHARED.box(0.1, 0.07, 0.08), yEye, -0.12, 0.0, 0.26);
    part(this.headGroup, SHARED.box(0.3, 0.07, 0.1), claw, 0, -0.14, 0.24);        // dentes

    const mkArm = (sx) => {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.66, 0.42, 0);
      this.torsoGroup.add(arm);
      part(arm, SHARED.box(0.24, 0.8, 0.24), hoodD, 0, -0.4, 0);
      part(arm, SHARED.box(0.2, 0.7, 0.2), skin, 0, -1.05, 0);
      for (let i = -1; i <= 1; i++) part(arm, SHARED.box(0.04, 0.04, 0.3), claw, i * 0.07, -1.45, 0.1);
      return arm;
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);
    this.armL.rotation.x = this.armR.rotation.x = -(this.baseLean + 0.35);

    const mkLeg = (sx) => {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.3, 0.72, 0);
      group.add(leg);
      part(leg, SHARED.box(0.28, 0.55, 0.28), pants, 0, -0.27, 0);
      const shin = new THREE.Group();
      shin.position.y = -0.55;
      leg.add(shin);
      part(shin, SHARED.box(0.24, 0.55, 0.24), pants, 0, -0.27, 0);
      part(shin, SHARED.box(0.26, 0.12, 0.4), L(0x111111), 0, -0.56, 0.1);
      shin.rotation.x = 1.7;
      return leg;
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);
    this.legL.rotation.x = this.legR.rotation.x = -1.0;
    return group;
  }

  /* ESMAGADOR (charger): enorme, braço direito GIGANTE quadrado, esquerdo atrofiado */
  buildCharger() {
    const L = c => SHARED.lambert(c);
    const group = new THREE.Group();
    const shirt = L(0x3a2b2b), skin = L(0x6d7f5f), flesh = L(0xa8321c), fleshD = L(0x7d2414), bone = L(0xe0d8c0), pants = L(0x232a33);

    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 1.35;
    this.torsoGroup.rotation.x = this.baseLean;
    group.add(this.torsoGroup);
    part(this.torsoGroup, SHARED.box(1.5, 1.5, 0.95), shirt, 0.12, 0.75, 0);
    part(this.torsoGroup, SHARED.box(1.1, 0.5, 0.6), flesh, 0.45, 1.2, 0.1);       // ombro musculoso do lado do braço

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(-0.2, 1.75, 0.2);
    this.torsoGroup.add(this.headGroup);
    part(this.headGroup, SHARED.box(0.5, 0.5, 0.5), skin);
    part(this.headGroup, SHARED.box(0.1, 0.08, 0.08), SHARED.mats.zombieEyes, 0.12, 0.05, 0.26);
    part(this.headGroup, SHARED.box(0.1, 0.08, 0.08), SHARED.mats.zombieEyes, -0.12, 0.05, 0.26);

    // BRAÇO GIGANTE (direito)
    this.armR = new THREE.Group();
    this.armR.position.set(1.15, 1.3, 0);
    this.torsoGroup.add(this.armR);
    part(this.armR, SHARED.box(1.2, 1.6, 1.2), flesh, 0.1, -0.8, 0);
    part(this.armR, SHARED.box(1.55, 1.4, 1.4), fleshD, 0.1, -2.2, 0.05);          // punho-bloco
    for (let i = -1; i <= 1; i++) part(this.armR, SHARED.box(0.22, 0.3, 0.22), bone, 0.1 + i * 0.45, -2.95, 0.55);  // nós dos dedos
    part(this.armR, SHARED.box(0.18, 0.5, 0.18), bone, 0.75, -0.5, 0.2, 0.3);

    // braço pequeno (esquerdo)
    this.armL = new THREE.Group();
    this.armL.position.set(-0.8, 1.3, 0);
    this.torsoGroup.add(this.armL);
    part(this.armL, SHARED.box(0.26, 1.2, 0.26), skin, 0, -0.6, 0);
    this.armL.rotation.x = -0.5;

    const mkLeg = (sx) => {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.42, 1.35, 0);
      group.add(leg);
      part(leg, SHARED.box(0.6, 1.35, 0.6), pants, 0, -0.67, 0);
      part(leg, SHARED.box(0.66, 0.16, 0.9), L(0x111111), 0, -1.3, 0.12);
      return leg;
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);
    return group;
  }

  buildTank() {
    const group = new THREE.Group();
    const tankMat = SHARED.lambert(0x8a2323), skinMat = SHARED.lambert(0x551111);
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 1.3;
    group.add(this.torsoGroup);
    part(this.torsoGroup, SHARED.geos.tankTorso, tankMat, 0, 0.8, 0);
    part(this.torsoGroup, SHARED.box(0.8, 0.7, 0.8), skinMat, 0, 1.8, 0.3);
    this.armR = new THREE.Group(); this.armR.position.set(1.2, 1.4, 0); this.torsoGroup.add(this.armR);
    part(this.armR, SHARED.box(0.7, 2.0, 0.7), skinMat, 0, -0.9, 0);
    this.armL = new THREE.Group(); this.armL.position.set(-1.2, 1.4, 0); this.torsoGroup.add(this.armL);
    part(this.armL, SHARED.box(0.7, 2.0, 0.7), skinMat, 0, -0.9, 0);
    this.legL = new THREE.Group(); this.legL.position.set(-0.6, 1.0, 0); group.add(this.legL);
    part(this.legL, SHARED.box(0.6, 1.0, 0.6), tankMat, 0, -0.5, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.6, 1.0, 0); group.add(this.legR);
    part(this.legR, SHARED.box(0.6, 1.0, 0.6), tankMat, 0, -0.5, 0);
    return group;
  }

  buildBoomer() {
    const group = new THREE.Group();
    const fat = SHARED.lambert(0x3d7028);
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 1.0;
    group.add(this.torsoGroup);
    part(this.torsoGroup, SHARED.geos.boomerBelly, fat, 0, 0.2, 0.2);
    part(this.torsoGroup, SHARED.box(0.5, 0.5, 0.5), fat, 0, 0.95, 0.1);
    this.armL = new THREE.Group(); this.armL.position.set(-0.7, 0.6, 0); this.torsoGroup.add(this.armL);
    part(this.armL, SHARED.box(0.3, 0.8, 0.3), fat, 0, -0.4, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.7, 0.6, 0); this.torsoGroup.add(this.armR);
    part(this.armR, SHARED.box(0.3, 0.8, 0.3), fat, 0, -0.4, 0);
    this.legL = new THREE.Group(); this.legL.position.set(-0.3, 0.8, 0); group.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.3, 0.8, 0); group.add(this.legR);
    return group;
  }

  /* ------------------------------------------------------------------ */
  moveBy(mx, mz) {
    const r = this.colR;
    if (Game.checkWallCollision(this.x, this.z, r)) { this.x += mx; this.z += mz; return; } // escapa de dentro de parede
    if (!Game.checkWallCollision(this.x + mx, this.z, r)) this.x += mx;
    if (!Game.checkWallCollision(this.x, this.z + mz, r)) this.z += mz;
  }

  /* Vai até (tx,tz): linha reta se houver visão livre, senão segue o campo de navegação */
  steer(dt, tx, tz, field, mul = 1) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    let ux = dx / d, uz = dz / d;
    if (d > 3 && field && !Nav.lineClear(Game.map, this.x, this.z, tx, tz)) {
      if (Nav.dir(Game.map, field, this.x, this.z, _dirTmp)) { ux = _dirTmp.x; uz = _dirTmp.z; }
    }
    this.moveBy(ux * this.speed * mul * dt, uz * this.speed * mul * dt);
    this.mesh.rotation.y = Math.atan2(ux, uz);
  }

  animWalk(moving) {
    if (!this.legL) return;
    const s = Math.sin(this.walkTime);
    if (this.type === 'hunter') {
      this.legL.rotation.x = -1.0 + s * 0.5; this.legR.rotation.x = -1.0 - s * 0.5;
      this.torsoGroup.rotation.x = this.baseLean + Math.abs(s) * 0.12;
    } else {
      const k = moving ? 0.65 : 0.1;
      this.legL.rotation.x = s * k; this.legR.rotation.x = -s * k;
      if (this.armL && this.armR && this.type !== 'tank' && this.type !== 'charger' && this.type !== 'boomer') {
        this.armL.rotation.x = -1.3 + Math.sin(this.walkTime * 0.8) * 0.25;
        this.armR.rotation.x = -1.3 - Math.sin(this.walkTime * 0.8) * 0.25;
      }
      if (this.type === 'charger' && !this.isCharging) this.armR.rotation.x = Math.sin(this.walkTime * 0.5) * 0.06;
    }
  }

  update(dt) {
    if (this.isDead || !Game.player) return;

    if (this.vx !== 0 || this.vz !== 0) {
      this.moveBy(this.vx * dt, this.vz * dt);
      const f = Math.pow(0.88, dt * 60);
      this.vx *= f; this.vz *= f;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      if (Math.abs(this.vz) < 0.1) this.vz = 0;
    }

    if (this.hitReact > 0) {
      this.hitReact -= dt;
      this.torsoGroup.rotation.x = this.baseLean - Math.max(0, this.hitReact) * 3.2; // tomba para trás
    } else if (this.type !== 'hunter') this.torsoGroup.rotation.x = this.baseLean;

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.mesh.position.set(this.x, 0, this.z);
      return;
    }

    const p = Game.player;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz) || 0.001;
    this.walkTime += dt * this.speed * 2.0;

    switch (this.type) {
      case 'witch': this.updateWitch(dt, dist, dx, dz); break;
      case 'smoker': this.updateSmoker(dt, dist, dx, dz); break;
      case 'spitter': this.updateSpitter(dt, dist, dx, dz); break;
      case 'charger': this.updateCharger(dt, dist, dx, dz); break;
      case 'hunter': this.updateHunter(dt, dist, dx, dz); break;
      case 'tank': this.updateTank(dt, dist, dx, dz); break;
      case 'common': this.updateCommon(dt, dist); break;
      default: // boomer, jockey
        this.animWalk(true);
        if (dist > 1.1) this.steer(dt, p.x, p.z, Game.nav.field); else this.attackPlayer(dt);
        this.mesh.position.set(this.x, 0, this.z);
    }
  }

  updateCommon(dt, dist) {
    const p = Game.player;
    const lure = Game.findLure(this);
    if (lure) {
      if (!this.lureOff) {
        const a = Math.random() * 6.283, r = Math.random() * (lure.type === 'G' ? 2.6 : 3.4);
        this.lureOff = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
      const tx = lure.x + this.lureOff.x, tz = lure.z + this.lureOff.z;
      if (Math.hypot(tx - this.x, tz - this.z) > 0.7) { this.animWalk(true); this.steer(dt, tx, tz, lure.field, 1.05); }
      else { this.animWalk(false); this.mesh.rotation.y = Math.atan2(lure.x - this.x, lure.z - this.z); }
    } else {
      this.lureOff = null;
      this.animWalk(true);
      if (dist > 1.1) this.steer(dt, p.x, p.z, Game.nav.field); else { this.mesh.rotation.y = Math.atan2(p.x - this.x, p.z - this.z); this.attackPlayer(dt); }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  attackPlayer(dt) {
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0) {
      this.attackCooldown = 0.8;
      Game.player.takeDamage(this.dmg, this.type);
      if (this.type === 'boomer') this.explodeBoomer();
      else if (this.type === 'jockey') {
        if (Game.player.survivor.name !== "ROCHELLE") { Game.player.jockeyTime = 3.5; Game.showPopup("JOCKEY NA SUA CABEÇA!", "#00f3ff"); }
      }
    }
  }

  updateWitch(dt, dist) {
    this.animWalk(this.isWitchEnraged);
    if (!this.isWitchEnraged) {
      if (dist < 6.0) this.witchAnger += dt * 35;
      if (this.witchAnger >= 100) this.enrageWitch();
    } else {
      const p = Game.player;
      this.steer(dt, p.x, p.z, Game.nav.field);
      if (dist < 1.3) Game.player.takeDamage(999, "Witch (Golpe Mortal)");
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  enrageWitch() {
    this.isWitchEnraged = true;
    this.speed = 14.0;
    audio.playSpecialAlert('witch');
    Game.showPopup("WITCH FOI ASSUSTADA!", "#ff0000");
  }

  updateSmoker(dt, dist, dx, dz) {
    this.animWalk(true);
    const p = Game.player;
    if (dist > 15) this.steer(dt, p.x, p.z, Game.nav.field);
    else if (dist < 8) { this.moveBy(-(dx / dist) * this.speed * dt, -(dz / dist) * this.speed * dt); this.mesh.rotation.y = Math.atan2(dx, dz); }
    else {
      this.mesh.rotation.y = Math.atan2(dx, dz);
      this.specialStateTimer += dt;
      if (this.specialStateTimer > 2.0) {
        this.specialStateTimer = 0;
        audio.playSpecialAlert('smoker');
        Game.showPopup("SMOKER TE PUXOU!", "#b026ff");
        const nx = p.x - (dx / dist) * 4.0, nz = p.z - (dz / dist) * 4.0;
        if (!Game.checkWallCollision(nx, nz, 0.55)) { p.x = nx; p.z = nz; }
        p.takeDamage(12, "Smoker Tongue");
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  updateSpitter(dt, dist, dx, dz) {
    this.animWalk(true);
    const p = Game.player;
    this.specialStateTimer += dt;
    if (this.specialStateTimer >= 3.5 && dist < 18) {
      this.specialStateTimer = 0;
      audio.playBileSplash();
      Game.spawnAcidPool(p.x, p.z);
      Game.showPopup("ÁCIDO DA SPITTER!", "#39ff14");
    }
    if (dist > 10) this.steer(dt, p.x, p.z, Game.nav.field);
    else this.mesh.rotation.y = Math.atan2(dx, dz);
    this.mesh.position.set(this.x, 0, this.z);
  }

  /* ESMAGADOR: investida de aríete com o braço gigante à frente */
  updateCharger(dt, dist, dx, dz) {
    const p = Game.player;
    this.specialStateTimer += dt;
    if (this.isCharging) {
      const ox = this.x, oz = this.z;
      this.moveBy(this.chargeDir.x * 16.0 * dt, this.chargeDir.z * 16.0 * dt);
      this.armR.rotation.x = -1.35;
      this.torsoGroup.rotation.x = 0.55;
      this.walkTime += dt * 12;
      this.legL.rotation.x = Math.sin(this.walkTime) * 0.7; this.legR.rotation.x = -this.legL.rotation.x;
      if (dist < 2.0) {
        p.takeDamage(40, "Esmagador");
        Game.cameraShake = 20;
        this.isCharging = false;
        this.stunTimer = 0.8;
      } else if (Math.hypot(this.x - ox, this.z - oz) < 16.0 * dt * 0.5) {
        this.isCharging = false;           // bateu na parede
        this.stunTimer = 1.5;
        Game.cameraShake = 15;
      }
      this.chargeT -= dt;
      if (this.chargeT <= 0) this.isCharging = false;
      if (!this.isCharging) { this.armR.rotation.x = 0; this.torsoGroup.rotation.x = this.baseLean; }
    } else {
      this.animWalk(true);
      if (this.specialStateTimer > 3.0 && dist < 20 && dist > 4 && Nav.lineClear(Game.map, this.x, this.z, p.x, p.z)) {
        this.specialStateTimer = 0;
        this.isCharging = true;
        this.chargeT = 1.1;
        this.chargeDir = new THREE.Vector3(dx / dist, 0, dz / dist);
        this.mesh.rotation.y = Math.atan2(dx, dz);
        audio.playSpecialAlert('charger');
        Game.showPopup("ESMAGADOR INVESTINDO!", "#ff8c00");
      } else if (dist > 1.8) this.steer(dt, p.x, p.z, Game.nav.field);
      else { this.attackPlayer(dt); }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  /* HUNTER: avança agachado e salta em dash (arco no ar, corpo esticado) */
  updateHunter(dt, dist, dx, dz) {
    const p = Game.player;
    this.specialStateTimer += dt;
    if (this.isPouncing) {
      const ox = this.x, oz = this.z;
      this.moveBy(this.pounceDir.x * 20.0 * dt, this.pounceDir.z * 20.0 * dt);
      this.pounceTimer -= dt;
      const k = 1 - Math.max(0, this.pounceTimer) / 0.7;
      this.mesh.position.set(this.x, Math.sin(k * Math.PI) * 1.5, this.z);
      this.torsoGroup.rotation.x = 1.5;
      this.armL.rotation.x = this.armR.rotation.x = -2.6;
      this.legL.rotation.x = this.legR.rotation.x = 0.7;
      if (dist < 1.4) {
        p.takeDamage(30, "Hunter Pin");
        this.isPouncing = false;
        this.stunTimer = 0.8;
        Game.showPopup("HUNTER TE PRENDEU!", "#00f3ff");
      } else if (Math.hypot(this.x - ox, this.z - oz) < 20.0 * dt * 0.4) this.isPouncing = false;
      if (this.pounceTimer <= 0) this.isPouncing = false;
      if (!this.isPouncing) { this.armL.rotation.x = this.armR.rotation.x = -(this.baseLean + 0.35); this.mesh.position.y = 0; }
    } else {
      this.animWalk(true);
      this.mesh.position.set(this.x, 0, this.z);
      if (this.specialStateTimer > 3.0 && dist < 16 && dist > 3 && Nav.lineClear(Game.map, this.x, this.z, p.x, p.z)) {
        this.specialStateTimer = 0;
        this.isPouncing = true;
        this.pounceTimer = 0.7;
        this.pounceDir = new THREE.Vector3(dx / dist, 0, dz / dist);
        this.mesh.rotation.y = Math.atan2(dx, dz);
        audio.playSpecialAlert('hunter');
      } else if (dist > 1.4) this.steer(dt, p.x, p.z, Game.nav.field);
      else this.attackPlayer(dt);
    }
  }

  updateTank(dt, dist, dx, dz) {
    const p = Game.player;
    this.animWalk(true);
    this.specialStateTimer += dt;
    Game.cameraShake = Math.max(Game.cameraShake, 1.2);

    if (this.specialStateTimer > 4.5 && dist > 8 && dist < 30) {
      this.specialStateTimer = 0;
      audio.playExplosion();
      Game.showPopup("TANK ARREMESSOU UMA ROCHA!", "#ff2a2a");
      const origin = new THREE.Vector3(this.x, 2.0, this.z);
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      mesh.position.copy(origin);
      Game.scene.add(mesh);
      Game.projectiles.push({ type: 'tank_rock', pos: origin, dir: new THREE.Vector3(dx / dist, 0, dz / dist), speed: 18, timer: 1.5, mesh });
    }
    if (dist > 1.8) this.steer(dt, p.x, p.z, Game.nav.field);
    else { this.attackPlayer(dt); Game.cameraShake = 18; }
    this.mesh.position.set(this.x, 0, this.z);
  }

  explodeBoomer() {
    if (this.isDead) return;
    audio.playExplosion();
    audio.playBileSplash();
    Game.spawnAcidPool(this.x, this.z);
    if (Math.hypot(Game.player.x - this.x, Game.player.z - this.z) < 7.0) {
      Game.player.bileTime = 8.0;
      Game.showPopup("COBERTO DE BILE!", "#39ff14");
      Game.triggerDirectorEvent("HORDE INCOMING!");
    }
    this.die(true);
  }

  takeDamage(amount, knockVec = null, isExplosive = false) {
    if (this.isDead) return;
    this.hp -= amount;
    if (knockVec) { this.vx += knockVec.x; this.vz += knockVec.z; this.hitReact = Math.max(this.hitReact, 0.15); }
    if (this.type === 'witch' && !this.isWitchEnraged) { this.witchAnger = 100; this.enrageWitch(); }
    if (this.hp <= 0) {
      if (this.type === 'boomer') this.explodeBoomer();
      else this.die(isExplosive);
    }
  }

  die(isExplosive = false) {
    if (this.isDead) return;
    this.isDead = true;
    const idx = Game.zombies.indexOf(this);
    if (idx !== -1) Game.zombies.splice(idx, 1);

    Game.kills++;
    Game.registerComboKill(this.scoreVal);
    Game.spawnBlood(this.x, this.z, isExplosive ? 16 : 10);
    this.mesh.position.y = 0;

    if (isExplosive) {
      Game.spawnGibs(this.x, 1.0, this.z);
      Game.scene.remove(this.mesh);
      disposeHierarchy(this.mesh);
    } else {
      Game.corpses.push({ mesh: this.mesh, timer: 5.0, fallProgress: 0, rotAxis: (Math.random() > 0.5 ? 'x' : 'z'), rotDir: (Math.random() > 0.5 ? 1 : -1) });
    }
    Game.dropLoot(this.x, this.z, this.type !== 'common');
  }
}

/* ==========================================================================
   10. DIRECTOR AI (PACING, HORDAS, ESPECIAIS & TANK)
   ========================================================================== */
Game.pickSpawnPoint = function (minD, maxD) {
  const cells = this.map.spawnCells, p = this.player;
  if (!cells.length) return { x: p.x, z: p.z + 20 };
  let best = null, bestE = 1e9;
  for (let k = 0; k < 14; k++) {
    const c = cells[Math.floor(Math.random() * cells.length)];
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d >= minD && d <= maxD) return c;
    const e = Math.abs(d - (minD + maxD) / 2);
    if (e < bestE) { bestE = e; best = c; }
  }
  return best;
};

Game.updateDirector = function (dt) {
  const d = this.director;
  d.timer += dt;
  d.specialTimer += dt;

  if (d.state === "PEACE") {
    if (d.timer > 16.0) { d.timer = 0; this.triggerDirectorEvent("HORDE APPROACHING!"); }
  } else if (d.state === "HORDE") {
    if (Math.random() < 0.35 && this.zombies.length < 35) this.spawnHordeZombie();
    if (d.timer > 14.0) {
      d.state = "PEACE"; d.timer = 0;
      audio.isHorde = false;
      document.getElementById('ui-director-banner').classList.remove('active');
    }
  }

  if (d.specialTimer > 18.0) {
    d.specialTimer = 0;
    this.spawnSpecialInfected(['smoker', 'hunter', 'boomer', 'spitter', 'charger', 'jockey'][Math.floor(Math.random() * 6)]);
  }

  if (!d.tankSpawned && (this.stageClock > 90.0 || this.kills >= 65)) {
    d.tankSpawned = true;
    this.spawnSpecialInfected('tank');
  }
};

Game.triggerDirectorEvent = function (text) {
  this.director.state = "HORDE";
  this.director.timer = 0;
  audio.isHorde = true;
  const banner = document.getElementById('ui-director-banner');
  banner.innerText = text;
  banner.classList.add('active');
  audio.playSpecialAlert('horde');
};

Game.spawnHordeZombie = function () {
  if (!this.player) return;
  const c = this.pickSpawnPoint(26, 60);
  this.zombies.push(new Zombie(c.x, c.z, 'common'));
};

Game.spawnZombie = function (x, z, type = 'common') { this.zombies.push(new Zombie(x, z, type)); };

Game.spawnSpecialInfected = function (type) {
  if (!this.player) return;
  const c = this.pickSpawnPoint(24, 50);
  audio.playSpecialAlert(type);
  if (type === 'tank') { audio.isTank = true; this.triggerDirectorEvent("TANK DETECTED!"); }
  else this.showPopup(`${type === 'charger' ? 'ESMAGADOR' : type.toUpperCase()} DETECTADO!`, "#ff007f");
  this.zombies.push(new Zombie(c.x, c.z, type));
};

/* Zumbis não se empilham (visual de multidão ao redor da granada) */
Game.separateZombies = function () {
  const zs = this.zombies;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j];
      const dx = b.x - a.x, dz = b.z - a.z, min = (a.radius + b.radius) * 0.8;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01, push = (min - d) * 0.5;
      const wa = a.type === 'tank' || a.isCharging || a.isPouncing ? 0 : 1;
      const wb = b.type === 'tank' || b.isCharging || b.isPouncing ? 0 : 1;
      if (wa) a.moveBy(-dx / d * push * (wb ? 1 : 2), -dz / d * push * (wb ? 1 : 2));
      if (wb) b.moveBy(dx / d * push * (wa ? 1 : 2), dz / d * push * (wa ? 1 : 2));
    }
  }
};

/* ==========================================================================
   11. COMBATE: PROJÉTEIS VISÍVEIS, EFEITOS, GRANADAS, EXPLOSÕES
   ========================================================================== */
Game.damageProp = function (prop, dmg) {
  if (prop.destroyed) return;
  prop.hp -= dmg;
  if (prop.type === 'car' && prop.hasAlarm && !prop.alarmTriggered) {
    prop.alarmTriggered = true;
    prop.alarmTime = 12;
    audio.playSpecialAlert('horde');
    this.triggerDirectorEvent("CAR ALARM TRIGGERED!");
    this.showPopup("ALARME DE CARRO DISPARADO!", "#ff0000");
  } else if (prop.hp <= 0) {
    prop.destroyed = true;
    this.scene.remove(prop.mesh);
    disposeHierarchy(prop.mesh);
    if (prop.type === 'barrel') this.spawnExplosion(prop.x, prop.z, 160);
    else if (prop.type === 'gas_can') this.spawnFirePool(prop.x, prop.z);
    else if (prop.type === 'propane') this.spawnExplosion(prop.x, prop.z, 220);
    else if (prop.type === 'car') this.spawnExplosion(prop.x, prop.z, 180);
  }
};

/* ---------- efeitos temporizados genéricos ---------- */
Game.addEffect = function (mesh, dur, onUpdate) {
  if (this.effects.length > 300) { const o = this.effects.shift(); this.scene.remove(o.mesh); disposeHierarchy(o.mesh); }
  this.scene.add(mesh);
  this.effects.push({ mesh, t: 0, dur, onUpdate });
};

Game.updateEffects = function (dt) {
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    e.t += dt;
    const k = Math.min(1, e.t / e.dur);
    e.onUpdate(k, e.mesh);
    if (k >= 1) { this.scene.remove(e.mesh); disposeHierarchy(e.mesh); this.effects.splice(i, 1); }
  }
};

Game.spawnMuzzleFlash = function (x, y, z, angle, w) {
  const g = new THREE.Group();
  const len = (w.kind === 'shotgun' ? 1.5 : (w.dmg > 80 ? 1.3 : 0.9)) * (0.8 + Math.random() * 0.4);
  const cone = part(g, SHARED.geos.cone, SHARED.basic(0xffc94a, { add: true }), 0, 0, len / 2, Math.PI / 2);
  cone.scale.set(w.kind === 'shotgun' ? 2 : 1.2, len, w.kind === 'shotgun' ? 2 : 1.2);
  const core = part(g, SHARED.geos.unitSphere, SHARED.basic(0xffffff, { add: true }), 0, 0, 0.05);
  core.scale.setScalar(0.24);
  g.position.set(x, y, z);
  g.rotation.y = angle;
  this.addEffect(g, 0.06, (k, m) => m.scale.setScalar(1 - k * 0.6));
};

Game.spawnImpact = function (x, y, z, color) {
  for (let i = 0; i < 4; i++) this.spawnParticle(x, y, z, color, 0.12, 0.28, 7, 4);
  const f = new THREE.Mesh(SHARED.geos.unitSphere, SHARED.basic(color, { add: true }));
  f.position.set(x, y, z);
  this.addEffect(f, 0.1, (k, m) => m.scale.setScalar(0.4 * (1 - k)));
};

/* Arco do golpe: mostra a ÁREA atingida e varre da direita para a esquerda */
Game.spawnSlashArc = function (x, z, angle, range, arc, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(range * 0.3, range, 22, 1, -arc / 2, arc), mat);
  ring.rotation.x = -Math.PI / 2;
  const grp = new THREE.Group();
  grp.add(ring);
  grp.position.set(x, 1.1, z);
  grp.rotation.y = angle - Math.PI / 2;
  const base = grp.rotation.y;
  this.addEffect(grp, 0.22, (k, m) => {
    m.rotation.y = base + 0.45 - 0.9 * k;
    mat.opacity = 0.8 * (1 - k);
    m.scale.setScalar(0.85 + 0.3 * k);
  });
};

Game.spawnExplosionVisual = function (x, z, radius, big) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const ball = new THREE.Mesh(SHARED.geos.unitSphere, mat);
  ball.position.set(x, 1.2, z);
  this.addEffect(ball, 0.45, (k, m) => { m.scale.setScalar(0.5 + radius * 0.45 * Math.sqrt(k)); mat.opacity = 0.9 * (1 - k); });

  const mat2 = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(SHARED.geos.ring, mat2);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.15, z);
  this.addEffect(ring, 0.5, (k, m) => { m.scale.setScalar(0.5 + radius * k); mat2.opacity = 0.8 * (1 - k); });

  for (let i = 0; i < (big ? 18 : 10); i++) this.spawnParticle(x, 1, z, i % 2 ? 0xffa500 : 0xff3300, 0.3, 0.6, 14, 9);
};

/* ---------- balas com projétil visível ---------- */
Game.shootBullet = function (origin, dir, w, specialAmmo) {
  const mesh = new THREE.Mesh(SHARED.geos.tracer, SHARED.basic(w.tracer, { add: true }));
  const len = w.kind === 'shotgun' ? w.tlen * 0.6 : w.tlen;
  mesh.scale.z = len;
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  mesh.visible = false;
  this.scene.add(mesh);
  this.bullets.push({
    pos: origin.clone(), dir: dir.clone(), dmg: w.dmg, speed: w.speed,
    maxDist: w.range + w.muzzle, dist: 0, hide: Math.max(0, w.muzzle - 0.6), len, mesh, special: specialAmmo, color: w.tracer
  });
};

Game.spawnCasing = function (x, y, z, playerAngle) {
  if (this.casings.length > 40) { const o = this.casings.shift(); this.scene.remove(o.mesh); }
  const mesh = new THREE.Mesh(SHARED.geos.casing, SHARED.mats.casing);
  mesh.position.set(x, y, z);
  this.scene.add(mesh);
  const ra = playerAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.4, sp = 2.5 + Math.random() * 2.0;
  this.casings.push({ mesh, vx: Math.sin(ra) * sp, vy: 2.8 + Math.random() * 1.5, vz: Math.cos(ra) * sp, timer: 1.5 });
};

Game.updateCasings = function (dt) {
  for (let i = this.casings.length - 1; i >= 0; i--) {
    const c = this.casings[i];
    c.timer -= dt;
    c.mesh.position.x += c.vx * dt; c.mesh.position.y += c.vy * dt; c.mesh.position.z += c.vz * dt;
    c.vy -= 9.8 * dt;
    c.mesh.rotation.x += dt * 15; c.mesh.rotation.y += dt * 12;
    if (c.mesh.position.y <= 0.05) { c.mesh.position.y = 0.05; c.vy = -c.vy * 0.3; c.vx *= 0.6; c.vz *= 0.6; }
    if (c.timer <= 0) { this.scene.remove(c.mesh); this.casings.splice(i, 1); }
  }
};

Game.updateBullets = function (dt) {
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i];
    let remaining = b.speed * dt, hit = false;

    while (remaining > 0 && !hit) {          // sub-passos: nenhum tiro atravessa inimigo/parede
      const s = Math.min(0.5, remaining);
      remaining -= s;
      b.pos.addScaledVector(b.dir, s);
      b.dist += s;

      for (let j = 0; j < this.zombies.length; j++) {
        const z = this.zombies[j];
        if (z.isDead) continue;
        if (Math.hypot(z.x - b.pos.x, z.z - b.pos.z) < z.radius + 0.25) {
          const px = b.pos.x, pz = b.pos.z;
          z.takeDamage(b.dmg, b.dir.clone().multiplyScalar(6));
          this.spawnBlood(px, pz, 4);
          this.spawnImpact(px, 1.4, pz, 0xff4466);
          if (b.special === "INCENDIÁRIA") this.spawnFirePool(px, pz);
          else if (b.special === "EXPLOSIVA") this.spawnExplosion(px, pz, 80);
          hit = true;
          break;
        }
      }
      if (hit) break;

      const sp = this.solidAt(b.pos.x, b.pos.z, 0.08);
      if (sp) {
        if (sp.damageable) { this.damageProp(sp, b.dmg); this.spawnImpact(b.pos.x, 1.2, b.pos.z, 0xffaa33); }
        else this.spawnImpact(b.pos.x, 1.4, b.pos.z, 0x00f3ff);
        audio.playImpact();
        hit = true;
        break;
      }
      if (b.dist >= b.maxDist) { hit = true; break; }
    }

    if (hit) {
      this.scene.remove(b.mesh);
      this.bullets.splice(i, 1);
    } else {
      b.mesh.visible = b.dist >= b.hide;
      b.mesh.position.set(b.pos.x - b.dir.x * b.len * 0.5, b.pos.y, b.pos.z - b.dir.z * b.len * 0.5);
    }
  }
};

/* ---------- GRANADAS (G, T, F) ---------- */
Game.spawnGrenade = function (def, x, z, tx, tz) {
  const mesh = buildGrenadeModel(def.id);
  mesh.scale.setScalar(1.4);
  mesh.position.set(x, 1.6, z);
  this.scene.add(mesh);
  const dist = Math.hypot(tx - x, tz - z);
  this.grenades.push({ def, x, z, sx: x, sz: z, tx, tz, T: Math.max(0.35, dist / def.speed), el: 0, y: 1.6, state: 'fly', t: 0, mesh, marker: null, lure: null, blink: false, smokeAcc: 0 });
};

Game.updateGrenades = function (dt) {
  for (let i = this.grenades.length - 1; i >= 0; i--) {
    const g = this.grenades[i], def = g.def;

    if (g.state === 'fly') {
      g.el += dt;
      let p = Math.min(1, g.el / g.T);
      const nx = g.sx + (g.tx - g.sx) * p, nz = g.sz + (g.tz - g.sz) * p;
      if (this.checkWallCollision(nx, nz, 0.25)) p = 1;   // bateu na parede: cai ali mesmo
      else { g.x = nx; g.z = nz; }
      g.y = 1.6 + (0.2 - 1.6) * p + Math.sin(Math.PI * p) * 2.4;
      g.mesh.rotation.x += dt * 12; g.mesh.rotation.z += dt * 7;
      g.mesh.position.set(g.x, g.y, g.z);

      if (p >= 1) {                                       // pousou
        g.state = 'ground'; g.t = 0;
        g.mesh.rotation.set(0, 0, 0);
        g.mesh.position.set(g.x, 0.3, g.z);
        const radius = def.id === 'G' ? 7 : (def.id === 'T' ? 3.2 : 0);
        if (radius) {
          g.marker = new THREE.Mesh(SHARED.geos.ring, SHARED.basic(def.band, { add: true, op: 0.55 }));
          g.marker.rotation.x = -Math.PI / 2;
          g.marker.position.set(g.x, 0.1, g.z);
          g.marker.scale.setScalar(radius);
          this.scene.add(g.marker);
        }
        audio.playPipeBombBeep();
        if (def.lure) {
          g.lure = { x: g.x, z: g.z, radius: def.lureRadius, type: def.id, field: Nav.computeField(this.map, g.x, g.z) };
          this.lures.push(g.lure);
        }
        if (def.onLand) def.onLand(g);
      }
      continue;
    }

    g.t += dt;
    if (def.onTick) def.onTick(g, dt);
    if (g.marker && def.id === 'G') g.marker.visible = g.blink;
    if (g.t >= def.fuse) {
      if (def.onEnd) def.onEnd(g);
      if (g.lure) { const k = this.lures.indexOf(g.lure); if (k >= 0) this.lures.splice(k, 1); }
      for (const m of [g.mesh, g.marker, g.dome]) if (m) { this.scene.remove(m); disposeHierarchy(m); }
      this.grenades.splice(i, 1);
    }
  }
};

Game.findLure = function (z) {
  let best = null, bd = 1e9;
  for (let i = 0; i < this.lures.length; i++) {
    const l = this.lures[i], d = Math.hypot(l.x - z.x, l.z - z.z);
    if (d < l.radius && d < bd) { bd = d; best = l; }
  }
  return best;
};

/* Fumaça verde visível durante todo o efeito da granada T */
Game.emitSmoke = function (g, dt) {
  if (!g.dome) {
    g.dome = new THREE.Mesh(SHARED.geos.unitSphere, SHARED.basic(0x39ff14, { add: true, op: 0.16 }));
    g.dome.position.set(g.x, 0.4, g.z);
    g.dome.scale.set(3.4, 2.4, 3.4);
    this.scene.add(g.dome);
  }
  g.dome.scale.set(3.4 + Math.sin(g.t * 2) * 0.25, 2.4, 3.4 + Math.sin(g.t * 2) * 0.25);
  g.smokeAcc += dt;
  while (g.smokeAcc > 0.09) {
    g.smokeAcc -= 0.09;
    const mat = new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.5, depthWrite: false });
    const puff = new THREE.Mesh(SHARED.geos.unitSphere, mat);
    const a = Math.random() * 6.283, r = Math.random() * 1.3;
    puff.position.set(g.x + Math.cos(a) * r, 0.4, g.z + Math.sin(a) * r);
    const y0 = puff.position.y, s0 = 0.7 + Math.random() * 0.5, rise = 2.5 + Math.random() * 1.5;
    this.addEffect(puff, 2.6, (k, m) => { m.position.y = y0 + rise * k; m.scale.setScalar(s0 + 1.8 * k); mat.opacity = 0.5 * (1 - k); });
  }
};

Game.spawnExplosion = function (x, z, dmg, opts = {}) {
  const radius = opts.radius || 7;
  audio.playExplosion();
  this.cameraShake = Math.max(this.cameraShake, opts.big ? 28 : 22);
  this.spawnExplosionVisual(x, z, radius, opts.big);

  this.zombies.slice().forEach(zb => {
    if (zb.isDead) return;
    const d = Math.hypot(zb.x - x, zb.z - z);
    if (d >= radius) return;
    const push = new THREE.Vector3(zb.x - x, 0, zb.z - z);
    if (push.lengthSq() === 0) push.set(1, 0, 0);
    push.normalize().multiplyScalar(zb.type === 'tank' ? 4 : 25);
    // GRANADA: todo zumbi COMUM dentro da área morre. Especiais levam dano normal.
    if (opts.killCommons && zb.type === 'common') zb.takeDamage(99999, push, true);
    else zb.takeDamage((1 - d / radius) * dmg, push, true);
  });

  this.props.forEach(p => {   // reação em cadeia entre explosivos
    if (p.destroyed || !p.damageable || p.type === 'car') return;
    if (Math.hypot(p.x - x, p.z - z) < radius) this.damageProp(p, 999);
  });
};

Game.spawnFirePool = function (x, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.1, 14), new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.7 }));
  mesh.position.set(x, 0.05, z);
  this.scene.add(mesh);
  this.pools.push({ type: 'fire', x, z, radius: 2.5, timer: 6.0, mesh });
};

Game.spawnAcidPool = function (x, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.1, 14), new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.65 }));
  mesh.position.set(x, 0.05, z);
  this.scene.add(mesh);
  this.pools.push({ type: 'acid', x, z, radius: 2.8, timer: 7.0, mesh });
};

Game.updatePools = function (dt) {
  for (let i = this.pools.length - 1; i >= 0; i--) {
    const pool = this.pools[i];
    pool.timer -= dt;
    if (pool.timer <= 0) { this.scene.remove(pool.mesh); disposeHierarchy(pool.mesh); this.pools.splice(i, 1); continue; }
    if (pool.type === 'fire') {
      pool.mesh.scale.set(1 + Math.random() * 0.08, 1, 1 + Math.random() * 0.08);
      if (Math.random() < dt * 14) this.spawnParticle(pool.x + (Math.random() - 0.5) * 3, 0.3, pool.z + (Math.random() - 0.5) * 3, 0xff8800, 0.2, 0.4, 1, 4);
      this.zombies.slice().forEach(z => {      // fogo queima zumbis
        if (!z.isDead && Math.hypot(z.x - pool.x, z.z - pool.z) < pool.radius + z.radius * 0.5) z.takeDamage(45 * dt * (z.fireResistant ? 0.3 : 1));
      });
    }
    if (this.player && !this.player.isDead && Math.hypot(this.player.x - pool.x, this.player.z - pool.z) < pool.radius) {
      this.player.takeDamage(dt * 18, pool.type === 'acid' ? "Spitter Acid" : "Fogo");
    }
  }
};

/* ---------- partículas, sangue, gibs, cadáveres ---------- */
Game.spawnParticle = function (x, y, z, color, size, life, spread = 8, up = 5) {
  if (this.particles.length > 450) { const o = this.particles.shift(); this.scene.remove(o.mesh); }
  const mesh = new THREE.Mesh(SHARED.geos.unitBox, SHARED.basic(color));
  mesh.scale.setScalar(size);
  mesh.position.set(x, y, z);
  this.scene.add(mesh);
  this.particles.push({ mesh, life, maxLife: life, size, vx: (Math.random() - 0.5) * spread, vy: Math.random() * up, vz: (Math.random() - 0.5) * spread });
};

Game.updateParticles = function (dt) {
  for (let i = this.particles.length - 1; i >= 0; i--) {
    const p = this.particles[i];
    p.life -= dt;
    p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
    p.vy -= 9.8 * dt;
    p.mesh.scale.setScalar(Math.max(0.01, p.size * (p.life / p.maxLife)));
    if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); }
  }
};

Game.spawnBlood = function (x, z, count = 8) {
  const decal = new THREE.Mesh(SHARED.geos.unitPlane, SHARED.mats.bloodDecal);
  const sz = 0.8 + Math.random() * 0.8;
  decal.scale.set(sz, sz, 1);
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = Math.random() * Math.PI * 2;
  decal.position.set(x, 0.03, z);
  this.scene.add(decal);
  this.bloodDecals.push(decal);
  if (this.bloodDecals.length > 80) this.scene.remove(this.bloodDecals.shift());
  for (let i = 0; i < count; i++) this.spawnParticle(x, 1.0, z, 0xbb0022, 0.25, 0.35);
};

Game.spawnGibs = function (x, y, z) {
  for (let i = 0; i < 6; i++) {
    const sz = 0.25 + Math.random() * 0.2;
    const mesh = new THREE.Mesh(SHARED.geos.unitBox, SHARED.lambert(i % 2 === 0 ? 0x8a2323 : 0x5a7a5a));
    mesh.scale.setScalar(sz);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2, pw = 4 + Math.random() * 5;
    this.gibPieces.push({ mesh, vx: Math.cos(a) * pw, vy: 4 + Math.random() * 4, vz: Math.sin(a) * pw, timer: 3.5 });
  }
};

Game.updateGibs = function (dt) {
  for (let i = this.gibPieces.length - 1; i >= 0; i--) {
    const g = this.gibPieces[i];
    g.timer -= dt;
    g.mesh.position.x += g.vx * dt; g.mesh.position.y += g.vy * dt; g.mesh.position.z += g.vz * dt;
    g.vy -= 9.8 * dt;
    g.mesh.rotation.x += dt * 8; g.mesh.rotation.y += dt * 6;
    if (g.mesh.position.y <= 0.1) { g.mesh.position.y = 0.1; g.vy = -g.vy * 0.25; g.vx *= 0.7; g.vz *= 0.7; }
    if (g.timer <= 0) { this.scene.remove(g.mesh); this.gibPieces.splice(i, 1); }
  }
};

Game.updateCorpses = function (dt) {
  for (let i = this.corpses.length - 1; i >= 0; i--) {
    const c = this.corpses[i];
    c.timer -= dt;
    if (c.fallProgress < 1.0) {
      c.fallProgress += dt * 3.5;
      const angle = Math.min(Math.PI / 2, c.fallProgress * (Math.PI / 2));
      if (c.rotAxis === 'x') c.mesh.rotation.x = angle * c.rotDir; else c.mesh.rotation.z = angle * c.rotDir;
      c.mesh.position.y = Math.max(0.15, 0.85 - c.fallProgress * 0.7);
    }
    if (c.timer <= 0) { this.scene.remove(c.mesh); disposeHierarchy(c.mesh); this.corpses.splice(i, 1); }
  }
};

/* ---------- projéteis especiais: arma arremessada e rocha do Tank ---------- */
Game.spawnThrownWeapon = function (x, z, dir, key, mag) {
  const mesh = buildWeaponModel(key);
  mesh.position.set(x, 1.0, z);
  this.scene.add(mesh);
  this.projectiles.push({ type: 'thrown_weapon', weaponKey: key, mag, pos: new THREE.Vector3(x, 1.0, z), dir: dir.clone(), speed: 22, timer: 0.85, mesh });
};

Game.updateProjectiles = function (dt) {
  for (let i = this.projectiles.length - 1; i >= 0; i--) {
    const p = this.projectiles[i];
    p.timer -= dt;

    if (p.speed > 0) {
      const nx = p.pos.x + p.dir.x * p.speed * dt, nz = p.pos.z + p.dir.z * p.speed * dt;
      if (p.type === 'thrown_weapon' && this.checkWallCollision(nx, nz, 0.3)) { p.speed = 0; p.timer = Math.min(p.timer, 0.05); }
      else { p.pos.x = nx; p.pos.z = nz; }
      p.speed = Math.max(0, p.speed - dt * 25);
    }
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y += dt * 10;
    if (p.type !== 'thrown_weapon') p.mesh.rotation.x += dt * 8;

    if (p.type === 'thrown_weapon' && p.speed > 4) {
      for (let j = 0; j < this.zombies.length; j++) {
        const z = this.zombies[j];
        if (z.isDead || Math.hypot(z.x - p.pos.x, z.z - p.pos.z) >= z.radius + 0.55) continue;
        const empty = (p.mag === 0);
        z.takeDamage(empty ? 130 : 85, p.dir.clone().multiplyScalar(empty ? 22 : 14));
        z.stunTimer = Math.max(z.stunTimer, empty ? 1.8 : 1.0);
        this.spawnBlood(z.x, z.z, 7);
        if (empty) { this.showPopup("GOLPE COM ARMA VAZIA! (CRÍTICO)", "#00f3ff"); audio.playPanClang(); } else audio.playZombieHit();
        this.applyHitStop(0.045);
        p.timer = 0;
        break;
      }
    }

    if (p.type === 'tank_rock' && this.player && Math.hypot(this.player.x - p.pos.x, this.player.z - p.pos.z) < 1.6) {
      this.player.takeDamage(42, "Rocha do Tank");
      this.cameraShake = 25;
      p.timer = 0;
    }

    if (p.timer <= 0) {
      this.scene.remove(p.mesh);
      disposeHierarchy(p.mesh);
      if (p.type === 'tank_rock') this.spawnParticle(p.pos.x, 1.0, p.pos.z, 0x666666, 1.5, 0.3);
      else if (p.type === 'thrown_weapon') this.spawnGroundWeapon(p.pos.x, p.pos.z, p.weaponKey, p.mag);
      this.projectiles.splice(i, 1);
    }
  }
};

/* ==========================================================================
   12. ITENS NO CHÃO, LOOT E INTERAÇÃO
   ========================================================================== */
Game.spawnGroundWeapon = function (x, z, key, mag) {
  const w = WEAPONS[key];
  if (!w) return;
  const disp = makeGroundDisplay(buildWeaponModel(key), 0x00f3ff, 1.5);
  disp.position.set(x, 0, z);
  this.scene.add(disp);
  this.droppedWeapons.push({
    key, x, z, mesh: disp, holder: disp.userData.holder, lock: 0.4,
    mag: (mag != null ? mag : (w.kind === 'melee' ? 0 : w.clip))
  });
};

/* kind: ammo | grenade | med | pills | adrenaline | defib | sammo */
Game.spawnPickup = function (kind, id, x, z, opts = {}) {
  let model, color, scale = 1.5;
  switch (kind) {
    case 'ammo': model = buildAmmoBoxModel(id); color = AMMO[id].color; break;
    case 'grenade': model = buildGrenadeModel(id); color = GRENADES[id].band; scale = 2.0; break;
    case 'med': model = buildMedkitModel(); color = 0x39ff14; break;
    case 'sammo': model = buildAmmoBoxModel('556'); color = id === 'INCENDIÁRIA' ? 0xff6a00 : 0xff2a2a; break;
    default: {
      model = new THREE.Group();
      if (kind === 'pills') { part(model, SHARED.cyl(0.1, 0.1, 0.28, 8), SHARED.lambert(0xff9800), 0, 0, 0); part(model, SHARED.cyl(0.105, 0.105, 0.08, 8), SHARED.lambert(0xffffff), 0, 0.17, 0); color = 0xffe600; }
      else if (kind === 'adrenaline') { part(model, SHARED.cyl(0.05, 0.05, 0.4, 6), SHARED.lambert(0xffe600), 0, 0, 0, 0, 0, Math.PI / 2); part(model, SHARED.box(0.04, 0.2, 0.2), SHARED.lambert(0xdddddd), 0.2, 0, 0); color = 0xffe600; }
      else { part(model, SHARED.box(0.5, 0.35, 0.3), SHARED.lambert(0xffd400), 0, 0, 0); part(model, SHARED.box(0.1, 0.25, 0.04), SHARED.basic(0x00f3ff), 0, 0, 0.17); color = 0x00f3ff; }
      scale = 1.8;
    }
  }
  const disp = makeGroundDisplay(model, color, scale);
  disp.position.set(x, 0, z);
  this.scene.add(disp);
  this.pickups.push({
    kind, id, x, z, mesh: disp, holder: disp.userData.holder, give: opts.give || 1,
    respawn: opts.respawn || 0, cool: 0, life: opts.life || 0, phase: Math.random() * 6, lastMsg: 0
  });
};

Game.dropLoot = function (x, z, special) {
  if (!this.player) return;
  if (Math.random() > (special ? 0.65 : 0.16)) return;
  const r = Math.random(), pl = this.player;
  const pool = Object.keys(AMMO);
  const owned = [1, 2].map(s => pl.slots[s]).filter(Boolean).map(it => WEAPONS[it.key].ammo);
  if (r < 0.22) this.spawnPickup('med', 'med', x, z, { life: 30 });
  else if (r < 0.46) this.spawnPickup('grenade', GRENADE_ORDER[Math.floor(Math.random() * 3)], x, z, { life: 30, give: 1 });
  else if (r < 0.78) { const t = owned.length ? owned[Math.floor(Math.random() * owned.length)] : pool[Math.floor(Math.random() * pool.length)]; this.spawnPickup('ammo', t, x, z, { life: 30, give: AMMO[t].give }); }
  else if (r < 0.86) this.spawnPickup('pills', 'pills', x, z, { life: 30 });
  else if (r < 0.92) this.spawnPickup('adrenaline', 'adrenaline', x, z, { life: 30 });
  else if (r < 0.96) this.spawnPickup('sammo', Math.random() > 0.5 ? 'INCENDIÁRIA' : 'EXPLOSIVA', x, z, { life: 30 });
  else this.spawnPickup('defib', 'defib', x, z, { life: 30 });
};

Game.tryCollect = function (pk) {
  const p = this.player, now = performance.now();
  const refuse = (msg) => { if (now - pk.lastMsg > 1500) { pk.lastMsg = now; this.showPopup(msg, "#aaaaaa"); } return false; };
  switch (pk.kind) {
    case 'ammo':
      if (!p.addAmmo(pk.id, pk.give)) return refuse(`MUNIÇÃO ${AMMO[pk.id].name} CHEIA`);
      this.showPopup(`+${pk.give} ${AMMO[pk.id].name}`, "#ffe600");
      break;
    case 'grenade': {
      const def = GRENADES[pk.id];
      if (p.grenades[pk.id] >= def.max) return refuse(`${def.name} CHEIA`);
      p.grenades[pk.id] = Math.min(def.max, p.grenades[pk.id] + pk.give);
      this.showPopup(`+${def.name}`, def.hud);
      break;
    }
    case 'med':
      if (p.medkits >= 3) return refuse("KITS MÉDICOS CHEIOS");
      p.medkits++;
      this.showPopup("+KIT MÉDICO", "#39ff14");
      break;
    case 'pills': p.tempHp = Math.min(100, p.tempHp + 50); this.showPopup("PÍLULAS! +50 TEMP HP", "#ffe600"); break;
    case 'adrenaline': p.adrenalineTime = (p.survivor.name === "ROCHELLE" ? 18 : 12); this.showPopup("ADRENALINA ATIVADA!", "#ffe600"); break;
    case 'defib': p.defibs++; this.showPopup("DESFIBRILADOR COLETADO!", "#00f3ff"); break;
    case 'sammo': p.specialAmmoType = pk.id; p.specialAmmoShots = 35; this.showPopup(`MUNIÇÃO ${pk.id}!`, "#00f3ff"); break;
  }
  audio.playPickup();
  this.updateHUD();
  return true;
};

Game.updatePickups = function (dt) {
  const t = performance.now() / 1000, p = this.player;
  for (let i = this.droppedWeapons.length - 1; i >= 0; i--) {
    const dw = this.droppedWeapons[i];
    if (dw.lock > 0) dw.lock -= dt;
    dw.holder.rotation.y += dt * 1.2;
    dw.holder.position.y = 0.55 + Math.sin(t * 2 + dw.x) * 0.08;
  }
  for (let i = this.pickups.length - 1; i >= 0; i--) {
    const pk = this.pickups[i];
    if (pk.cool > 0) {
      pk.cool -= dt;
      if (pk.cool <= 0) pk.mesh.visible = true;
      continue;
    }
    pk.holder.rotation.y += dt * 1.6;
    pk.holder.position.y = 0.55 + Math.sin(t * 2.4 + pk.phase) * 0.08;
    if (pk.life > 0) {
      pk.life -= dt;
      if (pk.life < 5) pk.mesh.visible = Math.floor(t * 6) % 2 === 0;
      if (pk.life <= 0) { this.scene.remove(pk.mesh); disposeHierarchy(pk.mesh); this.pickups.splice(i, 1); continue; }
    }
    if (p && !p.isDead && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.6 && this.tryCollect(pk)) {
      if (pk.respawn) { pk.cool = pk.respawn; pk.mesh.visible = false; }
      else { this.scene.remove(pk.mesh); disposeHierarchy(pk.mesh); this.pickups.splice(i, 1); }
    }
  }
};

Game.nearestWeapon = function () {
  const p = this.player;
  let best = null, bd = 2.6;
  for (const dw of this.droppedWeapons) {
    const d = Math.hypot(p.x - dw.x, p.z - dw.z);
    if (d < bd) { bd = d; best = dw; }
  }
  return best;
};

/* E: pega a arma, coloca no slot correspondente; se ocupado, deixa a antiga no chão */
Game.pickupWeapon = function (dw) {
  const p = this.player, w = WEAPONS[dw.key], slot = w.slot;
  if (dw.lock > 0) return false;
  const old = p.slots[slot];
  p.cancelReload();
  p.slots[slot] = (w.kind === 'melee') ? { key: dw.key } : { key: dw.key, mag: dw.mag };
  const idx = this.droppedWeapons.indexOf(dw);
  if (idx >= 0) this.droppedWeapons.splice(idx, 1);
  this.scene.remove(dw.mesh);
  disposeHierarchy(dw.mesh);
  if (old) {
    const a = Math.random() * 6.283;
    this.spawnGroundWeapon(p.x + Math.cos(a) * 1.4, p.z + Math.sin(a) * 1.4, old.key, WEAPONS[old.key].kind === 'melee' ? null : old.mag);
  }
  p.action = null;
  p.activeSlot = slot;
  p.lastWeaponSlot = slot;
  p.updateWeaponMesh();
  audio.playPickup();
  this.showPopup(`PEGOU: ${w.name} → SLOT ${slot}`, "#00f3ff");
  this.updateHUD();
  return true;
};

Game.updateInteract = function () {
  const el = document.getElementById('interact-prompt');
  let text = '';
  if (this.player && !this.player.isDead) {
    const dw = this.nearestWeapon();
    if (dw) {
      const w = WEAPONS[dw.key], old = this.player.slots[w.slot];
      text = `[E] PEGAR ${w.name} → SLOT ${w.slot}` + (old ? `  (TROCA ${WEAPONS[old.key].name})` : '');
    }
  }
  if (text !== this._lastPrompt) {
    this._lastPrompt = text;
    el.innerText = text;
    el.classList.toggle('visible', !!text);
  }
};

/* ==========================================================================
   13. COMBO, HUD, RADAR, VITÓRIA
   ========================================================================== */
Game.registerComboKill = function (basePoints) {
  this.comboTimer = 3.0;
  this.combo++;
  if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  let mult = this.combo;
  if (this.selectedSurvivor === "nick") mult = Math.floor(mult * 1.25);
  const earned = basePoints * mult;
  this.score += earned;
  this.points += Math.floor(earned * 0.1);

  const cm = document.getElementById('ui-combo-mult');
  cm.innerText = `COMBO x${this.combo}`;
  cm.classList.add('bump');
  setTimeout(() => cm.classList.remove('bump'), 120);

  let label = "KILL!";
  if (this.combo >= 15) label = "EXTERMÍNIO TOTAL!";
  else if (this.combo >= 10) label = "MASSACRE INSANO!";
  else if (this.combo >= 6) label = "ULTRA KILL!";
  else if (this.combo >= 3) label = "TRIPLE KILL!";
  this.showPopup(`${label} +${earned}`, "#ffe600");
  this.updateHUD();
};

Game.showPopup = function (text, color) {
  const el = document.createElement('div');
  el.className = 'floating-text';
  el.innerText = text;
  el.style.color = color;
  el.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 200) + 'px';
  el.style.top = (window.innerHeight / 2 - 80 + (Math.random() - 0.5) * 60) + 'px';
  document.body.appendChild(el);
  setTimeout(() => { el.style.transform = 'translate(-50%, -120%) scale(1.3)'; el.style.opacity = '0'; }, 50);
  setTimeout(() => el.remove(), 750);
};

Game.updateHUD = function () {
  if (!this.player) return;
  const p = this.player;
  const $ = id => document.getElementById(id);

  $('ui-hp-val').innerText = Math.ceil(p.hp);
  $('ui-max-hp-val').innerText = p.maxHp;
  const hpPct = (p.hp / p.maxHp) * 100;
  $('ui-hp-bar').style.width = hpPct + '%';
  $('ui-temp-hp-bar').style.width = Math.min(100, hpPct + (p.tempHp / p.maxHp) * 100) + '%';
  $('ui-survivor-name').innerText = p.survivor.name;
  $('ui-passive-badge').innerText = p.survivor.passive;

  /* painel da arma/item atual */
  const w = p.wdata(), it = p.item();
  let name, mag, res, sub;
  if (p.activeSlot === 4) {
    const d = GRENADES[p.grenadeType];
    name = d.name; mag = 'x' + p.grenades[p.grenadeType]; res = ''; sub = d.desc;
  } else if (p.activeSlot === 5) {
    name = "KIT MÉDICO"; mag = 'x' + p.medkits; res = ''; sub = "CLIQUE OU [V] PARA CURAR";
  } else if (w && w.kind === 'melee') {
    name = w.name; mag = "∞"; res = ""; sub = w.instakill ? "MATA COMUNS INSTANTANEAMENTE" : "CORPO A CORPO";
  } else if (w) {
    name = w.name; mag = it.mag; res = ' / ' + p.ammo[w.ammo];
    sub = AMMO[w.ammo].name + (p.specialAmmoType !== "PADRÃO" ? ' · ' + p.specialAmmoType : '');
  } else { name = "DESARMADO (SOCO)"; mag = "--"; res = ""; sub = "NENHUMA"; }
  $('ui-weapon-name').innerText = name;
  $('ui-mag-ammo').innerText = mag;
  $('ui-reserve-ammo').innerText = res;
  $('ui-ammo-type').innerText = sub;
  $('ui-score').innerText = this.score.toString().padStart(6, '0');

  /* barra de slots [1][2][3][4][5] */
  let html = '';
  for (let n = 1; n <= 5; n++) {
    let icon = '', sublbl = '', empty = false;
    if (n <= 3) {
      const s = p.slots[n];
      if (s) { const ww = WEAPONS[s.key]; icon = ICONS[ww.icon]; sublbl = ww.kind === 'melee' ? '∞' : `${s.mag}/${p.ammo[ww.ammo]}`; }
      else empty = true;
    } else if (n === 4) {
      icon = ICONS['gren_' + p.grenadeType];
      sublbl = GRENADE_ORDER.map(t => `<span class="${t === p.grenadeType ? 'cur' : ''}">${t}${p.grenades[t]}</span>`).join(' ');
      empty = p.totalGrenades() <= 0;
    } else {
      icon = ICONS.med; sublbl = 'x' + p.medkits; empty = p.medkits <= 0;
    }
    html += `<div class="slot ${p.activeSlot === n ? 'active' : ''} ${empty ? 'empty' : ''}"><div class="slot-num">${n}</div><div class="slot-icon">${icon}</div><div class="slot-sub">${sublbl}</div></div>`;
  }
  $('slot-bar').innerHTML = html;
};

Game.updateRadar = function () {
  const radar = document.getElementById('radar-container');
  radar.innerHTML = '';
  if (!this.player) return;
  this.zombies.forEach(z => {
    if (z.isDead || z.type === 'common') return;
    const dx = z.x - this.player.x, dz = z.z - this.player.z;
    if (Math.hypot(dx, dz) <= 14.0) return;
    const angle = Math.atan2(dz, dx), margin = 50;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const el = document.createElement('div');
    el.className = `radar-arrow ${z.type}`;
    el.innerText = z.type[0].toUpperCase();
    el.style.left = (cx + Math.cos(angle) * (cx - margin)) + 'px';
    el.style.top = (cy + Math.sin(angle) * (cy - margin)) + 'px';
    radar.appendChild(el);
  });
};

Game.checkStageClear = function () {
  if (this.gameMode === "survival") return;
  if (this.director.tankSpawned) {
    const tankAlive = this.zombies.some(z => z.type === 'tank' && !z.isDead);
    if (!tankAlive && this.kills > 30) this.triggerVictory();
  }
};

Game.triggerVictory = function () {
  this.isRunning = false;
  const sec = Math.floor((performance.now() - this.stageStartTime) / 1000);
  const m = Math.floor(sec / 60).toString().padStart(2, '0'), s = (sec % 60).toString().padStart(2, '0');
  let grade = "C";
  if (this.maxCombo >= 15 && this.damageTaken < 30) grade = "S+";
  else if (this.maxCombo >= 10 && this.damageTaken < 50) grade = "S";
  else if (this.maxCombo >= 6) grade = "A";
  else if (this.maxCombo >= 3) grade = "B";

  document.getElementById('victory-grade').innerText = grade;
  document.getElementById('vic-time').innerText = `${m}:${s}`;
  document.getElementById('vic-kills').innerText = this.kills;
  document.getElementById('vic-combo').innerText = `x${this.maxCombo}`;
  document.getElementById('vic-dmg').innerText = `${Math.round(this.damageTaken)} HP`;
  const bonus = 10000 + (this.maxCombo * 500) - (this.damageTaken * 40);
  this.points += Math.max(2000, Math.round(bonus));
  document.getElementById('vic-points').innerText = `+${Math.max(2000, Math.round(bonus)).toLocaleString()}`;
  this.showModal('modal-victory');
};

/* ==========================================================================
   14. LOOP PRINCIPAL E INPUT
   ========================================================================== */
Game.step = function (dt) {
  if (this.hitStopTimer > 0) { this.hitStopTimer -= dt; return; }
  this.stageClock += dt;

  if (this.player) {
    this.player.update(dt);
    this.nav.timer -= dt;
    if (this.nav.timer <= 0 && this.nav.field) { this.nav.timer = 0.25; Nav.computeField(this.map, this.player.x, this.player.z, this.nav.field); }
  }

  for (let i = this.zombies.length - 1; i >= 0; i--) { if (this.zombies[i]) this.zombies[i].update(dt); }
  this.separateZombies();

  this.updateCorpses(dt);
  this.updateGibs(dt);
  this.updateCasings(dt);
  this.updateBullets(dt);
  this.updateGrenades(dt);
  this.updateProjectiles(dt);
  this.updateEffects(dt);
  this.updatePools(dt);
  this.updateParticles(dt);
  this.updatePickups(dt);

  for (const p of this.props) {                                 // carros em alarme piscam
    if (p.alarmTriggered && p.alarmTime > 0 && p.bodyMat) {
      p.alarmTime -= dt;
      p.bodyMat.color.setHex(Math.floor(p.alarmTime * 5) % 2 ? 0xff2222 : 0x440000);
    }
  }

  if (this.comboTimer > 0) {
    this.comboTimer -= dt;
    document.getElementById('ui-combo-fill').style.width = (this.comboTimer / 3.0) * 100 + '%';
    if (this.comboTimer <= 0) {
      this.combo = 1;
      document.getElementById('ui-combo-mult').innerText = "COMBO x1";
      document.getElementById('ui-combo-fill').style.width = '0%';
    }
  }

  this.updateDirector(dt);
  this.checkStageClear();

  this._uiTimer -= dt;
  if (this._uiTimer <= 0) { this._uiTimer = 0.12; this.updateRadar(); this.updateInteract(); }
};

Game.updateCamera = function () {
  if (!this.player) return;
  const targetX = this.player.x + (this.mouseWorldPos.x - this.player.x) * 0.15;
  const targetZ = this.player.z + (this.mouseWorldPos.z - this.player.z) * 0.15;
  this.camera.position.x += (targetX - this.camera.position.x) * 0.1;
  this.camera.position.z += ((targetZ + 7.5) - this.camera.position.z) * 0.1;
  this.camera.position.y = 23;
  if (this.cameraShake > 0) {
    this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.08;
    this.camera.position.z += (Math.random() - 0.5) * this.cameraShake * 0.08;
    this.cameraShake *= 0.9;
    if (this.cameraShake < 0.2) this.cameraShake = 0;
  }
  this.camera.lookAt(this.camera.position.x, 0, this.camera.position.z - 7.5);
};

let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (Game.isRunning && !Game.isPaused) {
    Game.step(dt);
    Game.updateCamera();
  }
  Game.mouseClicked = false;
  Game.renderer.render(Game.scene, Game.camera);
}

window.addEventListener('load', () => {
  SHARED.init();

  Game.canvas = document.getElementById('game-canvas');
  Game.renderer = new THREE.WebGLRenderer({ canvas: Game.canvas, antialias: true });
  Game.renderer.setSize(window.innerWidth, window.innerHeight);
  Game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  Game.scene = new THREE.Scene();
  Game.scene.fog = new THREE.FogExp2(0x0a0612, 0.015);

  Game.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
  Game.camera.position.set(0, 23, 7.5);
  Game.camera.lookAt(0, 0, 0);

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  window.addEventListener('mousemove', (e) => {
    Game.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    Game.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
    const ch = document.getElementById('crosshair');
    ch.style.left = e.clientX + 'px';
    ch.style.top = e.clientY + 'px';
    raycaster.setFromCamera(Game.mousePos, Game.camera);
    raycaster.ray.intersectPlane(plane, Game.mouseWorldPos);
  });

  window.addEventListener('mousedown', (e) => {
    audio.init();
    if (!Game.isRunning || Game.isPaused) return;
    if (e.button === 0) { Game.mouseDown = true; Game.mouseClicked = true; }
    if (e.button === 2) Game.mouseRightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) Game.mouseDown = false;
    if (e.button === 2) Game.mouseRightDown = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    if (Game.isRunning && !Game.isPaused && Game.player && !Game.player.isDead) Game.player.cycleSlot(e.deltaY > 0 ? 1 : -1);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    Game.keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyP') { Game.togglePause(); return; }
    if (!Game.isRunning || Game.isPaused || !Game.player) return;
    const p = Game.player;

    if (e.code === 'KeyR' && p.isDead) { Game.restartStage(); return; }
    if (p.isDead) return;

    if (e.code === 'KeyR') p.startReload();
    else if (e.code === 'KeyQ') p.throwHeldWeapon();
    else if (e.code === 'KeyE') {
      const dw = Game.nearestWeapon();
      if (dw) Game.pickupWeapon(dw); else p.triggerShove();
    }
    else if (e.code >= 'Digit1' && e.code <= 'Digit5') p.equipSlot(parseInt(e.code.slice(5), 10));
    else if (e.code === 'KeyG') p.throwGrenade('G');
    else if (e.code === 'KeyT') p.throwGrenade('T');
    else if (e.code === 'KeyF') p.throwGrenade('F');
    else if (e.code === 'KeyV') p.useMedkit();
  });

  window.addEventListener('keyup', (e) => { Game.keys[e.code] = false; });

  window.addEventListener('resize', () => {
    Game.camera.aspect = window.innerWidth / window.innerHeight;
    Game.camera.updateProjectionMatrix();
    Game.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
});
/* ==========================================================================
   EXTRAS.JS  -  carregue DEPOIS de game.js
   - Fases longas estilo L4D2: SAFE ROOM inicial -> caminho -> SAFE ROOM final com PORTA
   - Zumbis adormecidos (acordam por proximidade ou barulho de tiro)
   - Evento CRESCENDO no checkpoint central
   - Rolamento (ESPAÇO) com invulnerabilidade
   - Inventário passa de fase em fase
   - Novas telas de início e de morte
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SAFE_BAND = 20, GAP = 4;
  const TAGLINES = ['Saia do abrigo e atravesse o shopping.', 'O hospital não está vazio.', 'Os alarmes vão te denunciar.', 'Não acorde o que dorme na mansão.', 'A ponte é a última saída.'];

  /* ---------- 1. fases maiores ---------- */
  const SIZES = [[64, 210], [60, 240], [72, 230], [64, 250], [56, 300]];
  STAGES_DATA.forEach((s, i) => {
    s.base = { w: SIZES[i][0], h: SIZES[i][1] };
    s.scale = 1;
    for (const k in s.gen) s.gen[k] = Math.round(s.gen[k] * 1.3);
  });

  /* estruturas nunca invadem as faixas dos safe rooms */
  const _fits = MapGen._fits;
  MapGen._fits = function (ctx, r, gap) {
    const b = MapGen.safeBand;
    if (b && (r.z + r.hd > ctx.map.hh - b || r.z - r.hd < -ctx.map.hh + b)) return false;
    return _fits.call(this, ctx, r, gap);
  };

  function blockRect(map, r) {
    const C = map.cell, R = MapGen.AGENT_R;
    const i0 = Math.max(0, Math.floor((r.x - r.hw - R + map.hw) / C)), i1 = Math.min(map.cols - 1, Math.floor((r.x + r.hw + R + map.hw) / C));
    const j0 = Math.max(0, Math.floor((r.z - r.hd - R + map.hh) / C)), j1 = Math.min(map.rows - 1, Math.floor((r.z + r.hd + R + map.hh) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = -map.hw + (i + 0.5) * C, cz = -map.hh + (j + 0.5) * C;
      if (Math.abs(cx - r.x) < r.hw + R && Math.abs(cz - r.z) < r.hd + R) { map.walk[j * map.cols + i] = 0; map.blocked[j * map.cols + i] = 1; }
    }
  }

  function floorSign(G, text, x, z, color) {
    try {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
      const c = cv.getContext('2d');
      c.font = 'bold 56px monospace'; c.textAlign = 'center'; c.fillStyle = color; c.fillText(text, 256, 66);
      const m = new THREE.Mesh(SHARED.geos.unitPlane, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
      m.rotation.x = -Math.PI / 2; m.scale.set(11, 2, 1); m.position.set(x, 0.06, z);
      G.scene.add(m);
    } catch (e) { /* sem canvas */ }
  }

  function buildRoom(G, zc, dir, color, label) {
    const plate = new THREE.Mesh(SHARED.geos.unitPlane, SHARED.lambert(color));
    plate.rotation.x = -Math.PI / 2; plate.scale.set(16, 15, 1); plate.position.set(0, 0.04, zc);
    G.scene.add(plate);
    const neon = SHARED.basic(label === 'SAFE ROOM' ? 0x39ff14 : 0x00f3ff);
    for (const [x, z, w, d] of [[-8, zc, 0.25, 15], [8, zc, 0.25, 15]]) {
      const m = new THREE.Mesh(SHARED.box(w, 0.1, d), neon); m.position.set(x, 0.08, z); G.scene.add(m);
    }
    const L = new THREE.PointLight(label === 'SAFE ROOM' ? 0x39ff14 : 0x00f3ff, 1.4, 26);
    L.position.set(0, 4, zc); G.scene.add(L);
    floorSign(G, label, 0, zc + dir * 2, label === 'SAFE ROOM' ? '#39ff14' : '#00f3ff');
  }

  /* ---------- 2. montagem da campanha ---------- */
  function setupCampaign(G, idx) {
    const map = G.map, hh = map.hh, wallMat = SHARED.lambert(G.stageInfo.wallColor);
    const R = (a, b, c, d) => MapGen._R(a, b, c, d, 'wall');
    const rects = [
      R(-10, hh - 18, -8, hh - 0.5), R(8, hh - 18, 10, hh - 0.5), R(-10, hh - 18, -GAP, hh - 16), R(GAP, hh - 18, 10, hh - 16),
      R(-10, -hh + 0.5, -8, -hh + 18), R(8, -hh + 0.5, 10, -hh + 18), R(-10, -hh + 16, -GAP, -hh + 18), R(GAP, -hh + 16, 10, -hh + 18)
    ];
    for (const r of rects) { G.addSolid(r, wallMat); blockRect(map, r); }

    buildRoom(G, hh - 8, -1, 0x0f2a44, 'INÍCIO');
    buildRoom(G, -hh + 8, 1, 0x10361f, 'SAFE ROOM');

    const beacon = new THREE.Mesh(SHARED.cyl(1.3, 1.3, 40, 12), SHARED.basic(0x39ff14, { add: true, op: 0.16 }));
    beacon.position.set(0, 20, -hh + 8); G.scene.add(beacon);

    const dm = new THREE.Mesh(SHARED.box(GAP * 2, 4, 2), SHARED.lambert(0x2ecc71));
    dm.position.set(0, 2, -hh + 17); dm.visible = false; G.scene.add(dm);
    const door = { type: 'door', solid: false, x: 0, z: -hh + 17, halfW: GAP, halfD: 1, mesh: dm };
    G.props.push(door);
    G.exit = { z: -hh + 8, startZ: hh - 7, door, timer: 0, closed: false, victoryT: 0, done: false, hh };

    /* tira itens/zumbis que caíram dentro das paredes dos safe rooms */
    const bad = (x, z) => Math.abs(x) < 11.5 && Math.abs(z) > hh - 19;
    const drop = o => { G.scene.remove(o.mesh); disposeHierarchy(o.mesh); };
    G.droppedWeapons = G.droppedWeapons.filter(d => bad(d.x, d.z) ? (drop(d), false) : true);
    G.pickups = G.pickups.filter(d => bad(d.x, d.z) ? (drop(d), false) : true);
    G.zombies = G.zombies.filter(z => (Math.abs(z.x) < 12 && Math.abs(z.z) > hh - 22) ? (drop(z), false) : true);
    map.spawnCells = map.spawnCells.filter(c => !(Math.abs(c.x) < 13 && Math.abs(c.z) > hh - 22));

    /* suprimentos iniciais */
    G.spawnPickup('med', 'med', -5, hh - 4, { give: 1 });
    G.spawnPickup('ammo', '9mm', 5, hh - 4, { give: 30 });
    G.spawnPickup('ammo', '556', 5, hh - 10, { give: 60 });
    G.spawnPickup('grenade', 'G', -5, hh - 10, { give: 1 });
    if (idx === 0) G.spawnGroundWeapon(0, hh - 4, 'm16', null);

    /* zumbis adormecidos espalhados pelo caminho */
    const rng = new SeededRNG(`${G.seed}|sl${idx}`);
    const cells = map.spawnCells.filter(c => Math.abs(c.z) < hh - 26 && Math.hypot(c.x, c.z - (hh - 7)) > 40);
    const specials = ['smoker', 'hunter', 'spitter', 'jockey', 'boomer'];
    G.sleepers = [];
    for (let g = 0, n = 16 + idx * 3; g < n && cells.length; g++) {
      const c = rng.pick(cells), cnt = rng.int(2, 5);
      for (let k = 0; k < cnt; k++) {
        const x = c.x + rng.range(-3, 3), z = c.z + rng.range(-3, 3);
        if (G.checkWallCollision(x, z, 0.7)) continue;
        G.sleepers.push({ x, z, type: (idx >= 1 && rng.chance(0.07)) ? rng.pick(specials) : 'common' });
      }
    }
  }

  /* ---------- 3. inventário entre fases ---------- */
  const snap = p => ({
    slots: JSON.parse(JSON.stringify(p.slots)), ammo: Object.assign({}, p.ammo), grenades: Object.assign({}, p.grenades),
    grenadeType: p.grenadeType, medkits: p.medkits, defibs: p.defibs, hp: Math.max(p.hp, Math.ceil(p.maxHp * 0.5))
  });
  function applyLoadout(G, s) {
    const p = G.player;
    p.slots = JSON.parse(JSON.stringify(s.slots));
    Object.assign(p.ammo, s.ammo); Object.assign(p.grenades, s.grenades);
    p.grenadeType = s.grenadeType; p.medkits = s.medkits; p.defibs = s.defibs; p.hp = Math.min(p.maxHp, s.hp);
    p.activeSlot = p.slots[2] ? 2 : (p.slots[1] ? 1 : 3); p.lastWeaponSlot = p.activeSlot;
    p.updateWeaponMesh();
  }

  const _load = Game.loadStage;
  Game.loadStage = function (idx) {
    const camp = idx >= 0;
    MapGen.safeBand = camp ? SAFE_BAND : 0;
    this.exit = null; this.sleepers = []; this.crescendo = null;
    _load.call(this, idx);
    if (camp) {
      setupCampaign(this, idx);
      const p = this.player, hh = this.map.hh;
      p.x = 0; p.z = hh - 7; p.mesh.position.set(0, 0, p.z);
      this.mouseWorldPos.set(0, 0, p.z - 10);
      this.camera.position.set(0, 23, p.z + 7.5);
      if (this._loadout) applyLoadout(this, this._loadout);
      Nav.computeField(this.map, p.x, p.z, this.nav.field);
      showIntro(idx, this.stageInfo.name);
    }
    this.updateHUD();
  };

  ['startCampaign', 'startSurvival', 'returnToTitle'].forEach(n => {
    const f = Game[n];
    Game[n] = function () { this._loadout = null; return f.apply(this, arguments); };
  });
  const _tv = Game.triggerVictory;
  Game.triggerVictory = function () {
    if (this.player && this.gameMode === 'campaign') this._loadout = snap(this.player);
    return _tv.call(this);
  };
  Game.checkStageClear = function () { /* campanha: a saída é a porta do safe room */ };

  /* ---------- 4. zumbis dormindo / barulho ---------- */
  const _zu = Zombie.prototype.update;
  Zombie.prototype.update = function (dt) {
    if (this.idle && !this.isDead && Game.player) {
      const d = Math.hypot(Game.player.x - this.x, Game.player.z - this.z);
      if (d < 18 || this.hp < this.maxHp) this.idle = false;
      else {
        this.walkTime += dt * 0.6; this.animWalk(false);
        this.mesh.position.set(this.x, 0, this.z);
        this.mesh.rotation.y += Math.sin(this.walkTime) * 0.004;
        return;
      }
    }
    return _zu.call(this, dt);
  };
  function wakeNear(G, r) {
    const p = G.player; if (!p) return;
    for (const z of G.zombies) if (z.idle && Math.hypot(z.x - p.x, z.z - p.z) < r) z.idle = false;
  }
  const _sb = Game.shootBullet;
  Game.shootBullet = function () { wakeNear(this, 26); return _sb.apply(this, arguments); };

  /* ---------- 5. rolamento (ESPAÇO) ---------- */
  const _pu = Player.prototype.update;
  Player.prototype.update = function (dt) {
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dash && this.dash.t > 0 && !this.isDead) {
      this.dash.t -= dt;
      const s = 22 * dt, nx = this.x + this.dash.x * s, nz = this.z + this.dash.z * s;
      if (!Game.checkWallCollision(nx, this.z, 0.55)) this.x = nx;
      if (!Game.checkWallCollision(this.x, nz, 0.55)) this.z = nz;
      Game.spawnParticle(this.x, 0.9, this.z, 0x00f3ff, 0.35, 0.25, 1, 0.5);
    }
    return _pu.call(this, dt);
  };
  const _td = Player.prototype.takeDamage;
  Player.prototype.takeDamage = function (a, s) {
    if (this.invuln > 0 && !this.isDead) return;
    return _td.call(this, a, s);
  };
  function doDash() {
    const G = Game, p = G.player;
    if (!G.isRunning || G.isPaused || !p || p.isDead || p.dashCd > 0) return;
    let dx = 0, dz = 0; const k = G.keys;
    if (k['KeyW']) dz -= 1; if (k['KeyS']) dz += 1; if (k['KeyA']) dx -= 1; if (k['KeyD']) dx += 1;
    if (!dx && !dz) { dx = Math.sin(p.mesh.rotation.y); dz = Math.cos(p.mesh.rotation.y); }
    const l = Math.hypot(dx, dz);
    p.dash = { t: 0.2, x: dx / l, z: dz / l };
    p.dashCd = 1.1; p.invuln = 0.32; p.jockeyTime = 0;
    audio.playSwoosh();
  }

  /* ---------- 6. passo extra do jogo: sleepers, porta, crescendo, HUD ---------- */
  const _step = Game.step;
  Game.step = function (dt) {
    const frozen = this.hitStopTimer > 0;
    _step.call(this, dt);
    if (!frozen && this.player) extraStep(this, dt);
  };

  const _v = new THREE.Vector3();
  function extraStep(G, dt) {
    const p = G.player;
    for (let i = G.sleepers.length - 1; i >= 0; i--) {
      const s = G.sleepers[i];
      if (Math.hypot(s.x - p.x, s.z - p.z) < 42 && G.zombies.length < 60) {
        G.sleepers.splice(i, 1);
        G.zombies.push(new Zombie(s.x, s.z, s.type));
        G.zombies[G.zombies.length - 1].idle = true;
      }
    }
    const ex = G.exit, hud = $('obj-hud');
    hud.style.display = ex ? 'block' : 'none';
    if (!ex) { $('obj-arrow').style.display = 'none'; return; }

    let msg = null;
    if (Math.abs(p.x) < 7.5 && Math.abs(p.z) < 1e9 && p.z < -ex.hh + 15.5 && !ex.closed) {
      ex.timer += dt; msg = `FECHANDO A PORTA... ${Math.max(0, 3 - ex.timer).toFixed(1)}s`;
      if (ex.timer >= 3) {
        ex.closed = true; ex.door.solid = true; ex.door.mesh.visible = true;
        blockRect(G.map, MapMeta(ex)); Nav.computeField(G.map, p.x, p.z, G.nav.field);
        audio.playPanClang(); G.cameraShake = 14; G.showPopup('PORTA TRANCADA! VOCÊ ESTÁ A SALVO', '#39ff14');
      }
    } else ex.timer = Math.max(0, ex.timer - dt * 2);
    if (ex.closed && !ex.done) { msg = 'PORTA TRANCADA'; ex.victoryT += dt; if (ex.victoryT > 1.2) { ex.done = true; G.triggerVictory(); } }

    /* crescendo no checkpoint central */
    let cr = G.crescendo;
    if (!cr && Math.abs(p.x) < 12 && Math.abs(p.z) < 12) {
      cr = G.crescendo = { t: 28, acc: 0 };
      G.triggerDirectorEvent('CRESCENDO! RESISTA!'); G.showPopup('ALARME ATIVADO! SOBREVIVA 28s', '#ff2a2a');
    }
    if (cr && cr.t > 0) {
      cr.t -= dt; cr.acc += dt; G.director.timer = 0;
      while (cr.acc > 0.22) { cr.acc -= 0.22; if (G.zombies.length < 70) G.spawnHordeZombie(); }
      msg = `CRESCENDO · SOBREVIVA ${Math.ceil(cr.t)}s`;
      if (cr.t <= 0) { G.score += 1500; G.showPopup('SILÊNCIO... SIGA ADIANTE! +1500', '#39ff14'); }
    }

    const total = ex.startZ - ex.z, prog = Math.min(1, Math.max(0, (ex.startZ - p.z) / total));
    $('obj-title').innerText = msg || `SIGA PARA O SAFE ROOM · ${Math.round(Math.abs(p.z - ex.z))} m`;
    $('obj-fill').style.width = (prog * 100) + '%';
    $('dash-fill').style.width = (100 - Math.max(0, (p.dashCd || 0) / 1.1) * 100) + '%';

    /* seta de objetivo na borda da tela */
    const arrow = $('obj-arrow'), W = window.innerWidth, H = window.innerHeight;
    _v.set(0, 1, ex.z).project(G.camera);
    let sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
    const off = _v.z > 1 || sx < 50 || sx > W - 50 || sy < 50 || sy > H - 50;
    if (off && Math.abs(p.z - ex.z) > 25) {
      let a = Math.atan2(sy - H / 2, sx - W / 2); if (_v.z > 1) a += Math.PI;
      arrow.style.display = 'flex';
      arrow.style.left = (W / 2 + Math.cos(a) * (W / 2 - 60)) + 'px';
      arrow.style.top = (H / 2 + Math.sin(a) * (H / 2 - 60)) + 'px';
      arrow.style.transform = `translate(-50%,-50%) rotate(${a}rad)`;
    } else arrow.style.display = 'none';
  }
  function MapMeta(ex) { return { x: 0, z: ex.door.z, hw: GAP, hd: 1 }; }

  /* ---------- 7. DOM extra (HUD, intro, entrada) ---------- */
  document.body.insertAdjacentHTML('beforeend',
    `<div id="obj-hud"><div id="obj-title"></div><div class="obj-bar"><i id="obj-fill"></i></div>
     <div class="obj-dash">ROLAR [ESPAÇO]<div class="obj-bar"><i id="dash-fill"></i></div></div></div>
     <div id="obj-arrow">➤</div>`);

  function showIntro(idx, name) {
    const old = $('chapter-intro'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'chapter-intro';
    el.innerHTML = `<small>CAPÍTULO ${idx + 1}</small><b>${name.replace(/^STAGE \d+:\s*/, '')}</b><em>${TAGLINES[idx] || ''}</em>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4600);
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !(e.target && e.target.tagName === 'INPUT')) { e.preventDefault(); doDash(); }
  });

  const ctl = document.querySelector('.controls-table tbody');
  if (ctl) ctl.insertAdjacentHTML('beforeend',
    '<tr><td>ESPAÇO</td><td>Rolar/dash com invulnerabilidade curta (solta Jockey)</td></tr>' +
    '<tr><td>OBJETIVO</td><td>Cruze o mapa até o SAFE ROOM verde e fique dentro 3s para trancar a porta. Tiros acordam zumbis adormecidos; golpes corpo a corpo são silenciosos.</td></tr>');

  /* ---------- 8. TELA DE INÍCIO ---------- */
  $('modal-title').innerHTML = `
  <div class="ts">
    <div class="ts-sun"></div><div class="ts-city"></div><div class="ts-grid"></div>
    <div class="ts-vignette"></div>
    <div class="ts-content">
      <div class="ts-kicker">▶ SOBREVIVA // ELIMINE // COMBO</div>
      <h1 class="ts-logo"><span class="l4">LEFT</span><span class="n4">4</span><span class="mi" data-text="MIAMI">MIAMI</span><span class="two">2</span></h1>
      <div class="ts-sub">RETRO BLOODLINE</div>
      <ul class="ts-menu" id="ts-menu">
        <li data-act="campaign">CAMPANHA <small>5 CAPÍTULOS · SAFE ROOMS</small></li>
        <li data-act="survival">SOBREVIVÊNCIA <small>ONDAS INFINITAS</small></li>
        <li data-act="shop">ARMÁRIO <small>COSMÉTICOS</small></li>
        <li data-act="controls">CONTROLES</li>
      </ul>
      <div class="ts-seed"><label for="seed-input">SEED</label>
        <input id="seed-input" type="text" maxlength="16" placeholder="ALEATÓRIA" autocomplete="off" spellcheck="false">
        <button onclick="Game.rollSeedInput()">SORTEAR</button></div>
      <div class="ts-crew" id="ts-crew"></div>
      <div class="ts-foot">PONTOS <span id="title-points">0</span> &nbsp;·&nbsp; ↑ ↓ ENTER</div>
    </div>
  </div>`;
  const city = document.querySelector('.ts-city');
  for (let i = 0; i < 34; i++) { const b = document.createElement('i'); b.style.height = (25 + Math.random() * 75) + '%'; b.style.flex = (1 + Math.random() * 1.6).toFixed(2); city.appendChild(b); }

  let sel = 0;
  const items = () => document.querySelectorAll('#ts-menu li');
  const paint = () => items().forEach((li, i) => li.classList.toggle('sel', i === sel));
  function runAct(a) {
    if (a === 'campaign') Game.startCampaign(); else if (a === 'survival') Game.startSurvival();
    else if (a === 'shop') Game.openShop(); else if (a === 'controls') Game.openControls();
  }
  items().forEach((li, i) => { li.onmouseenter = () => { sel = i; paint(); }; li.onclick = () => runAct(li.dataset.act); });
  function renderCrew() {
    const box = $('ts-crew'); box.innerHTML = '';
    Object.keys(SURVIVORS).forEach(k => {
      const s = SURVIVORS[k], d = document.createElement('div');
      d.className = 'crew' + (Game.selectedSurvivor === k ? ' on' : '');
      d.style.setProperty('--c', '#' + s.shirtColor.toString(16).padStart(6, '0'));
      d.innerHTML = `<b>${s.name}</b><small>${s.passive}</small>`;
      d.onclick = () => { Game.selectedSurvivor = k; renderCrew(); };
      box.appendChild(d);
    });
  }
  renderCrew(); paint();

  /* ---------- 9. TELA DE MORTE ---------- */
  const QUOTES = ['Eles não cansam. Você sim.', 'Mais uma tentativa. Sempre há mais uma.', 'A horda não esquece.', 'O safe room estava logo ali...', 'Dica: role com ESPAÇO antes do impacto.', 'Granadas atraem. Use isso.'];
  $('modal-death').innerHTML = `
  <div class="ds">
    <div class="ds-noise"></div>
    <div class="ds-content">
      <div class="ds-pre">// SINAL PERDIDO</div>
      <h1 class="ds-title" data-text="VOCÊ MORREU">VOCÊ MORREU</h1>
      <div class="ds-cause" id="death-cause">DEVORADO PELA HORDA</div>
      <div class="ds-stats">
        <div><b id="ds-kills">0</b><small>ABATES</small></div><div><b id="ds-score">0</b><small>PONTOS</small></div>
        <div><b id="ds-time">0s</b><small>SOBREVIVEU</small></div><div><b id="ds-combo">x1</b><small>COMBO MÁX</small></div>
      </div>
      <ul class="ds-menu">
        <li onclick="Game.restartStage()"><kbd>R</kbd> TENTAR DE NOVO</li>
        <li onclick="Game.newSeedRestart()"><kbd>N</kbd> NOVO MAPA</li>
        <li onclick="Game.returnToTitle()"><kbd>M</kbd> MENU PRINCIPAL</li>
      </ul>
      <div class="ds-quote" id="ds-quote"></div>
    </div>
  </div>`;

  const _show = Game.showModal;
  Game.showModal = function (id) {
    if (id === 'modal-death') {
      $('ds-kills').innerText = this.kills; $('ds-score').innerText = this.score.toLocaleString();
      $('ds-time').innerText = Math.floor(this.stageClock) + 's'; $('ds-combo').innerText = 'x' + this.maxCombo;
      $('ds-quote').innerText = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      const o = $('exit-obj'); if (o) o.remove();
      const hud = $('obj-hud'); if (hud) hud.style.display = 'none';
      $('obj-arrow').style.display = 'none';
    }
    if (id === 'modal-title') { renderCrew(); sel = 0; paint(); }
    return _show.call(this, id);
  };

  document.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const open = document.querySelectorAll('.modal-overlay.visible');
    if (open.length !== 1) return;
    if (open[0].id === 'modal-title') {
      if (e.code === 'ArrowDown') { sel = (sel + 1) % items().length; paint(); }
      else if (e.code === 'ArrowUp') { sel = (sel + items().length - 1) % items().length; paint(); }
      else if (e.code === 'Enter') runAct(items()[sel].dataset.act);
    } else if (open[0].id === 'modal-death') {
      if (e.code === 'KeyN') Game.newSeedRestart(); else if (e.code === 'KeyM') Game.returnToTitle();
    }
  });
})();
/* ==========================================================================
   AJUSTE: zumbis com movimento irregular + hordas espaçadas
   (cole no FINAL do game.js)
   ========================================================================== */
(function () {
  'use strict';

  /* ---- 1. Movimento: zigue-zague de longe, tropeços, reto de perto ---- */
  Zombie.prototype.steer = function (dt, tx, tz, field, mul) {
    mul = mul || 1;
    if (this.weavePhase === undefined) {
      this.weavePhase = Math.random() * 6.28;
      this.weaveFreq = 1.2 + Math.random() * 1.6;
      this.weaveAmp = 0.35 + Math.random() * 0.5;
      this.pauseT = 0;
      this.pauseCd = 2 + Math.random() * 4;
    }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    let ux = dx / d, uz = dz / d;

    if (d > 3 && field && !Nav.lineClear(Game.map, this.x, this.z, tx, tz)) {
      if (Nav.dir(Game.map, field, this.x, this.z, _dirTmp)) { ux = _dirTmp.x; uz = _dirTmp.z; }
    }

    if (d > 3.5 && this.type !== 'tank' && this.type !== 'witch') {
      this.weavePhase += dt * this.weaveFreq;
      const w = Math.sin(this.weavePhase) * this.weaveAmp * Math.min(1, (d - 3.5) / 6);
      const bx = ux, bz = uz;
      ux = bx - bz * w; uz = bz + bx * w;
      const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    }

    if (this.type === 'common') {
      if (this.pauseT > 0) { this.pauseT -= dt; mul *= 0.15; }
      else {
        this.pauseCd -= dt;
        if (this.pauseCd <= 0) {
          this.pauseCd = 2.5 + Math.random() * 5;
          if (Math.random() < 0.35) this.pauseT = 0.3 + Math.random() * 0.5;
        }
      }
    }

    this.moveBy(ux * this.speed * mul * dt, uz * this.speed * mul * dt);
    this.mesh.rotation.y = Math.atan2(ux, uz);
    if (this.type === 'common' && this.torsoGroup)
      this.torsoGroup.rotation.z = Math.sin(this.walkTime * 0.7 + this.weavePhase) * 0.1;
  };

  /* ---- 2. Horda: quantidade fixa, nasce aos poucos, intervalo de 60 a 110s ---- */
  Game.triggerDirectorEvent = function (text) {
    const d = this.director;
    d.state = "HORDE";
    d.timer = 0;
    d.spawnAcc = 0;
    d.hordeLeft = 16 + Math.floor(Math.random() * 8);
    d.nextHorde = 60 + Math.random() * 50;
    audio.isHorde = true;
    const banner = document.getElementById('ui-director-banner');
    banner.innerText = text;
    banner.classList.add('active');
    audio.playSpecialAlert('horde');
  };

  Game.updateDirector = function (dt) {
    const d = this.director;
    d.timer += dt;
    d.specialTimer += dt;

    if (d.state === "PEACE") {
      if (d.timer > (d.nextHorde || 60)) { d.timer = 0; this.triggerDirectorEvent("HORDE APPROACHING!"); }
    } else if (d.state === "HORDE") {
      d.spawnAcc = (d.spawnAcc || 0) + dt;
      if (d.spawnAcc > 0.35 && d.hordeLeft > 0 && this.zombies.length < 45) {
        d.spawnAcc = 0; d.hordeLeft--;
        this.spawnHordeZombie();
      }
      if (d.timer > 12.0) {
        d.state = "PEACE"; d.timer = 0;
        audio.isHorde = false;
        document.getElementById('ui-director-banner').classList.remove('active');
      }
    }

    if (d.specialTimer > 18.0) {
      d.specialTimer = 0;
      this.spawnSpecialInfected(['smoker', 'hunter', 'boomer', 'spitter', 'charger', 'jockey'][Math.floor(Math.random() * 6)]);
    }

    if (!d.tankSpawned && (this.stageClock > 90.0 || this.kills >= 65)) {
      d.tankSpawned = true;
      this.spawnSpecialInfected('tank');
    }
  };
})();