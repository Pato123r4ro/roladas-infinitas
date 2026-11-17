/**
 * Roladas Infinitas - Sistema de Rolagem de Dados de RPG
 * Moderno, customizável, autônomo e responsivo.
 */

// ==========================================
// 1. AUDIO ENGINE (Web Audio API Sintetizado)
// ==========================================
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.5;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playDiceRoll() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const count = 5 + Math.floor(Math.random() * 4); // 5-8 clacks
    for (let i = 0; i < count; i++) {
      const time = now + (i * 0.05) + (Math.random() * 0.03);
      this._createClack(time, 0.6 - (i * 0.05));
    }
  }

  _createClack(time, gainScale = 0.5) {
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.035);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700 + Math.random() * 1200, time);
    filter.Q.setValueAtTime(3.5, time);

    const gainNode = this.ctx.createGain();
    const finalGain = Math.max(0.01, this.volume * gainScale);
    gainNode.gain.setValueAtTime(finalGain, time);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    noise.start(time);
    noise.stop(time + 0.04);
  }

  playCritSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + (idx * 0.07);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(this.volume * 0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  playCritFail() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const startTime = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, startTime);
    osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.5);

    gain.gain.setValueAtTime(this.volume * 0.4, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.6);
  }
}

const soundEngine = new SoundFX();

// ==========================================
// 2. PARSER DE EXPRESSÕES DE DADOS DE RPG
// ==========================================
/**
 * Suporta:
 *  - Dados comuns: 1d20, 3d6, 1d100, 2d4, etc.
 *  - Fate/Fudge: 4dF (-1, 0, +1)
 *  - Keep Highest: 2d20kh1, 4d6kh3
 *  - Keep Lowest: 2d20kl1
 *  - Drop Lowest: 4d6dl1
 *  - Drop Highest: 4d6dh1
 *  - Explodir dados: 3d6! (rola novamente em caso de valor máximo)
 *  - Contagem de Sucessos: 6d10>=6, 5d10>7
 *  - Modificadores e matemática: + 5, - 2, * 2, / 2
 *  - Labels/Motivo: # Ataque Furtivo
 */
class DiceEngine {
  static rollSingleDie(sides) {
    if (sides === 'F') {
      // Fate/Fudge: -1, 0, +1
      const rand = Math.floor(Math.random() * 3) - 1;
      return { val: rand, isMax: rand === 1, isMin: rand === -1, text: rand > 0 ? '+1' : (rand < 0 ? '-1' : '0') };
    }
    const numSides = parseInt(sides, 10);
    const val = Math.floor(Math.random() * numSides) + 1;
    return {
      val,
      isMax: val === numSides,
      isMin: val === 1,
      text: val.toString()
    };
  }

  static evaluate(expression, label = '') {
    let cleanExpr = expression.trim();
    let rollLabel = label;

    // Extrair comentário ou hashtag (# Ataque)
    if (cleanExpr.includes('#')) {
      const parts = cleanExpr.split('#');
      cleanExpr = parts[0].trim();
      if (!rollLabel) rollLabel = parts[1].trim();
    }

    if (!cleanExpr) {
      throw new Error('Expressão de rolagem vazia.');
    }

    const allDiceResults = [];
    let hasNat20 = false;
    let hasNat1 = false;
    let isSuccessCountMode = false;

    // Expressão regular avançada para capturar dados
    // Exemplo: 4d6dl1, 2d20kh1, 3d6!, 6d10>=6, 4dF
    const diceRegex = /(\d+)?d(\d+|F|%)(kh\d+|kl\d+|dh\d+|dl\d+)?(!)?((?:>=|>|<=|<|=)\d+)?/gi;

    let expandedFormula = cleanExpr;
    const matches = [...cleanExpr.matchAll(diceRegex)];

    for (const match of matches) {
      const fullMatch = match[0];
      const count = match[1] ? parseInt(match[1], 10) : 1;
      let sides = match[2].toUpperCase();
      if (sides === '%') sides = '100';
      const keepDrop = match[3] ? match[3].toLowerCase() : null;
      const explode = Boolean(match[4]);
      const condition = match[5] ? match[5] : null;

      if (count > 200) throw new Error('Número de dados excede o limite máximo (200).');
      if (sides !== 'F' && parseInt(sides, 10) > 10000) throw new Error('Número de faces excede o limite (10000).');

      const rolled = [];
      for (let i = 0; i < count; i++) {
        let die = this.rollSingleDie(sides);
        rolled.push({ ...die, sides, originalIndex: rolled.length });

        // Exploding dice
        if (explode && sides !== 'F' && die.isMax) {
          let explodeLimit = 10;
          while (die.isMax && explodeLimit-- > 0) {
            die = this.rollSingleDie(sides);
            rolled.push({ ...die, sides, exploded: true, originalIndex: rolled.length });
          }
        }
      }

      // Check for Nat 20 / Nat 1 em d20
      if (sides === '20') {
        rolled.forEach(d => {
          if (d.val === 20) hasNat20 = true;
          if (d.val === 1) hasNat1 = true;
        });
      }

      // Apply Keep / Drop
      rolled.forEach(d => (d.dropped = false));
      if (keepDrop) {
        const kdType = keepDrop.substring(0, 2);
        const kdNum = parseInt(keepDrop.substring(2), 10);

        // Sort copy by value
        const sortedIndices = rolled
          .map((d, idx) => ({ val: d.val, idx }))
          .sort((a, b) => a.val - b.val);

        if (kdType === 'kh') { // keep highest
          const dropCount = Math.max(0, rolled.length - kdNum);
          for (let i = 0; i < dropCount; i++) {
            rolled[sortedIndices[i].idx].dropped = true;
          }
        } else if (kdType === 'kl') { // keep lowest
          const dropCount = Math.max(0, rolled.length - kdNum);
          for (let i = rolled.length - 1; i >= rolled.length - dropCount; i--) {
            rolled[sortedIndices[i].idx].dropped = true;
          }
        } else if (kdType === 'dl') { // drop lowest
          const dropCount = Math.min(kdNum, rolled.length);
          for (let i = 0; i < dropCount; i++) {
            rolled[sortedIndices[i].idx].dropped = true;
          }
        } else if (kdType === 'dh') { // drop highest
          const dropCount = Math.min(kdNum, rolled.length);
          for (let i = rolled.length - 1; i >= rolled.length - dropCount; i--) {
            rolled[sortedIndices[i].idx].dropped = true;
          }
        }
      }

      // Calculate sum or successes for this dice group
      let groupSum = 0;
      let groupSuccesses = 0;

      if (condition) {
        isSuccessCountMode = true;
        const condOp = condition.match(/[><=]+/)[0];
        const condVal = parseInt(condition.replace(condOp, ''), 10);

        rolled.forEach(d => {
          if (!d.dropped) {
            let pass = false;
            if (condOp === '>=') pass = d.val >= condVal;
            else if (condOp === '>') pass = d.val > condVal;
            else if (condOp === '<=') pass = d.val <= condVal;
            else if (condOp === '<') pass = d.val < condVal;
            else if (condOp === '=') pass = d.val === condVal;

            if (pass) {
              groupSuccesses++;
              d.success = true;
            } else {
              d.success = false;
            }
          }
        });
      } else {
        rolled.forEach(d => {
          if (!d.dropped) groupSum += d.val;
        });
      }

      allDiceResults.push({
        groupText: fullMatch,
        sides,
        dice: rolled,
        groupSum: condition ? groupSuccesses : groupSum,
        isSuccessCount: Boolean(condition)
      });

      // Substitui na fórmula a rolagem pelo valor calculado
      const replaceVal = condition ? groupSuccesses : `(${groupSum})`;
      expandedFormula = expandedFormula.replace(fullMatch, replaceVal);
    }

    // Calcula valor matemático final
    let finalTotal = 0;
    try {
      // Sanitizar antes de avaliar: apenas números, parenteses e operadores + - * /
      const safeMath = expandedFormula.replace(/[^0-9+\-*/(). ]/g, '');
      finalTotal = Function(`'use strict'; return (${safeMath || '0'})`)();
    } catch (e) {
      // Se falhou o parser aritmético, fallback para a soma dos grupos
      finalTotal = allDiceResults.reduce((acc, g) => acc + g.groupSum, 0);
    }

    if (typeof finalTotal === 'number' && !Number.isInteger(finalTotal)) {
      finalTotal = parseFloat(finalTotal.toFixed(2));
    }

    return {
      rawFormula: cleanExpr,
      label: rollLabel,
      total: finalTotal,
      diceGroups: allDiceResults,
      hasNat20,
      hasNat1,
      isSuccessCountMode,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  }
}

// ==========================================
// 3. CONFETTI ENGINE (Para Nat 20 / Críticos)
// ==========================================
class ConfettiEffect {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.particles = [];
    this.animationId = null;

    if (this.canvas) {
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawn() {
    if (!this.canvas) {
      this.canvas = document.getElementById('confetti-canvas');
      if (this.canvas) this.ctx = this.canvas.getContext('2d');
    }
    if (!this.canvas || !this.ctx) return;
    this.resize();
    const colors = ['#f59e0b', '#10b981', '#a855f7', '#06b6d4', '#ec4899', '#ffffff'];
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: this.canvas.width / 2 + (Math.random() * 200 - 100),
        y: this.canvas.height * 0.45,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        tilt: Math.random() * 10,
        tiltAngle: 0,
        tiltSpeed: Math.random() * 0.1 + 0.05,
        alpha: 1
      });
    }

    if (!this.animationId) {
      this.animate();
    }
  }

  animate() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let idx = this.particles.length - 1; idx >= 0; idx--) {
      const p = this.particles[idx];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravidade
      p.tiltAngle += p.tiltSpeed;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      p.alpha -= 0.012;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.rect(p.x + p.tilt, p.y, p.size, p.size);
      this.ctx.fill();
      this.ctx.restore();

      if (p.alpha <= 0 || p.y > this.canvas.height) {
        this.particles.splice(idx, 1);
      }
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.animationId = null;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// ==========================================

// ==========================================
// 3.5. 3D DICE ENGINE (Modelos Blender & Suporte a d100 com 2x d10)
// ==========================================

// Modelos 3D importados diretamente dos arquivos .obj do Blender
const SPACE_MODELS = {
  d4: {
    type: 'd4', sides: 4,
    vertices: [
      [0, 0.999985, 0],
      [0.762208, -0.33332, 0.55492],
      [0.099469, -0.33332, -0.93754],
      [-0.861677, -0.33332, 0.38262],
    ],
    faces: [
      { indices: [0, 3, 1], normal: [-0.09951, 0.33332, 0.93755], value: 4 },
      { indices: [0, 1, 2], normal: [0.8617, 0.3333, -0.3826], value: 1 },
      { indices: [0, 2, 3], normal: [-0.76222, 0.33331, -0.55491], value: 2 },
      { indices: [2, 1, 3], normal: [0, -1, 0], value: 3 },
    ]
  },
  d6: {
    type: 'd6', sides: 6,
    vertices: [
      [0.576638, 0.577358, -0.578054],
      [0.578054, 0.577358, 0.576638],
      [-0.578054, 0.577358, -0.576638],
      [0.576638, -0.577358, -0.578054],
      [-0.578054, -0.577358, -0.576638],
      [0.578054, -0.577358, 0.576638],
      [-0.576638, -0.577358, 0.578054],
      [-0.576638, 0.577358, 0.578054],
    ],
    faces: [
      { indices: [0, 1, 5, 3], normal: [1, 0, -0.0012], value: 6 },
      { indices: [0, 2, 7, 1], normal: [0, 1, 0], value: 2 },
      { indices: [0, 3, 4, 2], normal: [-0.0012, 0, -1], value: 1 },
      { indices: [6, 4, 3, 5], normal: [0, -1, 0], value: 5 },
      { indices: [6, 5, 1, 7], normal: [0.0012, 0, 1], value: 3 },
      { indices: [6, 7, 2, 4], normal: [-1, 0, 0.0012], value: 4 },
    ]
  },
  d10: {
    type: 'd10', sides: 10,
    vertices: [
      [0, -1, 0],
      [0.324093, -0.105579, -0.72598],
      [0.790608, -0.105579, 0.083889],
      [-0.590317, -0.105579, -0.532579],
      [-0.688916, -0.105579, 0.39685],
      [0.164532, -0.105579, 0.777842],
      [0.590317, 0.105579, 0.532579],
      [-0.324093, 0.105579, 0.72598],
      [0, 1, 0],
      [0.688916, 0.105579, -0.39685],
      [-0.164532, 0.105579, -0.777842],
      [-0.790608, 0.105579, -0.083889],
    ],
    faces: [
      { indices: [0, 1, 9, 2], normal: [0.70353, -0.58382, -0.40522], value: 10 },
      { indices: [3, 10, 1, 0], normal: [-0.168, -0.58381, -0.79432], value: 8 },
      { indices: [2, 6, 5, 0], normal: [0.60283, -0.58383, 0.54382], value: 2 },
      { indices: [3, 0, 4, 11], normal: [-0.80734, -0.58383, -0.0857], value: 4 },
      { indices: [4, 0, 5, 7], normal: [-0.3309, -0.5838, 0.7414], value: 6 },
      { indices: [7, 5, 6, 8], normal: [0.168, 0.58381, 0.79432], value: 1 },
      { indices: [8, 11, 4, 7], normal: [-0.70353, 0.58382, 0.40522], value: 9 },
      { indices: [9, 8, 6, 2], normal: [0.80734, 0.58383, 0.0857], value: 7 },
      { indices: [10, 8, 9, 1], normal: [0.3309, 0.5838, -0.7414], value: 5 },
      { indices: [11, 8, 10, 3], normal: [-0.60283, 0.58383, -0.54382], value: 3 },
    ]
  },
  d100: {
    type: 'd100', sides: 100,
    vertices: [
      [0, -1, 0],
      [0.324093, -0.105579, -0.72598],
      [0.790608, -0.105579, 0.083889],
      [-0.590317, -0.105579, -0.532579],
      [-0.688916, -0.105579, 0.39685],
      [0.164532, -0.105579, 0.777842],
      [0.590317, 0.105579, 0.532579],
      [-0.324093, 0.105579, 0.72598],
      [0, 1, 0],
      [0.688916, 0.105579, -0.39685],
      [-0.164532, 0.105579, -0.777842],
      [-0.790608, 0.105579, -0.083889],
    ],
    faces: [
      { indices: [0, 1, 9, 2], normal: [0.70353, -0.58382, -0.40522], value: '00' },
      { indices: [3, 10, 1, 0], normal: [-0.168, -0.58381, -0.79432], value: '80' },
      { indices: [2, 6, 5, 0], normal: [0.60283, -0.58383, 0.54382], value: '20' },
      { indices: [3, 0, 4, 11], normal: [-0.80734, -0.58383, -0.0857], value: '40' },
      { indices: [4, 0, 5, 7], normal: [-0.3309, -0.5838, 0.7414], value: '60' },
      { indices: [7, 5, 6, 8], normal: [0.168, 0.58381, 0.79432], value: '10' },
      { indices: [8, 11, 4, 7], normal: [-0.70353, 0.58382, 0.40522], value: '90' },
      { indices: [9, 8, 6, 2], normal: [0.80734, 0.58383, 0.0857], value: '70' },
      { indices: [10, 8, 9, 1], normal: [0.3309, 0.5838, -0.7414], value: '50' },
      { indices: [11, 8, 10, 3], normal: [-0.60283, 0.58383, -0.54382], value: '30' },
    ]
  },
  d12: {
    type: 'd12', sides: 12,
    vertices: [
      [-0.729409, -0.187136, -0.657969],
      [-0.451178, -0.794364, -0.406699],
      [-0.203163, 0.187757, -0.960975],
      [-0.976654, 0.188155, -0.103619],
      [-0.603228, 0.794985, -0.06401],
      [-0.851243, -0.187136, 0.490265],
      [-0.52647, -0.794364, 0.302956],
      [-0.400288, 0.187757, 0.896939],
      [-0.247021, 0.794761, 0.554375],
      [0.203163, -0.187757, 0.960975],
      [0.729409, 0.187136, 0.657969],
      [0.125188, -0.794761, 0.59386],
      [0.603228, -0.794985, 0.06401],
      [0.247021, -0.794761, -0.554375],
      [0.976654, -0.188155, 0.103619],
      [0.851243, 0.187136, -0.490265],
      [0.52647, 0.794364, -0.302956],
      [0.400288, -0.187757, -0.896939],
      [0.451178, 0.794364, 0.406699],
      [-0.125188, 0.794761, -0.59386],
    ],
    faces: [
      { indices: [0, 2, 17, 13, 1], normal: [-0.18539, -0.44708, -0.87507], value: 12 },
      { indices: [0, 1, 6, 5, 3], normal: [-0.88969, -0.4467, -0.0944], value: 1 },
      { indices: [0, 3, 4, 19, 2], normal: [-0.66383, 0.44762, -0.59913], value: 11 },
      { indices: [3, 5, 7, 8, 4], normal: [-0.77479, 0.44759, 0.44649], value: 2 },
      { indices: [6, 11, 9, 7, 5], normal: [-0.36489, -0.44709, 0.81668], value: 10 },
      { indices: [10, 18, 8, 7, 9], normal: [0.18539, 0.44708, 0.87507], value: 3 },
      { indices: [10, 9, 11, 12, 14], normal: [0.66383, -0.44762, 0.59913], value: 9 },
      { indices: [1, 13, 12, 11, 6], normal: [-0.0006, -1, -0.0001], value: 4 },
      { indices: [15, 14, 12, 13, 17], normal: [0.77479, -0.44759, -0.44649], value: 8 },
      { indices: [10, 14, 15, 16, 18], normal: [0.88969, 0.4467, 0.0944], value: 5 },
      { indices: [2, 19, 16, 15, 17], normal: [0.36489, 0.44709, -0.81668], value: 7 },
      { indices: [8, 18, 16, 19, 4], normal: [0.0006, 1, 0.0001], value: 6 },
    ]
  },
  d20: {
    type: 'd20', sides: 20,
    vertices: [
      [-0.39862, 0.187581, -0.897702],
      [0.578126, -0.187581, -0.794084],
      [0.357297, 0.794656, -0.490758],
      [-0.246373, -0.794656, -0.554818],
      [-0.60367, 0.794656, -0.064059],
      [-0.976746, -0.187581, -0.103643],
      [-0.578126, 0.187581, 0.794084],
      [-0.357297, -0.794656, 0.490758],
      [0.39862, -0.187581, 0.897702],
      [0.60367, -0.794656, 0.064059],
      [0.976746, 0.187581, 0.103643],
      [0.246373, 0.794656, 0.554818],
    ],
    faces: [
      { indices: [2, 1, 0], normal: [0.22521, 0.33331, -0.91553], value: 20 },
      { indices: [3, 0, 1], normal: [-0.028, -0.3333, -0.9424], value: 14 },
      { indices: [0, 4, 2], normal: [-0.27059, 0.74537, -0.60927], value: 8 },
      { indices: [0, 3, 5], normal: [-0.68028, -0.33329, -0.65279], value: 2 },
      { indices: [0, 5, 4], normal: [-0.83018, 0.33329, -0.44689], value: 12 },
      { indices: [6, 5, 7], normal: [-0.80211, -0.3333, 0.49551], value: 10 },
      { indices: [6, 4, 5], normal: [-0.90546, 0.33329, 0.26279], value: 6 },
      { indices: [5, 3, 7], normal: [-0.6629, -0.7454, -0.0703], value: 18 },
      { indices: [7, 8, 6], normal: [-0.22521, -0.33331, 0.91553], value: 4 },
      { indices: [8, 7, 9], normal: [0.27059, -0.74537, 0.60927], value: 16 },
      { indices: [9, 7, 3], normal: [0, -1, 0], value: 1 },
      { indices: [1, 10, 9], normal: [0.90546, -0.33329, -0.26279], value: 7 },
      { indices: [8, 9, 10], normal: [0.83018, -0.33329, 0.44689], value: 13 },
      { indices: [1, 9, 3], normal: [0.39238, -0.74536, -0.53897], value: 19 },
      { indices: [1, 2, 10], normal: [0.80211, 0.3333, -0.49551], value: 9 },
      { indices: [8, 10, 11], normal: [0.68028, 0.33329, 0.65279], value: 11 },
      { indices: [10, 2, 11], normal: [0.6629, 0.7454, 0.0703], value: 15 },
      { indices: [6, 11, 4], normal: [-0.39238, 0.74536, 0.53897], value: 3 },
      { indices: [11, 6, 8], normal: [0.028, 0.3333, 0.9424], value: 17 },
      { indices: [4, 11, 2], normal: [0, 1, 0], value: 5 },
    ]
  },
  d8: {
    type: 'd8', sides: 8,
    vertices: [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]],
    faces: [
      { indices: [0, 2, 4], normal: [0.577, 0.577, 0.577], value: 8 },
      { indices: [2, 1, 4], normal: [-0.577, 0.577, 0.577], value: 2 },
      { indices: [1, 3, 4], normal: [-0.577, -0.577, 0.577], value: 6 },
      { indices: [3, 0, 4], normal: [0.577, -0.577, 0.577], value: 4 },
      { indices: [2, 0, 5], normal: [0.577, 0.577, -0.577], value: 5 },
      { indices: [1, 2, 5], normal: [-0.577, 0.577, -0.577], value: 7 },
      { indices: [3, 1, 5], normal: [-0.577, -0.577, -0.577], value: 1 },
      { indices: [0, 3, 5], normal: [0.577, -0.577, -0.577], value: 3 }
    ]
  }
};



// Compilador Procedural de Malhas 3D Chanfradas (Bevel / Chamfer Sub-Mesh Compiler)
// Transforma cada poliedro bruto em um modelo 3D profissional com:
//  - Faces Principais (main) com rebaixo interno 3D (innerWell) e base ortonormal (T, B, N)
//  - Chanfros de Aresta 3D a 45° (edge bevels) que refletem luz especular metálica/cristalina
//  - Facetas de Vértice 3D (corner bevels) que eliminam quinas pontiagudas irreais
class BeveledModelCompiler {
  static vecNorm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  static vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  static vecAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  static vecScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  static vecDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  static vecCross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  static compileAll(rawModels) {
    const bevelConfig = {
      d4:   { bevelT: 0.145, bulge: 0.042, wellRatio: 0.76, visualScale: 1.06 },
      d6:   { bevelT: 0.155, bulge: 0.048, wellRatio: 0.80, visualScale: 0.96 },
      d8:   { bevelT: 0.120, bulge: 0.038, wellRatio: 0.77, visualScale: 1.04 },
      d10:  { bevelT: 0.105, bulge: 0.032, wellRatio: 0.78, visualScale: 1.04 },
      d100: { bevelT: 0.105, bulge: 0.032, wellRatio: 0.78, visualScale: 1.04 },
      d12:  { bevelT: 0.105, bulge: 0.030, wellRatio: 0.79, visualScale: 1.00 },
      d20:  { bevelT: 0.100, bulge: 0.030, wellRatio: 0.78, visualScale: 1.02 }
    };

    const compiled = {};
    for (const [key, raw] of Object.entries(rawModels)) {
      compiled[key] = this.compileSingle(raw, bevelConfig[key] || bevelConfig.d20);
    }
    return compiled;
  }

  static compileSingle(m, cfg) {
    const { bevelT, bulge, wellRatio, visualScale } = cfg;
    const newVerts = [];
    const faceVertMap = m.faces.map(() => ({}));

    // 1. Gerar vértices chanfrados das faces principais
    const mainFaces = m.faces.map((f, fi) => {
      const origPts = f.indices.map(i => m.vertices[i]);
      const c0 = origPts.reduce((acc, p) => this.vecAdd(acc, this.vecScale(p, 1 / origPts.length)), [0, 0, 0]);
      const n = this.vecNorm(f.normal);

      const indices = f.indices.map(vi => {
        const v = m.vertices[vi];
        const w = this.vecAdd(
          this.vecAdd(this.vecScale(v, 1 - bevelT), this.vecScale(c0, bevelT)),
          this.vecScale(n, bulge)
        );
        const idx = newVerts.length;
        newVerts.push(w);
        faceVertMap[fi][vi] = idx;
        return idx;
      });

      return { kind: 'main', fi, origIndices: f.indices, indices, normal: n, value: f.value };
    });

    // 2. Gerar faces de chanfro de aresta (Edge Bevel Quads a 45°)
    const edgeMap = new Map();
    m.faces.forEach((f, fi) => {
      const idx = f.indices;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[i], b = idx[(i + 1) % idx.length];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key).push({ fi, a, b });
      }
    });

    const edgeFaces = [];
    for (const list of edgeMap.values()) {
      if (list.length !== 2) continue;
      const e1 = list[0], e2 = list[1];
      const u = e1.a, v = e1.b;
      const qIndices = [
        faceVertMap[e1.fi][u],
        faceVertMap[e2.fi][u],
        faceVertMap[e2.fi][v],
        faceVertMap[e1.fi][v]
      ];
      const pts = qIndices.map(i => newVerts[i]);
      const c = pts.reduce((acc, p) => this.vecAdd(acc, this.vecScale(p, 0.25)), [0, 0, 0]);
      let n = this.vecNorm(this.vecCross(this.vecSub(pts[1], pts[0]), this.vecSub(pts[2], pts[0])));
      if (this.vecDot(n, c) < 0) {
        qIndices.reverse();
        n = this.vecScale(n, -1);
      }
      edgeFaces.push({ kind: 'edge', indices: qIndices, normal: n });
    }

    // 3. Gerar facetas de chanfro de vértice (Corner Bevel Polygons)
    const cornerFaces = m.vertices.map((v, vi) => {
      const inc = [];
      m.faces.forEach((f, fi) => {
        if (f.indices.includes(vi)) inc.push(fi);
      });
      const vn = this.vecNorm(v);
      const ref = Math.abs(vn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const t1 = this.vecNorm(this.vecCross(vn, ref));
      const t2 = this.vecCross(vn, t1);
      inc.sort((fa, fb) => {
        const pa = this.vecSub(newVerts[faceVertMap[fa][vi]], v);
        const pb = this.vecSub(newVerts[faceVertMap[fb][vi]], v);
        return Math.atan2(this.vecDot(pa, t2), this.vecDot(pa, t1)) -
               Math.atan2(this.vecDot(pb, t2), this.vecDot(pb, t1));
      });
      const cIndices = inc.map(fi => faceVertMap[fi][vi]);
      const pts = cIndices.map(i => newVerts[i]);
      const c = pts.reduce((acc, p) => this.vecAdd(acc, this.vecScale(p, 1 / pts.length)), [0, 0, 0]);
      let n = this.vecNorm(this.vecCross(this.vecSub(pts[1], pts[0]), this.vecSub(pts[2], pts[0])));
      if (this.vecDot(n, c) < 0) {
        cIndices.reverse();
        n = this.vecScale(n, -1);
      }
      return { kind: 'corner', indices: cIndices, normal: n };
    });

    // 4. Normalizar escala global dos vértices para manter raio consistente
    let maxR = 0;
    newVerts.forEach(v => {
      const r = Math.hypot(v[0], v[1], v[2]);
      if (r > maxR) maxR = r;
    });
    const normFactor = (1 / (maxR || 1)) * visualScale;
    for (let i = 0; i < newVerts.length; i++) {
      newVerts[i] = this.vecScale(newVerts[i], normFactor);
    }

    // 5. Pré-calcular geometria fina de cada face (Centro, Tangente, Bitangente, Inradius, Cavidade Interna)
    const allFaces = [...mainFaces, ...edgeFaces, ...cornerFaces];
    allFaces.forEach(face => {
      const bPts = face.indices.map(i => newVerts[i]);
      const center = bPts.reduce((acc, p) => this.vecAdd(acc, this.vecScale(p, 1 / bPts.length)), [0, 0, 0]);
      face.center = center;

      if (face.kind === 'main') {
        const n = face.normal;
        let B;
        let visualCenter = [...center];

        if (m.type === 'd6') {
          const e0 = this.vecNorm(this.vecSub(bPts[1], bPts[0]));
          const e1 = this.vecNorm(this.vecSub(bPts[3], bPts[0]));
          const refUp = Math.abs(n[1]) > 0.9 ? [0, 0, -n[1]] : [0, 1, 0];
          const candidates = [e0, this.vecScale(e0, -1), e1, this.vecScale(e1, -1)];
          candidates.sort((a, b) => this.vecDot(b, refUp) - this.vecDot(a, refUp));
          B = candidates[0];
        } else if (m.type === 'd10' || m.type === 'd100') {
          let poleIdx = 0, maxAbsY = -1;
          face.origIndices.forEach((vi, idx) => {
            const p = m.vertices[vi];
            if (Math.abs(p[1]) > maxAbsY) {
              maxAbsY = Math.abs(p[1]);
              poleIdx = idx;
            }
          });
          B = this.vecNorm(this.vecSub(bPts[poleIdx], center));
          // Desloca centro óptico para o incentro (parte mais larga da pipa do d10)
          visualCenter = this.vecAdd(center, this.vecScale(B, -0.042 * visualScale));
        } else {
          // Triângulos (d4, d8, d20) e Pentágonos (d12): alinha B com o vértice de topo (ápice)
          const refUp = Math.abs(n[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0];
          let bestV = bPts[0], bestDot = -Infinity;
          bPts.forEach(p => {
            const dir = this.vecNorm(this.vecSub(p, center));
            const d = this.vecDot(dir, refUp);
            if (d > bestDot) { bestDot = d; bestV = p; }
          });
          B = this.vecNorm(this.vecSub(bestV, center));
        }

        const T = this.vecNorm(this.vecCross(B, n));
        B = this.vecNorm(this.vecCross(n, T));

        // Raio do círculo inscrito em torno do visualCenter
        let inradius = Infinity;
        for (let i = 0; i < bPts.length; i++) {
          const a = bPts[i], b = bPts[(i + 1) % bPts.length];
          const ab = this.vecSub(b, a);
          const ac = this.vecSub(visualCenter, a);
          const dist = Math.hypot(...this.vecCross(ab, ac)) / (Math.hypot(...ab) || 1);
          if (dist < inradius) inradius = dist;
        }

        // Vértices da cavidade interna rebaixada (Inner Recessed Well) no plano 2D local [-100..100]
        const localPoly = bPts.map(p => {
          const d = this.vecSub(p, visualCenter);
          return [
            (this.vecDot(d, T) / inradius) * 100 * wellRatio,
            (-this.vecDot(d, B) / inradius) * 100 * wellRatio
          ];
        });

        // Para d4, calcula também posições locais dos 3 cantos para números de vértice reais
        let d4CornerPositions = null;
        if (m.type === 'd4') {
          d4CornerPositions = bPts.map(p => {
            const d = this.vecSub(p, visualCenter);
            return [
              (this.vecDot(d, T) / inradius) * 100 * 0.54,
              (-this.vecDot(d, B) / inradius) * 100 * 0.54
            ];
          });
        }

        face.visualCenter = visualCenter;
        face.T = T;
        face.B = B;
        face.inradius = inradius;
        face.localWellPoly = localPoly;
        face.d4CornerPositions = d4CornerPositions;
      }
    });

    return {
      type: m.type,
      sides: m.sides,
      vertices: newVerts,
      faces: allFaces,
      mainFaces
    };
  }
}

const COMPILED_SPACE_MODELS = BeveledModelCompiler.compileAll(SPACE_MODELS);

// Instância individual de um dado na cena 3D (suporta dados individuais ou múltiplos, como d100 com 2x d10)
class Die3DInstance {
  constructor(model, config = {}) {
    this.model = model;
    this.xOffset = config.xOffset || 0;
    this.scale = config.scale || 1.0;
    this.label = config.label || '';
    this.orientation = [0.955, 0.18, 0.22, -0.06];
    this.baseSettledQuat = [0.955, 0.18, 0.22, -0.06];
    this.targetQuat = [1, 0, 0, 0];
    this.startQuat = [1, 0, 0, 0];
    this.settleStartQuat = null;
    this.angularVelocity = config.angularVelocity || [0.38, 0.58, 0.22];
    this.tumbleVelocity = [0, 0, 0];
    this.yOffset = 0;
    this.jumpScale = 1.0;
  }
}

class Dice3DEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.logicalWidth = this.canvas ? (parseInt(this.canvas.getAttribute('width'), 10) || 420) : 420;
    this.logicalHeight = this.canvas ? (parseInt(this.canvas.getAttribute('height'), 10) || 280) : 280;
    this.dpr = 1;

    this.currentSides = 20;
    this.isDualD100 = false;
    this.activeDice = [];
    this.d6Style = 'pips'; // 'pips' (Clássico 3D Côncavo) | 'numbers' (Numeral RPG Entalhado)

    // Física e Animação
    this.state = 'IDLE'; // 'IDLE' | 'ROLLING' | 'SETTLED' | 'DRAGGING'
    this.rollStart = 0;
    this.rollDuration = 880; // ms
    this.onRollComplete = null;
    this.critState = null; // 'success' | 'fail' | null

    // Interação com Mouse / Touch
    this.isDragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.dragStartPos = { x: 0, y: 0 };
    this.dragDistance = 0;
    this.onDieClick = null;

    // Partículas de faíscas
    this.sparks = [];
    this.lastTime = performance.now();

    if (this.canvas) {
      this.setupHighDPI();
      window.addEventListener('resize', () => this.setupHighDPI());
      this.bindEvents();
      this.setDieType(20);
      this.startLoop();
    }
  }

  setupHighDPI() {
    if (!this.canvas || !this.ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.logicalWidth * this.dpr);
    this.canvas.height = Math.round(this.logicalHeight * this.dpr);
    this.canvas.style.width = `${this.logicalWidth}px`;
    this.canvas.style.height = `${this.logicalHeight}px`;
  }

  setDieType(sides) {
    const s = parseInt(sides, 10);
    this.currentSides = isNaN(s) ? 20 : s;

    if (this.currentSides === 100) {
      // Cria 2 dados d10 chanfrados para o d100: Dezenas (SpaceD100) e Unidades (SpaceD10)
      this.isDualD100 = true;
      const d100Model = COMPILED_SPACE_MODELS.d100;
      const d10Model = COMPILED_SPACE_MODELS.d10;
      const tensDie = new Die3DInstance(d100Model, {
        xOffset: -82,
        scale: 0.84,
        label: 'Dezenas (00–90)',
        angularVelocity: [0.35, 0.52, 0.18]
      });
      const unitsDie = new Die3DInstance(d10Model, {
        xOffset: 82,
        scale: 0.84,
        label: 'Unidades (0–9)',
        angularVelocity: [-0.38, 0.48, -0.20]
      });
      tensDie.orientation = this.getFaceTargetQuat(d100Model, '00');
      tensDie.baseSettledQuat = [...tensDie.orientation];
      unitsDie.orientation = this.getFaceTargetQuat(d10Model, '0');
      unitsDie.baseSettledQuat = [...unitsDie.orientation];
      this.activeDice = [tensDie, unitsDie];
    } else {
      // Dado único centralizado
      this.isDualD100 = false;
      const model = COMPILED_SPACE_MODELS['d' + this.currentSides] || COMPILED_SPACE_MODELS.d20;
      const singleDie = new Die3DInstance(model, {
        xOffset: 0,
        scale: 1.0,
        label: '',
        angularVelocity: [0.36, 0.56, 0.22]
      });
      singleDie.orientation = this.getFaceTargetQuat(model, this.currentSides);
      singleDie.baseSettledQuat = [...singleDie.orientation];
      this.activeDice = [singleDie];
    }

    // Atualiza botões chips na interface
    document.querySelectorAll('.d3d-chip').forEach(chip => {
      if (parseInt(chip.dataset.sides, 10) === this.currentSides) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  nudgeSpin() {
    if (this.state === 'SETTLED') this.state = 'IDLE';
    this.activeDice.forEach((d, idx) => {
      d.angularVelocity = [
        (0.35 + Math.random() * 0.4) * (idx === 0 ? 1 : -1),
        (0.55 + Math.random() * 0.5),
        (Math.random() - 0.5) * 0.35
      ];
    });
  }

  // --- Álgebra de Quatérnions & Matrizes 3D ---
  normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  quatNormalize(q) {
    const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  }

  quatMultiply(q1, q2) {
    const [w1, x1, y1, z1] = q1;
    const [w2, x2, y2, z2] = q2;
    return [
      w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
      w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
      w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
      w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
    ];
  }

  quatFromAxisAngle(axis, angle) {
    const half = angle / 2;
    const s = Math.sin(half);
    const n = this.normalize(axis);
    return [Math.cos(half), n[0] * s, n[1] * s, n[2] * s];
  }

  matrixToQuat(m) {
    const tr = m[0][0] + m[1][1] + m[2][2];
    let w, x, y, z;
    if (tr > 0) {
      const S = Math.sqrt(tr + 1.0) * 2;
      w = 0.25 * S;
      x = (m[2][1] - m[1][2]) / S;
      y = (m[0][2] - m[2][0]) / S;
      z = (m[1][0] - m[0][1]) / S;
    } else if ((m[0][0] > m[1][1]) && (m[0][0] > m[2][2])) {
      const S = Math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2;
      w = (m[2][1] - m[1][2]) / S;
      x = 0.25 * S;
      y = (m[0][1] + m[1][0]) / S;
      z = (m[0][2] + m[2][0]) / S;
    } else if (m[1][1] > m[2][2]) {
      const S = Math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2;
      w = (m[0][2] - m[2][0]) / S;
      x = (m[0][1] + m[1][0]) / S;
      y = 0.25 * S;
      z = (m[1][2] + m[2][1]) / S;
    } else {
      const S = Math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2;
      w = (m[1][0] - m[0][1]) / S;
      x = (m[0][2] + m[2][0]) / S;
      y = (m[1][2] + m[2][1]) / S;
      z = 0.25 * S;
    }
    return this.quatNormalize([w, x, y, z]);
  }

  quatSlerp(qa, qb, t) {
    let cosHalfTheta = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
    let target = [...qb];
    if (cosHalfTheta < 0) {
      target = target.map(x => -x);
      cosHalfTheta = -cosHalfTheta;
    }
    if (Math.abs(cosHalfTheta) >= 0.9995) {
      return this.quatNormalize([
        qa[0] + (target[0] - qa[0]) * t,
        qa[1] + (target[1] - qa[1]) * t,
        qa[2] + (target[2] - qa[2]) * t,
        qa[3] + (target[3] - qa[3]) * t
      ]);
    }
    const halfTheta = Math.acos(Math.min(1, Math.max(-1, cosHalfTheta)));
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    return this.quatNormalize([
      qa[0] * ratioA + target[0] * ratioB,
      qa[1] * ratioA + target[1] * ratioB,
      qa[2] * ratioA + target[2] * ratioB,
      qa[3] * ratioA + target[3] * ratioB
    ]);
  }

  quatToMatrix(q) {
    const [w, x, y, z] = q;
    return [
      [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w,     2 * x * z + 2 * y * w],
      [2 * x * y + 2 * z * w,     1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
      [2 * x * z - 2 * y * w,     2 * y * z + 2 * x * w,     1 - 2 * x * x - 2 * y * y]
    ];
  }

  // Calcula o Quatérnion exato que alinha a face sorteada (T, B, N) em ângulo 3/4 de estúdio 3D
  // garantindo que o número fique 100% em pé e que múltiplas faces e chanfros 3D fiquem visíveis!
  getFaceTargetQuat(model, targetValue) {
    if (!model || !model.mainFaces) return [1, 0, 0, 0];
    const strVal = String(targetValue);
    let matchedFace = model.mainFaces.find(f => {
      const fv = String(f.value);
      if (fv === strVal) return true;
      if (model.type === 'd10' && (strVal === '0' || strVal === '10') && (fv === '0' || fv === '10')) return true;
      return false;
    });
    if (!matchedFace) matchedFace = model.mainFaces[0];

    // Ângulo 3/4 de estúdio: mostra a face sorteada em destaque + faces laterais/superiores e chanfros em perspectiva 3D real
    const tilt = model.type === 'd6'
      ? [-0.29, -0.25, 0.924]
      : [-0.20, -0.18, 0.963];
    const targetN = this.normalize(tilt);
    const worldRight = this.normalize(this.cross([0, 1, 0], targetN));
    const worldUp = this.normalize(this.cross(targetN, worldRight));

    const T = matchedFace.T;
    const B = matchedFace.B;
    const N = matchedFace.normal;

    // R = [worldRight, worldUp, targetN] * [T, B, N]^T
    const R = [0, 1, 2].map(i => [0, 1, 2].map(j =>
      worldRight[i] * T[j] + worldUp[i] * B[j] + targetN[i] * N[j]
    ));

    return this.matrixToQuat(R);
  }

  // --- Eventos de Mouse e Touch ---
  bindEvents() {
    const container = document.getElementById('dice-3d-stage-box') || this.canvas;
    if (!container) return;

    const onPointerDown = (clientX, clientY) => {
      this.isDragging = true;
      this.dragDistance = 0;
      this.lastPointer = { x: clientX, y: clientY };
      this.dragStartPos = { x: clientX, y: clientY };
      container.classList.add('is-dragging');
    };

    const onPointerMove = (clientX, clientY) => {
      if (!this.isDragging) return;
      const dx = clientX - this.lastPointer.x;
      const dy = clientY - this.lastPointer.y;
      this.dragDistance += Math.hypot(dx, dy);
      this.lastPointer = { x: clientX, y: clientY };

      if (this.state !== 'ROLLING') {
        this.state = 'DRAGGING';
        const speed = 0.011;
        const rotY = this.quatFromAxisAngle([0, 1, 0], dx * speed);
        const rotX = this.quatFromAxisAngle([1, 0, 0], dy * speed);
        const delta = this.quatMultiply(rotY, rotX);

        this.activeDice.forEach(d => {
          d.orientation = this.quatNormalize(this.quatMultiply(delta, d.orientation));
          d.baseSettledQuat = [...d.orientation];
          d.angularVelocity = [
            Math.max(-2.2, Math.min(2.2, dy * 0.08)),
            Math.max(-2.2, Math.min(2.2, dx * 0.08)),
            0
          ];
        });
      }
    };

    const onPointerUp = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      container.classList.remove('is-dragging');

      if (this.dragDistance < 7) {
        if (this.onDieClick) this.onDieClick();
      } else {
        if (this.state === 'DRAGGING') {
          this.state = 'IDLE';
        }
      }
    };

    this.canvas.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => onPointerUp());

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => onPointerUp());

    // Chips seletores de modelo 3D
    document.querySelectorAll('.d3d-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const sides = parseInt(chip.dataset.sides, 10);
        this.setDieType(sides);
        this.nudgeSpin();
      });
    });

    // Alternador de estilo do D6 (Pips 3D Clássicos vs Números RPG)
    const d6StyleBtn = document.getElementById('d6-style-toggle');
    if (d6StyleBtn) {
      d6StyleBtn.addEventListener('click', () => {
        this.d6Style = this.d6Style === 'pips' ? 'numbers' : 'pips';
        d6StyleBtn.textContent = this.d6Style === 'pips' ? '⚅ d6: Pips 3D' : '🔢 d6: Números RPG';
        if (this.currentSides !== 6) {
          this.setDieType(6);
        }
        this.nudgeSpin();
      });
    }
  }

  // --- Disparo de Rolagem ---
  roll(sides, targetValue, hasNat20, hasNat1, onComplete) {
    this.setDieType(sides);
    this.state = 'ROLLING';
    this.rollStart = performance.now();
    this.rollDuration = 880; // ms
    this.onRollComplete = onComplete;
    this.critState = hasNat20 ? 'success' : (hasNat1 ? 'fail' : null);

    if (this.isDualD100) {
      const val = parseInt(targetValue, 10) || 0;
      let tensVal = '00';
      let unitsVal = '0';

      if (val >= 100) {
        tensVal = '00';
        unitsVal = '0'; // 00 + 0 = 100 no RPG de mesa
      } else {
        const u = val % 10;
        const t = Math.floor(val / 10) * 10;
        tensVal = t === 0 ? '00' : String(t);
        unitsVal = String(u);
      }

      this.activeDice[0].targetQuat = this.getFaceTargetQuat(this.activeDice[0].model, tensVal);
      this.activeDice[1].targetQuat = this.getFaceTargetQuat(this.activeDice[1].model, unitsVal);

      this.activeDice.forEach((d, idx) => {
        d.startQuat = [...d.orientation];
        d.settleStartQuat = null;
        const speed = 18 + Math.random() * 5;
        d.tumbleVelocity = [
          (idx === 0 ? 1 : -1) * (speed * 0.75),
          (idx === 0 ? -1 : 1) * (speed * 0.95),
          (Math.random() - 0.5) * speed * 0.6
        ];
      });
    } else {
      const d = this.activeDice[0];
      d.startQuat = [...d.orientation];
      d.settleStartQuat = null;
      d.targetQuat = this.getFaceTargetQuat(d.model, targetValue);
      const speed = 20;
      d.tumbleVelocity = [
        (Math.random() > 0.5 ? 1 : -1) * speed * (0.7 + Math.random() * 0.3),
        (Math.random() > 0.5 ? 1 : -1) * speed * (0.8 + Math.random() * 0.3),
        (Math.random() - 0.5) * speed * 0.65
      ];
    }

    if (hasNat20) {
      this.spawnSparks('#10b981', 28);
    } else if (hasNat1) {
      this.spawnSparks('#ef4444', 22);
    }
  }

  spawnSparks(color, count = 15) {
    for (let i = 0; i < count; i++) {
      this.sparks.push({
        x: this.logicalWidth / 2 + (Math.random() * 90 - 45),
        y: this.logicalHeight / 2 + (Math.random() * 90 - 45),
        vx: (Math.random() - 0.5) * 6.5,
        vy: (Math.random() - 0.5) * 6.5 - 2.2,
        size: Math.random() * 4 + 2,
        color,
        alpha: 1
      });
    }
  }

  // --- Paleta de Materiais 3D PBR baseada nos Temas ---
  getThemePalette() {
    if (this.critState === 'success') {
      return {
        faceDeep: [8, 65, 42],
        faceBase: [16, 125, 82],
        faceBright: [68, 230, 168],
        bevelBase: [180, 130, 20],
        bevelBright: [255, 225, 110],
        edgeColor: '#fbbf24',
        textColor: '#ffffff',
        glowColor: '#10b981',
        specular: [255, 250, 200]
      };
    }

    if (this.critState === 'fail') {
      return {
        faceDeep: [58, 10, 12],
        faceBase: [125, 22, 24],
        faceBright: [240, 72, 72],
        bevelBase: [90, 15, 18],
        bevelBright: [255, 110, 110],
        edgeColor: '#fca5a5',
        textColor: '#ffffff',
        glowColor: '#ef4444',
        specular: [255, 195, 195]
      };
    }

    const theme = document.body.className.replace('theme-', '') || 'arcane';
    switch (theme) {
      case 'dungeon':
        return {
          faceDeep: [18, 18, 22],
          faceBase: [36, 36, 44],
          faceBright: [82, 76, 92],
          bevelBase: [135, 82, 16],
          bevelBright: [252, 192, 75],
          edgeColor: '#f59e0b',
          textColor: '#fef3c7',
          glowColor: '#d97706',
          specular: [255, 215, 140]
        };
      case 'parchment':
        return {
          faceDeep: [150, 122, 90],
          faceBase: [205, 182, 148],
          faceBright: [248, 238, 218],
          bevelBase: [115, 62, 24],
          bevelBright: [195, 132, 72],
          edgeColor: '#78350f',
          textColor: '#2b1f14',
          glowColor: '#b45309',
          specular: [255, 252, 240]
        };
      case 'cyberpunk':
        return {
          faceDeep: [14, 10, 26],
          faceBase: [30, 18, 52],
          faceBright: [74, 34, 110],
          bevelBase: [165, 28, 72],
          bevelBright: [255, 95, 145],
          edgeColor: '#f43f5e',
          textColor: '#22d3ee',
          glowColor: '#f43f5e',
          specular: [160, 245, 255]
        };
      case 'forest':
        return {
          faceDeep: [5, 32, 20],
          faceBase: [12, 64, 42],
          faceBright: [32, 132, 86],
          bevelBase: [140, 105, 16],
          bevelBright: [245, 208, 76],
          edgeColor: '#eab308',
          textColor: '#fef9c3',
          glowColor: '#10b981',
          specular: [210, 255, 225]
        };
      case 'arcane':
      default:
        return {
          faceDeep: [18, 12, 40],
          faceBase: [42, 26, 84],
          faceBright: [98, 58, 168],
          bevelBase: [95, 42, 155],
          bevelBright: [205, 145, 255],
          edgeColor: '#c084fc',
          textColor: '#38bdf8',
          glowColor: '#9333ea',
          specular: [230, 205, 255]
        };
    }
  }

  // --- Loop de Renderização ---
  startLoop() {
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this.update(now, dt);
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(now, dt) {
    // Atualiza faíscas
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.15;
      s.alpha -= 0.024;
      if (s.alpha <= 0) this.sparks.splice(i, 1);
    }

    if (this.state === 'ROLLING') {
      const progress = (now - this.rollStart) / this.rollDuration;

      if (progress < 0.58) {
        // Fase 1: Arremesso Parabólico 3D e Giro Livre
        const subP = progress / 0.58;
        this.activeDice.forEach(d => {
          const arc = Math.sin(Math.PI * subP);
          d.yOffset = -38 * arc;
          d.jumpScale = 1 + 0.12 * arc;
          const ang = Math.hypot(...d.tumbleVelocity) * dt;
          if (ang > 0.0001) {
            const axis = this.normalize(d.tumbleVelocity);
            const dq = this.quatFromAxisAngle(axis, ang);
            d.orientation = this.quatNormalize(this.quatMultiply(dq, d.orientation));
          }
        });
      } else if (progress < 1.0) {
        // Fase 2: Captura orientação exata de entrada e interpola suavemente via Slerp até a face sorteada
        const u = (progress - 0.58) / 0.42;
        // Ease-out cúbico suave sem saltos
        const ease = 1 - Math.pow(1 - u, 3);
        const bounce = Math.sin(Math.PI * u) * (1 - u);
        this.activeDice.forEach(d => {
          if (!d.settleStartQuat) {
            d.settleStartQuat = [...d.orientation];
          }
          d.yOffset = -12 * bounce;
          d.jumpScale = 1 + 0.04 * bounce;
          d.orientation = this.quatSlerp(d.settleStartQuat, d.targetQuat, ease);
        });
      } else {
        // Finalização da rolagem
        this.state = 'SETTLED';
        this.activeDice.forEach(d => {
          d.orientation = [...d.targetQuat];
          d.baseSettledQuat = [...d.targetQuat];
          d.settleStartQuat = null;
          d.yOffset = 0;
          d.jumpScale = 1.0;
          d.angularVelocity = [0.22, 0.35, 0.08];
        });

        if (this.onRollComplete) {
          const cb = this.onRollComplete;
          this.onRollComplete = null;
          cb();
        }
      }
    } else if (this.state === 'IDLE') {
      // Rotação orbital contínua e suave para inspeção 3D
      this.activeDice.forEach((d, idx) => {
        d.yOffset = Math.sin(now * 0.0022 + idx * 1.5) * 4.5;
        d.jumpScale = 1.0;
        const ang = Math.hypot(...d.angularVelocity) * dt;
        if (ang > 0.0001) {
          const axis = this.normalize(d.angularVelocity);
          const dq = this.quatFromAxisAngle(axis, ang);
          d.orientation = this.quatNormalize(this.quatMultiply(dq, d.orientation));
          d.baseSettledQuat = [...d.orientation];
        }
        // Amortecimento gradual até velocidade orbital de vitrine 3D
        const targetVx = 0.28 * (idx === 0 ? 1 : -1);
        const targetVy = 0.46;
        d.angularVelocity[0] += (targetVx - d.angularVelocity[0]) * 0.03;
        d.angularVelocity[1] += (targetVy - d.angularVelocity[1]) * 0.03;
        d.angularVelocity[2] *= 0.96;
      });
    } else if (this.state === 'SETTLED') {
      // Respiração harmônica 3D ao redor da face sorteada (mantém reflexos especulares e chanfros vivos!)
      this.activeDice.forEach((d, idx) => {
        d.yOffset = Math.sin(now * 0.0024 + idx * 1.5) * 3.5;
        d.jumpScale = 1.0;
        const wobbleX = Math.sin(now * 0.0019 + idx) * 0.065;
        const wobbleY = Math.cos(now * 0.0015 + idx) * 0.085;
        const qWobble = this.quatMultiply(
          this.quatFromAxisAngle([0, 1, 0], wobbleY),
          this.quatFromAxisAngle([1, 0, 0], wobbleX)
        );
        d.orientation = this.quatNormalize(this.quatMultiply(qWobble, d.baseSettledQuat));
      });
    }
  }

  mixColor(c1, c2, t) {
    const k = Math.max(0, Math.min(1, t));
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * k),
      Math.round(c1[1] + (c2[1] - c1[1]) * k),
      Math.round(c1[2] + (c2[2] - c1[2]) * k)
    ];
  }

  rgbStr(c, alpha = 1) {
    if (alpha < 1) return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`;
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  // Renderiza os Pips 3D Côncavos ou Algarismos Entalhados diretamente no plano tangente 3D da face
  renderFaceSurfaceDetails(ctx, model, face, rNormal, lightDir, palette, viewCos) {
    // Suavização de opacidade apenas no horizonte extremo para evitar pop visual
    const detailAlpha = Math.min(1, Math.max(0, (viewCos - 0.03) / 0.14));
    if (detailAlpha <= 0.01) return;

    // 1. Cavidade Interna Rebaixada (3D Recessed Face Well)
    const wellPoly = face.localWellPoly;
    if (wellPoly && wellPoly.length >= 3) {
      ctx.save();
      ctx.globalAlpha = detailAlpha;

      ctx.beginPath();
      ctx.moveTo(wellPoly[0][0], wellPoly[0][1]);
      for (let i = 1; i < wellPoly.length; i++) {
        ctx.lineTo(wellPoly[i][0], wellPoly[i][1]);
      }
      ctx.closePath();

      // Fundo sutilmente mais profundo na cavidade
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fill();

      // Chanfro interno iluminado direcionalmente
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.stroke();

      ctx.lineWidth = 1.6;
      ctx.strokeStyle = palette.edgeColor;
      ctx.globalAlpha = detailAlpha * 0.55;
      ctx.stroke();
      ctx.restore();
    }

    // Determinar cor de destaque (Crítico / Falha / Padrão)
    let inkColor = palette.textColor;
    let isSpecialFace = false;
    if (model.type === 'd20') {
      if (face.value === 20) { inkColor = '#34d399'; isSpecialFace = true; }
      else if (face.value === 1) { inkColor = '#f87171'; isSpecialFace = true; }
    } else if (model.type === 'd6') {
      if (face.value === 6) { isSpecialFace = true; }
    } else if (model.type === 'd100' && face.value === '00') {
      inkColor = '#34d399';
      isSpecialFace = true;
    }

    // 2. Caso Especial: D6 com Pips 3D Côncavos (Bolinhas Entalhadas em 3D)
    if (model.type === 'd6' && this.d6Style === 'pips') {
      const pipLayouts = {
        1: [[0, 0]],
        2: [[-38, -38], [38, 38]],
        3: [[-42, -42], [0, 0], [42, 42]],
        4: [[-38, -38], [38, -38], [-38, 38], [38, 38]],
        5: [[-41, -41], [41, -41], [0, 0], [-41, 41], [41, 41]],
        6: [[-38, -44], [38, -44], [-38, 0], [38, 0], [-38, 44], [38, 44]]
      };
      const pips = pipLayouts[face.value] || pipLayouts[6];
      const baseRadius = face.value === 1 ? 23 : 13.5;

      ctx.save();
      ctx.globalAlpha = detailAlpha;

      // Ornamento especial para o Ás (Face 1) e Face 6 do D6
      if (face.value === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.strokeStyle = palette.edgeColor;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }

      pips.forEach(([px, py]) => {
        // Anel externo do entalhe (borda iluminada)
        ctx.beginPath();
        ctx.arc(px + 1.2, py + 1.5, baseRadius + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fill();

        // Cavidade esférica 3D (sombra côncava interna)
        ctx.beginPath();
        ctx.arc(px, py, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fill();

        // Preenchimento esmaltado / brilhante do pip
        const pipGrad = ctx.createRadialGradient(
          px - baseRadius * 0.28, py - baseRadius * 0.28, baseRadius * 0.1,
          px, py, baseRadius * 0.92
        );
        pipGrad.addColorStop(0, '#ffffff');
        pipGrad.addColorStop(0.35, face.value === 1 ? '#f59e0b' : inkColor);
        pipGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');

        ctx.beginPath();
        ctx.arc(px, py, baseRadius * 0.86, 0, Math.PI * 2);
        ctx.fillStyle = pipGrad;
        ctx.fill();
      });

      ctx.restore();
      return;
    }

    // 3. Algarismos Entalhados em Perspectiva 3D Real (d4, d6 números, d8, d10, d100, d12, d20)
    ctx.save();
    ctx.globalAlpha = detailAlpha;

    // Ornamentos geométricos nas quinas do D6 no modo números
    if (model.type === 'd6') {
      const corners = [[-58, -58], [58, -58], [-58, 58], [58, 58]];
      ctx.fillStyle = palette.edgeColor;
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Números auxiliares nos 3 vértices do D4 (como nos dados piramidais físicos de RPG!)
    if (model.type === 'd4' && face.d4CornerPositions) {
      ctx.font = "700 22px 'Cinzel', 'Segoe UI', serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.edgeColor;
      face.d4CornerPositions.forEach(([vx, vy]) => {
        ctx.fillText(String(face.value), vx, vy);
      });
    }

    let fontScale = 78;
    if (model.type === 'd6') fontScale = 86;
    else if (model.type === 'd4') fontScale = 68;
    else if (model.type === 'd8') fontScale = 76;
    else if (model.type === 'd10') fontScale = 74;
    else if (model.type === 'd100') fontScale = 64;
    else if (model.type === 'd12') fontScale = 72;
    else if (model.type === 'd20') fontScale = 72;

    let displayVal = String(face.value);
    if (model.type === 'd10' && this.isDualD100 && face.value === 10) {
      displayVal = '0';
    }

    ctx.font = `800 ${fontScale}px 'Cinzel', 'Segoe UI', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Sombra de baixo-relevo (Engraved Emboss Depth)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillText(displayVal, -2.5, -2.5);

    // Brilho de borda inferior do entalhe
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillText(displayVal, 2.0, 2.2);

    // Tinta principal metálica/luminosa
    ctx.fillStyle = inkColor;
    if (isSpecialFace) {
      ctx.shadowColor = inkColor;
      ctx.shadowBlur = 8;
    }
    ctx.fillText(displayVal, 0, 0);

    // Ponto/traço indicador de orientação para 6, 9, 60 e 90
    if (displayVal === '6' || displayVal === '9' || displayVal === '60' || displayVal === '90') {
      ctx.beginPath();
      ctx.arc(0, fontScale * 0.50, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = inkColor;
      ctx.fill();
    }

    ctx.restore();
  }

  render() {
    if (!this.ctx || !this.activeDice || this.activeDice.length === 0) return;
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    const ctx = this.ctx;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const palette = this.getThemePalette();
    // Distância da câmera e FOV calibrados para perspectiva 3D autêntica
    const fov = 340;
    const camDist = 3.45;

    // Iluminação Studio de 3 Pontos (Key Light + Fill Light + Rim Light)
    const keyLight = this.normalize([0.42, 0.66, 0.62]);
    const fillLight = this.normalize([-0.62, -0.28, 0.73]);
    const halfVec = this.normalize([keyLight[0], keyLight[1], keyLight[2] + 1.0]);

    // 1. Pedestal Arcano e Sombras Dinâmicas no Chão para cada dado
    this.activeDice.forEach(die => {
      ctx.save();
      const shadowX = w / 2 + die.xOffset;
      const shadowY = h / 2 + 94;
      const shadowScale = Math.max(0.38, 1 / (1 + Math.max(0, -die.yOffset) * 0.022)) * die.scale;
      ctx.translate(shadowX, shadowY);
      ctx.scale(shadowScale, shadowScale * 0.30);

      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 82);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
      grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 2. Renderização 3D Real de cada dado (Malha Chanfrada Convexa)
    this.activeDice.forEach(die => {
      const model = die.model;
      const mat = this.quatToMatrix(die.orientation);
      const effScale = die.scale * (die.jumpScale || 1.0);
      const centerX = w / 2 + die.xOffset;
      const centerY = h / 2 + die.yOffset - 4;

      // Rotaciona e projeta todos os vértices com PERSPECTIVA CORRETA (depth = camDist - rz)
      // Vértices mais próximos da câmera (rz > 0) têm menor depth e ficam MAIORES na tela!
      const rotatedVerts = new Array(model.vertices.length);
      const projected = new Array(model.vertices.length);

      for (let i = 0; i < model.vertices.length; i++) {
        const v = model.vertices[i];
        const rx = (mat[0][0] * v[0] + mat[0][1] * v[1] + mat[0][2] * v[2]) * effScale;
        const ry = (mat[1][0] * v[0] + mat[1][1] * v[1] + mat[1][2] * v[2]) * effScale;
        const rz = (mat[2][0] * v[0] + mat[2][1] * v[1] + mat[2][2] * v[2]) * effScale;

        rotatedVerts[i] = [rx, ry, rz];
        const depth = Math.max(0.5, camDist - rz);
        const factor = fov / depth;

        projected[i] = {
          x: centerX + rx * factor,
          y: centerY - ry * factor,
          z: rz,
          depth,
          factor
        };
      }

      const visibleFaces = [];

      // Culling de Backface Exato em Perspectiva: dot(rNormal, CamPos - rFaceCenter) > 0
      // Como o poliedro chanfrado é estritamente convexo, apenas as faces visíveis passam
      // e NUNCA ocorrem sobreposições invertidas ou flickering!
      for (let fi = 0; fi < model.faces.length; fi++) {
        const face = model.faces[fi];
        const norm = face.normal;
        const rnx = mat[0][0] * norm[0] + mat[0][1] * norm[1] + mat[0][2] * norm[2];
        const rny = mat[1][0] * norm[0] + mat[1][1] * norm[1] + mat[1][2] * norm[2];
        const rnz = mat[2][0] * norm[0] + mat[2][1] * norm[1] + mat[2][2] * norm[2];

        const fc = face.center;
        const rcx = (mat[0][0] * fc[0] + mat[0][1] * fc[1] + mat[0][2] * fc[2]) * effScale;
        const rcy = (mat[1][0] * fc[0] + mat[1][1] * fc[1] + mat[1][2] * fc[2]) * effScale;
        const rcz = (mat[2][0] * fc[0] + mat[2][1] * fc[1] + mat[2][2] * fc[2]) * effScale;

        // Vetor da face até a câmera em (0, 0, camDist)
        const vx = -rcx;
        const vy = -rcy;
        const vz = camDist - rcz;
        const vLen = Math.hypot(vx, vy, vz) || 1;
        const viewCos = (rnx * vx + rny * vy + rnz * vz) / vLen;

        // Culling exato no horizonte da perspectiva
        if (viewCos <= 0.0005) continue;

        const dotKey = Math.max(0, rnx * keyLight[0] + rny * keyLight[1] + rnz * keyLight[2]);
        const dotFill = Math.max(0, rnx * fillLight[0] + rny * fillLight[1] + rnz * fillLight[2]);
        const specDot = Math.max(0, rnx * halfVec[0] + rny * halfVec[1] + rnz * halfVec[2]);
        const shininess = face.kind === 'main' ? 18 : 30;
        const spec = Math.pow(specDot, shininess);
        const rim = Math.pow(1 - Math.min(1, viewCos), 2.4);

        visibleFaces.push({
          face,
          rNormal: [rnx, rny, rnz],
          rCenter: [rcx, rcy, rcz],
          viewCos,
          dotKey,
          dotFill,
          spec,
          rim
        });
      }

      // Ordena de trás para frente por garantia (Painter's Algorithm sobre malha convexa)
      visibleFaces.sort((a, b) => a.rCenter[2] - b.rCenter[2]);

      // Desenha cada faceta visível (faces principais, chanfros de aresta e facetas de canto)
      visibleFaces.forEach(item => {
        const { face, rNormal, viewCos, dotKey, dotFill, spec, rim } = item;
        const indices = face.indices;

        ctx.beginPath();
        const p0 = projected[indices[0]];
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < indices.length; i++) {
          const p = projected[indices[i]];
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        if (face.kind === 'main') {
          // Sombreamento PBR Rico para Face Principal com Gradiente Direcional 3D
          const lightMix = Math.min(1, 0.18 + dotKey * 0.74 + dotFill * 0.22);
          let baseCol = this.mixColor(palette.faceDeep, palette.faceBright, lightMix);
          baseCol = this.mixColor(baseCol, palette.specular, spec * 0.42 + rim * 0.18);

          const pFirst = projected[indices[0]];
          const pOpp = projected[indices[Math.floor(indices.length / 2)]];
          const grad = ctx.createLinearGradient(pFirst.x, pFirst.y, pOpp.x, pOpp.y);
          const colHi = this.mixColor(baseCol, palette.specular, 0.16 + spec * 0.35);
          const colLo = this.mixColor(baseCol, palette.faceDeep, 0.22);
          grad.addColorStop(0, this.rgbStr(colHi));
          grad.addColorStop(1, this.rgbStr(colLo));

          ctx.fillStyle = grad;
          ctx.fill();

          // Costura sutil da borda do chanfro
          ctx.strokeStyle = this.rgbStr(this.mixColor(palette.bevelBase, palette.bevelBright, dotKey), 0.75);
          ctx.lineWidth = 0.9 * effScale;
          ctx.stroke();

          // Projeção 3D Exata (Matriz Jacobiana Tangente) para Números, Pips e Rebaixo Interno
          const vc = face.visualCenter;
          const rvcx = (mat[0][0] * vc[0] + mat[0][1] * vc[1] + mat[0][2] * vc[2]) * effScale;
          const rvcy = (mat[1][0] * vc[0] + mat[1][1] * vc[1] + mat[1][2] * vc[2]) * effScale;
          const rvcz = (mat[2][0] * vc[0] + mat[2][1] * vc[1] + mat[2][2] * vc[2]) * effScale;

          const T = face.T, B = face.B;
          const rtx = mat[0][0] * T[0] + mat[0][1] * T[1] + mat[0][2] * T[2];
          const rty = mat[1][0] * T[0] + mat[1][1] * T[1] + mat[1][2] * T[2];
          const rtz = mat[2][0] * T[0] + mat[2][1] * T[1] + mat[2][2] * T[2];

          const rbx = mat[0][0] * B[0] + mat[0][1] * B[1] + mat[0][2] * B[2];
          const rby = mat[1][0] * B[0] + mat[1][1] * B[1] + mat[1][2] * B[2];
          const rbz = mat[2][0] * B[0] + mat[2][1] * B[1] + mat[2][2] * B[2];

          const D = Math.max(0.5, camDist - rvcz);
          const k = fov / D;
          const screenCx = centerX + rvcx * k;
          const screenCy = centerY - rvcy * k;
          const uScale = k * ((face.inradius * effScale) / 100);

          const m11 = uScale * (rtx + (rvcx / D) * rtz);
          const m12 = -uScale * (rty + (rvcy / D) * rtz);
          const m21 = uScale * (-rbx - (rvcx / D) * rbz);
          const m22 = -uScale * (-rby - (rvcy / D) * rbz);

          ctx.save();
          ctx.transform(m11, m12, m21, m22, screenCx, screenCy);
          this.renderFaceSurfaceDetails(ctx, model, face, rNormal, keyLight, palette, viewCos);
          ctx.restore();
        } else {
          // Chanfros de Aresta (Edge Bevels) e Facetas de Vértice (Corner Bevels)
          // Acabamento metálico/cristalino de alto brilho que define a silhueta 3D do dado
          const bevelLight = Math.min(1, 0.22 + dotKey * 0.78 + dotFill * 0.25);
          let bevelCol = this.mixColor(palette.bevelBase, palette.bevelBright, bevelLight);
          bevelCol = this.mixColor(bevelCol, palette.specular, spec * 0.68 + rim * 0.25);

          ctx.fillStyle = this.rgbStr(bevelCol);
          ctx.fill();

          ctx.strokeStyle = this.rgbStr(this.mixColor(bevelCol, palette.specular, 0.35), 0.65);
          ctx.lineWidth = 0.65 * effScale;
          ctx.stroke();
        }
      });

      // Rótulos explicativos sob os dados do d100
      if (this.isDualD100 && die.label) {
        ctx.save();
        ctx.font = '700 11px Inter, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(die.label, w / 2 + die.xOffset, h - 10);
        ctx.restore();
      }
    });

    // 3. Faíscas de Crítico
    this.sparks.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();
  }
}

// 4. BANCO DE DADOS & DADOS PADRÃO (STORAGE)
// ==========================================
const DEFAULT_MACROS = [
  {
    id: 'macro-1',
    name: 'Ataque com Arma',
    formula: '1d20 + 5',
    category: 'Ataque',
    icon: '⚔️',
    desc: 'Rolagem padrão de ataque (d20 + bônus de acerto).'
  },
  {
    id: 'macro-2',
    name: 'Ataque com Vantagem',
    formula: '2d20kh1 + 5',
    category: 'Ataque',
    icon: '🎯',
    desc: 'Rola 2d20 e escolhe o maior resultado + bônus.'
  },
  {
    id: 'macro-3',
    name: 'Dano Espada Longa',
    formula: '1d8 + 3',
    category: 'Dano',
    icon: '🗡️',
    desc: 'Dano cortante com bônus de força.'
  },
  {
    id: 'macro-4',
    name: 'Magia: Bola de Fogo',
    formula: '8d6',
    category: 'Magia',
    icon: '🔥',
    desc: '8d6 de puro dano flamejante em área!'
  },
  {
    id: 'macro-5',
    name: 'Rolar Atributo (4d6 drop 1)',
    formula: '4d6dl1',
    category: 'Criação de Ficha',
    icon: '🎲',
    desc: 'Rola 4d6 e descarta o menor dado (sistema D&D / Tormenta 20).'
  },
  {
    id: 'macro-6',
    name: 'Call of Cthulhu: Sanidade',
    formula: '1d100',
    category: 'Perícia',
    icon: '🐙',
    desc: 'Teste percentual de Sanidade / Perícia (1d100).'
  },
  {
    id: 'macro-7',
    name: 'Ordem Paranormal: 3 Dados',
    formula: '3d20kh1',
    category: 'Perícia',
    icon: '👁️',
    desc: 'Rola 3 dados de 20 e fica com o maior.'
  },
  {
    id: 'macro-8',
    name: 'Vampiro: Parada de 6 Dados',
    formula: '6d10>=6',
    category: 'Storyteller',
    icon: '🩸',
    desc: 'Conta sucessos em 6 dados de 10 faces (dificuldade 6).'
  },
  {
    id: 'macro-9',
    name: 'FATE Core: Teste Padrão',
    formula: '4dF + 2',
    category: 'FATE',
    icon: '✨',
    desc: '4 dados FATE (-1, 0, +1) + perícia regular.'
  }
];

const DEFAULT_TABLES = [
  {
    id: 'table-1',
    name: 'Tabela de Críticos Épicos',
    formula: '1d6',
    desc: 'Efeitos espetaculares para ataques decisivos.',
    entries: [
      { range: '1', text: 'Golpe Desestabilizador: O inimigo é derrubado no chão e fica caído!' },
      { range: '2', text: 'Desarme Perfeito: A arma ou escudo do alvo é arremessada a 3 metros!' },
      { range: '3', text: 'Ferimento Doloroso: O alvo tem desvantagem em todas as ações na próxima rodada.' },
      { range: '4', text: 'Golpe Preciso: Ignora qualquer armadura ou resistência física neste golpe!' },
      { range: '5', text: 'Frenesi Heróico: Cause dano máximo E ganhe um ataque extra imediato!' },
      { range: '6', text: 'Lenda Viva: Dano multiplicado por 3 e todos os aliados recebem +2 em testes por 1 minuto!' }
    ]
  },
  {
    id: 'table-2',
    name: 'Encontro Aleatório na Masmorra',
    formula: '1d8',
    desc: 'O que aguarda o grupo ao virar o próximo corredor?',
    entries: [
      { range: '1', text: 'Silêncio Fantasmagórico: Corredor vazio com tochas recém-apagadas.' },
      { range: '2', text: 'Armadilha Antiga: Placa de pressão no chão dispara dardos envenenados.' },
      { range: '3', text: 'Patrulha Goblinóide: 1d4+1 sentinelas com bestas e cães farejadores.' },
      { range: '4', text: 'Mercador Viajante Misterioso: Vende poções suspeitas e mapas incompletos.' },
      { range: '5', text: 'Santuário Abandonado: Uma fonte límpida que restaura 1d8 pontos de vida.' },
      { range: '6', text: 'Enxame Carniceiro: Ratos gigantes ou besouros carniceiros famintos.' },
      { range: '7', text: 'Inscrições Rúnicas na Parede: Um enigma que destranca uma câmara secreta.' },
      { range: '8', text: 'Criatura Errante Perigosa: Um Troll ou Aparição faminta ronda a área!' }
    ]
  },
  {
    id: 'table-3',
    name: 'Saque Rápido / Loot de Monstro',
    formula: '1d6',
    desc: 'O que o inimigo carregava nos bolsos?',
    entries: [
      { range: '1', text: 'Apenas fiapos, ossinhos roídos e uma moeda de cobre amassada.' },
      { range: '2', text: 'Uma bolsa de couro com 2d6 moedas de prata e dados de marfim.' },
      { range: '3', text: 'Frasco com óleo inflamável e uma gazua de boa qualidade.' },
      { range: '4', text: 'Um anel de prata trabalhado com um brasão nobre (vale 25 PO).' },
      { range: '5', text: 'Um frasco de Poção de Cura Menor (cura 2d4+2 PV).' },
      { range: '6', text: 'Um pergaminho antigo contendo um mapa de tesouro ou feitiço!' }
    ]
  }
];

class StorageManager {
  static get(key, defaultValue) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.warn('Erro ao carregar dados do localStorage:', e);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Erro ao salvar dados no localStorage:', e);
    }
  }

  static getMacros() {
    return this.get('roladas_macros', DEFAULT_MACROS);
  }

  static saveMacros(macros) {
    this.set('roladas_macros', macros);
  }

  static getTables() {
    return this.get('roladas_tables', DEFAULT_TABLES);
  }

  static saveTables(tables) {
    this.set('roladas_tables', tables);
  }

  static getHistory() {
    return this.get('roladas_history', []);
  }

  static saveHistory(history) {
    this.set('roladas_history', history);
  }

  static getSettings() {
    return this.get('roladas_settings', {
      theme: 'arcane',
      sound: true,
      volume: 0.5,
      animations: true
    });
  }

  static saveSettings(settings) {
    this.set('roladas_settings', settings);
  }
}

// ==========================================
// 5. CONTROLADOR PRINCIPAL DA APLICAÇÃO
// ==========================================
class AppController {
  constructor() {
    this.confetti = new ConfettiEffect('confetti-canvas');
    this.dice3D = new Dice3DEngine('dice-3d-canvas');
    this.pool = { 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 };
    this.mod = 0;
    this.advantageMode = 'none'; // 'none' | 'adv' | 'disadv'
    this.history = StorageManager.getHistory();
    this.macros = StorageManager.getMacros();
    this.tables = StorageManager.getTables();
    this.settings = StorageManager.getSettings();

    this.currentCategoryFilter = 'all';
    this.editingMacroId = null;
    this.editingTableId = null;

    this.init();
  }

  init() {
    this.applySettings();
    this.bindEvents();
    this.renderDiceButtons();
    this.renderHistory();
    this.renderMacros();
    this.renderTables();
    this.updateStatsSummary();

    // Clique direto no modelo 3D dispara rolagem
    if (this.dice3D) {
      this.dice3D.onDieClick = () => this.executeFormulaRoll();
    }
  }

  applySettings() {
    document.body.className = `theme-${this.settings.theme}`;
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = this.settings.theme;

    const soundToggle = document.getElementById('sound-toggle-btn');
    if (soundToggle) {
      soundToggle.innerHTML = this.settings.sound ? '🔊 Som Ativo' : '🔇 Mudo';
      soundEngine.enabled = this.settings.sound;
    }
    soundEngine.volume = this.settings.volume;

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) volumeSlider.value = this.settings.volume;

    const soundCheck = document.getElementById('setting-sound-enabled');
    if (soundCheck) soundCheck.checked = this.settings.sound;
  }

  bindEvents() {
    // Navigation tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetTab = btn.dataset.tab;
        const targetPane = document.getElementById(`tab-${targetTab}`);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Theme selector
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.settings.theme = e.target.value;
        StorageManager.saveSettings(this.settings);
        this.applySettings();
      });
    }

    // Sound toggle in header
    const soundToggle = document.getElementById('sound-toggle-btn');
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        this.settings.sound = !this.settings.sound;
        StorageManager.saveSettings(this.settings);
        this.applySettings();
      });
    }

    // Quick Pool Dice Click
    document.querySelectorAll('.die-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sides = parseInt(btn.dataset.sides, 10);
        this.addDieToPool(sides);
      });
      // Right click to decrement
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const sides = parseInt(btn.dataset.sides, 10);
        this.removeDieFromPool(sides);
      });
    });

    // Modifier buttons
    document.getElementById('mod-minus-btn')?.addEventListener('click', () => {
      this.mod--;
      this.updateFormulaFromPool();
    });
    document.getElementById('mod-plus-btn')?.addEventListener('click', () => {
      this.mod++;
      this.updateFormulaFromPool();
    });
    document.getElementById('mod-input')?.addEventListener('input', (e) => {
      this.mod = parseInt(e.target.value, 10) || 0;
      this.updateFormulaFromPool();
    });

    // Clear pool
    document.getElementById('clear-pool-btn')?.addEventListener('click', () => {
      this.clearPool();
    });

    // Advantage / Disadvantage toggles
    document.querySelectorAll('.adv-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mode = chip.dataset.mode;
        if (this.advantageMode === mode) {
          this.advantageMode = 'none';
        } else {
          this.advantageMode = mode;
        }
        document.querySelectorAll('.adv-chip').forEach(c => c.classList.remove('active'));
        if (this.advantageMode !== 'none') {
          chip.classList.add('active');
        }
        this.updateFormulaFromPool();
      });
    });

    // Primary Roll button
    document.getElementById('main-roll-btn')?.addEventListener('click', () => {
      this.executeFormulaRoll();
    });

    // Formula input Enter key
    document.getElementById('formula-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.executeFormulaRoll();
      }
    });

    // Clear history button
    document.getElementById('clear-history-btn')?.addEventListener('click', () => {
      if (confirm('Deseja limpar todo o histórico de rolagens?')) {
        this.history = [];
        StorageManager.saveHistory(this.history);
        this.renderHistory();
        this.updateStatsSummary();
      }
    });

    // Copy history button
    document.getElementById('copy-history-btn')?.addEventListener('click', () => {
      this.copyHistoryToClipboard();
    });

    // New Macro Modal
    document.getElementById('open-new-macro-btn')?.addEventListener('click', () => {
      this.openMacroModal();
    });
    document.getElementById('close-macro-modal-btn')?.addEventListener('click', () => {
      this.closeMacroModal();
    });
    document.getElementById('cancel-macro-modal-btn')?.addEventListener('click', () => {
      this.closeMacroModal();
    });
    document.getElementById('macro-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveMacroFromForm();
    });

    // Macro search & filter
    document.getElementById('macro-search-input')?.addEventListener('input', (e) => {
      this.renderMacros(e.target.value);
    });

    // New Table Modal
    document.getElementById('open-new-table-btn')?.addEventListener('click', () => {
      this.openTableModal();
    });
    document.getElementById('close-table-modal-btn')?.addEventListener('click', () => {
      this.closeTableModal();
    });
    document.getElementById('cancel-table-modal-btn')?.addEventListener('click', () => {
      this.closeTableModal();
    });
    document.getElementById('table-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveTableFromForm();
    });

    // Backup & Restore
    document.getElementById('export-backup-btn')?.addEventListener('click', () => {
      this.exportBackup();
    });
    document.getElementById('import-backup-input')?.addEventListener('change', (e) => {
      this.importBackup(e);
    });
    document.getElementById('reset-defaults-btn')?.addEventListener('click', () => {
      if (confirm('Atenção: Isso redefinirá todos os macros, tabelas e histórico para o padrão de fábrica. Continuar?')) {
        localStorage.clear();
        location.reload();
      }
    });

    // Settings page controls
    document.getElementById('volume-slider')?.addEventListener('input', (e) => {
      this.settings.volume = parseFloat(e.target.value);
      soundEngine.volume = this.settings.volume;
      StorageManager.saveSettings(this.settings);
    });
    document.getElementById('setting-sound-enabled')?.addEventListener('change', (e) => {
      this.settings.sound = e.target.checked;
      StorageManager.saveSettings(this.settings);
      this.applySettings();
    });
  }

  // Pool Management
  addDieToPool(sides) {
    if (!this.pool[sides]) this.pool[sides] = 0;
    this.pool[sides]++;
    this.updateFormulaFromPool();
    if (this.dice3D) {
      this.dice3D.setDieType(sides);
      this.dice3D.nudgeSpin();
    }
  }

  removeDieFromPool(sides) {
    if (this.pool[sides] && this.pool[sides] > 0) {
      this.pool[sides]--;
      this.updateFormulaFromPool();
      if (this.dice3D) {
        this.dice3D.setDieType(sides);
        this.dice3D.nudgeSpin();
      }
    }
  }

  clearPool() {
    Object.keys(this.pool).forEach(k => (this.pool[k] = 0));
    this.mod = 0;
    this.advantageMode = 'none';
    document.querySelectorAll('.adv-chip').forEach(c => c.classList.remove('active'));
    this.updateFormulaFromPool();
  }

  updateFormulaFromPool() {
    this.renderDiceButtons();
    const modInput = document.getElementById('mod-input');
    if (modInput) modInput.value = this.mod;

    const parts = [];
    const sidesList = [20, 4, 6, 8, 10, 12, 100];
    sidesList.forEach(s => {
      const count = this.pool[s] || 0;
      if (count > 0) {
        if (s === 20 && this.advantageMode === 'adv') {
          parts.push(`${count + 1}d20kh1`);
        } else if (s === 20 && this.advantageMode === 'disadv') {
          parts.push(`${count + 1}d20kl1`);
        } else {
          parts.push(`${count}d${s}`);
        }
      }
    });

    // Se nenhum dado foi clicado mas há modo de vantagem, sugere 2d20
    if (parts.length === 0 && this.advantageMode === 'adv') {
      parts.push('2d20kh1');
    } else if (parts.length === 0 && this.advantageMode === 'disadv') {
      parts.push('2d20kl1');
    }

    let formula = parts.join(' + ');

    if (this.mod !== 0) {
      if (formula.length > 0) {
        formula += this.mod > 0 ? ` + ${this.mod}` : ` - ${Math.abs(this.mod)}`;
      } else {
        formula = `${this.mod}`;
      }
    }

    const input = document.getElementById('formula-input');
    if (input && formula.length > 0) {
      input.value = formula;
    }
  }

  renderDiceButtons() {
    document.querySelectorAll('.die-btn').forEach(btn => {
      const sides = parseInt(btn.dataset.sides, 10);
      const count = this.pool[sides] || 0;
      const badge = btn.querySelector('.die-count-badge');
      if (badge) {
        badge.innerText = count;
      }
      if (count > 0) {
        btn.classList.add('has-dice');
      } else {
        btn.classList.remove('has-dice');
      }
    });
  }

  // Execution
  executeFormulaRoll(customFormula = null, rollLabel = '') {
    const input = document.getElementById('formula-input');
    const formula = customFormula || (input ? input.value : '1d20');

    if (!formula.trim()) {
      alert('Digite uma fórmula de rolagem válida (ex: 1d20+5, 4d6dl1)!');
      return;
    }

    try {
      soundEngine.playDiceRoll();
      const result = DiceEngine.evaluate(formula, rollLabel);

      // Determina qual face e tipo de dado 3D destacar
      let primarySides = 20;
      let targetVal = 20;

      if (result.diceGroups && result.diceGroups.length > 0) {
        const firstGroup = result.diceGroups[0];
        const parsedSides = parseInt(firstGroup.sides, 10);
        if (!isNaN(parsedSides)) primarySides = parsedSides;

        // Pega o primeiro dado não descartado ou primeiro da lista
        const activeDice = firstGroup.dice.filter(d => !d.dropped);
        if (activeDice.length > 0) {
          targetVal = activeDice[0].val;
        } else if (firstGroup.dice.length > 0) {
          targetVal = firstGroup.dice[0].val;
        }
      }

      // Mostra indicador animado de rolagem enquanto o dado 3D gira
      this.displayRollingState(result);

      // Dispara a animação 3D de rolagem e salto
      if (this.dice3D) {
        this.dice3D.roll(primarySides, targetVal, result.hasNat20, result.hasNat1, () => {
          this.displayArenaResult(result);
          this.addHistoryRecord(result);

          // Efeitos de Crítico
          if (result.hasNat20) {
            soundEngine.playCritSuccess();
            this.confetti.spawn();
          } else if (result.hasNat1) {
            soundEngine.playCritFail();
          }
        });
      } else {
        this.displayArenaResult(result);
        this.addHistoryRecord(result);

        if (result.hasNat20) {
          soundEngine.playCritSuccess();
          this.confetti.spawn();
        } else if (result.hasNat1) {
          soundEngine.playCritFail();
        }
      }
    } catch (err) {
      alert(`Erro na fórmula: ${err.message}`);
    }
  }

  displayRollingState(result) {
    const arena = document.getElementById('dice-arena');
    arena?.classList.remove('crit-glow-success', 'crit-glow-fail');

    const resultContainer = document.getElementById('dice-result-container');
    if (!resultContainer) return;

    const label = result.label ? `[${result.label}] ` : '';
    resultContainer.innerHTML = `
      <div class="rolling-indicator">
        <span>🎲</span> Rolando ${label}${result.rawFormula}...
      </div>
    `;
  }

  displayArenaResult(result) {
    const arena = document.getElementById('dice-arena');
    const resultContainer = document.getElementById('dice-result-container') || arena;
    if (!resultContainer) return;

    arena?.classList.remove('crit-glow-success', 'crit-glow-fail');
    if (result.hasNat20) arena?.classList.add('crit-glow-success');
    if (result.hasNat1) arena?.classList.add('crit-glow-fail');

    let totalClass = 'result-total-number';
    let bannerHtml = '';

    if (result.hasNat20) {
      totalClass += ' crit-nat20';
      bannerHtml = '<div class="result-banner success">✨ SUCESSO CRÍTICO / NAT 20! ✨</div>';
    } else if (result.hasNat1) {
      totalClass += ' crit-nat1';
      bannerHtml = '<div class="result-banner fail">💀 FALHA CRÍTICA / NAT 1! 💀</div>';
    }

    // Gerar fichas visuais para os dados rolados
    let diceTokensHtml = '';
    result.diceGroups.forEach(group => {
      group.dice.forEach(die => {
        let tokenClass = 'die-token rolling';
        if (die.dropped) tokenClass += ' dropped';
        else if (die.isMax && group.sides !== 'F') tokenClass += ' crit-max';
        else if (die.isMin && group.sides !== 'F') tokenClass += ' crit-min';

        if (die.success === true) tokenClass += ' crit-max';
        if (die.success === false) tokenClass += ' dropped';

        diceTokensHtml += `
          <div class="${tokenClass}" title="Face: ${die.val} em d${die.sides}">
            <span>${die.text}</span>
            <span class="die-type-tag">d${die.sides}</span>
          </div>
        `;
      });
    });

    const labelHtml = result.label ? `<div style="font-size:1.1rem;font-weight:bold;color:var(--primary-hover);margin-bottom:-5px;">${result.label}</div>` : '';

    resultContainer.innerHTML = `
      <div class="active-result-box">
        ${labelHtml}
        <div class="result-total-display">
          <div class="${totalClass}">${result.total}</div>
          ${bannerHtml}
        </div>
        <div class="dice-breakdown-row">
          ${diceTokensHtml}
        </div>
        <div class="result-formula-caption">
          ${result.rawFormula}
        </div>
      </div>
    `;
  }

  addHistoryRecord(result) {
    this.history.unshift(result);
    if (this.history.length > 50) this.history.pop();
    StorageManager.saveHistory(this.history);
    this.renderHistory();
    this.updateStatsSummary();
  }

  rerollHistory(idx) {
    const item = this.history[idx];
    if (item) {
      this.executeFormulaRoll(item.rawFormula, item.label || '');
    }
  }

  renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    if (this.history.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem 1rem;">Nenhuma rolagem realizada ainda.</div>';
      return;
    }

    list.innerHTML = this.history.map((item, idx) => {
      const isSuccess = item.hasNat20 ? 'success' : (item.hasNat1 ? 'fail' : '');
      const diceBreakdown = item.diceGroups.map(g => {
        const values = g.dice.map(d => d.dropped ? `<s>${d.val}</s>` : d.val).join(', ');
        return `[${values}]`;
      }).join(' + ');

      return `
        <div class="history-item" onclick="window.app.rerollHistory(${idx})" title="Clique para rolar novamente">
          <div class="history-item-left">
            ${item.label ? `<span class="history-label">${item.label}</span>` : ''}
            <span class="history-formula">${item.rawFormula}</span>
            <span class="history-breakdown">${diceBreakdown} às ${item.timestamp}</span>
          </div>
          <div class="history-total ${isSuccess}">${item.total}</div>
        </div>
      `;
    }).join('');
  }

  updateStatsSummary() {
    const totalRollsEl = document.getElementById('stat-total-rolls');
    const avgRollEl = document.getElementById('stat-avg-roll');
    const highestRollEl = document.getElementById('stat-highest-roll');
    const critsCountEl = document.getElementById('stat-crits-count');

    if (!totalRollsEl) return;

    if (this.history.length === 0) {
      totalRollsEl.innerText = '0';
      avgRollEl.innerText = '0';
      highestRollEl.innerText = '0';
      critsCountEl.innerText = '0';
      return;
    }

    const total = this.history.length;
    const sum = this.history.reduce((acc, h) => acc + (typeof h.total === 'number' ? h.total : 0), 0);
    const avg = (sum / total).toFixed(1);
    const max = Math.max(...this.history.map(h => typeof h.total === 'number' ? h.total : 0));
    const crits = this.history.filter(h => h.hasNat20).length;

    totalRollsEl.innerText = total;
    avgRollEl.innerText = avg;
    highestRollEl.innerText = max;
    critsCountEl.innerText = crits;
  }

  copyHistoryToClipboard() {
    if (this.history.length === 0) {
      alert('Histórico vazio!');
      return;
    }
    const text = this.history.map(h => {
      const label = h.label ? `[${h.label}] ` : '';
      return `${h.timestamp} - ${label}${h.rawFormula} = ${h.total}`;
    }).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      alert('Histórico copiado para a área de transferência!');
    }).catch(() => {
      prompt('Copie o histórico abaixo:', text);
    });
  }

  // ==========================================
  // MACROS / PRESETS
  // ==========================================
  renderMacros(filterSearch = '') {
    const container = document.getElementById('macros-grid');
    if (!container) return;

    const categories = ['all', ...new Set(this.macros.map(m => m.category || 'Geral'))];
    this.renderCategoryChips(categories);

    let filtered = this.macros;
    if (this.currentCategoryFilter !== 'all') {
      filtered = filtered.filter(m => (m.category || 'Geral') === this.currentCategoryFilter);
    }
    if (filterSearch.trim()) {
      const search = filterSearch.toLowerCase();
      filtered = filtered.filter(m => m.name.toLowerCase().includes(search) || m.formula.toLowerCase().includes(search) || (m.desc && m.desc.toLowerCase().includes(search)));
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem;">Nenhum botão de rolagem encontrado com esses filtros.</div>';
      return;
    }

    container.innerHTML = filtered.map(macro => `
      <div class="macro-card">
        <div class="macro-card-header">
          <div class="macro-title-group">
            <span class="macro-icon">${macro.icon || '🎲'}</span>
            <span class="macro-name">${macro.name}</span>
          </div>
          <span class="macro-category-badge">${macro.category || 'Geral'}</span>
        </div>
        <div class="macro-formula-text">${macro.formula}</div>
        ${macro.desc ? `<div class="macro-desc">${macro.desc}</div>` : ''}
        <div class="macro-card-footer">
          <button class="macro-btn-roll" onclick="window.app.rollMacro('${macro.id}')">
            <span>🎲</span> Rolar
          </button>
          <div class="macro-actions">
            <button class="macro-action-btn" title="Editar" onclick="window.app.editMacro('${macro.id}')">✏️</button>
            <button class="macro-action-btn delete" title="Excluir" onclick="window.app.deleteMacro('${macro.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderCategoryChips(categories) {
    const container = document.getElementById('category-filter-chips');
    if (!container) return;

    container.innerHTML = categories.map(cat => `
      <button class="category-chip ${this.currentCategoryFilter === cat ? 'active' : ''}" onclick="window.app.filterByCategory('${cat}')">
        ${cat === 'all' ? 'Todos' : cat}
      </button>
    `).join('');
  }

  filterByCategory(cat) {
    this.currentCategoryFilter = cat;
    const searchVal = document.getElementById('macro-search-input')?.value || '';
    this.renderMacros(searchVal);
  }

  rollMacro(id) {
    const macro = this.macros.find(m => m.id === id);
    if (!macro) return;
    this.executeFormulaRoll(macro.formula, macro.name);

    // switch to roll tray tab smoothly
    const trayTabBtn = document.querySelector('[data-tab="tray"]');
    if (trayTabBtn) trayTabBtn.click();
  }

  openMacroModal(macro = null) {
    this.editingMacroId = macro ? macro.id : null;
    const modal = document.getElementById('macro-modal');
    const title = document.getElementById('macro-modal-title');
    if (title) title.innerText = macro ? 'Editar Rolagem Customizada' : 'Criar Nova Rolagem Customizada';

    document.getElementById('macro-name-input').value = macro ? macro.name : '';
    document.getElementById('macro-formula-input').value = macro ? macro.formula : '';
    document.getElementById('macro-category-input').value = macro ? (macro.category || 'Geral') : 'Geral';
    document.getElementById('macro-icon-input').value = macro ? (macro.icon || '⚔️') : '⚔️';
    document.getElementById('macro-desc-input').value = macro ? (macro.desc || '') : '';

    modal?.classList.add('open');
  }

  closeMacroModal() {
    document.getElementById('macro-modal')?.classList.remove('open');
    this.editingMacroId = null;
  }

  saveMacroFromForm() {
    const name = document.getElementById('macro-name-input').value.trim();
    const formula = document.getElementById('macro-formula-input').value.trim();
    const category = document.getElementById('macro-category-input').value.trim() || 'Geral';
    const icon = document.getElementById('macro-icon-input').value.trim() || '🎲';
    const desc = document.getElementById('macro-desc-input').value.trim();

    if (!name || !formula) {
      alert('Por favor, preencha o Nome e a Fórmula!');
      return;
    }

    if (this.editingMacroId) {
      const idx = this.macros.findIndex(m => m.id === this.editingMacroId);
      if (idx !== -1) {
        this.macros[idx] = { id: this.editingMacroId, name, formula, category, icon, desc };
      }
    } else {
      this.macros.push({
        id: 'macro-' + Date.now(),
        name,
        formula,
        category,
        icon,
        desc
      });
    }

    StorageManager.saveMacros(this.macros);
    this.closeMacroModal();
    this.renderMacros();
  }

  editMacro(id) {
    const macro = this.macros.find(m => m.id === id);
    if (macro) this.openMacroModal(macro);
  }

  deleteMacro(id) {
    if (confirm('Tem certeza que deseja excluir esta rolagem customizada?')) {
      this.macros = this.macros.filter(m => m.id !== id);
      StorageManager.saveMacros(this.macros);
      this.renderMacros();
    }
  }

  // ==========================================
  // TABELAS DE ROLAGEM ALEATÓRIA
  // ==========================================
  renderTables() {
    const container = document.getElementById('tables-grid');
    if (!container) return;

    if (this.tables.length === 0) {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem;">Nenhuma tabela cadastrada. Crie uma para começar!</div>';
      return;
    }

    container.innerHTML = this.tables.map(tbl => `
      <div class="table-card">
        <div class="macro-card-header">
          <div>
            <div style="font-weight:bold;font-size:1.1rem;color:var(--text-main);">${tbl.name}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${tbl.desc || ''}</div>
          </div>
          <span class="macro-category-badge">${tbl.formula}</span>
        </div>

        <div class="table-entries-list">
          ${tbl.entries.map(e => `
            <div class="table-entry-row">
              <span class="table-entry-range">${e.range}</span>
              <span class="table-entry-text">${e.text}</span>
            </div>
          `).join('')}
        </div>

        <div id="table-result-${tbl.id}" class="table-roll-result">
          <span style="color:var(--text-muted);font-style:italic;">Clique abaixo para rolar um resultado aleatório...</span>
        </div>

        <div class="macro-card-footer">
          <button class="macro-btn-roll" onclick="window.app.rollOnTable('${tbl.id}')">
            <span>📜</span> Sortear na Tabela (${tbl.formula})
          </button>
          <div class="macro-actions">
            <button class="macro-action-btn delete" title="Excluir Tabela" onclick="window.app.deleteTable('${tbl.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  rollOnTable(tableId) {
    const tbl = this.tables.find(t => t.id === tableId);
    if (!tbl) return;

    try {
      soundEngine.playDiceRoll();
      const rollRes = DiceEngine.evaluate(tbl.formula, tbl.name);
      const rollVal = rollRes.total;

      // Localiza a entrada correspondente ao resultado
      let matchedEntry = null;
      for (const entry of tbl.entries) {
        if (entry.range.includes('-')) {
          const [min, max] = entry.range.split('-').map(x => parseInt(x.trim(), 10));
          if (rollVal >= min && rollVal <= max) {
            matchedEntry = entry;
            break;
          }
        } else {
          if (parseInt(entry.range.trim(), 10) === rollVal) {
            matchedEntry = entry;
            break;
          }
        }
      }

      const resultBox = document.getElementById(`table-result-${tbl.id}`);
      if (resultBox) {
        if (matchedEntry) {
          resultBox.innerHTML = `
            <div>
              <strong style="color:var(--primary-hover);font-size:1.05rem;">Rolagem [${rollVal}]:</strong> ${matchedEntry.text}
            </div>
          `;
        } else {
          resultBox.innerHTML = `<div><strong>Rolagem [${rollVal}]:</strong> Sem correspondência direta na tabela.</div>`;
        }
      }

      this.addHistoryRecord({
        ...rollRes,
        label: `Tabela: ${tbl.name} [Resultado: ${rollVal}]`
      });
    } catch (e) {
      alert(`Erro ao rolar na tabela: ${e.message}`);
    }
  }

  openTableModal() {
    const modal = document.getElementById('table-modal');
    modal?.classList.add('open');
  }

  closeTableModal() {
    document.getElementById('table-modal')?.classList.remove('open');
  }

  saveTableFromForm() {
    const name = document.getElementById('table-name-input').value.trim();
    const formula = document.getElementById('table-formula-input').value.trim();
    const desc = document.getElementById('table-desc-input').value.trim();
    const rawEntries = document.getElementById('table-entries-input').value.trim();

    if (!name || !formula || !rawEntries) {
      alert('Preencha o Nome, Fórmula e as Entradas da Tabela!');
      return;
    }

    const entries = [];
    const lines = rawEntries.split('\n');
    for (const line of lines) {
      if (line.includes(':')) {
        const [range, ...textParts] = line.split(':');
        entries.push({
          range: range.trim(),
          text: textParts.join(':').trim()
        });
      }
    }

    if (entries.length === 0) {
      alert('Formato inválido! Cada linha deve ser "Intervalo : Descrição" (ex: 1 : Item Fraco)');
      return;
    }

    this.tables.push({
      id: 'table-' + Date.now(),
      name,
      formula,
      desc,
      entries
    });

    StorageManager.saveTables(this.tables);
    this.closeTableModal();
    this.renderTables();
  }

  deleteTable(id) {
    if (confirm('Tem certeza que deseja excluir esta tabela?')) {
      this.tables = this.tables.filter(t => t.id !== id);
      StorageManager.saveTables(this.tables);
      this.renderTables();
    }
  }

  // ==========================================
  // BACKUP EXPORT & IMPORT
  // ==========================================
  exportBackup() {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      macros: this.macros,
      tables: this.tables,
      settings: this.settings
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roladas_infinitas_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.macros && Array.isArray(data.macros)) {
          this.macros = data.macros;
          StorageManager.saveMacros(this.macros);
        }
        if (data.tables && Array.isArray(data.tables)) {
          this.tables = data.tables;
          StorageManager.saveTables(this.tables);
        }
        if (data.settings) {
          this.settings = { ...this.settings, ...data.settings };
          StorageManager.saveSettings(this.settings);
        }
        alert('Backup importado com sucesso!');
        location.reload();
      } catch (err) {
        alert('Falha ao importar o arquivo. Certifique-se de que é um JSON válido.');
      }
    };
    reader.readAsText(file);
  }
}

// Inicializa no carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
