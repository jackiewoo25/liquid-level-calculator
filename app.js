const STORAGE_KEY = "lienwhaLiquidLevelSpreadsheet.v2";
const UNDO_KEY = "lienwhaLiquidLevelSpreadsheet.undo.v2";
const MAX_UNDO = 20;

const defaultRows = [
  { id: "n2o", tank: "N2O", factor: "36", current: "220", target: "350" },
  { id: "t959", tank: "959", factor: "31", current: "", target: "" },
  { id: "co2", tank: "CO2", factor: "33", current: "", target: "" },
  { id: "t481", tank: "481", factor: "25", current: "", target: "" },
  { id: "t338", tank: "338", factor: "21", current: "", target: "" },
  { id: "high-n2", tank: "高氮", factor: "37.5", current: "", target: "" }
];

const editableFields = ["factor", "current", "target"];
const normalFields = ["current", "target"];
const fieldLabels = {
  factor: "1cm=kg",
  current: "目前液位",
  target: "灌後液位"
};
const compactFieldLabels = {
  factor: "kg/cm",
  current: "前",
  target: "後"
};

let state = loadState();
let undoStack = loadUndoStack();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.rows)) throw new Error("empty");
    const factorLocked = saved.factorLocked !== false;
    return {
      netWeight: cleanNumber(saved.netWeight),
      factorLocked,
      rows: mergeRows(saved.rows),
      active: normalizeActive(saved.active, factorLocked)
    };
  } catch {
    return {
      netWeight: "",
      factorLocked: true,
      rows: clone(defaultRows),
      active: { rowId: "n2o", field: "current" }
    };
  }
}

function normalizeActive(active, factorLocked = true) {
  if (!active || !active.field) return { rowId: "n2o", field: "current" };
  if (active.field === "netWeight") return active;
  if (active.field === "factor" && factorLocked) return { rowId: active.rowId || "n2o", field: "current" };
  if (!editableFields.includes(active.field)) return { rowId: "n2o", field: "current" };
  return active;
}

function mergeRows(savedRows) {
  return defaultRows.map((row) => {
    const saved = savedRows.find((item) => item.id === row.id);
    return saved ? { ...row, ...pickEditable(saved) } : row;
  });
}

function pickEditable(row) {
  return {
    factor: cleanNumber(row.factor),
    current: cleanNumber(row.current),
    target: cleanNumber(row.target)
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadUndoStack() {
  try {
    const saved = JSON.parse(localStorage.getItem(UNDO_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveUndoStack() {
  localStorage.setItem(UNDO_KEY, JSON.stringify(undoStack.slice(-MAX_UNDO)));
}

function snapshotState() {
  return clone(state);
}

function pushUndo() {
  undoStack.push(snapshotState());
  undoStack = undoStack.slice(-MAX_UNDO);
  saveUndoStack();
}

function restorePrevious() {
  const previous = undoStack.pop();
  if (!previous) return;
  undoStack = undoStack.slice(-MAX_UNDO);
  state = previous;
  saveUndoStack();
  saveState();
  render();
}

function cleanNumber(value) {
  const raw = String(value ?? "");
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rowCalc(row) {
  const hasCurrent = row.current !== "";
  const hasTarget = row.target !== "";
  const hasFactor = row.factor !== "";
  if (!hasCurrent || !hasTarget || !hasFactor) {
    return {
      cm: 0,
      kg: 0,
      hasResult: false
    };
  }
  const cm = numberValue(row.target) - numberValue(row.current);
  const kg = cm * numberValue(row.factor);
  return {
    cm: Number.isFinite(cm) ? cm : 0,
    kg: Number.isFinite(kg) ? kg : 0,
    hasResult: true
  };
}

function formatNumber(value, digits = 1) {
  const fixed = Number(value).toFixed(digits);
  return fixed.replace(/\.0$/, "");
}

function totalKg() {
  return state.rows.reduce((sum, row) => sum + rowCalc(row).kg, 0);
}

function remainingKg() {
  return numberValue(state.netWeight) - totalKg();
}

function activeRow() {
  return state.rows.find((row) => row.id === state.active.rowId) || state.rows[0];
}

function render() {
  const grid = document.getElementById("calcGrid");
  grid.innerHTML = `
    ${state.rows.map(renderRow).join("")}
  `;
  renderSummary();
  renderKeypad();
  renderUndoState();
}

function renderUndoState() {
  const button = document.getElementById("undoAction");
  button.disabled = undoStack.length === 0;
  document.getElementById("settingsAction").classList.toggle("unlocked", !state.factorLocked);
}

function renderSummary() {
  const remaining = remainingKg();
  const remainingClass = remaining < 0 ? "over" : remaining === 0 && state.netWeight !== "" ? "done" : "";
  document.getElementById("summaryPanel").innerHTML = `
    <button class="summary-card editable-summary ${state.active.field === "netWeight" ? "active" : ""}" data-summary-field="netWeight" type="button">
      <span>總淨重 kg</span>
      <strong>${state.netWeight || "輸入"}</strong>
    </button>
    <div class="summary-card">
      <span>已充填 kg</span>
      <strong>${formatNumber(totalKg(), 0)}</strong>
    </div>
    <div class="summary-card remaining ${remainingClass}">
      <span>剩餘 kg</span>
      <strong>${state.netWeight === "" ? "-" : formatNumber(remaining, 0)}</strong>
    </div>
  `;
}

function renderRow(row) {
  const calc = rowCalc(row);
  const active = state.active.rowId === row.id;
  return `
    <article class="tank-card ${active ? "active-card" : ""}">
      <div class="tank-head">
        <div class="tank-name">${row.tank}</div>
        ${editableCell(row, "factor")}
      </div>
      <div class="input-row">
        ${editableCell(row, "current")}
        ${editableCell(row, "target")}
        ${metricCell("cm", calc.hasResult ? calc.cm : null, 1)}
        ${metricCell("kg", calc.hasResult ? calc.kg : null, 0)}
      </div>
    </article>
  `;
}

function metricCell(label, value, digits) {
  const activeResult = value !== null && value !== undefined;
  return `
    <div class="metric-cell metric-${label} ${activeResult ? "has-value" : "empty"}" aria-label="${label} ${activeResult ? formatNumber(value, digits) : "空白"}">
      <span>${activeResult ? formatNumber(value, digits) : label}</span>
    </div>
  `;
}

function editableCell(row, field) {
  const active = state.active.rowId === row.id && state.active.field === field;
  const value = row[field];
  const locked = field === "factor" && state.factorLocked;
  const placeholder = field === "factor" ? "-" : "&nbsp;";
  const hasValue = value !== "";
  return `
    <button class="editable field-${field} ${locked ? "locked" : ""} ${hasValue ? "has-value" : "empty"} ${active ? "active" : ""}" data-row-id="${row.id}" data-field="${field}" type="button" aria-label="${row.tank} ${fieldLabels[field]}${locked ? " 已鎖定" : ""}">
      <span>${hasValue ? value : field === "factor" ? placeholder : compactFieldLabels[field]}</span>
    </button>
  `;
}

function renderKeypad() {
  document.getElementById("keypadGrid").innerHTML = [
    "7",
    "8",
    "9",
    "back",
    "4",
    "5",
    "6",
    "clear",
    "1",
    "2",
    "3",
    "next",
    "0",
    "00",
    ".",
    "done"
  ]
    .map(renderKey)
    .join("");
}

function renderKey(key) {
  const labels = {
    back: "⌫",
    clear: "清除",
    next: "下一格",
    done: "完成"
  };
  return `<button class="key ${key.length > 1 ? "wide-key" : ""}" data-key="${key}" type="button">${labels[key] || key}</button>`;
}

function setActive(rowId, field) {
  if (!editableFields.includes(field)) return;
  if (field === "factor" && state.factorLocked) {
    openSettings();
    return;
  }
  state.active = { rowId, field };
  saveState();
  render();
}

function applyKey(key) {
  if (state.active.field === "netWeight") {
    if (key === "back") {
      pushUndo();
      state.netWeight = state.netWeight.slice(0, -1);
    } else if (key === "clear") {
      pushUndo();
      state.netWeight = "";
    } else if (key === "next" || key === "done") {
      state.active = { rowId: "n2o", field: "current" };
    } else {
      pushUndo();
      state.netWeight = cleanNumber(`${state.netWeight}${key}`);
    }
    saveState();
    render();
    return;
  }

  const row = activeRow();
  const field = state.active.field;
  if (!row || !editableFields.includes(field)) return;

  if (key === "back") {
    pushUndo();
    row[field] = row[field].slice(0, -1);
  } else if (key === "clear") {
    pushUndo();
    row[field] = "";
  } else if (key === "next" || key === "done") {
    moveNext();
    saveState();
    render();
    return;
  } else {
    pushUndo();
    row[field] = cleanNumber(`${row[field]}${key}`);
  }

  saveState();
  render();
}

function moveNext() {
  const fields = state.factorLocked ? normalFields : editableFields;
  const rowIndex = state.rows.findIndex((row) => row.id === state.active.rowId);
  const fieldIndex = fields.indexOf(state.active.field);
  if (fieldIndex < fields.length - 1) {
    state.active.field = fields[fieldIndex + 1];
    return;
  }
  const nextRow = state.rows[(rowIndex + 1) % state.rows.length];
  state.active = { rowId: nextRow.id, field: fields[0] };
}

function resetAll() {
  pushUndo();
  state = {
    netWeight: "",
    factorLocked: state.factorLocked,
    rows: clone(defaultRows).map((row) => ({ ...row, current: "", target: "" })),
    active: { rowId: "n2o", field: "current" }
  };
  saveState();
  render();
}

function openSettings() {
  document.getElementById("factorLockToggle").checked = state.factorLocked;
  document.getElementById("settingsPanel").hidden = false;
}

function closeSettings() {
  document.getElementById("settingsPanel").hidden = true;
}

function setFactorLock(locked) {
  pushUndo();
  state.factorLocked = locked;
  if (locked && state.active.field === "factor") {
    state.active.field = "current";
  }
  saveState();
  render();
}

function restoreDefaultFactors() {
  pushUndo();
  state.rows = state.rows.map((row) => {
    const defaultRow = defaultRows.find((item) => item.id === row.id);
    return defaultRow ? { ...row, factor: defaultRow.factor } : row;
  });
  saveState();
  render();
}

document.getElementById("calcGrid").addEventListener("click", (event) => {
  const cell = event.target.closest("[data-row-id][data-field]");
  if (!cell) return;
  setActive(cell.dataset.rowId, cell.dataset.field);
});

document.getElementById("summaryPanel").addEventListener("click", (event) => {
  const cell = event.target.closest("[data-summary-field]");
  if (!cell) return;
  state.active = { rowId: "", field: cell.dataset.summaryField };
  saveState();
  render();
});

document.getElementById("keypadGrid").addEventListener("click", (event) => {
  const key = event.target.closest("[data-key]");
  if (!key) return;
  applyKey(key.dataset.key);
});

document.getElementById("resetAll").addEventListener("click", resetAll);
document.getElementById("undoAction").addEventListener("click", restorePrevious);
document.getElementById("settingsAction").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", closeSettings);
document.getElementById("settingsPanel").addEventListener("click", (event) => {
  if (event.target.id === "settingsPanel") closeSettings();
});
document.getElementById("factorLockToggle").addEventListener("change", (event) => {
  setFactorLock(event.target.checked);
});
document.getElementById("restoreFactors").addEventListener("click", restoreDefaultFactors);

function setViewportHeight() {
  const height = Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight);
  if (height > 0) {
    document.documentElement.style.setProperty("--viewport-h", `${height}px`);
  }
}

function resetViewport() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function settleAfterRotation() {
  setViewportHeight();
  resetViewport();
  [80, 260, 650].forEach((delay) => {
    window.setTimeout(() => {
      setViewportHeight();
      resetViewport();
    }, delay);
  });
}

function isLandscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

let lastLandscape = isLandscape();

function handleOrientationChange() {
  const previousLandscape = lastLandscape;
  window.setTimeout(() => {
    const currentLandscape = isLandscape();
    lastLandscape = currentLandscape;
    setViewportHeight();
    resetViewport();
    if (previousLandscape && !currentLandscape) {
      window.setTimeout(() => window.location.reload(), 120);
    }
  }, 240);
}

setViewportHeight();
window.addEventListener("resize", settleAfterRotation);
window.addEventListener("orientationchange", handleOrientationChange);
window.visualViewport?.addEventListener("resize", settleAfterRotation);
render();
