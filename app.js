"use strict";

const SUPABASE_URL = "https://ahdbrkiuerbhtfmteobt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PZL56Nw8eE77QZ8c78SuaA_Hpkhy8qE";
const TABLE_NAME = "work_days_public";
const NOTE_TABLE_NAME = "work_notes_public";
const LINK_TABLE_NAME = "quick_links_public";
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

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
);
const currentPage = document.body.dataset.page || "badgeage";

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
  targetMinutes: document.querySelector("#target-minutes"),
  targetLock: document.querySelector("#target-lock"),
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
  noteCount: document.querySelector("#note-count"),
  noteForm: document.querySelector("#note-form"),
  noteInput: document.querySelector("#note-input"),
  noteReminder: document.querySelector("#note-reminder"),
  noteList: document.querySelector("#note-list"),
  linkCount: document.querySelector("#link-count"),
  linkForm: document.querySelector("#link-form"),
  linkLabel: document.querySelector("#link-label"),
  linkUrl: document.querySelector("#link-url"),
  linkCategory: document.querySelector("#link-category"),
  linkList: document.querySelector("#link-list"),
};

let records = {};
let notes = [];
let quickLinks = [];
let selectedDate = readSelectedDate();
let isTargetLocked = true;
let isRemoteReady = false;
let isNoteRemoteReady = false;
let isLinkRemoteReady = false;
let noteErrorMessage = "";
let linkErrorMessage = "";

function todayISO() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function readSelectedDate() {
  const date = new URLSearchParams(window.location.search).get("date");
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
}

function buildPageHref(pageName) {
  const pages = {
    badgeage: "index.html",
    notes: "notes.html",
    links: "liens.html",
    history: "historique.html",
  };
  const pagePath = pages[pageName] || "index.html";
  return `${pagePath}?date=${encodeURIComponent(selectedDate)}`;
}

function syncNavigationLinks() {
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.href = buildPageHref(link.dataset.pageLink);
  });
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

function parseTargetDuration(hoursValue, minutesValue) {
  const hours = Number.parseInt(hoursValue, 10);
  const minutes = Number.parseInt(minutesValue, 10);
  const safeHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 0), 24) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 0), 59) : 0;
  const totalMinutes = safeHours * 60 + safeMinutes;

  if (totalMinutes <= 0) {
    return DEFAULT_TARGET_MINUTES;
  }

  return totalMinutes;
}

function getTargetMinutes(record) {
  const targetMinutes = Number(record.targetMinutes);
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) {
    return DEFAULT_TARGET_MINUTES;
  }

  return Math.round(targetMinutes);
}

function targetMinutesToInputParts(targetMinutes) {
  return {
    hours: String(Math.floor(targetMinutes / 60)),
    minutes: String(targetMinutes % 60),
  };
}

function syncTargetLock() {
  if (!elements.targetHours || !elements.targetMinutes || !elements.targetLock) {
    return;
  }

  elements.targetHours.disabled = isTargetLocked;
  elements.targetMinutes.disabled = isTargetLocked;
  elements.targetLock.classList.toggle("unlocked", !isTargetLocked);
  elements.targetLock.setAttribute(
    "aria-label",
    isTargetLocked ? "Déverrouiller l'objectif" : "Verrouiller l'objectif",
  );
  elements.targetLock.title = isTargetLocked ? "Déverrouiller l'objectif" : "Verrouiller l'objectif";
  elements.targetLock.textContent = isTargetLocked ? "Modifier" : "OK";
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

function normalizeRecord(dateISO, record) {
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

  return cleaned;
}

function recordHasData(record) {
  return (
    FIELDS.some(({ key }) => record[key]) ||
    getTargetMinutes(record) !== DEFAULT_TARGET_MINUTES
  );
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
    return { type: "error", text: info.errors[0] };
  }

  if (!info.hasArrival) {
    return { type: "neutral", text: "Prêt à badger l'arrivée." };
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

function setStatusMessage(text, type = "neutral") {
  if (!elements.statusMessage) {
    return;
  }

  elements.statusMessage.textContent = text;
  elements.statusMessage.className = `status-message ${type === "neutral" ? "" : type}`.trim();
}

function rowTimeToHM(value) {
  return value ? String(value).slice(0, 5) : "";
}

function rowToRecord(row) {
  return normalizeRecord(row.work_date, {
    date: row.work_date,
    targetMinutes: row.target_minutes,
    arrival: rowTimeToHM(row.arrival),
    lunchOut: rowTimeToHM(row.lunch_out),
    lunchIn: rowTimeToHM(row.lunch_in),
    departure: rowTimeToHM(row.departure),
  });
}

function recordToRow(record) {
  return {
    work_date: record.date,
    target_minutes: getTargetMinutes(record),
    arrival: record.arrival || null,
    lunch_out: record.lunchOut || null,
    lunch_in: record.lunchIn || null,
    departure: record.departure || null,
    updated_at: new Date().toISOString(),
  };
}

async function loadRemoteRecords() {
  if (!supabaseClient) {
    setStatusMessage("Supabase n'a pas chargé. Vérifie ta connexion internet.", "error");
    return;
  }

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("work_date,target_minutes,arrival,lunch_out,lunch_in,departure")
    .order("work_date", { ascending: false });

  if (error) {
    setStatusMessage(`Erreur Supabase: ${error.message}`, "error");
    isRemoteReady = false;
    return;
  }

  records = {};
  data.forEach((row) => {
    const record = rowToRecord(row);
    records[record.date] = record;
  });

  isRemoteReady = true;
  render();
}

function rowToNote(row) {
  return {
    id: row.id,
    date: row.note_date,
    text: row.note_text,
    done: Boolean(row.is_done),
    reminderDate: row.reminder_date || "",
    position: Number(row.position) || 0,
  };
}

function rowToLink(row) {
  return {
    id: row.id,
    category: row.category || "Général",
    label: row.label,
    url: row.url,
    position: Number(row.position) || 0,
  };
}

function isReminderVisible(note, dateISO = selectedDate) {
  return Boolean(note.reminderDate && note.reminderDate <= dateISO && !note.done);
}

function getVisibleNotes() {
  return notes
    .filter((note) => note.date === selectedDate || isReminderVisible(note))
    .sort((first, second) => {
      if (first.done !== second.done) {
        return first.done ? 1 : -1;
      }

      if (first.date !== second.date) {
        return first.date.localeCompare(second.date);
      }

      return first.position - second.position;
    });
}

function formatShortDate(dateISO) {
  if (!dateISO) {
    return "";
  }

  const [year, month, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

function createEmptyState(text) {
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function renderNotes() {
  if (!elements.noteCount || !elements.noteList) {
    return;
  }

  const visibleNotes = getVisibleNotes();
  const pendingCount = visibleNotes.filter((note) => !note.done).length;
  elements.noteCount.textContent = pendingCount === 1 ? "1 en cours" : `${pendingCount} en cours`;
  elements.noteList.innerHTML = "";

  if (!isNoteRemoteReady && notes.length === 0) {
    elements.noteList.append(createEmptyState(noteErrorMessage || "Notes en cours de chargement..."));
    return;
  }

  if (visibleNotes.length === 0) {
    elements.noteList.append(createEmptyState("Aucune note pour cette journée."));
    return;
  }

  visibleNotes.forEach((note) => {
    const row = document.createElement("div");
    row.className = `note-row ${note.done ? "done" : ""}`;
    row.dataset.noteId = note.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = note.done;
    checkbox.setAttribute("aria-label", "Cocher la note");

    const text = document.createElement("span");
    text.className = "note-text";
    text.textContent = note.text;

    const meta = document.createElement("span");
    meta.className = `note-meta ${isReminderVisible(note) ? "due" : ""}`;
    if (note.reminderDate) {
      meta.textContent = `Rappel ${formatShortDate(note.reminderDate)}`;
    } else if (note.date !== selectedDate) {
      meta.textContent = `Note ${formatShortDate(note.date)}`;
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "Retirer";

    row.append(checkbox, text, meta, removeButton);
    elements.noteList.append(row);
  });
}

function renderLinks() {
  if (!elements.linkCount || !elements.linkList) {
    return;
  }

  const total = quickLinks.length;
  elements.linkCount.textContent = total === 1 ? "1 lien" : `${total} liens`;
  elements.linkList.innerHTML = "";

  if (!isLinkRemoteReady && quickLinks.length === 0) {
    elements.linkList.append(createEmptyState(linkErrorMessage || "Liens en cours de chargement..."));
    return;
  }

  if (quickLinks.length === 0) {
    elements.linkList.append(createEmptyState("Aucun lien rapide."));
    return;
  }

  const linksByCategory = quickLinks.reduce((groups, link) => {
    const category = link.category || "Général";
    groups.set(category, [...(groups.get(category) || []), link]);
    return groups;
  }, new Map());

  [...linksByCategory.entries()]
    .sort(([firstCategory], [secondCategory]) => firstCategory.localeCompare(secondCategory, "fr"))
    .forEach(([category, links]) => {
      const group = document.createElement("section");
      group.className = "link-group";

      const title = document.createElement("h3");
      title.textContent = category;

      const grid = document.createElement("div");
      grid.className = "link-grid";

      links
        .sort((first, second) => first.position - second.position || first.label.localeCompare(second.label, "fr"))
        .forEach((link) => {
          const card = document.createElement("article");
          card.className = "link-card";
          card.dataset.linkId = link.id;

          const anchor = document.createElement("a");
          anchor.href = link.url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.textContent = link.label;

          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "ghost-button";
          removeButton.textContent = "Retirer";

          const url = document.createElement("span");
          url.className = "link-url";
          url.textContent = link.url;

          card.append(anchor, removeButton, url);
          grid.append(card);
        });

      group.append(title, grid);
      elements.linkList.append(group);
    });
}

async function loadRemoteNotes() {
  if (!supabaseClient) {
    isNoteRemoteReady = false;
    noteErrorMessage = "Supabase n'a pas chargé.";
    renderNotes();
    return;
  }

  const { data, error } = await supabaseClient
    .from(NOTE_TABLE_NAME)
    .select("id,note_date,note_text,is_done,reminder_date,position")
    .order("note_date", { ascending: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    isNoteRemoteReady = false;
    notes = [];
    noteErrorMessage = `Erreur notes Supabase: ${error.message}`;
    renderNotes();
    setStatusMessage(`Erreur notes Supabase: ${error.message}`, "error");
    return;
  }

  isNoteRemoteReady = true;
  noteErrorMessage = "";
  notes = data.map(rowToNote);
  renderNotes();
}

async function loadRemoteLinks() {
  if (!supabaseClient) {
    isLinkRemoteReady = false;
    linkErrorMessage = "Supabase n'a pas chargé.";
    renderLinks();
    return;
  }

  const { data, error } = await supabaseClient
    .from(LINK_TABLE_NAME)
    .select("id,category,label,url,position")
    .order("category", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    isLinkRemoteReady = false;
    quickLinks = [];
    linkErrorMessage = `Erreur liens Supabase: ${error.message}`;
    renderLinks();
    setStatusMessage(`Erreur liens Supabase: ${error.message}`, "error");
    return;
  }

  isLinkRemoteReady = true;
  linkErrorMessage = "";
  quickLinks = data.map(rowToLink);
  renderLinks();
}

async function addNote(text, reminderDate) {
  const cleanText = text.trim();
  if (!cleanText) {
    return;
  }

  if (!isNoteRemoteReady) {
    setStatusMessage("Notes pas encore disponibles. Vérifie le script SQL Supabase.", "warning");
    return;
  }

  const nextPosition =
    notes
      .filter((note) => note.date === selectedDate)
      .reduce((max, note) => Math.max(max, note.position), 0) + 1;

  const { data, error } = await supabaseClient
    .from(NOTE_TABLE_NAME)
    .insert({
      note_date: selectedDate,
      note_text: cleanText,
      is_done: false,
      reminder_date: reminderDate || null,
      position: nextPosition,
      updated_at: new Date().toISOString(),
    })
    .select("id,note_date,note_text,is_done,reminder_date,position")
    .single();

  if (error) {
    setStatusMessage(`Ajout note impossible: ${error.message}`, "error");
    return;
  }

  notes.push(rowToNote(data));
  elements.noteInput.value = "";
  elements.noteReminder.value = "";
  renderNotes();
}

async function updateNoteDone(noteId, done) {
  const note = notes.find((item) => item.id === noteId);
  if (!note || !isNoteRemoteReady) {
    return;
  }

  note.done = done;
  renderNotes();

  const { error } = await supabaseClient
    .from(NOTE_TABLE_NAME)
    .update({ is_done: done, updated_at: new Date().toISOString() })
    .eq("id", noteId);

  if (error) {
    note.done = !done;
    renderNotes();
    setStatusMessage(`Mise à jour note impossible: ${error.message}`, "error");
  }
}

async function removeNote(noteId) {
  const existingNotes = [...notes];
  notes = notes.filter((note) => note.id !== noteId);
  renderNotes();

  const { error } = await supabaseClient
    .from(NOTE_TABLE_NAME)
    .delete()
    .eq("id", noteId);

  if (error) {
    notes = existingNotes;
    renderNotes();
    setStatusMessage(`Suppression note impossible: ${error.message}`, "error");
  }
}

function normalizeUrl(value) {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return "";
  }

  if (/^\\\\/.test(cleanValue)) {
    return `file:${cleanValue.replaceAll("\\", "/")}`;
  }

  if (/^(https?:|mailto:|file:)/i.test(cleanValue)) {
    return cleanValue;
  }

  return `https://${cleanValue}`;
}

async function addLink(label, url, category) {
  const cleanLabel = label.trim();
  const cleanUrl = normalizeUrl(url);
  const cleanCategory = category.trim() || "Général";
  if (!cleanLabel || !cleanUrl) {
    return;
  }

  if (!isLinkRemoteReady) {
    setStatusMessage("Liens pas encore disponibles. Vérifie le script SQL Supabase.", "warning");
    return;
  }

  const nextPosition =
    quickLinks
      .filter((link) => link.category === cleanCategory)
      .reduce((max, link) => Math.max(max, link.position), 0) + 1;

  const { data, error } = await supabaseClient
    .from(LINK_TABLE_NAME)
    .insert({
      label: cleanLabel,
      url: cleanUrl,
      category: cleanCategory,
      position: nextPosition,
      updated_at: new Date().toISOString(),
    })
    .select("id,category,label,url,position")
    .single();

  if (error) {
    setStatusMessage(`Ajout lien impossible: ${error.message}`, "error");
    return;
  }

  quickLinks.push(rowToLink(data));
  elements.linkLabel.value = "";
  elements.linkUrl.value = "";
  elements.linkCategory.value = "";
  renderLinks();
}

async function removeLink(linkId) {
  const existingLinks = [...quickLinks];
  quickLinks = quickLinks.filter((link) => link.id !== linkId);
  renderLinks();

  const { error } = await supabaseClient
    .from(LINK_TABLE_NAME)
    .delete()
    .eq("id", linkId);

  if (error) {
    quickLinks = existingLinks;
    renderLinks();
    setStatusMessage(`Suppression lien impossible: ${error.message}`, "error");
  }
}

async function saveRemoteRecord(record) {
  if (!isRemoteReady) {
    return;
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .upsert(recordToRow(record), { onConflict: "work_date" });

  if (error) {
    setStatusMessage(`Sauvegarde Supabase impossible: ${error.message}`, "error");
  }
}

async function deleteRemoteRecord(dateISO) {
  if (!isRemoteReady) {
    return;
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .delete()
    .eq("work_date", dateISO);

  if (error) {
    setStatusMessage(`Suppression Supabase impossible: ${error.message}`, "error");
  }
}

function render() {
  syncNavigationLinks();
  if (elements.dateInput) {
    elements.dateInput.value = selectedDate;
  }

  if (currentPage === "notes") {
    renderNotes();
    return;
  }

  if (currentPage === "links") {
    renderLinks();
    return;
  }

  if (currentPage === "history") {
    renderHistory();
    return;
  }

  if (!elements.liveClock) {
    return;
  }

  const record = getRecord();
  const info = calculateDay(record, selectedDate);
  const currentField = getCurrentField(record);

  elements.liveClock.textContent = nowHM();
  const targetInputParts = targetMinutesToInputParts(info.targetMinutes);
  elements.targetHours.value = targetInputParts.hours;
  elements.targetMinutes.value = targetInputParts.minutes;
  syncTargetLock();
  elements.nextPunch.textContent = currentField ? currentField.label : "Journée complète";
  elements.quickPunch.disabled = !currentField || !isRemoteReady;
  elements.quickPunch.textContent = currentField
    ? QUICK_BUTTON_LABELS[currentField.key]
    : "Journée complète";

  FIELDS.forEach(({ key }) => {
    if (fieldInputs[key]) {
      fieldInputs[key].value = record[key] || "";
    }
    const row = document.querySelector(`[data-field-row="${key}"]`);
    if (row) {
      row.classList.toggle("complete", Boolean(record[key]));
      row.classList.toggle("current", currentField?.key === key);
    }
  });

  elements.workedTime.textContent = formatDuration(info.workedMinutes, { empty: "0h00" });
  elements.remainingTime.textContent =
    info.remainingMinutes == null ? formatDuration(info.targetMinutes) : formatDuration(Math.max(0, info.remainingMinutes));
  elements.lunchTime.textContent = formatDuration(info.lunchMinutes);
  elements.targetTime.textContent = formatClockWithDay(info.targetEnd);

  const progress = info.workedMinutes == null ? 0 : Math.min(140, Math.max(0, (info.workedMinutes / info.targetMinutes) * 100));
  elements.progressBar.style.width = `${Math.min(progress, 100)}%`;
  elements.progressBar.classList.toggle("over", progress > 100);

  const status = isRemoteReady
    ? buildStatus(record, info)
    : { type: "warning", text: "Connexion Supabase en cours..." };
  setStatusMessage(status.text, status.type);
}

function renderHistory() {
  if (!elements.historyBody) {
    return;
  }

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

async function setRecord(dateISO, record) {
  const cleaned = normalizeRecord(dateISO, record);

  if (recordHasData(cleaned)) {
    records[dateISO] = cleaned;
    render();
    await saveRemoteRecord(cleaned);
  } else {
    delete records[dateISO];
    render();
    await deleteRemoteRecord(dateISO);
  }
}

async function setField(key, value) {
  const record = { ...getRecord(), [key]: value };
  await setRecord(selectedDate, record);
}

async function setTargetDuration() {
  const record = {
    ...getRecord(),
    targetMinutes: parseTargetDuration(elements.targetHours.value, elements.targetMinutes.value),
  };
  await setRecord(selectedDate, record);
}

function toggleTargetLock() {
  isTargetLocked = !isTargetLocked;
  syncTargetLock();

  if (!isTargetLocked) {
    elements.targetHours.focus();
  }
}

function punchField(key) {
  setField(key, nowHM());
}

function quickPunch() {
  const record = getRecord();
  const currentField = getCurrentField(record);
  if (!currentField || !isRemoteReady) {
    return;
  }

  punchField(currentField.key);
}

async function undoLastPunch() {
  const record = { ...getRecord() };
  const lastField = [...FIELDS].reverse().find(({ key }) => record[key]);
  if (!lastField) {
    return;
  }

  delete record[lastField.key];
  await setRecord(selectedDate, record);
}

async function clearDay() {
  const record = getRecord();
  if (!recordHasData(record)) {
    return;
  }

  if (confirm("Effacer toutes les heures de cette journée ?")) {
    delete records[selectedDate];
    render();
    await deleteRemoteRecord(selectedDate);
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
  if (elements.noteForm) {
    elements.noteForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addNote(elements.noteInput.value, elements.noteReminder.value);
    });
  }

  if (elements.noteList) {
    elements.noteList.addEventListener("click", (event) => {
      const row = event.target.closest(".note-row");
      if (!row) {
        return;
      }

      if (event.target.matches('input[type="checkbox"]')) {
        updateNoteDone(row.dataset.noteId, event.target.checked);
        return;
      }

      if (event.target.matches("button")) {
        removeNote(row.dataset.noteId);
      }
    });
  }

  if (elements.linkForm) {
    elements.linkForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addLink(elements.linkLabel.value, elements.linkUrl.value, elements.linkCategory.value);
    });
  }

  if (elements.linkList) {
    elements.linkList.addEventListener("click", (event) => {
      const row = event.target.closest(".link-card");
      if (!row || !event.target.matches("button")) {
        return;
      }

      removeLink(row.dataset.linkId);
    });
  }

  if (elements.dateInput) {
    elements.dateInput.addEventListener("change", (event) => {
      selectedDate = event.target.value || todayISO();
      isTargetLocked = true;
      render();
    });
  }

  if (elements.todayButton) {
    elements.todayButton.addEventListener("click", () => {
      selectedDate = todayISO();
      isTargetLocked = true;
      render();
    });
  }

  elements.quickPunch?.addEventListener("click", quickPunch);
  elements.targetHours?.addEventListener("change", setTargetDuration);
  elements.targetMinutes?.addEventListener("change", setTargetDuration);
  elements.targetLock?.addEventListener("click", toggleTargetLock);
  elements.undoButton?.addEventListener("click", undoLastPunch);
  elements.clearButton?.addEventListener("click", clearDay);
  elements.exportButton?.addEventListener("click", exportCsv);

  FIELDS.forEach(({ key }) => {
    fieldInputs[key]?.addEventListener("input", (event) => {
      setField(key, event.target.value);
    });
  });

  document.querySelectorAll("[data-punch]").forEach((button) => {
    button.addEventListener("click", () => {
      punchField(button.dataset.punch);
    });
  });

  if (elements.historyBody) {
    elements.historyBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-date]");
      if (!row) {
        return;
      }

      selectedDate = row.dataset.date;
      isTargetLocked = true;
      window.location.href = buildPageHref("badgeage");
    });
  }
}

bindEvents();
render();
if (currentPage === "badgeage" || currentPage === "history") {
  loadRemoteRecords();
}
if (currentPage === "notes") {
  loadRemoteNotes();
}
if (currentPage === "links") {
  loadRemoteLinks();
}
setInterval(() => {
  if (currentPage === "badgeage") {
    render();
  }
}, 30_000);
