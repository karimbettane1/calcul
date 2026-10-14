/**
 * ============================================================================
 * Calculatrice Professionnelle Moderne & Scientifique
 * Visualisation de Données D3.js (Fréquence des Opérations Standard vs Sci)
 * HTML5, CSS3 & JavaScript Vanilla (Strictement sans eval)
 * ============================================================================
 */

import * as d3 from 'd3';

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Constantes & Clés de stockage LocalStorage
  // --------------------------------------------------------------------------
  const STORAGE_THEME_KEY = 'calc_pro_theme';
  const STORAGE_HISTORY_KEY = 'calc_pro_history';
  const STORAGE_SOUND_KEY = 'calc_pro_sound';
  const STORAGE_MODE_KEY = 'calc_pro_mode';
  const STORAGE_ANGLE_KEY = 'calc_pro_angle';
  const STORAGE_STATS_KEY = 'calc_pro_op_stats';
  const STORAGE_CHART_VIEW_KEY = 'calc_pro_chart_view';
  const MAX_HISTORY_ITEMS = 10;

  // --------------------------------------------------------------------------
  // Sélecteurs DOM
  // --------------------------------------------------------------------------
  const elements = {
    // Carte calculatrice
    calculatorCard: document.getElementById('calculator-card'),

    // Écran
    expressionText: document.getElementById('expression-text'),
    resultText: document.getElementById('result-text'),
    errorToast: document.getElementById('error-toast'),
    errorMessage: document.getElementById('error-message'),
    copyBtn: document.getElementById('copy-btn'),

    // Sélecteur de mode & Unité d'angle
    modeStandardBtn: document.getElementById('mode-standard-btn'),
    modeScientificBtn: document.getElementById('mode-scientific-btn'),
    angleUnitBtn: document.getElementById('angle-unit-btn'),

    // Boutons d'en-tête
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    historyToggleBtn: document.getElementById('history-toggle-btn'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    helpToggleBtn: document.getElementById('help-toggle-btn'),

    // Claviers
    scientificKeypad: document.getElementById('scientific-keypad'),
    keypad: document.getElementById('keypad'),

    // Panneau Historique
    historyPanel: document.getElementById('history-panel'),
    historyList: document.getElementById('history-list'),
    historyCount: document.getElementById('history-count'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),

    // Modale Aide
    helpModal: document.getElementById('help-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),

    // Notification Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),

    // Éléments Section Analytics D3.js
    chartViewCatBtn: document.getElementById('chart-view-cat-btn'),
    chartViewDetailBtn: document.getElementById('chart-view-detail-btn'),
    resetStatsBtn: document.getElementById('reset-stats-btn'),
    kpiTotalOps: document.getElementById('kpi-total-ops'),
    kpiStandardCount: document.getElementById('kpi-standard-count'),
    kpiStandardPct: document.getElementById('kpi-standard-pct'),
    kpiScientificCount: document.getElementById('kpi-scientific-count'),
    kpiScientificPct: document.getElementById('kpi-scientific-pct'),
    d3PieChart: document.getElementById('d3-pie-chart'),
    chartTooltip: document.getElementById('chart-tooltip'),
    chartLegendList: document.getElementById('chart-legend-list'),
  };

  // --------------------------------------------------------------------------
  // Données initiales pour les statistiques d'utilisation
  // --------------------------------------------------------------------------
  const initialStarterStats = {
    standardCount: 18,
    scientificCount: 12,
    detailCounts: {
      'Addition (+)': 8,
      'Multiplication (×)': 5,
      'Soustraction (−)': 3,
      'Division (÷)': 2,
      'Trigonométrie (sin, cos, tan)': 5,
      'Puissances & Racines (xʸ, √x, x²)': 4,
      'Logarithmes & Exp (log, ln, eˣ)': 2,
      'Inverse & Constantes (¹/x, π, e)': 1,
    },
  };

  // --------------------------------------------------------------------------
  // État de l'Application
  // --------------------------------------------------------------------------
  const state = {
    currentInput: '0',        // Nombre en cours de saisie
    previousInput: null,      // Nombre précédent dans l'opération
    selectedOperator: null,   // '+', '-', '*', '/', '^'
    pendingExpression: '',    // Expression affichée en haut
    justEvaluated: false,     // Vrai si le calcul vient de se terminer
    hasError: false,          // Erreur active
    mode: localStorage.getItem(STORAGE_MODE_KEY) || 'standard',
    angleUnit: localStorage.getItem(STORAGE_ANGLE_KEY) || 'DEG',
    theme: localStorage.getItem(STORAGE_THEME_KEY) || 'dark',
    soundEnabled: localStorage.getItem(STORAGE_SOUND_KEY) !== 'false',
    history: [],              // Liste des 10 dernières opérations
    stats: loadStats(),       // Données d'analyse
    chartView: localStorage.getItem(STORAGE_CHART_VIEW_KEY) || 'category', // 'category' ou 'detail'
  };

  // --------------------------------------------------------------------------
  // Synthétiseur Audio Web (Micro-sons natifs)
  // --------------------------------------------------------------------------
  let audioCtx = null;

  function playKeySound(type = 'default') {
    if (!state.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      let freq = 420;
      let duration = 0.035;

      if (type === 'operator') {
        freq = 600;
        duration = 0.045;
      } else if (type === 'scientific') {
        freq = 720;
        duration = 0.04;
      } else if (type === 'equal') {
        freq = 840;
        duration = 0.07;
      } else if (type === 'clear') {
        freq = 280;
        duration = 0.04;
      }

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Ignorer silencieusement si bloqué
    }
  }

  // --------------------------------------------------------------------------
  // Moteur Mathématique Sécurisé (SANS eval)
  // --------------------------------------------------------------------------
  function sanitizePrecision(num) {
    if (!Number.isFinite(num)) return num;
    if (Math.abs(num) < 1e-12 && num !== 0) return 0;
    return Number(Math.round(num + 'e+12') + 'e-12');
  }

  function computeBinary(a, op, b) {
    const numA = Number(a);
    const numB = Number(b);

    if (isNaN(numA) || isNaN(numB)) {
      throw new Error('Entrée non valide');
    }

    switch (op) {
      case '+':
        return sanitizePrecision(numA + numB);
      case '-':
        return sanitizePrecision(numA - numB);
      case '*':
        return sanitizePrecision(numA * numB);
      case '/':
        if (numB === 0) {
          throw new Error('Division par 0 impossible');
        }
        return sanitizePrecision(numA / numB);
      case '^':
        const powRes = Math.pow(numA, numB);
        if (isNaN(powRes)) {
          throw new Error('Puissance non définie');
        }
        return sanitizePrecision(powRes);
      default:
        throw new Error('Opérateur inconnu');
    }
  }

  // --------------------------------------------------------------------------
  // Fonctions Scientifiques Avancées
  // --------------------------------------------------------------------------
  function executeScientificFunction(funcName) {
    clearError();
    playKeySound('scientific');

    const val = parseFloat(state.currentInput);
    if (isNaN(val)) return;

    let result;
    let exprLabel = '';

    try {
      switch (funcName) {
        case 'sin': {
          recordOperation('scientific', 'Trigonométrie (sin, cos, tan)');
          const rad = state.angleUnit === 'DEG' ? (val * Math.PI) / 180 : val;
          if (state.angleUnit === 'DEG' && val % 180 === 0) {
            result = 0;
          } else if (state.angleUnit === 'DEG' && (val - 90) % 360 === 0) {
            result = 1;
          } else if (state.angleUnit === 'DEG' && (val - 270) % 360 === 0) {
            result = -1;
          } else {
            result = sanitizePrecision(Math.sin(rad));
          }
          exprLabel = `sin(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'cos': {
          recordOperation('scientific', 'Trigonométrie (sin, cos, tan)');
          const rad = state.angleUnit === 'DEG' ? (val * Math.PI) / 180 : val;
          if (state.angleUnit === 'DEG' && (val - 90) % 180 === 0) {
            result = 0;
          } else if (state.angleUnit === 'DEG' && val % 360 === 0) {
            result = 1;
          } else if (state.angleUnit === 'DEG' && (val - 180) % 360 === 0) {
            result = -1;
          } else {
            result = sanitizePrecision(Math.cos(rad));
          }
          exprLabel = `cos(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'tan': {
          recordOperation('scientific', 'Trigonométrie (sin, cos, tan)');
          if (state.angleUnit === 'DEG' && Math.abs(val % 180) === 90) {
            throw new Error('Tangente indéfinie');
          }
          const rad = state.angleUnit === 'DEG' ? (val * Math.PI) / 180 : val;
          if (state.angleUnit === 'DEG' && val % 180 === 0) {
            result = 0;
          } else if (state.angleUnit === 'DEG' && (val - 45) % 180 === 0) {
            result = 1;
          } else {
            result = sanitizePrecision(Math.tan(rad));
          }
          exprLabel = `tan(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'sqrt': {
          recordOperation('scientific', 'Puissances & Racines (xʸ, √x, x²)');
          if (val < 0) {
            throw new Error('Racine carrée négative impossible');
          }
          result = sanitizePrecision(Math.sqrt(val));
          exprLabel = `√(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'log': {
          recordOperation('scientific', 'Logarithmes & Exp (log, ln, eˣ)');
          if (val <= 0) {
            throw new Error('Logarithme indéfini pour ≤ 0');
          }
          result = sanitizePrecision(Math.log10(val));
          exprLabel = `log(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'ln': {
          recordOperation('scientific', 'Logarithmes & Exp (log, ln, eˣ)');
          if (val <= 0) {
            throw new Error('Ln indéfini pour ≤ 0');
          }
          result = sanitizePrecision(Math.log(val));
          exprLabel = `ln(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'exp': {
          recordOperation('scientific', 'Logarithmes & Exp (log, ln, eˣ)');
          result = sanitizePrecision(Math.exp(val));
          exprLabel = `e^(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'sqr': {
          recordOperation('scientific', 'Puissances & Racines (xʸ, √x, x²)');
          result = sanitizePrecision(val * val);
          exprLabel = `sqr(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'inv': {
          recordOperation('scientific', 'Inverse & Constantes (¹/x, π, e)');
          if (val === 0) {
            throw new Error('Division par 0 impossible');
          }
          result = sanitizePrecision(1 / val);
          exprLabel = `1/(${formatNumberForDisplay(String(val))})`;
          break;
        }

        case 'pi': {
          recordOperation('scientific', 'Inverse & Constantes (¹/x, π, e)');
          result = sanitizePrecision(Math.PI);
          state.currentInput = String(result);
          state.justEvaluated = true;
          triggerResultAnimation();
          render();
          return;
        }

        case 'e': {
          recordOperation('scientific', 'Inverse & Constantes (¹/x, π, e)');
          result = sanitizePrecision(Math.E);
          state.currentInput = String(result);
          state.justEvaluated = true;
          triggerResultAnimation();
          render();
          return;
        }

        default:
          return;
      }

      saveHistoryItem({
        expression: exprLabel,
        result: result,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      state.pendingExpression = `${exprLabel} =`;
      state.currentInput = String(result);
      state.justEvaluated = true;

      triggerResultAnimation();
      render();
    } catch (err) {
      showError(err.message || 'Erreur scientifique');
    }
  }

  // --------------------------------------------------------------------------
  // Formatage & Affichage
  // --------------------------------------------------------------------------
  function formatNumberForDisplay(valStr) {
    if (valStr === '' || valStr === '0') return '0';
    if (valStr === '-') return '-0';
    if (valStr === 'Erreur' || valStr.includes('impossible')) return valStr;

    const num = Number(valStr);
    if (!Number.isFinite(num)) return 'Erreur';

    if (Math.abs(num) >= 1e12 || (Math.abs(num) > 0 && Math.abs(num) < 1e-7)) {
      return num.toExponential(6).replace('e+', 'e');
    }

    const parts = valStr.split('.');
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? parts[1] : null;

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    if (decimalPart !== null) {
      return `${formattedInteger}.${decimalPart}`;
    }
    return formattedInteger;
  }

  function getReadableOperator(op) {
    switch (op) {
      case '*': return '×';
      case '/': return '÷';
      case '+': return '+';
      case '-': return '−';
      case '^': return '^';
      default: return op;
    }
  }

  function adjustDisplayFontSize() {
    const textLength = elements.resultText.textContent.length;
    elements.resultText.classList.remove('size-sm', 'size-xs');

    if (textLength > 14) {
      elements.resultText.classList.add('size-xs');
    } else if (textLength > 9) {
      elements.resultText.classList.add('size-sm');
    }
  }

  function render() {
    if (state.hasError) {
      elements.resultText.textContent = state.currentInput;
      elements.expressionText.textContent = state.pendingExpression;
      adjustDisplayFontSize();
      return;
    }

    elements.resultText.textContent = formatNumberForDisplay(state.currentInput);
    adjustDisplayFontSize();

    if (state.previousInput !== null && state.selectedOperator !== null) {
      const prevFormatted = formatNumberForDisplay(String(state.previousInput));
      const opSymbol = getReadableOperator(state.selectedOperator);
      elements.expressionText.innerHTML = `${prevFormatted} <span class="expression-op-tag">${opSymbol}</span>`;
    } else if (state.pendingExpression) {
      elements.expressionText.textContent = state.pendingExpression;
    } else {
      elements.expressionText.textContent = '';
    }

    document.querySelectorAll('.btn-operator, .btn-sci-op').forEach((btn) => {
      if (btn.dataset.action === state.selectedOperator && !state.justEvaluated) {
        btn.classList.add('op-active');
      } else {
        btn.classList.remove('op-active');
      }
    });
  }

  function showError(msg) {
    state.hasError = true;
    state.currentInput = 'Erreur';
    elements.errorMessage.textContent = msg;
    elements.errorToast.classList.add('visible');

    setTimeout(() => {
      elements.errorToast.classList.remove('visible');
    }, 3200);

    render();
  }

  function clearError() {
    if (state.hasError) {
      state.hasError = false;
      state.currentInput = '0';
      elements.errorToast.classList.remove('visible');
    }
  }

  function triggerResultAnimation() {
    elements.resultText.classList.remove('result-animate');
    void elements.resultText.offsetWidth;
    elements.resultText.classList.add('result-animate');
  }

  function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 2200);
  }

  // --------------------------------------------------------------------------
  // Actions Principales de Calcul
  // --------------------------------------------------------------------------
  function inputDigit(digit) {
    clearError();
    playKeySound('default');

    if (state.justEvaluated) {
      state.currentInput = String(digit);
      state.pendingExpression = '';
      state.justEvaluated = false;
      render();
      return;
    }

    if (state.currentInput === '0') {
      state.currentInput = String(digit);
    } else if (state.currentInput === '-0') {
      state.currentInput = '-' + digit;
    } else {
      const digitsOnly = state.currentInput.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 15) return;
      state.currentInput += String(digit);
    }
    render();
  }

  function inputDecimal() {
    clearError();
    playKeySound('default');

    if (state.justEvaluated) {
      state.currentInput = '0.';
      state.pendingExpression = '';
      state.justEvaluated = false;
      render();
      return;
    }

    if (!state.currentInput.includes('.')) {
      state.currentInput += '.';
    }
    render();
  }

  function handleOperator(nextOp) {
    clearError();
    playKeySound('operator');

    // Suivi statistique
    if (nextOp === '+') recordOperation('standard', 'Addition (+)');
    else if (nextOp === '-') recordOperation('standard', 'Soustraction (−)');
    else if (nextOp === '*') recordOperation('standard', 'Multiplication (×)');
    else if (nextOp === '/') recordOperation('standard', 'Division (÷)');
    else if (nextOp === '^') recordOperation('scientific', 'Puissances & Racines (xʸ, √x, x²)');

    const inputVal = parseFloat(state.currentInput);

    if (state.previousInput === null) {
      state.previousInput = inputVal;
    } else if (state.selectedOperator && !state.justEvaluated) {
      try {
        const intermediate = computeBinary(state.previousInput, state.selectedOperator, inputVal);
        state.previousInput = intermediate;
        state.currentInput = String(intermediate);
        triggerResultAnimation();
      } catch (err) {
        showError(err.message || 'Erreur de calcul');
        return;
      }
    }

    state.selectedOperator = nextOp;
    state.currentInput = '0';
    state.justEvaluated = false;
    render();
  }

  function handleEquals() {
    if (state.selectedOperator === null || state.previousInput === null) {
      return;
    }

    playKeySound('equal');
    const inputVal = parseFloat(state.currentInput);

    try {
      const result = computeBinary(state.previousInput, state.selectedOperator, inputVal);

      const opSymbol = getReadableOperator(state.selectedOperator);
      const prevFormatted = formatNumberForDisplay(String(state.previousInput));
      const currFormatted = formatNumberForDisplay(String(inputVal));
      const fullExpression = `${prevFormatted} ${opSymbol} ${currFormatted}`;

      saveHistoryItem({
        expression: fullExpression,
        result: result,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      state.pendingExpression = `${fullExpression} =`;
      state.currentInput = String(result);
      state.previousInput = null;
      state.selectedOperator = null;
      state.justEvaluated = true;

      triggerResultAnimation();
      render();
    } catch (err) {
      showError(err.message || 'Erreur de calcul');
    }
  }

  function handlePercent() {
    clearError();
    playKeySound('operator');
    recordOperation('standard', 'Pourcentage (%)');

    const currentVal = parseFloat(state.currentInput);
    if (isNaN(currentVal)) return;

    let resultVal;
    if (state.previousInput !== null && (state.selectedOperator === '+' || state.selectedOperator === '-')) {
      resultVal = (state.previousInput * currentVal) / 100;
    } else {
      resultVal = currentVal / 100;
    }

    resultVal = sanitizePrecision(resultVal);
    state.currentInput = String(resultVal);
    render();
  }

  function handleToggleSign() {
    clearError();
    playKeySound('default');

    if (state.currentInput === '0') return;

    if (state.currentInput.startsWith('-')) {
      state.currentInput = state.currentInput.slice(1);
    } else {
      state.currentInput = '-' + state.currentInput;
    }
    render();
  }

  function handleDelete() {
    clearError();
    playKeySound('default');

    if (state.justEvaluated) {
      state.currentInput = '0';
      state.pendingExpression = '';
      state.justEvaluated = false;
      render();
      return;
    }

    if (state.currentInput.length > 1) {
      state.currentInput = state.currentInput.slice(0, -1);
      if (state.currentInput === '-' || state.currentInput === '-0') {
        state.currentInput = '0';
      }
    } else {
      state.currentInput = '0';
    }
    render();
  }

  function handleClearAll() {
    playKeySound('clear');
    clearError();
    state.currentInput = '0';
    state.previousInput = null;
    state.selectedOperator = null;
    state.pendingExpression = '';
    state.justEvaluated = false;
    render();
  }

  // --------------------------------------------------------------------------
  // Gestion du Mode (Standard vs Scientifique)
  // --------------------------------------------------------------------------
  function setMode(mode) {
    state.mode = mode;
    localStorage.setItem(STORAGE_MODE_KEY, mode);

    if (mode === 'scientific') {
      elements.calculatorCard.classList.add('scientific-mode');
      elements.modeScientificBtn.classList.add('active');
      elements.modeScientificBtn.setAttribute('aria-selected', 'true');
      elements.modeStandardBtn.classList.remove('active');
      elements.modeStandardBtn.setAttribute('aria-selected', 'false');
      showToast('Mode scientifique activé');
    } else {
      elements.calculatorCard.classList.remove('scientific-mode');
      elements.modeStandardBtn.classList.add('active');
      elements.modeStandardBtn.setAttribute('aria-selected', 'true');
      elements.modeScientificBtn.classList.remove('active');
      elements.modeScientificBtn.setAttribute('aria-selected', 'false');
      showToast('Mode standard activé');
    }
  }

  function toggleAngleUnit() {
    state.angleUnit = state.angleUnit === 'DEG' ? 'RAD' : 'DEG';
    localStorage.setItem(STORAGE_ANGLE_KEY, state.angleUnit);
    elements.angleUnitBtn.textContent = state.angleUnit;
    showToast(`Angles en ${state.angleUnit === 'DEG' ? 'Degrés' : 'Radians'}`);
  }

  // --------------------------------------------------------------------------
  // Gestion de l'Historique
  // --------------------------------------------------------------------------
  function loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_HISTORY_KEY);
      state.history = stored ? JSON.parse(stored) : [];
    } catch {
      state.history = [];
    }
    renderHistory();
  }

  function saveHistoryItem(item) {
    state.history.unshift(item);
    if (state.history.length > MAX_HISTORY_ITEMS) {
      state.history = state.history.slice(0, MAX_HISTORY_ITEMS);
    }
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(state.history));
    } catch {
      // Ignorer si stockage saturé
    }
    renderHistory();
  }

  function clearHistory() {
    state.history = [];
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {
      // Ignorer
    }
    renderHistory();
    showToast('Historique effacé');
  }

  function renderHistory() {
    elements.historyCount.textContent = state.history.length;

    if (state.history.length === 0) {
      elements.historyList.innerHTML = `
        <div class="history-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <p>Aucun calcul récent. Vos opérations s'afficheront ici.</p>
        </div>
      `;
      return;
    }

    elements.historyList.innerHTML = state.history
      .map((item, index) => {
        const formattedRes = formatNumberForDisplay(String(item.result));
        return `
          <div class="history-item" data-index="${index}" title="Cliquer pour réutiliser le résultat">
            <span class="history-item-time">${item.time}</span>
            <span class="history-item-expr">${item.expression}</span>
            <span class="history-item-res"><span>=</span>${formattedRes}</span>
          </div>
        `;
      })
      .join('');

    elements.historyList.querySelectorAll('.history-item').forEach((elem) => {
      elem.addEventListener('click', () => {
        const idx = parseInt(elem.dataset.index, 10);
        const item = state.history[idx];
        if (item) {
          clearError();
          state.currentInput = String(item.result);
          state.justEvaluated = true;
          state.pendingExpression = `Reprise : ${item.expression} =`;
          triggerResultAnimation();
          render();
          showToast(`Résultat réutilisé : ${formatNumberForDisplay(String(item.result))}`);
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // Suivi des Données & Visualisation D3.js (Pie Chart)
  // --------------------------------------------------------------------------
  function loadStats() {
    try {
      const stored = localStorage.getItem(STORAGE_STATS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // Fallback
    }
    return JSON.parse(JSON.stringify(initialStarterStats));
  }

  function saveStats() {
    try {
      localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(state.stats));
    } catch {
      // Ignorer
    }
  }

  function recordOperation(category, detailName) {
    if (category === 'standard') {
      state.stats.standardCount = (state.stats.standardCount || 0) + 1;
    } else {
      state.stats.scientificCount = (state.stats.scientificCount || 0) + 1;
    }

    if (detailName) {
      if (!state.stats.detailCounts) state.stats.detailCounts = {};
      state.stats.detailCounts[detailName] = (state.stats.detailCounts[detailName] || 0) + 1;
    }

    saveStats();
    updateKPIs();
    renderPieChart();
  }

  function resetStats() {
    state.stats = {
      standardCount: 0,
      scientificCount: 0,
      detailCounts: {},
    };
    saveStats();
    updateKPIs();
    renderPieChart();
    showToast('Statistiques réinitialisées');
  }

  function updateKPIs() {
    const std = state.stats.standardCount || 0;
    const sci = state.stats.scientificCount || 0;
    const total = std + sci;

    elements.kpiTotalOps.textContent = total;
    elements.kpiStandardCount.textContent = std;
    elements.kpiScientificCount.textContent = sci;

    const stdPct = total > 0 ? Math.round((std / total) * 100) : 0;
    const sciPct = total > 0 ? Math.round((sci / total) * 100) : 0;

    elements.kpiStandardPct.textContent = `${stdPct}%`;
    elements.kpiScientificPct.textContent = `${sciPct}%`;
  }

  /**
   * Rendu complet du Pie / Donut Chart interactif avec D3.js
   */
  function renderPieChart() {
    const container = elements.d3PieChart;
    if (!container) return;

    // Nettoyer l'ancien SVG
    container.innerHTML = '';

    const std = state.stats.standardCount || 0;
    const sci = state.stats.scientificCount || 0;
    const total = std + sci;

    // Préparation des données selon le mode de visualisation choisi
    let data = [];
    if (state.chartView === 'category') {
      data = [
        { label: 'Opérations Standards', value: std, color: '#3b82f6', category: 'standard' },
        { label: 'Opérations Scientifiques', value: sci, color: '#8b5cf6', category: 'scientific' },
      ];
    } else {
      const palette = [
        '#3b82f6', '#06b6d4', '#6366f1', '#10b981',
        '#8b5cf6', '#d946ef', '#f43f5e', '#f59e0b',
      ];
      const details = state.stats.detailCounts || {};
      const entries = Object.entries(details).filter(([, val]) => val > 0);

      data = entries.map(([name, val], i) => ({
        label: name,
        value: val,
        color: palette[i % palette.length],
      }));

      // Si aucune donnée détaillée
      if (data.length === 0) {
        data = [
          { label: 'Standards', value: std, color: '#3b82f6' },
          { label: 'Scientifiques', value: sci, color: '#8b5cf6' },
        ];
      }
    }

    // Filtrer les valeurs nulles
    const filteredData = data.filter((d) => d.value > 0);

    // Mettre à jour la liste légende
    renderLegend(filteredData, total);

    // Si aucune opération enregistrée (0 total)
    if (total === 0 || filteredData.length === 0) {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.8rem; text-align: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 8px;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
          <span>Aucune opération enregistrée. Effectuez des calculs pour visualiser vos données !</span>
        </div>
      `;
      return;
    }

    // Dimensions du graphique
    const width = 280;
    const height = 280;
    const radius = Math.min(width, height) / 2 - 14;
    const innerRadius = radius * 0.58; // Rayon intérieur pour effet Donut moderne

    // Création de l'élément SVG D3
    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Générateurs D3 Pie & Arc
    const pie = d3
      .pie()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.025);

    const arc = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .cornerRadius(5);

    const arcHover = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(radius + 7)
      .cornerRadius(6);

    // Données des arcs
    const arcs = svg
      .selectAll('.pie-slice')
      .data(pie(filteredData))
      .enter()
      .append('g')
      .attr('class', 'pie-slice-group');

    // Tracé des tranches
    arcs
      .append('path')
      .attr('class', 'pie-slice')
      .attr('d', arc)
      .attr('fill', (d) => d.data.color)
      .attr('stroke', state.theme === 'dark' ? '#0a0d14' : '#ffffff')
      .attr('stroke-width', 2)
      .on('mouseenter', function (event, d) {
        d3.select(this)
          .transition()
          .duration(180)
          .attr('d', arcHover);

        const pct = Math.round((d.data.value / total) * 100);
        centerLabel.text(d.data.label);
        centerValue.text(`${d.data.value} ops`);
        centerSubtext.text(`${pct}% du total`);

        // Tooltip
        elements.chartTooltip.textContent = `${d.data.label}: ${d.data.value} (${pct}%)`;
        elements.chartTooltip.classList.add('visible');

        // Mettre en surbrillance l'élément de légende
        document.querySelectorAll('.legend-item').forEach((item) => {
          if (item.dataset.label === d.data.label) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      })
      .on('mousemove', function (event) {
        const bounds = container.getBoundingClientRect();
        const mouseX = event.clientX - bounds.left;
        const mouseY = event.clientY - bounds.top;
        elements.chartTooltip.style.left = `${mouseX}px`;
        elements.chartTooltip.style.top = `${mouseY}px`;
      })
      .on('mouseleave', function () {
        d3.select(this)
          .transition()
          .duration(180)
          .attr('d', arc);

        resetCenterText();
        elements.chartTooltip.classList.remove('visible');
        document.querySelectorAll('.legend-item').forEach((item) => {
          item.classList.remove('active');
        });
      });

    // Groupe de texte central du Donut
    const centerGroup = svg.append('g').attr('class', 'center-text-group');

    const centerLabel = centerGroup
      .append('text')
      .attr('class', 'center-label')
      .attr('y', -16)
      .text('TOTAL');

    const centerValue = centerGroup
      .append('text')
      .attr('class', 'center-value')
      .attr('y', 8)
      .text(total);

    const centerSubtext = centerGroup
      .append('text')
      .attr('class', 'center-subtext')
      .attr('y', 26)
      .text('Opérations');

    function resetCenterText() {
      centerLabel.text('TOTAL');
      centerValue.text(total);
      centerSubtext.text('Opérations');
    }
  }

  function renderLegend(data, total) {
    if (!elements.chartLegendList) return;

    if (data.length === 0 || total === 0) {
      elements.chartLegendList.innerHTML = `
        <div style="font-size: 0.78rem; color: var(--text-muted); padding: 8px;">
          En attente de calculs...
        </div>
      `;
      return;
    }

    elements.chartLegendList.innerHTML = data
      .map((item) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return `
          <div class="legend-item" data-label="${item.label}">
            <div class="legend-item-header">
              <div class="legend-item-label-wrap">
                <span class="legend-color-dot" style="background: ${item.color};"></span>
                <span class="legend-item-name">${item.label}</span>
              </div>
              <div class="legend-item-metrics">
                <span class="legend-item-count">${item.value}</span>
                <span class="legend-item-pct">(${pct}%)</span>
              </div>
            </div>
            <div class="legend-progress-bar-bg">
              <div class="legend-progress-bar-fill" style="width: ${pct}%; background: ${item.color};"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function setChartView(view) {
    state.chartView = view;
    localStorage.setItem(STORAGE_CHART_VIEW_KEY, view);

    if (view === 'category') {
      elements.chartViewCatBtn.classList.add('active');
      elements.chartViewCatBtn.setAttribute('aria-selected', 'true');
      elements.chartViewDetailBtn.classList.remove('active');
      elements.chartViewDetailBtn.setAttribute('aria-selected', 'false');
    } else {
      elements.chartViewDetailBtn.classList.add('active');
      elements.chartViewDetailBtn.setAttribute('aria-selected', 'true');
      elements.chartViewCatBtn.classList.remove('active');
      elements.chartViewCatBtn.setAttribute('aria-selected', 'false');
    }

    renderPieChart();
  }

  // --------------------------------------------------------------------------
  // Thème Sombre / Clair
  // --------------------------------------------------------------------------
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);

    if (theme === 'light') {
      elements.themeToggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `;
      elements.themeToggleBtn.setAttribute('title', 'Passer au mode sombre');
    } else {
      elements.themeToggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      `;
      elements.themeToggleBtn.setAttribute('title', 'Passer au mode clair');
    }

    // Ré-appliquer le rendu D3 pour rafraîchir les traits d'accent
    renderPieChart();
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    showToast(`Mode ${nextTheme === 'dark' ? 'sombre' : 'clair'} activé`);
  }

  // --------------------------------------------------------------------------
  // Gestion du Son
  // --------------------------------------------------------------------------
  function updateSoundButton() {
    if (state.soundEnabled) {
      elements.soundToggleBtn.classList.remove('active');
      elements.soundToggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
      elements.soundToggleBtn.setAttribute('title', 'Désactiver les effets sonores');
    } else {
      elements.soundToggleBtn.classList.add('active');
      elements.soundToggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      `;
      elements.soundToggleBtn.setAttribute('title', 'Activer les effets sonores');
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(STORAGE_SOUND_KEY, state.soundEnabled);
    updateSoundButton();
    showToast(state.soundEnabled ? 'Sons activés' : 'Sons désactivés');
  }

  // --------------------------------------------------------------------------
  // Copie dans le Presse-papiers
  // --------------------------------------------------------------------------
  async function copyResultToClipboard() {
    const textToCopy = state.currentInput;
    if (!textToCopy || textToCopy === 'Erreur') return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('Résultat copié dans le presse-papiers !');
      elements.copyBtn.style.color = 'var(--success-color)';
      setTimeout(() => {
        elements.copyBtn.style.color = '';
      }, 1000);
    } catch {
      const tempInput = document.createElement('textarea');
      tempInput.value = textToCopy;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      showToast('Résultat copié !');
    }
  }

  // --------------------------------------------------------------------------
  // Feedback Visuel Touche Clavier
  // --------------------------------------------------------------------------
  function highlightButton(selector) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.classList.add('key-pressed');
      setTimeout(() => {
        btn.classList.remove('key-pressed');
      }, 140);
    }
  }

  // --------------------------------------------------------------------------
  // Écouteurs d'Événements du Clavier Physique
  // --------------------------------------------------------------------------
  function handlePhysicalKeyboard(e) {
    if (elements.helpModal.classList.contains('open')) {
      if (e.key === 'Escape') {
        elements.helpModal.classList.remove('open');
      }
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      inputDigit(parseInt(e.key, 10));
      highlightButton(`[data-digit="${e.key}"]`);
      return;
    }

    if (e.key === '.' || e.key === ',') {
      e.preventDefault();
      inputDecimal();
      highlightButton('[data-action="decimal"]');
      return;
    }

    if (e.key === '+') {
      e.preventDefault();
      handleOperator('+');
      highlightButton('[data-action="+"]');
      return;
    }
    if (e.key === '-') {
      e.preventDefault();
      handleOperator('-');
      highlightButton('[data-action="-"]');
      return;
    }
    if (e.key === '*' || (e.key.toLowerCase() === 'x' && state.mode !== 'scientific')) {
      e.preventDefault();
      handleOperator('*');
      highlightButton('[data-action="*"]');
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      handleOperator('/');
      highlightButton('[data-action="/"]');
      return;
    }

    if (e.key === '^') {
      e.preventDefault();
      handleOperator('^');
      highlightButton('[data-action="^"]');
      return;
    }

    const lowerKey = e.key.toLowerCase();
    if (lowerKey === 's' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('sin');
      highlightButton('[data-sci="sin"]');
      return;
    }
    if (lowerKey === 'c' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('cos');
      highlightButton('[data-sci="cos"]');
      return;
    }
    if (lowerKey === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('tan');
      highlightButton('[data-sci="tan"]');
      return;
    }
    if ((lowerKey === 'r' || lowerKey === 'q') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('sqrt');
      highlightButton('[data-sci="sqrt"]');
      return;
    }
    if (lowerKey === 'l' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('log');
      highlightButton('[data-sci="log"]');
      return;
    }
    if (lowerKey === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('exp');
      highlightButton('[data-sci="exp"]');
      return;
    }
    if (lowerKey === 'p' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      executeScientificFunction('pi');
      highlightButton('[data-sci="pi"]');
      return;
    }

    if (lowerKey === 'm' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setMode(state.mode === 'standard' ? 'scientific' : 'standard');
      return;
    }

    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      handleEquals();
      highlightButton('[data-action="equals"]');
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      handleDelete();
      highlightButton('[data-action="delete"]');
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleClearAll();
      highlightButton('[data-action="clear"]');
      return;
    }

    if (e.key === '%') {
      e.preventDefault();
      handlePercent();
      highlightButton('[data-action="percent"]');
      return;
    }

    if (lowerKey === 'h' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      elements.historyPanel.classList.toggle('collapsed');
      return;
    }

    if (lowerKey === 'k' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      copyResultToClipboard();
      return;
    }
  }

  // --------------------------------------------------------------------------
  // Initialisation des Événements
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // Clavier standard
    elements.keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.calc-btn');
      if (!btn) return;

      const digit = btn.dataset.digit;
      const action = btn.dataset.action;

      if (digit !== undefined) {
        inputDigit(parseInt(digit, 10));
        return;
      }

      switch (action) {
        case '+':
        case '-':
        case '*':
        case '/':
        case '^':
          handleOperator(action);
          break;
        case 'equals':
          handleEquals();
          break;
        case 'clear':
          handleClearAll();
          break;
        case 'delete':
          handleDelete();
          break;
        case 'decimal':
          inputDecimal();
          break;
        case 'percent':
          handlePercent();
          break;
        case 'negate':
          handleToggleSign();
          break;
        default:
          break;
      }
    });

    // Clavier scientifique
    elements.scientificKeypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.calc-btn');
      if (!btn) return;

      const sciFunc = btn.dataset.sci;
      const action = btn.dataset.action;

      if (sciFunc) {
        executeScientificFunction(sciFunc);
      } else if (action === '^') {
        handleOperator('^');
      }
    });

    // Bascule de Mode
    elements.modeStandardBtn.addEventListener('click', () => setMode('standard'));
    elements.modeScientificBtn.addEventListener('click', () => setMode('scientific'));
    elements.angleUnitBtn.addEventListener('click', toggleAngleUnit);

    // Vues Analytics
    elements.chartViewCatBtn.addEventListener('click', () => setChartView('category'));
    elements.chartViewDetailBtn.addEventListener('click', () => setChartView('detail'));
    elements.resetStatsBtn.addEventListener('click', resetStats);

    // Copier le résultat
    elements.copyBtn.addEventListener('click', copyResultToClipboard);

    // Barre d'outils
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    elements.soundToggleBtn.addEventListener('click', toggleSound);

    elements.historyToggleBtn.addEventListener('click', () => {
      elements.historyPanel.classList.toggle('collapsed');
      elements.historyToggleBtn.classList.toggle('active');
    });

    elements.clearHistoryBtn.addEventListener('click', clearHistory);

    // Modale Aide
    elements.helpToggleBtn.addEventListener('click', () => {
      elements.helpModal.classList.add('open');
    });

    elements.closeModalBtn.addEventListener('click', () => {
      elements.helpModal.classList.remove('open');
    });

    elements.helpModal.addEventListener('click', (e) => {
      if (e.target === elements.helpModal) {
        elements.helpModal.classList.remove('open');
      }
    });

    // Redimensionnement de fenêtre : réadapter le graphique
    window.addEventListener('resize', () => {
      renderPieChart();
    });

    // Clavier physique
    window.addEventListener('keydown', handlePhysicalKeyboard);
  }

  // --------------------------------------------------------------------------
  // Démarrage de l'Application
  // --------------------------------------------------------------------------
  function init() {
    applyTheme(state.theme);
    updateSoundButton();
    setMode(state.mode);
    setChartView(state.chartView);
    elements.angleUnitBtn.textContent = state.angleUnit;
    loadHistory();
    updateKPIs();
    renderPieChart();
    setupEventListeners();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
