/* ==========================================================================
   LEFT 4 MIAMI 2 // RETRO BLOODLINE - GAME ENGINE
   ========================================================================== */

/* ==========================================================================
   1. WEB AUDIO SYNTHESIZER ENGINE (PROCEDURAL SYNTHWAVE & SFX)
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
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
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
      const secondsPerStep = (60.0 / tempo) / 4.0;
      this.nextNoteTime += secondsPerStep;
      this.step = (this.step + 1) % 16;
    }
    setTimeout(() => this.scheduleLoop(), 40);
  }

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
      this.synthLead(time, leadNote, 0.12);
    }
  }

  synthKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.08);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  synthSnare(time) {
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 800;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.13);
  }

  synthHiHat(time, vol = 0.05) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(8000, time);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.05);
  }

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

  synthLead(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur);
  }

  playPistol() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.08);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  playShotgun() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(25, time + 0.22);
    oscGain.gain.setValueAtTime(1.0, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.26);

    const bufSize = this.ctx.sampleRate * 0.2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.9, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    noise.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(time);
    noise.stop(time + 0.21);
  }

  playRifle() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.11);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.13);
  }

  playPanClang() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(880, time);
    osc2.type = 'triangle'; osc2.frequency.setValueAtTime(1420, time);
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc1.connect(gain); osc2.connect(gain);
    gain.connect(this.sfxGain);
    osc1.start(time); osc2.start(time);
    osc1.stop(time + 0.52); osc2.stop(time + 0.52);
  }

  playChainsaw() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110 + Math.random() * 40, time);
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.11);
  }

  playExplosion() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, time);
    osc.frequency.exponentialRampToValueAtTime(20, time + 0.6);
    gain.gain.setValueAtTime(1.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.75);
  }

  playZombieHit() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.09);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.11);
  }

  playSpecialAlert(type) {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';

    if (type === 'tank') {
      osc.frequency.setValueAtTime(60, time);
      osc.frequency.linearRampToValueAtTime(120, time + 0.4);
      gain.gain.setValueAtTime(0.9, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
    } else if (type === 'witch') {
      osc.frequency.setValueAtTime(800, time);
      osc.frequency.linearRampToValueAtTime(1200, time + 0.5);
      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
    } else {
      osc.frequency.setValueAtTime(300, time);
      osc.frequency.exponentialRampToValueAtTime(150, time + 0.3);
      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    }
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.85);
  }

  playPipeBombBeep() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, time);
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  playBileSplash() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, time);
    osc.frequency.linearRampToValueAtTime(90, time + 0.25);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  playShove() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  playPunch() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.1);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.13);
  }

  playDryClick() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, time);
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.04);
  }

  playPickup() {
    if (!this.initialized) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, time);
    osc.frequency.exponentialRampToValueAtTime(880, time + 0.09);
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.12);
  }
}

const audio = new AudioManager();

/* ==========================================================================
   2. WEAPONS, ITEMS & SURVIVORS DATABASE
   ========================================================================== */
const WEAPONS = {
  p220: { name: "P220", type: "gun", subtype: "pistol", dmg: 32, rate: 0.22, clip: 15, maxRes: 150, spread: 0.04, color: 0xcccccc, sound: "pistol" },
  glock: { name: "GLOCK", type: "gun", subtype: "pistol", dmg: 26, rate: 0.14, clip: 20, maxRes: 180, spread: 0.06, color: 0x333333, sound: "pistol" },
  magnum: { name: "MAGNUM", type: "gun", subtype: "pistol", dmg: 95, rate: 0.42, clip: 8, maxRes: 80, spread: 0.02, color: 0xe6e6fa, sound: "shotgun" },

  uzi: { name: "SMG UZI", type: "gun", subtype: "smg", dmg: 25, rate: 0.08, clip: 50, maxRes: 350, spread: 0.09, color: 0x444455, sound: "pistol" },
  silenced_smg: { name: "MAC-10 SILENCED", type: "gun", subtype: "smg", dmg: 27, rate: 0.075, clip: 50, maxRes: 350, spread: 0.07, color: 0x222222, sound: "pistol" },
  mp5: { name: "MP5 NEON", type: "gun", subtype: "smg", dmg: 30, rate: 0.095, clip: 30, maxRes: 270, spread: 0.05, color: 0x00f3ff, sound: "rifle" },

  pump: { name: "PUMP SHOTGUN", type: "shotgun", subtype: "shotgun", dmg: 22, pellets: 8, rate: 0.75, clip: 8, maxRes: 72, spread: 0.16, color: 0x8b5a2b, sound: "shotgun" },
  chrome: { name: "CHROME SHOTGUN", type: "shotgun", subtype: "shotgun", dmg: 24, pellets: 8, rate: 0.72, clip: 8, maxRes: 72, spread: 0.13, color: 0xeeeeee, sound: "shotgun" },
  tactical: { name: "TACTICAL SHOTGUN", type: "shotgun", subtype: "shotgun", dmg: 18, pellets: 10, rate: 0.35, clip: 10, maxRes: 90, spread: 0.17, color: 0x2e4053, sound: "shotgun" },
  spas: { name: "SPAS-12 AUTO", type: "shotgun", subtype: "shotgun", dmg: 20, pellets: 10, rate: 0.28, clip: 10, maxRes: 90, spread: 0.15, color: 0xff007f, sound: "shotgun" },

  m16: { name: "M16 RIFLE", type: "gun", subtype: "rifle", dmg: 38, rate: 0.10, clip: 50, maxRes: 300, spread: 0.05, color: 0x1b4f72, sound: "rifle" },
  ak47: { name: "AK-47", type: "gun", subtype: "rifle", dmg: 52, rate: 0.13, clip: 40, maxRes: 240, spread: 0.08, color: 0xa04000, sound: "rifle" },
  scar: { name: "SCAR BURST", type: "burst", subtype: "rifle", dmg: 46, burstCount: 3, burstGap: 0.06, rate: 0.38, clip: 60, maxRes: 300, spread: 0.04, color: 0xb7950b, sound: "rifle" },
  hunting_rifle: { name: "HUNTING RIFLE", type: "gun", subtype: "rifle", dmg: 105, rate: 0.38, clip: 15, maxRes: 90, spread: 0.01, color: 0x566573, sound: "rifle" },
  military_sniper: { name: "SNIPER MILITAR", type: "gun", subtype: "rifle", dmg: 130, rate: 0.32, clip: 30, maxRes: 120, spread: 0.01, color: 0x17202a, sound: "rifle" },

  grenade_launcher: { name: "LANÇA-GRANADAS", type: "launcher", subtype: "launcher", dmg: 280, rate: 1.1, clip: 1, maxRes: 25, spread: 0.02, color: 0x7d6608, sound: "shotgun" },
  m60: { name: "M60 HEAVY", type: "gun", subtype: "rifle", dmg: 60, rate: 0.085, clip: 150, maxRes: 0, spread: 0.07, color: 0x78281f, sound: "rifle" },

  fireaxe: { name: "MACHADO DE BOMBEIRO", type: "melee", subtype: "fireaxe", dmg: 125, rate: 0.6, range: 2.8, color: 0xc0392b, sound: "melee" },
  katana: { name: "KATANA NEON", type: "melee", subtype: "katana", dmg: 110, rate: 0.38, range: 3.0, color: 0x00f3ff, sound: "melee" },
  baseball_bat: { name: "BASTÃO DE BASEBALL", type: "melee", subtype: "bat", dmg: 90, rate: 0.44, range: 2.6, color: 0xd35400, sound: "melee" },
  frying_pan: { name: "FRIGIDEIRA (CLANG!)", type: "melee", subtype: "pan", dmg: 100, rate: 0.48, range: 2.4, color: 0x17202a, sound: "pan" },
  chainsaw: { name: "MOTOSSERRA", type: "chainsaw", subtype: "chainsaw", dmg: 45, rate: 0.06, fuel: 100, range: 2.7, color: 0xf39c12, sound: "chainsaw" },
  crowbar: { name: "PÉ DE CABRA", type: "melee", subtype: "crowbar", dmg: 85, rate: 0.36, range: 2.5, color: 0x7f8c8d, sound: "melee" },
  knife: { name: "FACA DE COMBATE", type: "melee", subtype: "knife", dmg: 65, rate: 0.22, range: 2.0, color: 0xbdc3c7, sound: "melee" },
  guitar: { name: "GUITARRA ELÉTRICA", type: "melee", subtype: "guitar", dmg: 115, rate: 0.52, range: 2.9, color: 0x8e44ad, sound: "melee" }
};

const SURVIVORS = {
  coach: { name: "COACH", maxHp: 125, speed: 7.2, passive: "+25 HP & DANO CORPO A CORPO", shirtColor: 0x2471a3, skinColor: 0x5d4037, hairColor: 0x111111, pantsColor: 0x1a252f, hat: "cap" },
  ellis: { name: "ELLIS", maxHp: 100, speed: 8.5, passive: "+18% VELOCIDADE & RECARGA RÁPIDA", shirtColor: 0xf1c40f, skinColor: 0xffd1b3, hairColor: 0x8b5a2b, pantsColor: 0x2874a6, hat: "cap" },
  nick: { name: "NICK", maxHp: 100, speed: 7.6, passive: "+20% CADÊNCIA & PONTUAÇÃO EXTRA", shirtColor: 0xecf0f1, skinColor: 0xf5cba7, hairColor: 0x1c2833, pantsColor: 0xd5dbdb, hat: "none" },
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

/* ==========================================================================
   SHARED GEOMETRIES & MATERIALS POOL (ZERO ALLOC PERFORMANCE)
   ========================================================================== */
const SHARED = {
  geos: {},
  mats: {},
  init() {
    this.geos.head = new THREE.SphereGeometry(0.28, 8, 8);
    this.geos.head.userData.isShared = true;

    this.geos.neck = new THREE.CylinderGeometry(0.12, 0.14, 0.2, 6);
    this.geos.neck.userData.isShared = true;

    this.geos.torso = new THREE.BoxGeometry(0.68, 0.72, 0.42);
    this.geos.torso.userData.isShared = true;

    this.geos.pelvis = new THREE.BoxGeometry(0.6, 0.3, 0.38);
    this.geos.pelvis.userData.isShared = true;

    this.geos.upperLimb = new THREE.CylinderGeometry(0.11, 0.1, 0.45, 6);
    this.geos.upperLimb.userData.isShared = true;

    this.geos.lowerLimb = new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6);
    this.geos.lowerLimb.userData.isShared = true;

    this.geos.foot = new THREE.BoxGeometry(0.18, 0.12, 0.32);
    this.geos.foot.userData.isShared = true;

    this.geos.hand = new THREE.SphereGeometry(0.1, 6, 6);
    this.geos.hand.userData.isShared = true;

    this.geos.tankTorso = new THREE.BoxGeometry(1.8, 1.6, 1.2);
    this.geos.tankTorso.userData.isShared = true;

    this.geos.boomerBelly = new THREE.SphereGeometry(0.9, 10, 10);
    this.geos.boomerBelly.userData.isShared = true;

    this.geos.casing = new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6);
    this.geos.casing.userData.isShared = true;

    this.mats.casing = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.mats.casing.userData.isShared = true;

    this.mats.bloodDecal = new THREE.MeshBasicMaterial({ color: 0x770011, transparent: true, opacity: 0.82 });
    this.mats.bloodDecal.userData.isShared = true;

    this.mats.zombieEyes = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    this.mats.zombieEyes.userData.isShared = true;
  }
};

function disposeHierarchy(obj) {
  if (!obj) return;
  obj.traverse(child => {
    if (child.isMesh) {
      if (child.geometry && !child.geometry.userData.isShared) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { if (!m.userData.isShared) m.dispose(); });
        } else if (!child.material.userData.isShared) {
          child.material.dispose();
        }
      }
    }
  });
}

/* ==========================================================================
   3. GAME STATE & SINGLETON ENGINE
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

  isRunning: false,
  isPaused: false,
  gameMode: "campaign",
  currentStageIdx: 0,
  stageStartTime: 0,

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
  droppedWeapons: [],
  props: [],
  particles: [],
  pools: [],
  bloodDecals: [],

  keys: {},
  mousePos: { x: 0, y: 0 },
  mouseWorldPos: new THREE.Vector3(),
  mouseDown: false,
  mouseRightDown: false,

  director: {
    intensity: 0,
    state: "PEACE",
    timer: 0,
    hordeDuration: 0,
    specialTimer: 0,
    tankSpawned: false
  },

  cameraShake: 0,

  startCampaign() {
    audio.init();
    this.gameMode = "campaign";
    this.currentStageIdx = 0;
    this.hideAllModals();
    this.loadStage(this.currentStageIdx);
  },

  startSurvival() {
    audio.init();
    this.gameMode = "survival";
    this.hideAllModals();
    this.loadStage(-1);
  },

  openShop() {
    this.renderShop();
    this.showModal('modal-shop');
  },

  openControls() {
    this.showModal('modal-controls');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('visible');
  },

  showModal(id) {
    document.getElementById(id).classList.add('visible');
  },

  hideAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('visible'));
  },

  togglePause() {
    if (!this.isRunning || (this.player && this.player.isDead)) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.showModal('modal-pause');
    } else {
      this.closeModal('modal-pause');
    }
  },

  returnToTitle() {
    this.isRunning = false;
    this.isPaused = false;
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

  applyHitStop(duration = 0.045) {
    this.hitStopTimer = duration;
  },

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
        <div class="shop-item-cost">${s.passive}</div>
      `;
      div.onclick = () => {
        this.selectedSurvivor = k;
        this.renderShop();
      };
      sGrid.appendChild(div);
    });

    const hGrid = document.getElementById('grid-hats');
    hGrid.innerHTML = '';
    COSMETICS.hats.forEach(h => {
      const owned = this.unlockedItems.includes(h.id);
      const isEquipped = (this.selectedHat === h.id);
      const div = document.createElement('div');
      div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
      div.innerHTML = `
        <div class="shop-item-name">${h.name}</div>
        <div class="shop-item-cost">${owned ? (isEquipped ? 'EQUIPADO' : 'USAR') : h.cost + ' PTS'}</div>
      `;
      div.onclick = () => {
        if (owned) {
          this.selectedHat = h.id;
        } else if (this.points >= h.cost) {
          this.points -= h.cost;
          this.unlockedItems.push(h.id);
          this.selectedHat = h.id;
        } else {
          alert("Pontos insuficientes!");
        }
        this.renderShop();
      };
      hGrid.appendChild(div);
    });

    const skGrid = document.getElementById('grid-skins');
    skGrid.innerHTML = '';
    COSMETICS.skins.forEach(sk => {
      const owned = this.unlockedItems.includes(sk.id);
      const isEquipped = (this.selectedSkin === sk.id);
      const div = document.createElement('div');
      div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
      div.innerHTML = `
        <div class="shop-item-name">${sk.name}</div>
        <div class="shop-item-cost">${owned ? (isEquipped ? 'EQUIPADO' : 'USAR') : sk.cost + ' PTS'}</div>
      `;
      div.onclick = () => {
        if (owned) {
          this.selectedSkin = sk.id;
        } else if (this.points >= sk.cost) {
          this.points -= sk.cost;
          this.unlockedItems.push(sk.id);
          this.selectedSkin = sk.id;
        } else {
          alert("Pontos insuficientes!");
        }
        this.renderShop();
      };
      skGrid.appendChild(div);
    });
  }
};

/* ==========================================================================
   4. STAGE GENERATOR & MAP LAYOUTS
   ========================================================================== */
const STAGES_DATA = [
  { name: "STAGE 1: LIBERTY SHOPPING MALL", size: { w: 90, h: 90 }, floorColor: 0x1a1528, wallColor: 0x3d1c5a },
  { name: "STAGE 2: MERCY HOSPITAL", size: { w: 80, h: 100 }, floorColor: 0x102028, wallColor: 0x1f455b },
  { name: "STAGE 3: DOWNTOWN CAR ALARMS", size: { w: 100, h: 80 }, floorColor: 0x181820, wallColor: 0x403525 },
  { name: "STAGE 4: WHISPERING MANSION", size: { w: 85, h: 85 }, floorColor: 0x241410, wallColor: 0x5a2d22 },
  { name: "STAGE 5: THE RIVER HIGHWAY BRIDGE", size: { w: 60, h: 140 }, floorColor: 0x111118, wallColor: 0x303038 }
];

Game.loadStage = function(stageIdx) {
  while (this.scene.children.length > 0) {
    const obj = this.scene.children[0];
    this.scene.remove(obj);
    disposeHierarchy(obj);
  }

  this.zombies = [];
  this.corpses = [];
  this.gibPieces = [];
  this.casings = [];
  this.bullets = [];
  this.projectiles = [];
  this.droppedWeapons = [];
  this.props = [];
  this.particles = [];
  this.pools = [];
  this.bloodDecals = [];

  this.stageStartTime = performance.now();
  this.kills = 0;
  this.damageTaken = 0;
  this.combo = 1;
  this.comboTimer = 0;
  this.maxCombo = 1;
  this.score = 0;
  this.hitStopTimer = 0;
  this.director.intensity = 0;
  this.director.state = "PEACE";
  this.director.timer = 0;
  this.director.specialTimer = 4.0;
  this.director.tankSpawned = false;
  audio.isHorde = false;
  audio.isTank = false;

  const isSurvival = (stageIdx === -1);
  const stageInfo = isSurvival
    ? { name: "MODO SOBREVIVÊNCIA // ONDAS INFINITAS", size: { w: 100, h: 100 }, floorColor: 0x1c0f24, wallColor: 0x5c1b48 }
    : STAGES_DATA[stageIdx];

  document.getElementById('ui-stage-title').innerText = stageInfo.name;
  document.getElementById('ui-director-banner').classList.remove('active');
  document.getElementById('ui-reload-fill').style.width = '0%';

  const amb = new THREE.AmbientLight(0x403055, 1.2);
  this.scene.add(amb);

  const dirLight = new THREE.DirectionalLight(0xff007f, 0.6);
  dirLight.position.set(20, 40, 20);
  this.scene.add(dirLight);

  const cyanLight = new THREE.DirectionalLight(0x00f3ff, 0.5);
  cyanLight.position.set(-20, 40, -20);
  this.scene.add(cyanLight);

  const floorGeo = new THREE.PlaneGeometry(stageInfo.size.w, stageInfo.size.h);
  const floorMat = new THREE.MeshLambertMaterial({ color: stageInfo.floorColor });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  this.scene.add(floor);

  const grid = new THREE.GridHelper(Math.max(stageInfo.size.w, stageInfo.size.h), 40, 0xff007f, 0x221133);
  grid.position.y = 0.02;
  this.scene.add(grid);

  const wallHeight = 4.5;
  const wallThick = 1.5;
  const wallMat = new THREE.MeshLambertMaterial({ color: stageInfo.wallColor });
  const hw = stageInfo.size.w / 2;
  const hh = stageInfo.size.h / 2;

  this.createWall(0, -hh, stageInfo.size.w, wallThick, wallHeight, wallMat);
  this.createWall(0, hh, stageInfo.size.w, wallThick, wallHeight, wallMat);
  this.createWall(-hw, 0, wallThick, stageInfo.size.h, wallHeight, wallMat);
  this.createWall(hw, 0, wallThick, stageInfo.size.h, wallHeight, wallMat);

  this.buildStageLayout(stageIdx, hw, hh, wallMat);

  const surv = SURVIVORS[this.selectedSurvivor];
  this.player = new Player(0, 0, surv);
  this.scene.add(this.player.mesh);

  this.spawnGroundWeapon(3, 0, 'uzi');
  this.spawnGroundWeapon(-3, 0, 'pump');
  this.spawnGroundWeapon(0, 4, 'fireaxe');
  this.spawnGroundWeapon(0, -4, 'p220');

  this.spawnProp(8, 8, 'barrel');
  this.spawnProp(-8, -8, 'gas_can');
  this.spawnProp(14, -12, 'propane');

  if (stageIdx === 2 || stageIdx === 0) {
    this.spawnProp(10, -5, 'car', true);
    this.spawnProp(-12, 10, 'car', false);
  }

  this.isRunning = true;
  this.isPaused = false;
  this.updateHUD();
};

Game.createWall = function(x, z, w, d, h, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, h / 2, z);
  this.scene.add(mesh);
  this.props.push({ type: 'wall', x, z, w, d, halfW: w / 2, halfD: d / 2, mesh });
};

Game.buildStageLayout = function(idx, hw, hh, wallMat) {
  if (idx === 0) {
    this.createWall(-15, -15, 18, 1.2, 4, wallMat);
    this.createWall(15, -15, 18, 1.2, 4, wallMat);
    this.createWall(-15, 15, 18, 1.2, 4, wallMat);
    this.createWall(15, 15, 18, 1.2, 4, wallMat);
    this.spawnGroundWeapon(15, -18, 'spas');
    this.spawnGroundWeapon(-15, 18, 'katana');
  } else if (idx === 1) {
    for (let z = -30; z <= 30; z += 20) {
      this.createWall(-12, z, 20, 1.2, 4, wallMat);
      this.createWall(16, z + 10, 20, 1.2, 4, wallMat);
    }
    this.spawnGroundWeapon(-10, -25, 'magnum');
    this.spawnGroundWeapon(12, 25, 'tactical');
  } else if (idx === 2) {
    this.createWall(-20, 0, 8, 40, 4, wallMat);
    this.createWall(20, 0, 8, 40, 4, wallMat);
    this.spawnGroundWeapon(0, 15, 'ak47');
    this.spawnGroundWeapon(0, -15, 'chainsaw');
  } else if (idx === 3) {
    this.createWall(0, -15, 35, 1.5, 4, wallMat);
    this.createWall(-18, 10, 1.5, 30, 4, wallMat);
    this.createWall(18, 10, 1.5, 30, 4, wallMat);
    this.spawnZombie(0, 5, 'witch');
    this.spawnGroundWeapon(-15, -20, 'hunting_rifle');
  } else if (idx === 4) {
    for (let z = -50; z <= 50; z += 25) {
      const offset = (z % 50 === 0) ? -8 : 8;
      this.createWall(offset, z, 14, 2, 4, wallMat);
      this.spawnProp(-offset, z, 'barrel');
    }
    this.spawnGroundWeapon(0, -40, 'grenade_launcher');
    this.spawnGroundWeapon(0, 0, 'm60');
  } else {
    this.createWall(-16, -16, 8, 8, 4, wallMat);
    this.createWall(16, -16, 8, 8, 4, wallMat);
    this.createWall(-16, 16, 8, 8, 4, wallMat);
    this.createWall(16, 16, 8, 8, 4, wallMat);
    this.spawnGroundWeapon(0, 10, 'm16');
    this.spawnGroundWeapon(0, -10, 'spas');
  }
};

/* ==========================================================================
   5. PLAYER CLASS (HUMAN SILHOUETTE, PROCEDURAL ANIMATION, HOTLINE MIAMI)
   ========================================================================== */
class Player {
  constructor(x, z, survivorData) {
    this.x = x;
    this.z = z;
    this.survivor = survivorData;
    this.hp = survivorData.maxHp;
    this.maxHp = survivorData.maxHp;
    this.tempHp = 0;
    this.speed = survivorData.speed;
    this.isDead = false;

    this.adrenalineTime = 0;
    this.bileTime = 0;
    this.jockeyTarget = null;
    this.jockeyTime = 0;

    this.weapon = JSON.parse(JSON.stringify(WEAPONS.p220));
    this.mag = this.weapon.clip;
    this.reserve = this.weapon.maxRes;

    this.lastFireTime = 0;
    this.lastThrowTime = 0;
    this.lastPunchTime = 0;
    this.lastShoveTime = 0;

    this.isReloading = false;
    this.reloadProgress = 0;

    this.specialAmmoType = "PADRÃO";
    this.specialAmmoShots = 0;

    this.throwable = { name: "PIPE BOMB", type: "pipe_bomb", count: 1 };
    this.med = { name: "MEDKIT", type: "medkit", count: 1 };

    this.walkTime = 0;
    this.punchAnim = 0;
    this.punchArm = 'R';
    this.recoilAnim = 0;

    this.buildMesh();
    this.attachCosmeticHat(Game.selectedHat);
    this.updateWeaponMesh();
  }

  buildMesh() {
    this.mesh = new THREE.Group();
    this.mesh.position.set(this.x, 0, this.z);

    const skinMat = new THREE.MeshLambertMaterial({ color: this.survivor.skinColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: this.survivor.shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: this.survivor.pantsColor });
    const hairMat = new THREE.MeshLambertMaterial({ color: this.survivor.hairColor });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.85;
    this.mesh.add(this.pelvis);

    const pelvisMesh = new THREE.Mesh(SHARED.geos.pelvis, pantsMat);
    this.pelvis.add(pelvisMesh);

    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.2;
    this.pelvis.add(this.torsoGroup);

    const torsoMesh = new THREE.Mesh(SHARED.geos.torso, shirtMat);
    torsoMesh.position.y = 0.36;
    this.torsoGroup.add(torsoMesh);

    const neckMesh = new THREE.Mesh(SHARED.geos.neck, skinMat);
    neckMesh.position.y = 0.76;
    this.torsoGroup.add(neckMesh);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.95;
    this.torsoGroup.add(this.headGroup);

    const headMesh = new THREE.Mesh(SHARED.geos.head, skinMat);
    this.headGroup.add(headMesh);

    const hairGeo = new THREE.BoxGeometry(0.58, 0.22, 0.58);
    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.position.set(0, 0.18, -0.05);
    this.headGroup.add(hairMesh);

    const eyeGeo = new THREE.BoxGeometry(0.1, 0.06, 0.08);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.12, 0.02, 0.26);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.12, 0.02, 0.26);
    this.headGroup.add(eyeR);
    this.headGroup.add(eyeL);

    this.armL = new THREE.Group();
    this.armL.position.set(-0.42, 0.65, 0);
    this.torsoGroup.add(this.armL);

    const upperArmL = new THREE.Mesh(SHARED.geos.upperLimb, shirtMat);
    upperArmL.position.y = -0.22;
    this.armL.add(upperArmL);

    this.forearmL = new THREE.Group();
    this.forearmL.position.y = -0.42;
    this.armL.add(this.forearmL);

    const lowerArmL = new THREE.Mesh(SHARED.geos.lowerLimb, skinMat);
    lowerArmL.position.y = -0.2;
    this.forearmL.add(lowerArmL);

    const handL = new THREE.Mesh(SHARED.geos.hand, skinMat);
    handL.position.y = -0.4;
    this.forearmL.add(handL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.42, 0.65, 0);
    this.torsoGroup.add(this.armR);

    const upperArmR = new THREE.Mesh(SHARED.geos.upperLimb, shirtMat);
    upperArmR.position.y = -0.22;
    this.armR.add(upperArmR);

    this.forearmR = new THREE.Group();
    this.forearmR.position.y = -0.42;
    this.armR.add(this.forearmR);

    const lowerArmR = new THREE.Mesh(SHARED.geos.lowerLimb, skinMat);
    lowerArmR.position.y = -0.2;
    this.forearmR.add(lowerArmR);

    const handR = new THREE.Mesh(SHARED.geos.hand, skinMat);
    handR.position.y = -0.4;
    this.forearmR.add(handR);

    this.weaponMount = new THREE.Group();
    this.weaponMount.position.set(0, -0.4, 0.1);
    this.forearmR.add(this.weaponMount);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.2, -0.15, 0);
    this.pelvis.add(this.legL);

    const thighL = new THREE.Mesh(SHARED.geos.upperLimb, pantsMat);
    thighL.position.y = -0.22;
    this.legL.add(thighL);

    this.shinL = new THREE.Group();
    this.shinL.position.y = -0.42;
    this.legL.add(this.shinL);

    const calfL = new THREE.Mesh(SHARED.geos.lowerLimb, pantsMat);
    calfL.position.y = -0.2;
    this.shinL.add(calfL);

    const footL = new THREE.Mesh(SHARED.geos.foot, shoeMat);
    footL.position.set(0, -0.42, 0.08);
    this.shinL.add(footL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.2, -0.15, 0);
    this.pelvis.add(this.legR);

    const thighR = new THREE.Mesh(SHARED.geos.upperLimb, pantsMat);
    thighR.position.y = -0.22;
    this.legR.add(thighR);

    this.shinR = new THREE.Group();
    this.shinR.position.y = -0.42;
    this.legR.add(this.shinR);

    const calfR = new THREE.Mesh(SHARED.geos.lowerLimb, pantsMat);
    calfR.position.y = -0.2;
    this.shinR.add(calfR);

    const footR = new THREE.Mesh(SHARED.geos.foot, shoeMat);
    footR.position.set(0, -0.42, 0.08);
    this.shinR.add(footR);

    this.spotLight = new THREE.SpotLight(0xffffff, 2.0, 30, Math.PI / 5, 0.35);
    this.spotLight.position.set(0, 1.4, 0);
    this.spotLight.target.position.set(0, 1.4, 10);
    this.mesh.add(this.spotLight);
    this.mesh.add(this.spotLight.target);
  }

  attachCosmeticHat(hatId) {
    if (this.hatMesh) {
      this.headGroup.remove(this.hatMesh);
      disposeHierarchy(this.hatMesh);
    }
    let geo, mat;
    if (hatId === "cap") {
      geo = new THREE.BoxGeometry(0.65, 0.18, 0.75);
      mat = new THREE.MeshLambertMaterial({ color: 0x00f3ff });
    } else if (hatId === "helmet") {
      geo = new THREE.BoxGeometry(0.72, 0.32, 0.72);
      mat = new THREE.MeshLambertMaterial({ color: 0x2e4053 });
    } else if (hatId === "cowboy") {
      geo = new THREE.CylinderGeometry(0.55, 0.8, 0.2, 8);
      mat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    } else if (hatId && hatId.startsWith("mask")) {
      geo = new THREE.BoxGeometry(0.62, 0.62, 0.35);
      const col = hatId.includes("rooster") ? 0xff0044 : (hatId.includes("horse") ? 0x995533 : 0xffaa00);
      mat = new THREE.MeshLambertMaterial({ color: col });
    } else {
      return;
    }
    this.hatMesh = new THREE.Mesh(geo, mat);
    this.hatMesh.position.set(0, 0.28, 0.06);
    this.headGroup.add(this.hatMesh);
  }

  updateWeaponMesh() {
    while (this.weaponMount.children.length > 0) {
      const c = this.weaponMount.children[0];
      this.weaponMount.remove(c);
      disposeHierarchy(c);
    }

    if (!this.weapon) return;

    const skinData = COSMETICS.skins.find(s => s.id === Game.selectedSkin);
    const tint = skinData ? skinData.tint : 0xffffff;
    const wColor = (tint !== 0xffffff) ? tint : (this.weapon.color || 0x444444);
    const wMat = new THREE.MeshLambertMaterial({ color: wColor });

    const wModel = new THREE.Group();
    const sub = this.weapon.subtype || this.weapon.type;

    if (sub === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.45), wMat);
      slide.position.set(0, 0.05, 0.15);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.14), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      grip.position.set(0, -0.1, 0);
      wModel.add(slide); wModel.add(grip);
    } else if (sub === 'smg') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.65), wMat);
      body.position.set(0, 0.05, 0.2);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.12), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
      mag.position.set(0, -0.15, 0.1);
      wModel.add(body); wModel.add(mag);
    } else if (sub === 'shotgun') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), wMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.06, 0.4);
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 6), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, 0.02, 0.35);
      wModel.add(barrel); wModel.add(pump);
    } else if (sub === 'rifle') {
      const main = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 1.1), wMat);
      main.position.set(0, 0.05, 0.35);
      const curvedMag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      curvedMag.position.set(0, -0.18, 0.22);
      curvedMag.rotation.x = 0.25;
      wModel.add(main); wModel.add(curvedMag);
    } else if (sub === 'fireaxe') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xd35400 }));
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, 0.35);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.28), wMat);
      blade.position.set(0, 0.12, 0.85);
      wModel.add(handle); wModel.add(blade);
    } else if (sub === 'katana') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 1.3), new THREE.MeshBasicMaterial({ color: 0x00f3ff }));
      blade.position.set(0, 0.05, 0.55);
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0xffe600 }));
      guard.position.set(0, 0.05, 0.0);
      wModel.add(blade); wModel.add(guard);
    } else if (sub === 'pan') {
      const panBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      panBody.position.set(0, 0.05, 0.4);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      h.rotation.x = Math.PI / 2;
      h.position.set(0, 0.05, 0.15);
      wModel.add(panBody); wModel.add(h);
    } else if (sub === 'chainsaw') {
      const eng = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.32, 0.5), new THREE.MeshLambertMaterial({ color: 0xf39c12 }));
      eng.position.set(0, 0.05, 0.15);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.7), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      bl.position.set(0, 0.05, 0.65);
      wModel.add(eng); wModel.add(bl);
    } else {
      const generic = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 0.8), wMat);
      generic.position.set(0, 0.05, 0.3);
      wModel.add(generic);
    }

    this.weaponMount.add(wModel);
  }

  update(dt) {
    if (this.isDead) return;

    if (this.adrenalineTime > 0) {
      this.adrenalineTime -= dt;
      document.getElementById('adrenaline-overlay').style.opacity = '1';
    } else {
      document.getElementById('adrenaline-overlay').style.opacity = '0';
    }

    if (this.bileTime > 0) {
      this.bileTime -= dt;
      document.getElementById('bile-overlay').style.opacity = Math.min(1, this.bileTime / 3).toString();
    } else {
      document.getElementById('bile-overlay').style.opacity = '0';
    }

    if (this.tempHp > 0) {
      this.tempHp -= dt * 0.8;
      if (this.tempHp < 0) this.tempHp = 0;
    }

    let curSpeed = this.speed;
    if (this.adrenalineTime > 0) curSpeed *= 1.45;

    let dx = 0;
    let dz = 0;

    if (this.jockeyTime > 0) {
      this.jockeyTime -= dt;
      dx = (Math.random() - 0.5) * 1.5;
      dz = (Math.random() - 0.5) * 1.5;
    } else {
      if (Game.keys['KeyW'] || Game.keys['ArrowUp']) dz -= 1;
      if (Game.keys['KeyS'] || Game.keys['ArrowDown']) dz += 1;
      if (Game.keys['KeyA'] || Game.keys['ArrowLeft']) dx -= 1;
      if (Game.keys['KeyD'] || Game.keys['ArrowRight']) dx += 1;
    }

    const isMoving = (dx !== 0 || dz !== 0);

    if (isMoving) {
      const len = Math.hypot(dx, dz);
      dx = (dx / len) * curSpeed * dt;
      dz = (dz / len) * curSpeed * dt;

      const newX = this.x + dx;
      const newZ = this.z + dz;
      if (!Game.checkWallCollision(newX, this.z, 0.55)) this.x = newX;
      if (!Game.checkWallCollision(this.x, newZ, 0.55)) this.z = newZ;

      this.walkTime += dt * curSpeed * 2.2;
      const legAngle = Math.sin(this.walkTime) * 0.65;
      this.legL.rotation.x = legAngle;
      this.legR.rotation.x = -legAngle;
      this.shinL.rotation.x = Math.max(0, -legAngle * 0.6);
      this.shinR.rotation.x = Math.max(0, legAngle * 0.6);

      this.torsoGroup.rotation.x = 0.14;
    } else {
      this.legL.rotation.x *= 0.82;
      this.legR.rotation.x *= 0.82;
      this.shinL.rotation.x *= 0.82;
      this.shinR.rotation.x *= 0.82;

      this.torsoGroup.rotation.x = 0;
      this.torsoGroup.position.y = 0.2 + Math.sin(performance.now() * 0.003) * 0.02;
    }

    this.mesh.position.set(this.x, 0, this.z);

    const angle = Math.atan2(Game.mouseWorldPos.x - this.x, Game.mouseWorldPos.z - this.z);
    this.mesh.rotation.y = angle;

    if (this.recoilAnim > 0) {
      this.recoilAnim -= dt * 4;
      if (this.recoilAnim < 0) this.recoilAnim = 0;
    }

    if (this.punchAnim > 0) {
      this.punchAnim -= dt * 3.5;
      if (this.punchAnim < 0) this.punchAnim = 0;
    }

    if (this.weapon) {
      this.armR.rotation.x = -Math.PI / 2 + 0.1 - this.recoilAnim;
      this.armR.rotation.y = -0.15;
      this.forearmR.rotation.x = 0.1;

      this.armL.rotation.x = -Math.PI / 2 + 0.25;
      this.armL.rotation.y = 0.4;
      this.forearmL.rotation.x = 0.4;
    } else {
      if (this.punchAnim > 0) {
        const punchExt = Math.sin(this.punchAnim * Math.PI) * 0.8;
        if (this.punchArm === 'R') {
          this.armR.rotation.x = -Math.PI / 2 - punchExt * 0.3;
          this.forearmR.rotation.x = punchExt * 0.2;
          this.armL.rotation.x = -1.1;
        } else {
          this.armL.rotation.x = -Math.PI / 2 - punchExt * 0.3;
          this.forearmL.rotation.x = punchExt * 0.2;
          this.armR.rotation.x = -1.1;
        }
      } else {
        this.armR.rotation.x = -1.0;
        this.armR.rotation.y = -0.3;
        this.forearmR.rotation.x = 0.6;

        this.armL.rotation.x = -1.0;
        this.armL.rotation.y = 0.3;
        this.forearmL.rotation.x = 0.6;
      }
    }

    if (this.isReloading) {
      if (!this.weapon) {
        this.isReloading = false;
        this.reloadProgress = 0;
        document.getElementById('ui-reload-fill').style.width = '0%';
      } else {
        const reloadDuration = (this.survivor.name === "ELLIS" ? 1.3 : 1.8);
        this.reloadProgress += dt / reloadDuration;
        document.getElementById('ui-reload-fill').style.width = Math.min(100, this.reloadProgress * 100) + '%';
        if (this.reloadProgress >= 1.0) {
          this.completeReload();
        }
      }
    }

    if (Game.mouseDown && !this.isReloading) {
      this.triggerAttack();
    }

    if (Game.mouseRightDown) {
      this.triggerShove();
    }
  }

  triggerAttack() {
    const now = performance.now() / 1000;

    if (!this.weapon) {
      this.attackUnarmedPunch();
      return;
    }

    let rate = this.weapon.rate;
    if (this.survivor.name === "NICK") rate *= 0.82;
    if (this.adrenalineTime > 0) rate *= 0.7;

    if (now - this.lastFireTime < rate) return;
    this.lastFireTime = now;

    if (this.weapon.type === "melee") {
      this.attackMelee();
      return;
    }
    if (this.weapon.type === "chainsaw") {
      this.attackChainsaw();
      return;
    }

    if (this.mag <= 0) {
      audio.playDryClick();
      if (this.reserve > 0) {
        this.startReload();
      } else {
        Game.showPopup("SEM MUNIÇÃO! [Q PARA ARREMESSAR]", "#ff2a2a");
      }
      return;
    }

    this.mag--;
    this.recoilAnim = 0.25;
    Game.cameraShake = Math.min(Game.cameraShake + 4, 15);

    if (this.weapon.sound === "pistol") audio.playPistol();
    else if (this.weapon.sound === "shotgun") audio.playShotgun();
    else audio.playRifle();

    const origin = new THREE.Vector3(this.x, 1.25, this.z);
    const angle = this.mesh.rotation.y;

    Game.spawnCasing(this.x, 1.2, this.z, angle);

    if (this.weapon.type === "shotgun") {
      const count = this.weapon.pellets || 8;
      for (let i = 0; i < count; i++) {
        const spreadAngle = angle + (Math.random() - 0.5) * this.weapon.spread * 2;
        const dir = new THREE.Vector3(Math.sin(spreadAngle), 0, Math.cos(spreadAngle)).normalize();
        Game.shootBullet(origin, dir, this.weapon.dmg, this.specialAmmoType);
      }
    } else if (this.weapon.type === "launcher") {
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize();
      Game.spawnGrenade(origin, dir);
    } else {
      const spreadAngle = angle + (Math.random() - 0.5) * this.weapon.spread;
      const dir = new THREE.Vector3(Math.sin(spreadAngle), 0, Math.cos(spreadAngle)).normalize();
      Game.shootBullet(origin, dir, this.weapon.dmg, this.specialAmmoType);
    }

    if (this.specialAmmoShots > 0) {
      this.specialAmmoShots--;
      if (this.specialAmmoShots === 0) {
        this.specialAmmoType = "PADRÃO";
      }
    }

    Game.updateHUD();
  }

  attackUnarmedPunch() {
    const now = performance.now() / 1000;
    if (now - this.lastPunchTime < 0.32) return;
    this.lastPunchTime = now;
    this.punchAnim = 0.22;
    this.punchArm = (this.punchArm === 'R' ? 'L' : 'R');

    audio.playPunch();

    let dmg = 28;
    if (this.survivor.name === "COACH") dmg = 38;

    const angle = this.mesh.rotation.y;
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

    let hitAny = false;
    Game.zombies.forEach(z => {
      if (z.isDead) return;
      const toZ = new THREE.Vector3(z.x - this.x, 0, z.z - this.z);
      const dist = toZ.length();
      if (dist <= 1.9) {
        toZ.normalize();
        if (forward.dot(toZ) > 0.4) {
          z.takeDamage(dmg, forward.clone().multiplyScalar(10));
          z.stunTimer = Math.max(z.stunTimer, 0.4);
          Game.spawnBlood(z.x, z.z, 4);
          hitAny = true;
        }
      }
    });

    if (hitAny) {
      Game.cameraShake = 4;
      Game.applyHitStop(0.045);
    }
  }

  attackMelee() {
    if (!this.weapon) return;
    if (this.weapon.sound === "pan") audio.playPanClang();
    else audio.playShove();

    this.recoilAnim = 0.4;
    let dmg = this.weapon.dmg;
    if (this.survivor.name === "COACH") dmg *= 1.35;

    const angle = this.mesh.rotation.y;
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    let hitAny = false;

    Game.zombies.forEach(z => {
      if (z.isDead) return;
      const toZ = new THREE.Vector3(z.x - this.x, 0, z.z - this.z);
      const dist = toZ.length();
      if (dist <= (this.weapon.range || 2.8)) {
        toZ.normalize();
        if (forward.dot(toZ) > 0.4) {
          z.takeDamage(dmg, forward.clone().multiplyScalar(18));
          Game.spawnBlood(z.x, z.z, 7);
          hitAny = true;
        }
      }
    });

    if (hitAny) {
      Game.cameraShake = 7;
      Game.applyHitStop(0.05);
    }
  }

  attackChainsaw() {
    if (!this.weapon) return;
    audio.playChainsaw();
    const angle = this.mesh.rotation.y;
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

    Game.zombies.forEach(z => {
      if (z.isDead) return;
      const toZ = new THREE.Vector3(z.x - this.x, 0, z.z - this.z);
      if (toZ.length() <= this.weapon.range && forward.dot(toZ.clone().normalize()) > 0.6) {
        z.takeDamage(this.weapon.dmg, forward.clone().multiplyScalar(4));
        Game.spawnBlood(z.x, z.z, 4);
      }
    });
    Game.cameraShake = 2;
  }

  triggerShove() {
    const now = performance.now() / 1000;
    if (now - this.lastShoveTime < 0.6) return;
    this.lastShoveTime = now;
    audio.playShove();

    const angle = this.mesh.rotation.y;
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    let knockPower = (this.survivor.name === "COACH" ? 22 : 16);

    Game.zombies.forEach(z => {
      if (z.isDead) return;
      const toZ = new THREE.Vector3(z.x - this.x, 0, z.z - this.z);
      if (toZ.length() < 3.2 && forward.dot(toZ.clone().normalize()) > 0.3) {
        z.takeDamage(15, forward.clone().multiplyScalar(knockPower));
        z.stunTimer = 1.2;
      }
    });
    Game.cameraShake = 4;
  }

  throwHeldWeapon() {
    const now = performance.now() / 1000;
    if (now - this.lastThrowTime < 0.4) return;
    if (!this.weapon) return;

    this.lastThrowTime = now;

    if (this.isReloading) {
      this.isReloading = false;
      this.reloadProgress = 0;
      document.getElementById('ui-reload-fill').style.width = '0%';
    }

    const angle = this.mesh.rotation.y;
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const wKey = Object.keys(WEAPONS).find(k => WEAPONS[k].name === this.weapon.name) || 'p220';

    Game.spawnThrownWeapon(this.x, this.z, dir, this.weapon, this.mag, this.reserve, wKey);

    this.weapon = null;
    this.mag = 0;
    this.reserve = 0;
    this.updateWeaponMesh();

    Game.showPopup("ARMA ARREMESSADA!", "#ff007f");
    Game.updateHUD();
  }

  startReload() {
    if (!this.weapon || this.weapon.type === "melee" || this.weapon.type === "chainsaw") return;
    if (this.isReloading || this.mag >= this.weapon.clip || this.reserve <= 0) return;
    this.isReloading = true;
    this.reloadProgress = 0;
  }

  completeReload() {
    this.isReloading = false;
    if (!this.weapon) {
      document.getElementById('ui-reload-fill').style.width = '0%';
      return;
    }
    const needed = this.weapon.clip - this.mag;
    const amount = Math.min(needed, this.reserve);
    this.mag += amount;
    this.reserve -= amount;
    document.getElementById('ui-reload-fill').style.width = '0%';
    Game.updateHUD();
  }

  useMedItem() {
    if (this.med.count <= 0) return;
    if (this.med.type === "medkit") {
      this.hp = Math.min(this.maxHp, this.hp + 80);
      this.med.count--;
      Game.showPopup("VIDA RESTAURADA! +80 HP", "#39ff14");
    } else if (this.med.type === "pills") {
      this.tempHp = Math.min(100, this.tempHp + 50);
      this.med.count--;
      Game.showPopup("PÍLULAS USADAS! +50 TEMP HP", "#ffe600");
    } else if (this.med.type === "adrenaline") {
      this.adrenalineTime = (this.survivor.name === "ROCHELLE" ? 18 : 12);
      this.med.count--;
      Game.showPopup("ADRENALINA ATIVADA!", "#ffe600");
    }
    if (this.med.count <= 0) {
      this.med.name = "NENHUM";
      this.med.type = "none";
    }
    Game.updateHUD();
  }

  useThrowable() {
    if (this.throwable.count <= 0) return;
    this.throwable.count--;
    const angle = this.mesh.rotation.y;
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    Game.spawnThrowable(this.x, this.z, dir, this.throwable.type);
    if (this.throwable.count <= 0) {
      this.throwable.name = "NENHUM";
      this.throwable.type = "none";
    }
    Game.updateHUD();
  }

  takeDamage(amount, source = "Zumbi") {
    if (this.isDead) return;
    Game.damageTaken += amount;
    Game.cameraShake = Math.min(Game.cameraShake + 12, 30);
    audio.playZombieHit();

    const dmgOverlay = document.getElementById('damage-overlay');
    dmgOverlay.style.opacity = '1';
    setTimeout(() => { if (dmgOverlay) dmgOverlay.style.opacity = '0'; }, 150);

    if (this.tempHp > 0) {
      if (this.tempHp >= amount) {
        this.tempHp -= amount;
        amount = 0;
      } else {
        amount -= this.tempHp;
        this.tempHp = 0;
      }
    }

    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(source);
    }
    Game.updateHUD();
  }

  die(cause) {
    if (this.med && this.med.type === "defib" && this.med.count > 0) {
      this.med.count--;
      this.hp = 60;
      Game.showPopup("DESFIBRILADOR! VOCÊ REVIVEU!", "#00f3ff");
      audio.playSpecialAlert('horde');
      Game.cameraShake = 20;
      Game.updateHUD();
      return;
    }
    this.isDead = true;
    document.getElementById('death-cause').innerText = `DEVORADO POR: ${cause.toUpperCase()}`;
    Game.showModal('modal-death');
  }
}

/* ==========================================================================
   6. ZOMBIE CLASS (HUMAN SILHOUETTE, VARIANTS, ANIMATIONS & SPECIALS)
   ========================================================================== */
class Zombie {
  constructor(x, z, type = 'common') {
    this.x = x;
    this.z = z;
    this.type = type;
    this.isDead = false;
    this.vx = 0;
    this.vz = 0;
    this.stunTimer = 0;
    this.attackCooldown = 0;
    this.specialStateTimer = 0;

    this.hp = 50;
    this.maxHp = 50;
    this.speed = 5.5 + Math.random() * 2.0;
    this.dmg = 12;
    this.radius = 0.55;
    this.scoreVal = 100;
    this.fireResistant = false;

    this.walkTime = Math.random() * 10;
    this.variant = 'civilian';
    if (type === 'common') {
      const r = Math.random();
      if (r < 0.25) this.variant = 'police';
      else if (r < 0.5) this.variant = 'worker';
      else if (r < 0.65) this.variant = 'hazmat';
    }

    this.initTypeAttributes();
    this.mesh = this.buildMesh();
    this.mesh.position.set(x, 0, z);
    Game.scene.add(this.mesh);
  }

  initTypeAttributes() {
    if (this.type === 'smoker') {
      this.hp = 250; this.speed = 5.0; this.dmg = 15; this.scoreVal = 600;
    } else if (this.type === 'hunter') {
      this.hp = 260; this.speed = 7.5; this.dmg = 24; this.scoreVal = 700;
    } else if (this.type === 'boomer') {
      this.hp = 180; this.speed = 3.8; this.dmg = 5; this.scoreVal = 500;
    } else if (this.type === 'spitter') {
      this.hp = 200; this.speed = 5.8; this.dmg = 10; this.scoreVal = 650;
    } else if (this.type === 'charger') {
      this.hp = 600; this.speed = 4.8; this.dmg = 35; this.scoreVal = 900;
    } else if (this.type === 'jockey') {
      this.hp = 220; this.speed = 8.2; this.dmg = 12; this.scoreVal = 550;
    } else if (this.type === 'witch') {
      this.hp = 1000; this.speed = 1.0; this.dmg = 999; this.scoreVal = 2500;
      this.witchAnger = 0;
      this.isWitchEnraged = false;
    } else if (this.type === 'tank') {
      this.hp = 4000; this.speed = 5.2; this.dmg = 45; this.scoreVal = 5000;
      this.radius = 1.4;
    } else {
      if (this.variant === 'hazmat') this.fireResistant = true;
      if (this.variant === 'police') this.hp = 85;
    }
    this.maxHp = this.hp;
  }

  buildMesh() {
    const group = new THREE.Group();

    let skinCol = 0x5a7a5a;
    let clothCol = 0x334455;
    let pantsCol = 0x222233;

    if (this.variant === 'police') { clothCol = 0x1b2631; pantsCol = 0x151d24; skinCol = 0x6e826e; }
    else if (this.variant === 'worker') { clothCol = 0xd35400; pantsCol = 0x3e2723; }
    else if (this.variant === 'hazmat') { clothCol = 0xf4d03f; pantsCol = 0xf4d03f; skinCol = 0xf4d03f; }
    else if (this.type === 'smoker') { clothCol = 0x5b2c6f; skinCol = 0x4a5d4e; }
    else if (this.type === 'hunter') { clothCol = 0x1f618d; skinCol = 0x566573; pantsCol = 0x17202a; }
    else if (this.type === 'spitter') { clothCol = 0x1e8449; skinCol = 0x52be80; }
    else if (this.type === 'witch') { clothCol = 0xecf0f1; skinCol = 0xd5dbdb; }

    const clothMat = new THREE.MeshLambertMaterial({ color: clothCol });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsCol });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinCol });

    if (this.type === 'tank') {
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a2323 });
      const tankSkinMat = new THREE.MeshLambertMaterial({ color: 0x551111 });

      this.torsoGroup = new THREE.Group();
      this.torsoGroup.position.y = 1.3;
      group.add(this.torsoGroup);

      const chest = new THREE.Mesh(SHARED.geos.tankTorso, tankMat);
      chest.position.y = 0.8;
      this.torsoGroup.add(chest);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), tankSkinMat);
      head.position.set(0, 1.8, 0.3);
      this.torsoGroup.add(head);

      this.armR = new THREE.Group();
      this.armR.position.set(1.2, 1.4, 0);
      this.torsoGroup.add(this.armR);
      const bigArmR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), tankSkinMat);
      bigArmR.position.y = -0.9;
      this.armR.add(bigArmR);

      this.armL = new THREE.Group();
      this.armL.position.set(-1.2, 1.4, 0);
      this.torsoGroup.add(this.armL);
      const bigArmL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), tankSkinMat);
      bigArmL.position.y = -0.9;
      this.armL.add(bigArmL);

      this.legL = new THREE.Group();
      this.legL.position.set(-0.6, 1.0, 0);
      group.add(this.legL);
      const tLegL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), tankMat);
      tLegL.position.y = -0.5;
      this.legL.add(tLegL);

      this.legR = new THREE.Group();
      this.legR.position.set(0.6, 1.0, 0);
      group.add(this.legR);
      const tLegR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), tankMat);
      tLegR.position.y = -0.5;
      this.legR.add(tLegR);

      return group;
    }

    if (this.type === 'boomer') {
      const fatMat = new THREE.MeshLambertMaterial({ color: 0x3d7028 });
      this.torsoGroup = new THREE.Group();
      this.torsoGroup.position.y = 1.0;
      group.add(this.torsoGroup);

      const belly = new THREE.Mesh(SHARED.geos.boomerBelly, fatMat);
      belly.position.set(0, 0.2, 0.2);
      this.torsoGroup.add(belly);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), fatMat);
      head.position.set(0, 0.95, 0.1);
      this.torsoGroup.add(head);

      this.armL = new THREE.Group();
      this.armL.position.set(-0.7, 0.6, 0);
      this.torsoGroup.add(this.armL);
      const bArmL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), fatMat);
      bArmL.position.y = -0.4;
      this.armL.add(bArmL);

      this.armR = new THREE.Group();
      this.armR.position.set(0.7, 0.6, 0);
      this.torsoGroup.add(this.armR);
      const bArmR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), fatMat);
      bArmR.position.y = -0.4;
      this.armR.add(bArmR);

      this.legL = new THREE.Group(); this.legL.position.set(-0.3, 0.8, 0); group.add(this.legL);
      this.legR = new THREE.Group(); this.legR.position.set(0.3, 0.8, 0); group.add(this.legR);
      return group;
    }

    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.85;
    group.add(this.torsoGroup);

    this.torsoGroup.rotation.x = 0.24;

    const chest = new THREE.Mesh(SHARED.geos.torso, clothMat);
    chest.position.y = 0.36;
    this.torsoGroup.add(chest);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.92;
    this.torsoGroup.add(this.headGroup);

    const head = new THREE.Mesh(SHARED.geos.head, skinMat);
    this.headGroup.add(head);

    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), SHARED.mats.zombieEyes);
    eyeR.position.set(0.12, 0.02, 0.25);
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), SHARED.mats.zombieEyes);
    eyeL.position.set(-0.12, 0.02, 0.25);
    this.headGroup.add(eyeR);
    this.headGroup.add(eyeL);

    this.armL = new THREE.Group();
    this.armL.position.set(-0.4, 0.65, 0);
    this.torsoGroup.add(this.armL);
    const uArmL = new THREE.Mesh(SHARED.geos.upperLimb, clothMat);
    uArmL.position.y = -0.22;
    this.armL.add(uArmL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.4, 0.65, 0);
    this.torsoGroup.add(this.armR);

    if (this.type === 'charger') {
      const bigShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.4, 0.65), new THREE.MeshLambertMaterial({ color: 0xb5351b }));
      bigShoulder.position.set(0.15, -0.4, 0.2);
      this.armR.add(bigShoulder);
    } else {
      const uArmR = new THREE.Mesh(SHARED.geos.upperLimb, clothMat);
      uArmR.position.y = -0.22;
      this.armR.add(uArmR);
    }

    this.armL.rotation.x = -1.3;
    this.armR.rotation.x = -1.3;

    this.legL = new THREE.Group();
    this.legL.position.set(-0.2, 0.75, 0);
    group.add(this.legL);
    const legMeshL = new THREE.Mesh(SHARED.geos.lowerLimb, pantsMat);
    legMeshL.position.y = -0.35;
    this.legL.add(legMeshL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.2, 0.75, 0);
    group.add(this.legR);
    const legMeshR = new THREE.Mesh(SHARED.geos.lowerLimb, pantsMat);
    legMeshR.position.y = -0.35;
    this.legR.add(legMeshR);

    if (this.type === 'witch') {
      const hairWitch = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.7, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      hairWitch.position.set(0, 0.1, 0.1);
      this.headGroup.add(hairWitch);
    } else if (this.type === 'hunter') {
      group.scale.set(0.9, 0.75, 0.9);
    } else if (this.type === 'jockey') {
      group.scale.set(0.7, 0.65, 0.7);
    } else if (this.type === 'smoker') {
      group.scale.set(0.85, 1.25, 0.85);
    }

    return group;
  }

  update(dt) {
    if (this.isDead || !Game.player) return;

    if (this.vx !== 0 || this.vz !== 0) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.vx *= 0.88;
      this.vz *= 0.88;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      if (Math.abs(this.vz) < 0.1) this.vz = 0;
    }

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.mesh.position.set(this.x, 0, this.z);
      return;
    }

    const p = Game.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);

    this.mesh.rotation.y = Math.atan2(dx, dz);

    this.walkTime += dt * this.speed * 2.0;
    if (this.legL && this.legR) {
      const step = Math.sin(this.walkTime) * 0.65;
      this.legL.rotation.x = step;
      this.legR.rotation.x = -step;
    }
    if (this.armL && this.armR && this.type !== 'tank') {
      this.armL.rotation.x = -1.3 + Math.sin(this.walkTime * 0.8) * 0.25;
      this.armR.rotation.x = -1.3 - Math.sin(this.walkTime * 0.8) * 0.25;
    }

    if (this.type === 'witch') {
      this.updateWitch(dt, dist);
      return;
    } else if (this.type === 'smoker') {
      this.updateSmoker(dt, dist, dx, dz);
      return;
    } else if (this.type === 'spitter') {
      this.updateSpitter(dt, dist, dx, dz);
      return;
    } else if (this.type === 'charger') {
      this.updateCharger(dt, dist, dx, dz);
      return;
    } else if (this.type === 'hunter') {
      this.updateHunter(dt, dist, dx, dz);
      return;
    } else if (this.type === 'tank') {
      this.updateTank(dt, dist, dx, dz);
      return;
    }

    if (dist > 1.1) {
      const moveStep = this.speed * dt;
      const nx = this.x + (dx / dist) * moveStep;
      const nz = this.z + (dz / dist) * moveStep;

      if (!Game.checkWallCollision(nx, this.z, this.radius)) this.x = nx;
      if (!Game.checkWallCollision(this.x, nz, this.radius)) this.z = nz;
    } else {
      this.attackPlayer(dt);
    }

    this.mesh.position.set(this.x, 0, this.z);
  }

  attackPlayer(dt) {
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0) {
      this.attackCooldown = 0.8;
      Game.player.takeDamage(this.dmg, this.type);

      if (this.type === 'boomer') {
        this.explodeBoomer();
      } else if (this.type === 'jockey') {
        Game.player.jockeyTime = 3.5;
        Game.showPopup("JOCKEY NA SUA CABEÇA!", "#00f3ff");
      }
    }
  }

  updateWitch(dt, dist) {
    if (!this.isWitchEnraged) {
      if (dist < 6.0) this.witchAnger += dt * 35;
      if (this.witchAnger >= 100) {
        this.isWitchEnraged = true;
        this.speed = 14.0;
        audio.playSpecialAlert('witch');
        Game.showPopup("WITCH FOI ASSUSTADA!", "#ff0000");
      }
    } else {
      const p = Game.player;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const step = this.speed * dt;
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
      if (dist < 1.3) {
        Game.player.takeDamage(999, "Witch (Golpe Mortal)");
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  updateSmoker(dt, dist, dx, dz) {
    if (dist > 15) {
      this.x += (dx / dist) * this.speed * dt;
      this.z += (dz / dist) * this.speed * dt;
    } else if (dist < 8) {
      this.x -= (dx / dist) * this.speed * dt;
      this.z -= (dz / dist) * this.speed * dt;
    } else {
      this.specialStateTimer += dt;
      if (this.specialStateTimer > 2.0) {
        this.specialStateTimer = 0;
        audio.playSpecialAlert('smoker');
        Game.showPopup("SMOKER TE PUXOU!", "#b026ff");
        Game.player.x -= (dx / dist) * 4.0;
        Game.player.z -= (dz / dist) * 4.0;
        Game.player.takeDamage(12, "Smoker Tongue");
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  updateSpitter(dt, dist, dx, dz) {
    this.specialStateTimer += dt;
    if (this.specialStateTimer >= 3.5 && dist < 18) {
      this.specialStateTimer = 0;
      audio.playBileSplash();
      Game.spawnAcidPool(Game.player.x, Game.player.z);
      Game.showPopup("ÁCIDO DA SPITTER!", "#39ff14");
    }
    if (dist > 10) {
      this.x += (dx / dist) * this.speed * dt;
      this.z += (dz / dist) * this.speed * dt;
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  updateCharger(dt, dist, dx, dz) {
    this.specialStateTimer += dt;
    if (this.isCharging) {
      this.x += this.chargeDir.x * 16.0 * dt;
      this.z += this.chargeDir.z * 16.0 * dt;
      if (dist < 1.5) {
        Game.player.takeDamage(40, "Charger Slam");
        Game.cameraShake = 20;
        this.isCharging = false;
      }
      if (Game.checkWallCollision(this.x, this.z, this.radius)) {
        this.isCharging = false;
        this.stunTimer = 1.5;
        Game.cameraShake = 15;
      }
    } else {
      if (this.specialStateTimer > 3.0 && dist < 20) {
        this.specialStateTimer = 0;
        this.isCharging = true;
        this.chargeDir = new THREE.Vector3(dx / dist, 0, dz / dist);
        audio.playSpecialAlert('charger');
        Game.showPopup("CHARGER INVESTINDO!", "#ff8c00");
      } else {
        this.x += (dx / dist) * this.speed * dt;
        this.z += (dz / dist) * this.speed * dt;
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  updateHunter(dt, dist, dx, dz) {
    this.specialStateTimer += dt;
    if (this.isPouncing) {
      this.x += this.pounceDir.x * 20.0 * dt;
      this.z += this.pounceDir.z * 20.0 * dt;
      this.pounceTimer -= dt;
      if (dist < 1.3) {
        Game.player.takeDamage(30, "Hunter Pin");
        this.isPouncing = false;
        this.stunTimer = 0.8;
        Game.showPopup("HUNTER TE PRENDEU!", "#00f3ff");
      }
      if (this.pounceTimer <= 0) {
        this.isPouncing = false;
      }
    } else {
      if (this.specialStateTimer > 3.0 && dist < 16) {
        this.specialStateTimer = 0;
        this.isPouncing = true;
        this.pounceTimer = 0.7;
        this.pounceDir = new THREE.Vector3(dx / dist, 0, dz / dist);
        audio.playSpecialAlert('hunter');
      } else {
        this.x += (dx / dist) * this.speed * dt;
        this.z += (dz / dist) * this.speed * dt;
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  updateTank(dt, dist, dx, dz) {
    this.specialStateTimer += dt;
    Game.cameraShake = Math.max(Game.cameraShake, 1.2);

    if (this.specialStateTimer > 4.5 && dist > 8 && dist < 30) {
      this.specialStateTimer = 0;
      audio.playExplosion();
      Game.showPopup("TANK ARREMESSOU UMA ROCHA!", "#ff2a2a");
      const origin = new THREE.Vector3(this.x, 2.0, this.z);
      const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
      const geo = new THREE.DodecahedronGeometry(0.9);
      const mat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      Game.scene.add(mesh);
      Game.projectiles.push({
        type: 'tank_rock',
        pos: origin,
        dir: dir,
        speed: 18,
        timer: 1.5,
        mesh: mesh
      });
    }

    if (dist > 1.8) {
      const step = this.speed * dt;
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
    } else {
      this.attackPlayer(dt);
      Game.cameraShake = 18;
    }
    this.mesh.position.set(this.x, 0, this.z);
  }

  explodeBoomer() {
    audio.playExplosion();
    audio.playBileSplash();
    Game.spawnAcidPool(this.x, this.z);
    const distToPlayer = Math.hypot(Game.player.x - this.x, Game.player.z - this.z);
    if (distToPlayer < 7.0) {
      Game.player.bileTime = 8.0;
      Game.showPopup("COBERTO DE BILE!", "#39ff14");
      Game.triggerDirectorEvent("HORDE INCOMING!");
    }
    this.die(true);
  }

  takeDamage(amount, knockVec = null, isExplosive = false) {
    if (this.isDead) return;
    this.hp -= amount;

    if (knockVec) {
      this.vx += knockVec.x;
      this.vz += knockVec.z;
    }

    if (this.type === 'witch' && !this.isWitchEnraged) {
      this.witchAnger = 100;
      this.isWitchEnraged = true;
      this.speed = 14.0;
      audio.playSpecialAlert('witch');
    }

    if (this.hp <= 0) {
      if (this.type === 'boomer') {
        this.explodeBoomer();
      } else {
        this.die(isExplosive);
      }
    }
  }

  die(isExplosive = false) {
    if (this.isDead) return;
    this.isDead = true;

    const idx = Game.zombies.indexOf(this);
    if (idx !== -1) {
      Game.zombies.splice(idx, 1);
    }

    Game.kills++;
    Game.registerComboKill(this.scoreVal);
    Game.spawnBlood(this.x, this.z, isExplosive ? 16 : 10);

    if (isExplosive) {
      Game.spawnGibs(this.x, 1.0, this.z);
      Game.scene.remove(this.mesh);
      disposeHierarchy(this.mesh);
    } else {
      Game.corpses.push({
        mesh: this.mesh,
        timer: 5.0,
        fallProgress: 0,
        rotAxis: (Math.random() > 0.5 ? 'x' : 'z'),
        rotDir: (Math.random() > 0.5 ? 1 : -1)
      });
    }

    if (Math.random() < 0.15) {
      Game.spawnGroundLoot(this.x, this.z);
    }
  }
}

/* ==========================================================================
   7. DIRECTOR AI (PACING, HORDAS, ESPECIAIS & TANK)
   ========================================================================== */
Game.updateDirector = function(dt) {
  this.director.timer += dt;
  this.director.specialTimer += dt;

  if (this.director.state === "PEACE") {
    if (this.director.timer > 16.0) {
      this.director.timer = 0;
      this.triggerDirectorEvent("HORDE APPROACHING!");
    }
  } else if (this.director.state === "HORDE") {
    if (Math.random() < 0.35 && this.zombies.length < 35) {
      this.spawnHordeZombie();
    }
    if (this.director.timer > 14.0) {
      this.director.state = "PEACE";
      this.director.timer = 0;
      audio.isHorde = false;
      document.getElementById('ui-director-banner').classList.remove('active');
    }
  }

  if (this.director.specialTimer > 18.0) {
    this.director.specialTimer = 0;
    const specials = ['smoker', 'hunter', 'boomer', 'spitter', 'charger', 'jockey'];
    const chosen = specials[Math.floor(Math.random() * specials.length)];
    this.spawnSpecialInfected(chosen);
  }

  if (!this.director.tankSpawned && (this.director.timer > 75.0 || this.kills >= 65)) {
    this.director.tankSpawned = true;
    this.spawnSpecialInfected('tank');
  }
};

Game.triggerDirectorEvent = function(text) {
  this.director.state = "HORDE";
  this.director.timer = 0;
  audio.isHorde = true;
  const banner = document.getElementById('ui-director-banner');
  banner.innerText = text;
  banner.classList.add('active');
  audio.playSpecialAlert('horde');
};

Game.spawnHordeZombie = function() {
  if (!this.player) return;
  const angle = Math.random() * Math.PI * 2;
  const dist = 28 + Math.random() * 10;
  const zx = this.player.x + Math.cos(angle) * dist;
  const zz = this.player.z + Math.sin(angle) * dist;
  this.zombies.push(new Zombie(zx, zz, 'common'));
};

Game.spawnZombie = function(x, z, type = 'common') {
  this.zombies.push(new Zombie(x, z, type));
};

Game.spawnSpecialInfected = function(type) {
  if (!this.player) return;
  const angle = Math.random() * Math.PI * 2;
  const dist = 25;
  const zx = this.player.x + Math.cos(angle) * dist;
  const zz = this.player.z + Math.sin(angle) * dist;

  audio.playSpecialAlert(type);
  if (type === 'tank') {
    audio.isTank = true;
    this.triggerDirectorEvent("TANK DETECTED!");
  } else {
    this.showPopup(`${type.toUpperCase()} DETECTADO!`, "#ff007f");
  }
  this.zombies.push(new Zombie(zx, zz, type));
};

/* ==========================================================================
   8. COMBAT, PROJECTILES, WEAPON PICKUPS, CASINGS & PARTICLES
   ========================================================================== */
Game.damageProp = function(prop, dmg) {
  prop.hp -= dmg;
  if (prop.type === 'car' && prop.hasAlarm && !prop.alarmTriggered) {
    prop.alarmTriggered = true;
    if (prop.mesh && prop.mesh.material) prop.mesh.material.color.setHex(0xff0000);
    audio.playSpecialAlert('horde');
    this.triggerDirectorEvent("CAR ALARM TRIGGERED!");
    this.showPopup("ALARME DE CARRO DISPARADO!", "#ff0000");
  } else if (prop.hp <= 0 && !prop.destroyed) {
    prop.destroyed = true;
    this.scene.remove(prop.mesh);
    disposeHierarchy(prop.mesh);
    if (prop.type === 'barrel') {
      this.spawnExplosion(prop.x, prop.z, 160);
    } else if (prop.type === 'gas_can') {
      this.spawnFirePool(prop.x, prop.z);
    } else if (prop.type === 'propane') {
      this.spawnExplosion(prop.x, prop.z, 220);
    }
  }
};

Game.shootBullet = function(origin, dir, dmg, specialAmmo) {
  this.bullets.push({
    pos: origin.clone(),
    dir: dir.clone(),
    dmg: dmg,
    specialAmmo: specialAmmo,
    dist: 0,
    maxDist: 35
  });

  this.spawnParticle(origin.x + dir.x * 0.8, origin.y, origin.z + dir.z * 0.8, 0xffe600, 0.45, 0.06);
};

Game.spawnCasing = function(x, y, z, playerAngle) {
  const geo = SHARED.geos.casing;
  const mat = SHARED.mats.casing;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  this.scene.add(mesh);

  const rightAngle = playerAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
  const speed = 2.5 + Math.random() * 2.0;

  this.casings.push({
    mesh,
    vx: Math.sin(rightAngle) * speed,
    vy: 2.8 + Math.random() * 1.5,
    vz: Math.cos(rightAngle) * speed,
    timer: 1.5
  });
};

Game.updateCasings = function(dt) {
  for (let i = this.casings.length - 1; i >= 0; i--) {
    const c = this.casings[i];
    c.timer -= dt;
    c.mesh.position.x += c.vx * dt;
    c.mesh.position.y += c.vy * dt;
    c.mesh.position.z += c.vz * dt;
    c.vy -= 9.8 * dt;

    c.mesh.rotation.x += dt * 15;
    c.mesh.rotation.y += dt * 12;

    if (c.mesh.position.y <= 0.05) {
      c.mesh.position.y = 0.05;
      c.vy = -c.vy * 0.3;
      c.vx *= 0.6;
      c.vz *= 0.6;
    }

    if (c.timer <= 0) {
      this.scene.remove(c.mesh);
      this.casings.splice(i, 1);
    }
  }
};

Game.updateBullets = function(dt) {
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i];
    const step = 85 * dt;
    b.pos.addScaledVector(b.dir, step);
    b.dist += step;

    let hit = false;
    for (let j = 0; j < this.zombies.length; j++) {
      const z = this.zombies[j];
      if (z.isDead) continue;
      const d = Math.hypot(z.x - b.pos.x, z.z - b.pos.z);
      if (d < z.radius + 0.3) {
        z.takeDamage(b.dmg, b.dir.clone().multiplyScalar(6));
        this.spawnBlood(z.x, z.z, 5);

        if (b.specialAmmo === "INCENDIÁRIA") {
          this.spawnFirePool(z.x, z.z);
        } else if (b.specialAmmo === "EXPLOSIVA") {
          audio.playExplosion();
          this.spawnExplosion(z.x, z.z, 80);
        }
        hit = true;
        break;
      }
    }

    if (!hit) {
      for (let k = 0; k < this.props.length; k++) {
        const prop = this.props[k];
        if (prop.destroyed) continue;
        if (prop.type === 'barrel' || prop.type === 'gas_can' || prop.type === 'propane' || prop.type === 'car') {
          const distP = Math.hypot(prop.x - b.pos.x, prop.z - b.pos.z);
          const pr = (prop.type === 'car' ? 2.2 : 0.85);
          if (distP < pr) {
            this.damageProp(prop, b.dmg);
            hit = true;
            break;
          }
        }
      }
    }

    if (!hit && this.checkWallCollision(b.pos.x, b.pos.z, 0.2)) {
      this.spawnParticle(b.pos.x, b.pos.y, b.pos.z, 0x00f3ff, 0.3, 0.1);
      hit = true;
    }

    if (hit || b.dist >= b.maxDist) {
      this.bullets.splice(i, 1);
    }
  }
};

Game.spawnGrenade = function(origin, dir) {
  const geo = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  this.scene.add(mesh);

  this.projectiles.push({
    type: 'grenade',
    pos: origin.clone(),
    dir: dir.clone(),
    speed: 24,
    timer: 0.65,
    mesh: mesh
  });
};

Game.spawnThrowable = function(x, z, dir, type) {
  const col = (type === 'pipe_bomb' ? 0xff0044 : (type === 'molotov' ? 0xffaa00 : 0x39ff14));
  const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8);
  const mat = new THREE.MeshBasicMaterial({ color: col });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1.2, z);
  this.scene.add(mesh);

  this.projectiles.push({
    type: type,
    pos: new THREE.Vector3(x, 1.2, z),
    dir: dir.clone(),
    speed: 18,
    timer: (type === 'pipe_bomb' ? 3.5 : 0.85),
    lastBeep: 0,
    mesh: mesh
  });
};

Game.spawnThrownWeapon = function(x, z, dir, weaponData, mag, reserve, weaponKey) {
  const geo = new THREE.BoxGeometry(0.28, 0.28, 0.9);
  const mat = new THREE.MeshLambertMaterial({ color: weaponData.color || 0xcccccc });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1.0, z);
  this.scene.add(mesh);

  this.projectiles.push({
    type: 'thrown_weapon',
    weapon: weaponData,
    weaponKey: weaponKey || 'p220',
    mag: mag,
    reserve: reserve,
    pos: new THREE.Vector3(x, 1.0, z),
    dir: dir.clone(),
    speed: 22,
    timer: 0.85,
    mesh: mesh
  });
};

Game.updateProjectiles = function(dt) {
  for (let i = this.projectiles.length - 1; i >= 0; i--) {
    const p = this.projectiles[i];
    p.timer -= dt;

    if (p.speed > 0) {
      p.pos.addScaledVector(p.dir, p.speed * dt);
      p.speed = Math.max(0, p.speed - dt * 25);
    }
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y += dt * 10;
    p.mesh.rotation.x += dt * 8;

    if (p.type === 'pipe_bomb') {
      p.lastBeep = (p.lastBeep || 0) + dt;
      if (p.lastBeep > 0.28) {
        p.lastBeep = 0;
        audio.playPipeBombBeep();
        this.zombies.forEach(z => {
          if (z.type === 'common' && !z.isDead) {
            const toBomb = new THREE.Vector3(p.pos.x - z.x, 0, p.pos.z - z.z);
            if (toBomb.length() < 25) {
              z.mesh.rotation.y = Math.atan2(toBomb.x, toBomb.z);
              z.x += (toBomb.x / toBomb.length()) * z.speed * dt * 0.9;
              z.z += (toBomb.z / toBomb.length()) * z.speed * dt * 0.9;
            }
          }
        });
      }
    }

    if (p.type === 'thrown_weapon' && p.speed > 4) {
      for (let j = 0; j < this.zombies.length; j++) {
        const z = this.zombies[j];
        if (z.isDead) continue;
        if (Math.hypot(z.x - p.pos.x, z.z - p.pos.z) < z.radius + 0.55) {
          const isEmpty = (p.mag === 0);
          const dmg = isEmpty ? 130 : 85;
          const stun = isEmpty ? 1.8 : 1.0;
          const knock = isEmpty ? 22 : 14;

          z.takeDamage(dmg, p.dir.clone().multiplyScalar(knock));
          z.stunTimer = Math.max(z.stunTimer, stun);
          this.spawnBlood(z.x, z.z, 7);

          if (isEmpty) {
            this.showPopup("GOLPE COM ARMA VAZIA! (CRÍTICO)", "#00f3ff");
            audio.playPanClang();
          } else {
            audio.playZombieHit();
          }

          this.applyHitStop(0.045);
          p.timer = 0;
          break;
        }
      }
    }

    if (p.type === 'tank_rock' && Game.player) {
      if (Math.hypot(Game.player.x - p.pos.x, Game.player.z - p.pos.z) < 1.6) {
        Game.player.takeDamage(42, "Rocha do Tank");
        Game.cameraShake = 25;
        p.timer = 0;
      }
    }

    if (p.timer <= 0) {
      this.scene.remove(p.mesh);
      disposeHierarchy(p.mesh);

      if (p.type === 'grenade') {
        this.spawnExplosion(p.pos.x, p.pos.z, 280);
      } else if (p.type === 'pipe_bomb') {
        this.spawnExplosion(p.pos.x, p.pos.z, 300);
      } else if (p.type === 'molotov') {
        audio.playBileSplash();
        this.spawnFirePool(p.pos.x, p.pos.z);
      } else if (p.type === 'bile_jar') {
        audio.playBileSplash();
        this.spawnAcidPool(p.pos.x, p.pos.z);
      } else if (p.type === 'tank_rock') {
        this.spawnParticle(p.pos.x, 1.0, p.pos.z, 0x666666, 1.5, 0.3);
      } else if (p.type === 'thrown_weapon') {
        this.spawnGroundWeapon(p.pos.x, p.pos.z, p.weaponKey, p.mag, p.reserve);
      }
      this.projectiles.splice(i, 1);
    }
  }
};

Game.spawnExplosion = function(x, z, dmg) {
  audio.playExplosion();
  this.cameraShake = 22;
  this.spawnParticle(x, 1.0, z, 0xff5500, 3.5, 0.4);

  this.zombies.forEach(zombie => {
    const d = Math.hypot(zombie.x - x, zombie.z - z);
    if (d < 7.0) {
      const pwr = (1.0 - d / 7.0) * dmg;
      const push = new THREE.Vector3(zombie.x - x, 0, zombie.z - z).normalize().multiplyScalar(25);
      zombie.takeDamage(pwr, push, true);
    }
  });
};

Game.spawnFirePool = function(x, z) {
  const geo = new THREE.CylinderGeometry(2.5, 2.5, 0.1, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.05, z);
  this.scene.add(mesh);
  this.pools.push({ type: 'fire', x, z, radius: 2.5, timer: 6.0, mesh });
};

Game.spawnAcidPool = function(x, z) {
  const geo = new THREE.CylinderGeometry(2.8, 2.8, 0.1, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.65 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.05, z);
  this.scene.add(mesh);
  this.pools.push({ type: 'acid', x, z, radius: 2.8, timer: 7.0, mesh });
};

Game.spawnBlood = function(x, z, count = 8) {
  const sz = 0.8 + Math.random() * 0.8;
  const geo = new THREE.PlaneGeometry(sz, sz);
  const mat = SHARED.mats.bloodDecal;
  const decal = new THREE.Mesh(geo, mat);
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = Math.random() * Math.PI * 2;
  decal.position.set(x, 0.03, z);
  this.scene.add(decal);
  this.bloodDecals.push(decal);

  if (this.bloodDecals.length > 80) {
    const old = this.bloodDecals.shift();
    this.scene.remove(old);
    if (old.geometry) old.geometry.dispose();
  }

  for (let i = 0; i < count; i++) {
    this.spawnParticle(x, 1.0, z, 0xbb0022, 0.25, 0.35);
  }
};

Game.spawnGibs = function(x, y, z) {
  for (let i = 0; i < 6; i++) {
    const sz = 0.25 + Math.random() * 0.2;
    const geo = new THREE.BoxGeometry(sz, sz, sz);
    const mat = new THREE.MeshLambertMaterial({ color: (i % 2 === 0 ? 0x8a2323 : 0x5a7a5a) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    this.scene.add(mesh);

    const angle = Math.random() * Math.PI * 2;
    const pwr = 4 + Math.random() * 5;

    this.gibPieces.push({
      mesh,
      vx: Math.cos(angle) * pwr,
      vy: 4 + Math.random() * 4,
      vz: Math.sin(angle) * pwr,
      timer: 3.5
    });
  }
};

Game.updateGibs = function(dt) {
  for (let i = this.gibPieces.length - 1; i >= 0; i--) {
    const g = this.gibPieces[i];
    g.timer -= dt;
    g.mesh.position.x += g.vx * dt;
    g.mesh.position.y += g.vy * dt;
    g.mesh.position.z += g.vz * dt;
    g.vy -= 9.8 * dt;

    g.mesh.rotation.x += dt * 8;
    g.mesh.rotation.y += dt * 6;

    if (g.mesh.position.y <= 0.1) {
      g.mesh.position.y = 0.1;
      g.vy = -g.vy * 0.25;
      g.vx *= 0.7;
      g.vz *= 0.7;
    }

    if (g.timer <= 0) {
      this.scene.remove(g.mesh);
      disposeHierarchy(g.mesh);
      this.gibPieces.splice(i, 1);
    }
  }
};

Game.updateCorpses = function(dt) {
  for (let i = this.corpses.length - 1; i >= 0; i--) {
    const c = this.corpses[i];
    c.timer -= dt;

    if (c.fallProgress < 1.0) {
      c.fallProgress += dt * 3.5;
      const angle = Math.min(Math.PI / 2, c.fallProgress * (Math.PI / 2));
      if (c.rotAxis === 'x') {
        c.mesh.rotation.x = angle * c.rotDir;
      } else {
        c.mesh.rotation.z = angle * c.rotDir;
      }
      c.mesh.position.y = Math.max(0.15, 0.85 - c.fallProgress * 0.7);
    }

    if (c.timer <= 0) {
      this.scene.remove(c.mesh);
      disposeHierarchy(c.mesh);
      this.corpses.splice(i, 1);
    }
  }
};

Game.spawnParticle = function(x, y, z, color, size, life) {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  this.scene.add(mesh);

  this.particles.push({
    mesh,
    life,
    maxLife: life,
    vx: (Math.random() - 0.5) * 8,
    vy: Math.random() * 5,
    vz: (Math.random() - 0.5) * 8
  });
};

Game.spawnGroundWeapon = function(x, z, weaponKey, mag = null, reserve = null) {
  const wData = WEAPONS[weaponKey];
  if (!wData) return;

  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.24, 0.2, 0.85);
  const mat = new THREE.MeshLambertMaterial({ color: wData.color || 0xcccccc });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  group.position.set(x, 0.15, z);
  this.scene.add(group);

  this.droppedWeapons.push({
    key: weaponKey,
    data: JSON.parse(JSON.stringify(wData)),
    mag: (mag !== null ? mag : (wData.clip || 0)),
    reserve: (reserve !== null ? reserve : (wData.maxRes || 0)),
    x, z, mesh: group
  });
};

Game.spawnGroundLoot = function(x, z) {
  const r = Math.random();
  if (r < 0.38) {
    const medTypes = [
      { name: "MEDKIT", type: "medkit" },
      { name: "PÍLULAS", type: "pills" },
      { name: "ADRENALINA", type: "adrenaline" },
      { name: "DESFIBRILADOR", type: "defib" }
    ];
    const chosen = medTypes[Math.floor(Math.random() * medTypes.length)];
    Game.player.med = { name: chosen.name, type: chosen.type, count: 1 };
    Game.showPopup(`${chosen.name} COLETADO!`, "#39ff14");
  } else if (r < 0.72) {
    const throwTypes = [
      { name: "PIPE BOMB", type: "pipe_bomb" },
      { name: "MOLOTOV", type: "molotov" },
      { name: "JARRA DE BILE", type: "bile_jar" }
    ];
    const chosen = throwTypes[Math.floor(Math.random() * throwTypes.length)];
    Game.player.throwable = { name: chosen.name, type: chosen.type, count: 1 };
    Game.showPopup(`${chosen.name} COLETADO!`, "#ffe600");
  } else {
    Game.player.specialAmmoType = (Math.random() > 0.5 ? "INCENDIÁRIA" : "EXPLOSIVA");
    Game.player.specialAmmoShots = 35;
    Game.showPopup(`MUNIÇÃO ${Game.player.specialAmmoType}!`, "#00f3ff");
  }
  Game.updateHUD();
};

Game.spawnProp = function(x, z, type, hasAlarm = false) {
  let geo, mat;
  if (type === 'barrel') {
    geo = new THREE.CylinderGeometry(0.7, 0.7, 1.5, 8);
    mat = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
  } else if (type === 'gas_can') {
    geo = new THREE.BoxGeometry(0.6, 0.9, 0.6);
    mat = new THREE.MeshLambertMaterial({ color: 0xffaa00 });
  } else if (type === 'propane') {
    geo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8);
    mat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  } else if (type === 'car') {
    geo = new THREE.BoxGeometry(2.4, 1.4, 4.8);
    mat = new THREE.MeshLambertMaterial({ color: hasAlarm ? 0x990022 : 0x224466 });
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.8, z);
  this.scene.add(mesh);

  this.props.push({
    type,
    x, z,
    hasAlarm,
    alarmTriggered: false,
    hp: (type === 'car' ? 300 : 25),
    mesh
  });
};

Game.checkWallCollision = function(x, z, r = 0.5) {
  for (let i = 0; i < this.props.length; i++) {
    const p = this.props[i];
    if (p.type === 'wall') {
      if (x + r > p.x - p.halfW && x - r < p.x + p.halfW &&
          z + r > p.z - p.halfD && z - r < p.z + p.halfD) {
        return true;
      }
    }
  }
  return false;
};

/* ==========================================================================
   9. COMBO & SCORING SYSTEM (HOTLINE MIAMI STYLE)
   ========================================================================== */
Game.registerComboKill = function(basePoints) {
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

  let killLabel = "KILL!";
  if (this.combo >= 15) killLabel = "EXTERMÍNIO TOTAL!";
  else if (this.combo >= 10) killLabel = "MASSACRE INSANO!";
  else if (this.combo >= 6) killLabel = "ULTRA KILL!";
  else if (this.combo >= 3) killLabel = "TRIPLE KILL!";

  this.showPopup(`${killLabel} +${earned}`, "#ffe600");
  this.updateHUD();
};

Game.showPopup = function(text, color) {
  const el = document.createElement('div');
  el.className = 'floating-text';
  el.innerText = text;
  el.style.color = color;
  el.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 200) + 'px';
  el.style.top = (window.innerHeight / 2 - 80 + (Math.random() - 0.5) * 60) + 'px';
  document.body.appendChild(el);

  setTimeout(() => {
    el.style.transform = 'translate(-50%, -120%) scale(1.3)';
    el.style.opacity = '0';
  }, 50);

  setTimeout(() => el.remove(), 750);
};

/* ==========================================================================
   10. HUD & RADAR OFF-SCREEN WARNINGS
   ========================================================================== */
Game.updateHUD = function() {
  if (!this.player) return;
  const p = this.player;

  document.getElementById('ui-hp-val').innerText = Math.ceil(p.hp);
  document.getElementById('ui-max-hp-val').innerText = p.maxHp;
  const hpPct = (p.hp / p.maxHp) * 100;
  document.getElementById('ui-hp-bar').style.width = hpPct + '%';

  const tempHpPct = Math.min(100, hpPct + (p.tempHp / p.maxHp) * 100);
  document.getElementById('ui-temp-hp-bar').style.width = tempHpPct + '%';

  document.getElementById('ui-survivor-name').innerText = p.survivor.name;
  document.getElementById('ui-passive-badge').innerText = p.survivor.passive;

  if (p.weapon) {
    document.getElementById('ui-weapon-name').innerText = p.weapon.name;
    const magDisplay = (p.weapon.type === "chainsaw" ? p.weapon.fuel : (p.weapon.type === "melee" ? "∞" : p.mag));
    const resDisplay = (p.weapon.type === "melee" || p.weapon.type === "chainsaw" ? "∞" : p.reserve);
    document.getElementById('ui-mag-ammo').innerText = magDisplay;
    document.getElementById('ui-reserve-ammo').innerText = resDisplay;
    document.getElementById('ui-ammo-type').innerText = p.specialAmmoType;
  } else {
    document.getElementById('ui-weapon-name').innerText = "DESARMADO (SOCO)";
    document.getElementById('ui-mag-ammo').innerText = "--";
    document.getElementById('ui-reserve-ammo').innerText = "--";
    document.getElementById('ui-ammo-type').innerText = "NENHUMA";
  }

  document.getElementById('ui-throwable-name').innerText = p.throwable.name;
  document.getElementById('ui-throwable-count').innerText = `x${p.throwable.count}`;
  document.getElementById('ui-med-name').innerText = p.med.name;
  document.getElementById('ui-med-count').innerText = `x${p.med.count}`;

  document.getElementById('ui-score').innerText = this.score.toString().padStart(6, '0');

  this.updateRadar();
};

Game.updateRadar = function() {
  const radar = document.getElementById('radar-container');
  radar.innerHTML = '';
  if (!this.player) return;

  this.zombies.forEach(z => {
    if (z.isDead || z.type === 'common') return;
    const dx = z.x - this.player.x;
    const dz = z.z - this.player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 8.0) {
      const angle = Math.atan2(dz, dx);
      const margin = 50;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const rx = cx - margin;
      const ry = cy - margin;

      const el = document.createElement('div');
      el.className = `radar-arrow ${z.type}`;
      el.innerText = z.type[0].toUpperCase();
      el.style.left = (cx + Math.cos(angle) * rx) + 'px';
      el.style.top = (cy + Math.sin(angle) * ry) + 'px';
      radar.appendChild(el);
    }
  });
};

/* ==========================================================================
   11. STAGE COMPLETION & VICTORY EVALUATION
   ========================================================================== */
Game.checkStageClear = function() {
  if (this.gameMode === "survival") return;

  if (this.director.tankSpawned) {
    const tankAlive = this.zombies.some(z => z.type === 'tank' && !z.isDead);
    if (!tankAlive && this.kills > 30) {
      this.triggerVictory();
    }
  }
};

Game.triggerVictory = function() {
  this.isRunning = false;
  const elapsedSec = Math.floor((performance.now() - this.stageStartTime) / 1000);
  const m = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
  const s = (elapsedSec % 60).toString().padStart(2, '0');

  let grade = "C";
  if (this.maxCombo >= 15 && this.damageTaken < 30) grade = "S+";
  else if (this.maxCombo >= 10 && this.damageTaken < 50) grade = "S";
  else if (this.maxCombo >= 6) grade = "A";
  else if (this.maxCombo >= 3) grade = "B";

  document.getElementById('victory-grade').innerText = grade;
  document.getElementById('vic-time').innerText = `${m}:${s}`;
  document.getElementById('vic-kills').innerText = this.kills;
  document.getElementById('vic-combo').innerText = `x${this.maxCombo}`;
  document.getElementById('vic-dmg').innerText = `${this.damageTaken} HP`;

  const bonus = 10000 + (this.maxCombo * 500) - (this.damageTaken * 40);
  this.points += Math.max(2000, bonus);
  document.getElementById('vic-points').innerText = `+${bonus.toLocaleString()}`;

  this.showModal('modal-victory');
};

/* ==========================================================================
   12. MAIN GAME LOOP & INITIALIZATION
   ========================================================================== */
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (Game.isRunning && !Game.isPaused) {
    if (Game.hitStopTimer > 0) {
      Game.hitStopTimer -= dt;
      Game.renderer.render(Game.scene, Game.camera);
      return;
    }

    if (Game.player) {
      Game.player.update(dt);
    }

    for (let i = Game.zombies.length - 1; i >= 0; i--) {
      Game.zombies[i].update(dt);
    }

    Game.updateCorpses(dt);
    Game.updateGibs(dt);
    Game.updateCasings(dt);
    Game.updateBullets(dt);
    Game.updateProjectiles(dt);

    if (Game.comboTimer > 0) {
      Game.comboTimer -= dt;
      const pct = (Game.comboTimer / 3.0) * 100;
      document.getElementById('ui-combo-fill').style.width = pct + '%';
      if (Game.comboTimer <= 0) {
        Game.combo = 1;
        document.getElementById('ui-combo-mult').innerText = "COMBO x1";
        document.getElementById('ui-combo-fill').style.width = '0%';
      }
    }

    for (let i = Game.pools.length - 1; i >= 0; i--) {
      const pool = Game.pools[i];
      pool.timer -= dt;
      if (pool.timer <= 0) {
        Game.scene.remove(pool.mesh);
        disposeHierarchy(pool.mesh);
        Game.pools.splice(i, 1);
      } else {
        const dist = Math.hypot(Game.player.x - pool.x, Game.player.z - pool.z);
        if (dist < pool.radius) {
          Game.player.takeDamage(dt * 18, pool.type === 'acid' ? "Spitter Acid" : "Molotov Fire");
        }
      }
    }

    for (let i = Game.particles.length - 1; i >= 0; i--) {
      const p = Game.particles[i];
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 9.8 * dt;
      if (p.life <= 0) {
        Game.scene.remove(p.mesh);
        disposeHierarchy(p.mesh);
        Game.particles.splice(i, 1);
      }
    }

    Game.updateDirector(dt);
    Game.checkStageClear();

    if (Game.player) {
      const targetX = Game.player.x + (Game.mouseWorldPos.x - Game.player.x) * 0.15;
      const targetZ = Game.player.z + (Game.mouseWorldPos.z - Game.player.z) * 0.15;

      Game.camera.position.x += (targetX - Game.camera.position.x) * 0.1;
      Game.camera.position.z += ((targetZ + 7.5) - Game.camera.position.z) * 0.1;
      Game.camera.position.y = 23;

      if (Game.cameraShake > 0) {
        Game.camera.position.x += (Math.random() - 0.5) * Game.cameraShake * 0.08;
        Game.camera.position.z += (Math.random() - 0.5) * Game.cameraShake * 0.08;
        Game.cameraShake *= 0.9;
        if (Game.cameraShake < 0.2) Game.cameraShake = 0;
      }

      Game.camera.lookAt(Game.camera.position.x, 0, Game.camera.position.z - 7.5);
    }
  }

  Game.renderer.render(Game.scene, Game.camera);
}

/* ==========================================================================
   13. INPUT LISTENERS & SETUP
   ========================================================================== */
window.addEventListener('load', () => {
  SHARED.init();

  Game.canvas = document.getElementById('game-canvas');
  Game.renderer = new THREE.WebGLRenderer({ canvas: Game.canvas, antialias: true });
  Game.renderer.setSize(window.innerWidth, window.innerHeight);
  Game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  Game.scene = new THREE.Scene();
  Game.scene.fog = new THREE.FogExp2(0x0a0612, 0.015);

  Game.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
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
    if (e.button === 0) Game.mouseDown = true;
    if (e.button === 2) Game.mouseRightDown = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) Game.mouseDown = false;
    if (e.button === 2) Game.mouseRightDown = false;
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    Game.keys[e.code] = true;

    if (e.code === 'KeyR' && Game.player && Game.player.isDead) {
      Game.restartStage();
      return;
    }

    if (e.code === 'KeyR' && Game.player && !Game.player.isDead) {
      Game.player.startReload();
    }

    if (e.code === 'KeyQ' && Game.player && !Game.player.isDead) {
      Game.player.throwHeldWeapon();
    }

    if (e.code === 'KeyE' && Game.player && !Game.player.isDead) {
      let picked = false;
      for (let i = 0; i < Game.droppedWeapons.length; i++) {
        const dw = Game.droppedWeapons[i];
        const dist = Math.hypot(Game.player.x - dw.x, Game.player.z - dw.z);
        if (dist < 2.5) {
          if (Game.player.isReloading) {
            Game.player.isReloading = false;
            Game.player.reloadProgress = 0;
            document.getElementById('ui-reload-fill').style.width = '0%';
          }

          if (Game.player.weapon) {
            const oldW = Game.player.weapon;
            const oldMag = Game.player.mag;
            const oldRes = Game.player.reserve;
            const oldKey = Object.keys(WEAPONS).find(k => WEAPONS[k].name === oldW.name) || 'p220';

            Game.player.weapon = dw.data;
            Game.player.mag = dw.mag;
            Game.player.reserve = dw.reserve;

            dw.key = oldKey;
            dw.data = oldW;
            dw.mag = oldMag;
            dw.reserve = oldRes;
            if (dw.mesh) {
              dw.mesh.traverse(child => {
                if (child.isMesh && child.material) {
                  child.material.color.setHex(oldW.color || 0xcccccc);
                }
              });
            }
          } else {
            Game.player.weapon = dw.data;
            Game.player.mag = dw.mag;
            Game.player.reserve = dw.reserve;

            Game.scene.remove(dw.mesh);
            disposeHierarchy(dw.mesh);
            Game.droppedWeapons.splice(i, 1);
          }

          Game.player.updateWeaponMesh();
          audio.playPickup();
          Game.showPopup(`PEGOU: ${Game.player.weapon.name}`, "#00f3ff");
          Game.updateHUD();
          picked = true;
          break;
        }
      }
      if (!picked) {
        Game.player.triggerShove();
      }
    }

    if ((e.code === 'KeyG' || e.code === 'Digit1') && Game.player && !Game.player.isDead) {
      Game.player.useThrowable();
    }

    if ((e.code === 'KeyV' || e.code === 'Digit2') && Game.player && !Game.player.isDead) {
      Game.player.useMedItem();
    }

    if (e.code === 'Escape' || e.code === 'KeyP') {
      Game.togglePause();
    }
  });

  window.addEventListener('keyup', (e) => {
    Game.keys[e.code] = false;
  });

  window.addEventListener('resize', () => {
    Game.camera.aspect = window.innerWidth / window.innerHeight;
    Game.camera.updateProjectionMatrix();
    Game.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
});
