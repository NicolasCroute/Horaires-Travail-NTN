"use strict";

const STORAGE_KEY = "horaires-travail.records.v1";
const DEFAULT_TARGET_MINUTES = 8 * 60;
const MIN_LUNCH_MINUTES = 45;

const FIELDS = [
  { key: "arrival", label: "Arrivée" },
  { key: "lunchOut", label: "Départ repas" },
  { key: "lunchIn", label: "Retour repas" },
  { key: "departure", label: "Départ boulot" },
];

const QUICK_BUTTON_LABELS = {
  arrival: "Badger l'arrivée",
  lunchOut: "Badger le départ repas",
  lunchIn: "Badger le retour repas",
  departure: "Badger le départ boulot",
};

const fieldInputs = Object.fromEntries(
  FIELDS.map((field) => [field.key, document.querySelector(`[data-field="${field.key}"]`)]),
);

const elements = {
  dateInput: document.querySelector("#work-date"),
  todayButton: document.querySelector("#today-button"),
  quickPunch: document.querySelector("#quick-punch"),
  liveClock: document.querySelector("#live-clock"),
  nextPunch: document.querySelector("#next-punch"),
  targetHours: document.querySelector("#target-hours"),
  workedTime: document.querySelector("#worked-time"),
  remainingTime: document.querySelector("#remaining-time"),
  lunchTime: document.querySelector("#lunch-time"),
  targetTime: document.querySelector("#target-time"),
  progressBar: document.querySelector("#progress-bar"),
  statusMessage: document.querySelector("#status-message"),
  undoButton: document.querySelector("#undo-button"),
  clearButton: document.querySelector("#clear-button"),
  exportButton: document.querySelector("#export-button"),
  historyBody: document.querySelector("#history-body"),
};

let records = loadRecords();
let selectedDate = todayISO();

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function todayISO() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function nowHM() {
  return minutesToClock(nowMinutes());
}

function parseHM(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesToClock(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatClockWithDay(totalMinutes) {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) {
    return "--:--";
  }

  const label = minutesToClock(totalMinutes);
  if (totalMinutes >= 1440) {
    return `${label} demain`;
  }

  if (totalMinutes < 0) {
    return `${label} veille`;
  }

  return label;
}

function formatDuration(totalMinutes, options = {}) {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) {
    return options.empty || "--";
  }

  const sign = totalMinutes < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatDelta(totalMinutes) {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) {
    return "--";
  }

  if (Math.round(totalMinutes) === 0) {
    return "Pile";
  }

  return `${totalMinutes > 0 ? "+" : "-"}${formatDuration(Math.abs(totalMinutes))}`;
}

function parseTargetHours(value) {
  const hours = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_TARGET_MINUTES;
  }

  return Math.round(hours * 60);
}

function getTargetMinutes(record) {
  const targetMinutes = Number(record.targetMinutes);
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) {
    return DEFAULT_TARGET_MINUTES;
  }

  return Math.round(targetMinutes);
}

function targetMinutesToInputValue(targetMinutes) {
  return Number((targetMinutes / 60).toFixed(2)).toString();
}

function dateLabel(dateISO) {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getRecord(dateISO = selectedDate) {
  return records[dateISO] || { date: dateISO };
}

function setRecord(dateISO, record) {
  const cleaned = { date: dateISO };
  const targetMinutes = getTargetMinutes(record);

  if (targetMinutes !== DEFAULT_TARGET_MINUTES) {
    cleaned.targetMinutes = targetMinutes;
  }

  FIELDS.forEach(({ key }) => {
    if (record[key]) {
      cleaned[key] = record[key];
    }
  });

  const hasPunch = FIELDS.some(({ key }) => cleaned[key]);
  const hasCustomTarget = cleaned.targetMinutes != null;
  if (hasPunch || hasCustomTarget) {
    records[dateISO] = cleaned;
  } else {
    delete records[dateISO];
  }

  saveRecords();
}

function getCurrentField(record) {
  return FIELDS.find(({ key }) => !record[key]);
}

function calculateDay(record, dateISO) {
  const values = Object.fromEntries(FIELDS.map(({ key }) => [key, parseHM(record[key])]));
  const targetMinutes = getTargetMinutes(record);
  const errors = [];
  const warnings = [];
  const isToday = dateISO === todayISO();
  const currentMinutes = isToday ? nowMinutes() : null;

  let previous = null;
  for (const { key, label } of FIELDS) {
    const value = values[key];
    if (value == null) {
      continue;
    }

    if (previous && value < previous.value) {
      errors.push(`${label} doit être après ${previous.label.toLowerCase()}.`);
    }
    previous = { label, value };
  }

  const hasArrival = values.arrival != null;
  const hasLunchOut = values.lunchOut != null;
  const hasLunchIn = values.lunchIn != null;
  const hasDeparture = values.departure != null;
  const canCalculate = hasArrival && errors.length === 0;

  let lunchMinutes = null;
  if (hasLunchOut && hasLunchIn) {
    lunchMinutes = values.lunchIn - values.lunchOut;
    if (lunchMinutes < MIN_LUNCH_MINUTES) {
      warnings.push(`Pause midi trop courte: encore ${formatDuration(MIN_LUNCH_MINUTES - lunchMinutes)} à prévoir.`);
    }
  } else if (hasLunchOut && !hasLunchIn) {
    const liveLunch = currentMinutes == null ? null : Math.max(0, currentMinutes - values.lunchOut);
    lunchMinutes = liveLunch;
    if (liveLunch != null && liveLunch < MIN_LUNCH_MINUTES) {
      warnings.push(`Pause midi en cours: minimum ${formatDuration(MIN_LUNCH_MINUTES)}.`);
    }
  } else if (hasDeparture) {
    warnings.push("Pause midi non renseignée.");
  }

  let workedMinutes = 0;
  if (canCalculate) {
    if (hasLunchOut) {
      workedMinutes += values.lunchOut - values.arrival;
    } else {
      const fallbackEnd = hasDeparture ? values.departure : currentMinutes;
      if (fallbackEnd != null && fallbackEnd >= values.arrival) {
        workedMinutes += fallbackEnd - values.arrival;
      }
    }

    if (hasLunchIn) {
      const afternoonEnd = hasDeparture ? values.departure : currentMinutes;
      if (afternoonEnd != null && afternoonEnd >= values.lunchIn) {
        workedMinutes += afternoonEnd - values.lunchIn;
      }
    }

    workedMinutes = Math.max(0, workedMinutes);
  } else {
    workedMinutes = null;
  }

  let targetEnd = null;
  if (canCalculate) {
    if (!hasLunchOut) {
      targetEnd = values.arrival + targetMinutes + MIN_LUNCH_MINUTES;
    } else if (!hasLunchIn) {
      const morningWorked = values.lunchOut - values.arrival;
      const effectiveReturn = Math.max(
        values.lunchOut + MIN_LUNCH_MINUTES,
        currentMinutes == null ? values.lunchOut + MIN_LUNCH_MINUTES : currentMinutes,
      );
      targetEnd = effectiveReturn + Math.max(0, targetMinutes - morningWorked);
    } else {
      const morningWorked = values.lunchOut - values.arrival;
      targetEnd = values.lunchIn + Math.max(0, targetMinutes - morningWorked);
    }
  }

  const remainingMinutes = workedMinutes == null ? null : targetMinutes - workedMinutes;
  const deltaMinutes = hasDeparture && workedMinutes != null ? workedMinutes - targetMinutes : null;

  return {
    errors,
    warnings,
    targetMinutes,
    workedMinutes,
    remainingMinutes,
    lunchMinutes,
    targetEnd,
    deltaMinutes,
    hasArrival,
    hasDeparture,
    isToday,
  };
}

function buildStatus(record, info) {
  if (info.errors.length > 0) {
    return {
      type: "error",
      text: info.errors[0],
    };
  }

  if (!info.hasArrival) {
    return {
      type: "neutral",
      text: "Prêt à badger l'arrivée.",
    };
  }

  if (info.hasDeparture && info.deltaMinutes != null) {
    const lunchWarning = info.warnings.length > 0 ? `${info.warnings[0]} ` : "";

    if (Math.round(info.deltaMinutes) === 0) {
      return {
        type: lunchWarning ? "warning" : "success",
        text: `${lunchWarning}Journée pile à ${formatDuration(info.targetMinutes)}.`,
      };
    }

    const direction = info.deltaMinutes > 0 ? "en plus" : "en moins";
    return {
      type: info.deltaMinutes > 0 ? "warning" : "error",
      text: `${lunchWarning}Journée terminée avec ${formatDuration(Math.abs(info.deltaMinutes))} ${direction}.`,
    };
  }

  if (info.warnings.length > 0) {
    return {
      type: "warning",
      text: `${info.warnings[0]} Départ conseillé: ${formatClockWithDay(info.targetEnd)}.`,
    };
  }

  const current = getCurrentField(record);
  if (current?.key === "lunchIn") {
    return {
      type: "neutral",
      text: `Pause en cours. Départ conseillé: ${formatClockWithDay(info.targetEnd)}.`,
    };
  }

  if (info.remainingMinutes <= 0) {
    const surplus = Math.abs(info.remainingMinutes);
    return {
      type: "success",
      text:
        Math.round(surplus) === 0
          ? `Tu es pile à ${formatDuration(info.targetMinutes)}. Départ conseillé: ${formatClockWithDay(info.targetEnd)}.`
          : `Objectif atteint depuis ${formatClockWithDay(info.targetEnd)}. Écart actuel: +${formatDuration(surplus)}.`,
    };
  }

  return {
    type: "neutral",
    text: `Départ conseillé: ${formatClockWithDay(info.targetEnd)}.`,
  };
}

function render() {
  const record = getRecord();
  const info = calculateDay(record, selectedDate);
  const currentField = getCurrentField(record);

  elements.dateInput.value = selectedDate;
  elements.liveClock.textContent = nowHM();
  elements.targetHours.value = targetMinutesToInputValue(info.targetMinutes);
  elements.nextPunch.textContent = currentField ? currentField.label : "Journée complète";
  elements.quickPunch.disabled = !currentField;
  elements.quickPunch.textContent = currentField
    ? QUICK_BUTTON_LABELS[currentField.key]
    : "Journée complète";

  FIELDS.forEach(({ key }) => {
    fieldInputs[key].value = record[key] || "";
    const row = document.querySelector(`[data-field-row="${key}"]`);
    row.classList.toggle("complete", Boolean(record[key]));
    row.classList.toggle("current", currentField?.key === key);
  });

  elements.workedTime.textContent = formatDuration(info.workedMinutes, { empty: "0h00" });
  elements.remainingTime.textContent =
    info.remainingMinutes == null ? formatDuration(info.targetMinutes) : formatDuration(Math.max(0, info.remainingMinutes));
  elements.lunchTime.textContent = formatDuration(info.lunchMinutes);
  elements.targetTime.textContent = formatClockWithDay(info.targetEnd);

  const progress = info.workedMinutes == null ? 0 : Math.min(140, Math.max(0, (info.workedMinutes / info.targetMinutes) * 100));
  elements.progressBar.style.width = `${Math.min(progress, 100)}%`;
  elements.progressBar.classList.toggle("over", progress > 100);

  const status = buildStatus(record, info);
  elements.statusMessage.textContent = status.text;
  elements.statusMessage.className = `status-message ${status.type === "neutral" ? "" : status.type}`.trim();

  renderHistory();
}

function renderHistory() {
  const sortedDates = Object.keys(records).sort().reverse();
  elements.historyBody.innerHTML = "";

  if (sortedDates.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    row.innerHTML = `<td colspan="8">Aucune journée enregistrée.</td>`;
    elements.historyBody.append(row);
    return;
  }

  sortedDates.forEach((dateISO) => {
    const record = getRecord(dateISO);
    const info = calculateDay(record, dateISO);
    const row = document.createElement("tr");
    row.dataset.date = dateISO;

    const deltaClass =
      info.deltaMinutes == null
        ? ""
        : Math.round(info.deltaMinutes) === 0
          ? "delta-ok"
          : info.deltaMinutes > 0
            ? "delta-positive"
            : "delta-negative";

    row.innerHTML = `
      <td>${dateLabel(dateISO)}</td>
      <td>${record.arrival || "--"}</td>
      <td>${record.lunchOut || "--"}</td>
      <td>${record.lunchIn || "--"}</td>
      <td>${record.departure || "--"}</td>
      <td>${formatDuration(info.targetMinutes)}</td>
      <td>${formatDuration(info.workedMinutes, { empty: "--" })}</td>
      <td class="${deltaClass}">${formatDelta(info.deltaMinutes)}</td>
    `;
    elements.historyBody.append(row);
  });
}

function setField(key, value) {
  const record = { ...getRecord(), [key]: value };
  setRecord(selectedDate, record);
  render();
}

function setTargetHours(value) {
  const record = { ...getRecord(), targetMinutes: parseTargetHours(value) };
  setRecord(selectedDate, record);
  render();
}

function punchField(key) {
  setField(key, nowHM());
}

function quickPunch() {
  const record = getRecord();
  const currentField = getCurrentField(record);
  if (!currentField) {
    return;
  }

  punchField(currentField.key);
}

function undoLastPunch() {
  const record = { ...getRecord() };
  const lastField = [...FIELDS].reverse().find(({ key }) => record[key]);
  if (!lastField) {
    return;
  }

  delete record[lastField.key];
  setRecord(selectedDate, record);
  render();
}

function clearDay() {
  const record = getRecord();
  const hasData = FIELDS.some(({ key }) => record[key]) || getTargetMinutes(record) !== DEFAULT_TARGET_MINUTES;
  if (!hasData) {
    return;
  }

  if (confirm("Effacer toutes les heures de cette journée ?")) {
    delete records[selectedDate];
    saveRecords();
    render();
  }
}

function exportCsv() {
  const sortedDates = Object.keys(records).sort();
  const header = ["Date", "Arrivée", "Départ repas", "Retour repas", "Départ boulot", "Objectif", "Travaillé", "Écart"];
  const lines = [header.join(";")];

  sortedDates.forEach((dateISO) => {
    const record = getRecord(dateISO);
    const info = calculateDay(record, dateISO);
    lines.push(
      [
        dateISO,
        record.arrival || "",
        record.lunchOut || "",
        record.lunchIn || "",
        record.departure || "",
        formatDuration(info.targetMinutes),
        formatDuration(info.workedMinutes, { empty: "" }),
        formatDelta(info.deltaMinutes).replace("Pile", "0h00"),
      ].join(";"),
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `horaires-travail-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  elements.dateInput.addEventListener("change", (event) => {
    selectedDate = event.target.value || todayISO();
    render();
  });

  elements.todayButton.addEventListener("click", () => {
    selectedDate = todayISO();
    render();
  });

  elements.quickPunch.addEventListener("click", quickPunch);
  elements.targetHours.addEventListener("change", (event) => {
    setTargetHours(event.target.value);
  });
  elements.undoButton.addEventListener("click", undoLastPunch);
  elements.clearButton.addEventListener("click", clearDay);
  elements.exportButton.addEventListener("click", exportCsv);

  FIELDS.forEach(({ key }) => {
    fieldInputs[key].addEventListener("input", (event) => {
      setField(key, event.target.value);
    });
  });

  document.querySelectorAll("[data-punch]").forEach((button) => {
    button.addEventListener("click", () => {
      punchField(button.dataset.punch);
    });
  });

  elements.historyBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-date]");
    if (!row) {
      return;
    }

    selectedDate = row.dataset.date;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

bindEvents();
render();
setInterval(render, 30_000);
