import { DATA_ROOT, LAYER_GROUPS } from "./config.js";

const BRAZIL_BOUNDS = [
  [-34.8, -74.2],
  [5.5, -32.2],
];
const THEME_STORAGE_KEY = "webmap-theme";

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true,
  minZoom: 3,
  maxZoom: 17,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 180,
  wheelDebounceTime: 90,
}).fitBounds(BRAZIL_BOUNDS, {
  paddingTopLeft: [20, 20],
  paddingBottomRight: [20, 20],
  maxZoom: 5.5,
});

L.control.zoom({ position: "bottomleft" }).addTo(map);

function recenterMapToDefault() {
  map.fitBounds(BRAZIL_BOUNDS, {
    paddingTopLeft: [20, 20],
    paddingBottomRight: [20, 20],
    maxZoom: 5.5,
  });
}

function addRecenterControlButton() {
  const zoomControl = document.querySelector(".leaflet-control-zoom");
  if (!zoomControl) {
    return;
  }

  if (zoomControl.querySelector(".leaflet-control-recenter")) {
    return;
  }

  const button = document.createElement("a");
  button.className = "leaflet-control-zoom-in leaflet-control-recenter";
  button.href = "#";
  button.role = "button";
  button.setAttribute("aria-label", "Re-center map");
  button.setAttribute("title", "Re-center");
  button.textContent = "RE-CENTER";

  button.addEventListener("click", (event) => {
    event.preventDefault();
    recenterMapToDefault();
  });

  zoomControl.appendChild(button);
}

addRecenterControlButton();

const lightTileLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 20,
});

const darkTileLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 20,
});

const mapShellEl = document.getElementById("map-shell");
const mapUiLeftEl = document.getElementById("map-ui-left");
const mapUiRightEl = document.getElementById("map-ui-right");
const themeToggleEl = document.getElementById("theme-toggle");
const mapTitleCardEl = document.getElementById("map-title-card");
const statusPanelEl = document.getElementById("status-panel");
const statusListEl = document.getElementById("status-list");
const loadingOverlayEl = document.getElementById("loading-overlay");
const SUBSTATION_GROUP_IDS = new Set(["substations-operation", "substations-planned"]);
const TRANSMISSION_GROUP_IDS = new Set(["transmission-operation", "transmission-planned"]);
const ISOLATED_SYSTEMS_GROUP_ID = "regions-isolated-systems";
const VOLTAGE_GROUP_IDS = new Set([...SUBSTATION_GROUP_IDS, ...TRANSMISSION_GROUP_IDS]);
const LEFT_SECTIONS = new Set(["Substations", "Transmission lines"]);
const STATUS_SUBGROUP_SECTIONS = new Set(["Substations", "Transmission lines", "Power plants"]);
const FLOW_ARROW_SECTION = "Transmission lines";
const COLLAPSIBLE_SECTIONS = new Set([
  "Substations",
  "Transmission lines",
  "Regions",
  "Power plants",
]);
const VOLTAGE_PALETTE = [
  "#1d4ed8",
  "#0ea5e9",
  "#14b8a6",
  "#10b981",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#e11d48",
  "#db2777",
  "#a855f7",
  "#7c3aed",
  "#4f46e5",
  "#0f766e",
  "#166534",
  "#b45309",
];
const CATEGORY_PALETTE = [
  "#e76f51",
  "#2a9d8f",
  "#e9c46a",
  "#f4a261",
  "#457b9d",
  "#9d4edd",
  "#ef476f",
  "#06d6a0",
];

function setLoadingOverlayVisible(visible) {
  if (!loadingOverlayEl) {
    return;
  }

  const show = Boolean(visible);
  loadingOverlayEl.classList.toggle("is-hidden", !show);
  loadingOverlayEl.setAttribute("aria-hidden", String(!show));
}

function initializeCountrySwitcherNavigation() {
  const switchLinks = document.querySelectorAll("#country-switcher a.country-switcher-btn");
  for (const link of switchLinks) {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || link.classList.contains("is-active")) {
        return;
      }

      event.preventDefault();
      setLoadingOverlayVisible(true);
      window.setTimeout(() => {
        window.location.href = href;
      }, 120);
    });
  }
}
const DEFAULT_FIELD_UNITS = {
  Tensao: "kV",
  potencia: "kW",
  Potencia: "kW",
  demanda: "MW",
  carga: "MW",
  Extensao: "km",
  Shape_STLe: "km",
};
const GLOBAL_FIELD_ALIASES = {
  NOME: "Name",
  Nome: "Name",
  propiet: "Proprietary",
  Propriet: "Proprietary",
  propriet: "Proprietary",
  RIO: "River",
  Rio: "River",
  Regiao: "Region",
  "Região": "Region",
  Cidade: "City",
  Tipo: "Type",
  Tensao: "Voltage",
  Extensao: "Length",
  Ano_Opera: "Op Year",
  potencia: "Power",
  Potencia: "Power",
  ini_oper: "Ini Oper Time",
};
const POPUP_FIELDS_TO_HIDE = new Set([
  "source_file",
  "Classecap",
  "Caprocmi",
  "Cpanhm3d",
  "Cphidrm3d",
  "ceg",
  "created_us",
  "created_da",
  "last_edite",
  "last_edi_1",
  "CD_MUN",
  "Cd Mun",
  "cd_mun",
  "Longitude",
  "Latitude",
  "longitude",
  "latitude",
  "Cnpj",
  "Materiapri",
  "Situacao",
  "Autorizaca",
  "Iniciooper",
  "Observacao",
  "Shape_STLe",
  "Shape Stle",
  "shape_stle",
  "UF",
  "uf",
  "Program",
  "programa",
  "Previsao",
  "previsao",
  "Previsaopu",
  "previsaopu",
  "Capm3dia",
  "capm3dia",
  "Capm3ano",
  "capm3ano",
  "Autanp",
  "autanp",
  "Selobsoc",
  "selobsoc",
]);
const POPUP_FIELDS_TO_HIDE_NORMALIZED = new Set(
  [...POPUP_FIELDS_TO_HIDE].map((key) => normalizePopupKey(key))
);

const runtime = new Map();
const sectionCards = new Map();
let activeBaseLayer = null;
let activeHoverPopupLayer = null;
let flowArrowsEnabled = false;
let flowToggleButton = null;
let generationShareToggleButton = null;
let generationShareCard = null;
let generationShareResizeObserver = null;

const GENERATION_SHARE_CARD_ID = "section-generation-share";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function storeCardRelativePosition(card) {
  if (!card || !mapShellEl || !card.classList.contains("is-floating")) {
    return;
  }

  const shellRect = mapShellEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const left = Number.parseFloat(card.style.left);
  const top = Number.parseFloat(card.style.top);
  const resolvedLeft = Number.isFinite(left) ? left : cardRect.left - shellRect.left;
  const resolvedTop = Number.isFinite(top) ? top : cardRect.top - shellRect.top;
  const maxLeft = Math.max(0, shellRect.width - cardRect.width);
  const maxTop = Math.max(0, shellRect.height - cardRect.height);

  card.dataset.floatLeftRatio = String(maxLeft > 0 ? resolvedLeft / maxLeft : 0);
  card.dataset.floatTopRatio = String(maxTop > 0 ? resolvedTop / maxTop : 0);
}

function clampCardPositionToShell(card) {
  if (!card || !mapShellEl || !card.classList.contains("is-floating")) {
    return;
  }

  const shellRect = mapShellEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const currentLeft = Number.parseFloat(card.style.left);
  const currentTop = Number.parseFloat(card.style.top);
  const maxLeft = Math.max(0, shellRect.width - cardRect.width);
  const maxTop = Math.max(0, shellRect.height - cardRect.height);
  const leftRatio = Number.parseFloat(card.dataset.floatLeftRatio);
  const topRatio = Number.parseFloat(card.dataset.floatTopRatio);
  const fallbackLeft = Number.isFinite(currentLeft) ? currentLeft : cardRect.left - shellRect.left;
  const fallbackTop = Number.isFinite(currentTop) ? currentTop : cardRect.top - shellRect.top;
  const nextLeft = Number.isFinite(leftRatio) ? leftRatio * maxLeft : fallbackLeft;
  const nextTop = Number.isFinite(topRatio) ? topRatio * maxTop : fallbackTop;

  card.style.left = `${clamp(nextLeft, 0, maxLeft)}px`;
  card.style.top = `${clamp(nextTop, 0, maxTop)}px`;
  storeCardRelativePosition(card);
}

function refreshResponsiveCardLayout() {
  map.invalidateSize(false);

  const floatingCards = mapShellEl?.querySelectorAll(".draggable-card.is-floating, .section-card.is-floating");
  floatingCards?.forEach((card) => clampCardPositionToShell(card));
}

function getInitialTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setActiveBaseLayer(theme) {
  const targetLayer = theme === "dark" ? darkTileLayer : lightTileLayer;

  if (activeBaseLayer === targetLayer) {
    return;
  }

  if (activeBaseLayer) {
    map.removeLayer(activeBaseLayer);
  }

  activeBaseLayer = targetLayer;
  activeBaseLayer.addTo(map);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  setActiveBaseLayer(theme);

  if (!themeToggleEl) {
    return;
  }

  if (theme === "dark") {
    themeToggleEl.setAttribute("aria-label", "Switch to light mode");
    themeToggleEl.setAttribute("title", "Switch to light mode");
    themeToggleEl.setAttribute("aria-pressed", "true");
  } else {
    themeToggleEl.setAttribute("aria-label", "Switch to dark mode");
    themeToggleEl.setAttribute("title", "Switch to dark mode");
    themeToggleEl.setAttribute("aria-pressed", "false");
  }
}

function initializeThemeToggle() {
  const theme = getInitialTheme();
  applyTheme(theme);

  if (!themeToggleEl) {
    return;
  }

  themeToggleEl.addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  });
}

function initializeStatusPanelToggle() {
  if (!statusPanelEl) {
    return;
  }

  const heading = statusPanelEl.querySelector("h2");
  const statusList = statusPanelEl.querySelector("#status-list");
  if (!(heading instanceof HTMLElement) || !(statusList instanceof HTMLElement) || statusPanelEl.querySelector(".section-toggle-btn")) {
    return;
  }

  let body = statusPanelEl.querySelector(".section-card-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "section-card-body";
    statusList.parentNode?.insertBefore(body, statusList);
    body.appendChild(statusList);
  }

  const header = document.createElement("div");
  header.className = "section-card-header";
  heading.parentNode?.insertBefore(header, heading);
  header.appendChild(heading);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "section-toggle-btn";
  toggleButton.textContent = "Hide";
  toggleButton.setAttribute("aria-expanded", "true");
  toggleButton.setAttribute("title", "Hide Status Window");
  toggleButton.addEventListener("click", () => {
    const collapsed = statusPanelEl.classList.toggle("is-collapsed");
    toggleButton.textContent = collapsed ? "Show" : "Hide";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} Status Window`);
  });
  header.appendChild(toggleButton);
}

const DRAGGABLE_IGNORE_SELECTOR = "button, input, select, textarea, a, label";

function isInteractiveTarget(target) {
  return target instanceof Element && target.closest(DRAGGABLE_IGNORE_SELECTOR);
}

function enableCardDrag(card, handle = card) {
  if (!card || !handle || !mapShellEl) {
    return;
  }

  card.classList.add("draggable-card");
  handle.classList.add("draggable-handle");

  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;
  let shellRect = null;
  let placeholder = null;
  let originalParent = null;

  const onPointerMove = (event) => {
    if (pointerId !== event.pointerId || !shellRect) {
      return;
    }

    event.preventDefault();

    const maxX = shellRect.width - card.offsetWidth;
    const maxY = shellRect.height - card.offsetHeight;
    const nextX = event.clientX - shellRect.left - offsetX;
    const nextY = event.clientY - shellRect.top - offsetY;
    const clampedX = Math.min(Math.max(0, nextX), Math.max(0, maxX));
    const clampedY = Math.min(Math.max(0, nextY), Math.max(0, maxY));

    card.style.left = `${clampedX}px`;
    card.style.top = `${clampedY}px`;
    storeCardRelativePosition(card);
  };

  const onPointerUp = (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }

    card.classList.remove("is-dragging");
    card.releasePointerCapture(pointerId);
    pointerId = null;
    shellRect = null;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const cardRect = card.getBoundingClientRect();
    shellRect = mapShellEl.getBoundingClientRect();
    offsetX = event.clientX - cardRect.left;
    offsetY = event.clientY - cardRect.top;
    pointerId = event.pointerId;

    if (!card.classList.contains("is-floating")) {
      card.classList.add("is-floating");
      card.style.width = `${cardRect.width}px`;
      originalParent = card.parentElement;
      if (originalParent) {
        placeholder = document.createElement("div");
        placeholder.className = "card-placeholder";
        placeholder.style.height = `${cardRect.height}px`;
        placeholder.style.flex = "0 0 auto";

        // Preserve flex ordering (e.g., right-column cards use CSS `order`).
        // Without this, the placeholder defaults to order=0 and can jump ahead of ordered siblings.
        const computedOrder = window.getComputedStyle(card).order;
        if (computedOrder) {
          placeholder.style.order = computedOrder;
        }

        originalParent.insertBefore(placeholder, card.nextSibling);
      }
      mapShellEl.appendChild(card);
      card.style.left = `${cardRect.left - shellRect.left}px`;
      card.style.top = `${cardRect.top - shellRect.top}px`;
      storeCardRelativePosition(card);
      clampCardPositionToShell(card);
    }

    card.classList.add("is-dragging");
    card.setPointerCapture(pointerId);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

function getPolylineDecoratorFactory() {
  if (typeof L?.polylineDecorator === "function") {
    return L.polylineDecorator;
  }

  if (typeof L?.PolylineDecorator === "function") {
    return (sourceLayer, options) => new L.PolylineDecorator(sourceLayer, options);
  }

  return null;
}

function canUseFlowArrows() {
  return typeof getPolylineDecoratorFactory() === "function" && typeof L?.Symbol?.arrowHead === "function";
}

function createFlowArrowLayer(sourceLayer, color) {
  const decoratorFactory = getPolylineDecoratorFactory();
  if (!decoratorFactory) {
    return null;
  }

  return decoratorFactory(sourceLayer, {
    patterns: [
      {
        offset: "18px",
        repeat: "120px",
        symbol: L.Symbol.arrowHead({
          pixelSize: 8,
          polygon: false,
          pathOptions: {
            stroke: true,
            color,
            weight: 1.6,
            opacity: 0.9,
          },
        }),
      },
    ],
  });
}

function updateFlowToggleButton() {
  if (!flowToggleButton) {
    return;
  }

  flowToggleButton.textContent = flowArrowsEnabled ? "Hide flow arrows" : "Show flow arrows";
  flowToggleButton.setAttribute("aria-pressed", String(flowArrowsEnabled));
}

function updateFlowArrowsForGroup(state) {
  if (!flowArrowsEnabled || !state?.group || !isTransmissionGroup(state.group)) {
    return;
  }

  if (!state.voltageLayers || !state.dataLayer) {
    return;
  }

  const groupVisible = map.hasLayer(state.dataLayer);
  for (const voltageState of state.voltageLayers.values()) {
    if (!voltageState.arrowLayer) {
      continue;
    }

    const shouldShow = flowArrowsEnabled && groupVisible && voltageState.visible;
    if (shouldShow) {
      if (!map.hasLayer(voltageState.arrowLayer)) {
        voltageState.arrowLayer.addTo(map);
      }
    } else if (map.hasLayer(voltageState.arrowLayer)) {
      map.removeLayer(voltageState.arrowLayer);
    }
  }
}

function updateAllTransmissionFlowArrows() {
  for (const state of runtime.values()) {
    if (!state?.group || !isTransmissionGroup(state.group)) {
      continue;
    }

    if (!state.voltageLayers || !state.dataLayer) {
      continue;
    }

    const groupVisible = map.hasLayer(state.dataLayer);
    for (const voltageState of state.voltageLayers.values()) {
      if (!voltageState.arrowLayer) {
        continue;
      }

      const shouldShow = flowArrowsEnabled && groupVisible && voltageState.visible;
      if (shouldShow) {
        if (!map.hasLayer(voltageState.arrowLayer)) {
          voltageState.arrowLayer.addTo(map);
        }
      } else if (map.hasLayer(voltageState.arrowLayer)) {
        map.removeLayer(voltageState.arrowLayer);
      }
    }
  }
}

function setFlowArrowsEnabled(nextValue) {
  flowArrowsEnabled = Boolean(nextValue);
  updateFlowToggleButton();

  if (!flowArrowsEnabled) {
    for (const state of runtime.values()) {
      if (!state?.voltageLayers) {
        continue;
      }

      for (const voltageState of state.voltageLayers.values()) {
        if (voltageState.arrowLayer && map.hasLayer(voltageState.arrowLayer)) {
          map.removeLayer(voltageState.arrowLayer);
        }
      }
    }
    return;
  }

  updateAllTransmissionFlowArrows();
}

function getShpParser() {
  const parser = window.shp || window.shpjs;
  if (typeof parser !== "function") {
    throw new Error("shpjs parser is unavailable (window.shp)");
  }
  return parser;
}

for (const group of LAYER_GROUPS) {
  runtime.set(group.id, {
    dataLayer: null,
    dataBoundsLayer: null,
    featureCollection: null,
    loaded: false,
    loading: false,
    checkbox: null,
    voltageFilterContainer: null,
    voltageLayers: new Map(),
  });
}

function setStatus(groupId, kind, message) {
  if (!statusListEl) {
    return;
  }

  let li = document.querySelector(`[data-status-id="${groupId}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.statusId = groupId;
    statusListEl.appendChild(li);
  }
  li.className = kind;
  li.textContent = message;
}

function removeStatus(groupId) {
  if (!statusListEl) {
    return;
  }

  const li = statusListEl.querySelector(`[data-status-id="${groupId}"]`);
  if (li) {
    li.remove();
  }
}

function formatErrorMessage(error) {
  if (!error) {
    return "unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

function makeAbsoluteUrl(path) {
  return new URL(path, window.location.href).href;
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.arrayBuffer();
}

async function fetchOptionalText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.text();
}

function buildPopupHTML(feature, group) {
  const properties = feature?.properties || {};
  const allKeys = Object.keys(properties);
  const priorityKeys = (group?.popupPriorityFields || []).filter(
    (key) => key in properties && !isPopupFieldHidden(key)
  );
  const extraKeys = allKeys.filter((key) => !priorityKeys.includes(key) && !isPopupFieldHidden(key));
  const keys = [...priorityKeys, ...extraKeys].slice(0, 20);

  if (keys.length === 0) {
    return "No attributes available.";
  }

  const geometry = feature?.geometry;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
  const hasPointCoords = geometry?.type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2;

  const coordinateRows = [];
  if (hasPointCoords) {
    const [lon, lat] = coordinates;
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      coordinateRows.push(
        `<tr><th>Longitude</th><td>${escapeHtml(formatCoordinate(lon))}</td></tr>`
      );
      coordinateRows.push(
        `<tr><th>Latitude</th><td>${escapeHtml(formatCoordinate(lat))}</td></tr>`
      );
    }
  }

  const rows = keys
    .map((key) => {
      const raw = properties[key];
      const value = formatValueWithUnit(raw, key, group);
      const label = group?.fieldAliases?.[key] || GLOBAL_FIELD_ALIASES[key] || toTitleCaseLabel(key);
      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
    })
    .concat(coordinateRows)
    .join("");

  return `<table>${rows}</table>`;
}

function normalizePopupKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isPopupFieldHidden(key) {
  return POPUP_FIELDS_TO_HIDE.has(key) || POPUP_FIELDS_TO_HIDE_NORMALIZED.has(normalizePopupKey(key));
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(5);
}

function toTitleCaseLabel(key) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getFieldUnit(key, group) {
  if (group?.fieldUnits?.[key]) {
    return group.fieldUnits[key];
  }

  return DEFAULT_FIELD_UNITS[key] || null;
}

function hasUnitSuffix(text, unit) {
  return new RegExp(`\\b${unit}\\b`, "i").test(text);
}

function normalizeNumberString(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  const text = String(value).trim();
  if (!text) {
    return text;
  }

  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric)) {
    return Number.isInteger(numeric)
      ? String(numeric)
      : numeric.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  return text;
}

function parseNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const cleaned = text.replace(",", ".");
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumeric(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatValueWithUnit(rawValue, key, group) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return "-";
  }

  const base = normalizeNumberString(rawValue);
  const unit = getFieldUnit(key, group);

  if (!unit) {
    return base;
  }

  // Convert generation values that are in kW to MW as requested.
  if (unit === "kW") {
    const numericValue = parseNumericValue(rawValue);
    if (numericValue !== null) {
      return `${formatNumeric(numericValue / 1000.0)} MW`;
    }
  }

  if (hasUnitSuffix(base, unit)) {
    return base;
  }

  // Voltage fields often arrive as strings like "500/230"; append a shared kV suffix.
  if (key === "Tensao") {
    return `${base} ${unit}`;
  }

  // For general numeric fields with known units, append the corresponding unit.
  return `${base} ${unit}`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toFeatureCollection(parsedData, sourceName) {
  if (Array.isArray(parsedData)) {
    const features = parsedData.flatMap((item) => item?.features || []);
    return {
      type: "FeatureCollection",
      features: features.map((feature) => withSource(feature, sourceName)),
    };
  }

  if (parsedData?.type === "FeatureCollection") {
    return {
      type: "FeatureCollection",
      features: (parsedData.features || []).map((feature) => withSource(feature, sourceName)),
    };
  }

  return { type: "FeatureCollection", features: [] };
}

function withSource(feature, sourceName) {
  return {
    ...feature,
    properties: {
      ...(feature?.properties || {}),
      source_file: sourceName,
    },
  };
}

function pointStyle(group) {
  return {
    radius: 3,
    fillColor: group.color,
    color: "#0b0f0f",
    weight: 0.5,
    fillOpacity: 0.9,
  };
}

function pointStyleWithColor(color, radius = 3) {
  return {
    radius,
    fillColor: color,
    color: "#0b0f0f",
    weight: 0.6,
    fillOpacity: 0.95,
  };
}

function substationSvg(size, color, fillOpacity, strokeColor, dashed) {
  const sw = size > 12 ? 0.8 : 0.6;
  const dash = dashed ? ` stroke-dasharray="${size > 12 ? '3 2' : '2 1.5'}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="${sw / 2}" y="${sw / 2}" width="${size - sw}" height="${size - sw}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${sw}"${dash}/><line x1="${sw / 2}" y1="${size - sw / 2}" x2="${size - sw / 2}" y2="${sw / 2}" stroke="${strokeColor}" stroke-width="${sw}"${dash}/></svg>`;
}

function createSubstationIcon(color, fillOpacity = 0.95, dashed = false) {
  const size = 14;
  return L.divIcon({
    html: substationSvg(size, color, fillOpacity, "#0b0f0f", dashed),
    className: "substation-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createSubstationSwatch(color, dashed) {
  const el = document.createElement("span");
  el.className = "layer-swatch substation-swatch";
  el.innerHTML = substationSvg(12, color, 1, "#0b0f0f", dashed);
  return el;
}

function createTransmissionSwatch(color, dashed) {
  const w = 20;
  const h = 12;
  const dash = dashed ? ' stroke-dasharray="4 2"' : "";
  const el = document.createElement("span");
  el.className = "layer-swatch transmission-swatch";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${color}" stroke-width="2"${dash}/></svg>`;
  return el;
}

function triangleSvg(size, color, fillOpacity, strokeColor) {
  const sw = 0.6;
  const cx = size / 2;
  const points = `${cx},${sw / 2} ${size - sw / 2},${size - sw / 2} ${sw / 2},${size - sw / 2}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${points}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${sw}"/></svg>`;
}

function createTriangleIcon(color, fillOpacity = 0.95) {
  const size = 14;
  return L.divIcon({
    html: triangleSvg(size, color, fillOpacity, "#0b0f0f"),
    className: "triangle-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createTriangleSwatch(color) {
  const el = document.createElement("span");
  el.className = "layer-swatch triangle-swatch";
  el.innerHTML = triangleSvg(12, color, 1, "#0b0f0f");
  return el;
}

function isIsolatedSystemsGroup(group) {
  return group?.id === ISOLATED_SYSTEMS_GROUP_ID;
}

function createCircleSwatch(color, dashed) {
  const size = 12;
  const r = (size - 1) / 2;
  const dash = dashed ? ' stroke-dasharray="2 1.5"' : '';
  const el = document.createElement("span");
  el.className = "layer-swatch circle-swatch";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="#0b0f0f" stroke-width="0.6"${dash}/></svg>`;
  return el;
}

function isPowerPlantGroup(group) {
  return group?.section === "Power plants";
}

function isPlannedGroup(group) {
  return isPowerPlantGroup(group) && group?.id?.includes("-planned");
}

function hexToRgb(hexColor) {
  const normalized = String(hexColor || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixWithColor(hexColor, mixColor, ratio) {
  const source = hexToRgb(hexColor);
  const mix = hexToRgb(mixColor);
  if (!source || !mix) {
    return hexColor;
  }

  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: source.r * (1 - t) + mix.r * t,
    g: source.g * (1 - t) + mix.g * t,
    b: source.b * (1 - t) + mix.b * t,
  });
}

function getPowerPlantToneColor(baseColor, group) {
  if (!isPowerPlantGroup(group)) {
    return baseColor;
  }

  // Planned plants use softer/lower-intensity tones; in-operation remains vivid/high-intensity.
  if (isPlannedGroup(group)) {
    return mixWithColor(baseColor, "#ffffff", 0.45);
  }

  return mixWithColor(baseColor, "#000000", 0.08);
}

function getPowerPlantOpacity(group) {
  if (!isPowerPlantGroup(group)) {
    return null;
  }

  return isPlannedGroup(group) ? 0.62 : 0.96;
}

function pointStyleByGroup(color, group, feature) {
  let radius = 3;
  if (isPowerPlantGroup(group)) {
    radius = getPowerScaledRadius(getPowerValueMW(feature));
  } else if (isSubstationGroup(group)) {
    radius = getVoltageScaledRadius(getFeatureVoltageKV(feature));
  }
  const style = pointStyleWithColor(color, radius);
  const opacity = getPowerPlantOpacity(group);

  if (opacity !== null) {
    style.fillOpacity = opacity;
  }

  if (isPlannedGroup(group)) {
    style.dashArray = "3 2";
  }

  return style;
}

function getPowerValueMW(feature) {
  const properties = feature?.properties || {};
  const rawValue = properties.potencia ?? properties.Potencia ?? null;
  const numericValue = parseNumericValue(rawValue);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  // Potencia fields are provided in kW; convert to MW.
  return numericValue / 1000.0;
}

function getPowerScaledRadius(powerMW) {
  if (!Number.isFinite(powerMW) || powerMW <= 0) {
    return 3.2;
  }

  const stops = [
    { mw: 5, r: 4.0 },
    { mw: 10, r: 4.6 },
    { mw: 25, r: 5.2 },
    { mw: 50, r: 6.0 },
    { mw: 100, r: 6.8 },
    { mw: 200, r: 7.6 },
    { mw: 500, r: 8.6 },
    { mw: 1000, r: 9.6 },
  ];

  if (powerMW <= stops[0].mw) {
    return stops[0].r;
  }

  for (let i = 1; i < stops.length; i += 1) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (powerMW <= next.mw) {
      const t = (powerMW - prev.mw) / (next.mw - prev.mw);
      return prev.r + t * (next.r - prev.r);
    }
  }

  return stops[stops.length - 1].r + Math.min(2.4, Math.log10(powerMW / 1000 + 1) * 1.6);
}

function getFeatureVoltageKV(feature) {
  const raw = feature?.properties?.Tensao;
  const values = extractVoltageNumbers(raw);
  if (!values.length) {
    return null;
  }

  return Math.max(...values);
}

function getVoltageScaledRadius(voltageKV) {
  if (!Number.isFinite(voltageKV) || voltageKV <= 0) {
    return 3.2;
  }

  const stops = [
    { kv: 69, r: 3.8 },
    { kv: 138, r: 4.6 },
    { kv: 230, r: 5.4 },
    { kv: 345, r: 6.4 },
    { kv: 500, r: 7.4 },
    { kv: 600, r: 8.2 },
    { kv: 750, r: 9.0 },
    { kv: 800, r: 9.6 },
  ];

  if (voltageKV <= stops[0].kv) {
    return stops[0].r;
  }

  for (let i = 1; i < stops.length; i += 1) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (voltageKV <= next.kv) {
      const t = (voltageKV - prev.kv) / (next.kv - prev.kv);
      return prev.r + t * (next.r - prev.r);
    }
  }

  return stops[stops.length - 1].r + Math.min(2.0, Math.log10(voltageKV / 800 + 1) * 1.4);
}

function lineStyle(group) {
  return {
    color: group.color,
    weight: 1.4,
    opacity: 0.9,
  };
}

function polygonStyle(group) {
  return {
    color: group.color,
    weight: 1.0,
    fillOpacity: 0.08,
  };
}

function buildColorRamp(total, palette) {
  const colors = [];
  const basePalette = Array.isArray(palette) && palette.length > 0 ? palette : CATEGORY_PALETTE;

  for (let i = 0; i < total; i += 1) {
    if (i < basePalette.length) {
      colors.push(basePalette[i]);
      continue;
    }

    // Extend palette with evenly spaced hues if there are more categories than base colors.
    const hue = Math.round((i * 137.508) % 360);
    colors.push(`hsl(${hue}, 68%, 52%)`);
  }

  return colors;
}

function buildThematicColorIndex(collection, group) {
  if (!group?.thematicField) {
    return null;
  }

  const uniqueValues = [...new Set(
    (collection?.features || []).map((feature) => String(feature?.properties?.[group.thematicField] ?? "Unknown"))
  )].sort((a, b) => a.localeCompare(b));

  const colors = buildColorRamp(uniqueValues.length, group.thematicPalette);
  const thematicColorIndex = new Map();

  uniqueValues.forEach((value, index) => {
    thematicColorIndex.set(value, colors[index]);
  });

  return thematicColorIndex;
}

function getUniqueThematicValues(collection, group) {
  if (!group?.thematicField) {
    return [];
  }

  return [...new Set(
    (collection?.features || []).map((feature) => String(feature?.properties?.[group.thematicField] ?? "Unknown"))
  )].sort((a, b) => a.localeCompare(b));
}

function getFeatureColor(feature, group, thematicColorIndex) {
  let color = group.color;

  if (group?.thematicField && thematicColorIndex) {
    const value = String(feature?.properties?.[group.thematicField] ?? "Unknown");
    color = thematicColorIndex.get(value) || group.color;
  }

  return getPowerPlantToneColor(color, group);
}

function featureStyle(feature, group, thematicColorIndex) {
  const color = getFeatureColor(feature, group, thematicColorIndex);
  const geometryType = feature?.geometry?.type || "";

  if (geometryType.includes("Polygon")) {
    return {
      color,
      weight: 1.2,
      fillColor: color,
      fillOpacity: 0.28,
      opacity: 0.95,
    };
  }

  if (geometryType.includes("Line")) {
    return {
      color,
      weight: 1.4,
      opacity: 0.9,
    };
  }

  return lineStyle(group);
}

function bindFeaturePopup(feature, featureLayer, group) {
  featureLayer.bindPopup(buildPopupHTML(feature, group), {
    closeButton: true,
    autoClose: true,
    closeOnClick: false,
    closeOnEscapeKey: true,
  });

  featureLayer.on("mouseover", () => {
    if (activeHoverPopupLayer && activeHoverPopupLayer !== featureLayer) {
      activeHoverPopupLayer.closePopup();
    }

    featureLayer.openPopup();
    activeHoverPopupLayer = featureLayer;
  });

  featureLayer.on("popupclose", () => {
    if (activeHoverPopupLayer === featureLayer) {
      activeHoverPopupLayer = null;
    }
  });
}

map.getContainer().addEventListener("mouseleave", () => {
  if (activeHoverPopupLayer) {
    activeHoverPopupLayer.closePopup();
    activeHoverPopupLayer = null;
  }
});

function createLeafletLayer(group, collection) {
  const thematicColorIndex = buildThematicColorIndex(collection, group);

  const geoJsonOptions = {
    style: (feature) => featureStyle(feature, group, thematicColorIndex),
    onEachFeature: (feature, layer) => {
      bindFeaturePopup(feature, layer, group);
    },
  };

  if (isIsolatedSystemsGroup(group)) {
    geoJsonOptions.pointToLayer = (_feature, latlng) =>
      L.marker(latlng, { icon: createTriangleIcon(group.color) });
  } else {
    geoJsonOptions.pointToLayer = (feature, latlng) =>
      L.circleMarker(
        latlng,
        pointStyleByGroup(getFeatureColor(feature, group, thematicColorIndex), group, feature)
      );
  }

  return L.geoJSON(collection, geoJsonOptions);
}

function isSubstationGroup(group) {
  return SUBSTATION_GROUP_IDS.has(group.id);
}

function isTransmissionGroup(group) {
  return TRANSMISSION_GROUP_IDS.has(group.id);
}

function isVoltageGroupedGroup(group) {
  return VOLTAGE_GROUP_IDS.has(group.id);
}

function makeSectionNodeId(sectionName) {
  return `section-${sectionName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
}

function getSectionContainer(sectionName) {
  if (LEFT_SECTIONS.has(sectionName)) {
    return mapUiLeftEl;
  }
  return mapUiRightEl;
}

function getGroupSectionName(group) {
  return group.section || "Other";
}

function getStatusSubgroupLabel(group) {
  if (!STATUS_SUBGROUP_SECTIONS.has(group.section)) {
    return null;
  }

  return group.id.includes("-planned") ? "Planned" : "In operation";
}

function normalizeLabelText(value) {
  return String(value || "").trim().toLowerCase();
}

function suppressMapGesturesOnElement(element) {
  if (!element || !L?.DomEvent) {
    return;
  }
  L.DomEvent.disableScrollPropagation(element);
  L.DomEvent.disableClickPropagation(element);
}

function getOrCreateSectionCard(sectionName) {
  const sectionNodeId = makeSectionNodeId(sectionName);
  const cached = sectionCards.get(sectionNodeId);
  if (cached) {
    return cached;
  }

  const host = getSectionContainer(sectionName);
  if (!host) {
    return null;
  }

  const card = document.createElement("section");
  card.id = sectionNodeId;
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = sectionName;

  const body = document.createElement("div");
  body.className = "section-card-body";

  header.appendChild(title);

  let toggleButton = null;
  if (COLLAPSIBLE_SECTIONS.has(sectionName)) {
    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "section-toggle-btn";
    toggleButton.textContent = "Hide";
    toggleButton.setAttribute("aria-expanded", "true");
    toggleButton.setAttribute("title", `Hide ${sectionName}`);

    toggleButton.addEventListener("click", () => {
      const collapsed = card.classList.toggle("is-collapsed");
      toggleButton.textContent = collapsed ? "Show" : "Hide";
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      toggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} ${sectionName}`);
    });

    header.appendChild(toggleButton);
  }

  card.appendChild(header);
  card.appendChild(body);

  suppressMapGesturesOnElement(card);
  suppressMapGesturesOnElement(body);

  if (sectionName === "Power plants") {
    const footer = document.createElement("div");
    footer.className = "section-card-footer";

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "section-toggle-btn section-action-btn";
    actionButton.textContent = "Show Generation Share";
    actionButton.setAttribute("aria-expanded", "false");
    actionButton.setAttribute("title", "Show generation share for existing power plants");
    generationShareToggleButton = actionButton;

    actionButton.addEventListener("click", async () => {
      await toggleGenerationShareCard();
    });

    footer.appendChild(actionButton);
    card.appendChild(footer);
  }

  host.appendChild(card);


  enableCardDrag(card, header);

  const record = {
    card,
    body,
    toggleButton,
    subgroupContainers: new Map(),
    subgroupControls: new Map(),
  };

  sectionCards.set(sectionNodeId, record);
  return record;
}

function getExistingPowerPlantGroups() {
  return LAYER_GROUPS.filter(
    (group) => group.section === "Power plants" && !String(group.id || "").includes("-planned")
  );
}

function getOrCreateGenerationShareCard() {
  if (generationShareCard) {
    return generationShareCard;
  }

  const card = document.createElement("section");
  card.id = GENERATION_SHARE_CARD_ID;
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "Generation share";

  header.appendChild(title);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";
  body.innerHTML = `
    <div class="generation-share-layout">
      <div class="generation-share-chart-wrap">
        <canvas class="generation-share-chart" aria-label="Generation share chart" role="img"></canvas>
      </div>
      <div class="generation-share-legend" aria-label="Generation share legend"></div>
    </div>
    <p class="generation-share-footnote">
      Share calculated from <strong>existing</strong> power-plant installed capacity (MW).
    </p>
  `;
  card.appendChild(body);

  if (!mapShellEl) {
    return null;
  }

  // Make it independent: mount as a floating card inside the map shell.
  card.classList.add("is-floating");
  mapShellEl.appendChild(card);

  const shellRect = mapShellEl.getBoundingClientRect();
  const anchor = document.getElementById(makeSectionNodeId("Power plants"));
  const anchorRect = anchor ? anchor.getBoundingClientRect() : null;

  const defaultWidth = Math.min(680, Math.max(560, Math.round(anchorRect?.width || 620)));
  card.style.width = `${defaultWidth}px`;

  // Position just below the Power plants card, aligned to its right edge.
  const desiredRight = (anchorRect?.right ?? (shellRect.right - 12)) - shellRect.left;
  const desiredLeft = desiredRight - defaultWidth;
  const desiredTop = (anchorRect?.bottom ?? (shellRect.top + 180)) - shellRect.top + 10;

  card.style.left = `${clamp(desiredLeft, 0, Math.max(0, shellRect.width - defaultWidth))}px`;
  card.style.top = `${clamp(desiredTop, 0, Math.max(0, shellRect.height - 140))}px`;
  storeCardRelativePosition(card);

  enableCardDrag(card, header);

  const canvas = body.querySelector(".generation-share-chart");
  const legend = body.querySelector(".generation-share-legend");

  generationShareCard = {
    card,
    body,
    canvas,
    legend,
    slices: null,
  };

  if (typeof window.ResizeObserver === "function" && canvas) {
    generationShareResizeObserver = new ResizeObserver(() => {
      if (!generationShareCard?.slices) {
        return;
      }
      drawDoughnutChart(canvas, generationShareCard.slices);
    });
    generationShareResizeObserver.observe(card);
  }

  return generationShareCard;
}

function destroyGenerationShareCard() {
  if (!generationShareCard) {
    return;
  }

  if (generationShareResizeObserver) {
    generationShareResizeObserver.disconnect();
    generationShareResizeObserver = null;
  }

  generationShareCard.card.remove();
  generationShareCard = null;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

function formatMW(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} MW`;
}

function getCssColorValue(variableName, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(variableName).trim();
  return value || fallback;
}

function drawDoughnutChart(canvas, slices) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  const radius = Math.min(cssWidth, cssHeight) * 0.46;
  const innerRadius = radius * 0.64;
  const borderColor = getCssColorValue("--ui-border", "rgba(0,0,0,0.25)");

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = "transparent";

  let startAngle = -Math.PI / 2;
  const gap = 0.012;

  for (const slice of slices) {
    const angle = Math.max(0, slice.fraction) * Math.PI * 2;
    if (angle <= 0) {
      continue;
    }

    const from = startAngle + gap;
    const to = startAngle + angle - gap;
    if (to <= from) {
      startAngle += angle;
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, from, to);
    ctx.closePath();

    ctx.fillStyle = slice.color;
    ctx.fill();

    startAngle += angle;
  }

  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
}

const GENERATION_SHARE_LABEL_OVERRIDES = {
  Hydroelectric: "Hydro",
  Wind: "Wind",
  "Fossil thermoelectric": "Fossil",
  "Solar photovoltaic": "Solar",
  Biomass: "Biomass",
  "Small hydro": "Small Hydro",
  "Nuclear thermoelectric": "Nuclear",
  "Micro hydro": "Micro Hydro",
};

function getGenerationShareLabel(label) {
  const key = String(label || "").trim();
  return GENERATION_SHARE_LABEL_OVERRIDES[key] || label;
}

async function computeGenerationShare() {
  const groups = getExistingPowerPlantGroups();
  const totalsByGroup = [];

  for (const group of groups) {
    const state = runtime.get(group.id);
    if (!state) {
      continue;
    }

    if (!state.loaded) {
      await loadLayerGroup(group);
    }

    const collection = state.featureCollection;
    const features = Array.isArray(collection?.features) ? collection.features : [];

    let totalMW = 0;
    let counted = 0;
    for (const feature of features) {
      const powerMW = getPowerValueMW(feature);
      if (!Number.isFinite(powerMW) || powerMW <= 0) {
        continue;
      }
      totalMW += powerMW;
      counted += 1;
    }

    if (totalMW > 0) {
      totalsByGroup.push({
        id: group.id,
        label: getGenerationShareLabel(group.label),
        color: getPowerPlantToneColor(group.color, group),
        mw: totalMW,
        featureCount: counted,
      });
    }
  }

  totalsByGroup.sort((a, b) => b.mw - a.mw);
  const totalMW = totalsByGroup.reduce((sum, entry) => sum + entry.mw, 0);

  return { totalMW, totalsByGroup };
}

function renderGenerationShareLegend(container, totalMW, totalsByGroup) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.innerHTML = "";

  const totalRow = document.createElement("div");
  totalRow.className = "generation-share-total";
  totalRow.textContent = `Total: ${formatMW(totalMW)}`;
  container.appendChild(totalRow);

  for (const entry of totalsByGroup) {
    const pct = totalMW > 0 ? (entry.mw / totalMW) * 100 : 0;

    const row = document.createElement("div");
    row.className = "generation-share-row";

    const swatch = document.createElement("span");
    swatch.className = "generation-share-swatch";
    swatch.style.backgroundColor = entry.color;

    const label = document.createElement("span");
    label.className = "generation-share-label";
    label.textContent = entry.label;

    const value = document.createElement("span");
    value.className = "generation-share-value";
    value.textContent = `${formatPercent(pct)} · ${formatMW(entry.mw)}`;

    row.appendChild(swatch);
    row.appendChild(label);
    row.appendChild(value);
    container.appendChild(row);
  }
}

async function renderGenerationShareCard() {
  const cardRecord = getOrCreateGenerationShareCard();
  if (!cardRecord) {
    return;
  }

  const canvas = cardRecord.canvas;
  const legend = cardRecord.legend;
  if (!canvas || !legend) {
    return;
  }

  legend.textContent = "Loading generation share…";

  const { totalMW, totalsByGroup } = await computeGenerationShare();
  if (!Number.isFinite(totalMW) || totalMW <= 0 || totalsByGroup.length === 0) {
    legend.textContent = "No capacity values available to compute share.";
    drawDoughnutChart(canvas, []);
    return;
  }

  const slices = totalsByGroup.map((entry) => ({
    label: entry.label,
    color: entry.color,
    fraction: entry.mw / totalMW,
  }));

  cardRecord.slices = slices;
  drawDoughnutChart(canvas, slices);
  renderGenerationShareLegend(legend, totalMW, totalsByGroup);
}

async function toggleGenerationShareCard() {
  const isOpen = Boolean(generationShareCard);
  if (isOpen) {
    destroyGenerationShareCard();
    if (generationShareToggleButton) {
      generationShareToggleButton.textContent = "Show Generation Share";
      generationShareToggleButton.setAttribute("aria-expanded", "false");
    }
    return;
  }

  getOrCreateGenerationShareCard();
  if (generationShareToggleButton) {
    generationShareToggleButton.textContent = "Hide Generation Share";
    generationShareToggleButton.setAttribute("aria-expanded", "true");
  }

  await renderGenerationShareCard();
}

function updateSubgroupMaster(subgroupControl) {
  if (!subgroupControl?.masterCheckbox) {
    return;
  }

  const total = subgroupControl.childCheckboxes.length;
  if (total === 0) {
    subgroupControl.masterCheckbox.checked = false;
    subgroupControl.masterCheckbox.indeterminate = false;
    return;
  }

  const checkedCount = subgroupControl.childCheckboxes.filter((checkbox) => checkbox.checked).length;

  if (checkedCount === 0) {
    subgroupControl.masterCheckbox.checked = false;
    subgroupControl.masterCheckbox.indeterminate = false;
    return;
  }

  if (checkedCount === total) {
    subgroupControl.masterCheckbox.checked = true;
    subgroupControl.masterCheckbox.indeterminate = false;
    return;
  }

  subgroupControl.masterCheckbox.checked = true;
  subgroupControl.masterCheckbox.indeterminate = true;
}

function extractVoltageNumbers(rawVoltage) {
  const raw = String(rawVoltage ?? "").trim();
  if (!raw) {
    return [];
  }

  const matches = raw.match(/\d+(?:[\.,]\d+)?/g) || [];
  const values = matches
    .map((entry) => Number(entry.replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));

  return [...new Set(values)];
}

function normalizeVoltageLabel(rawVoltage) {
  const values = extractVoltageNumbers(rawVoltage);
  if (values.length === 0) {
    return "Unknown";
  }

  const maxValue = Math.max(...values);
  return String(maxValue);
}

function voltageSortValue(label) {
  if (label === "Unknown") {
    return -1;
  }

  const match = String(label).match(/\d+(?:\.\d+)?/);
  if (!match) {
    return -1;
  }
  return Number(match[0]);
}

function getVoltageColor(label) {
  let hash = 0;
  for (const char of String(label)) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  const index = Math.abs(hash) % VOLTAGE_PALETTE.length;
  return VOLTAGE_PALETTE[index];
}

function getVoltageColorByIndex(index) {
  if (index < VOLTAGE_PALETTE.length) {
    return VOLTAGE_PALETTE[index];
  }

  // Fallback for very large category counts.
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 70%, 50%)`;
}

function isPlannedStatusGroup(group) {
  return String(group?.id || "").includes("-planned");
}

function getVoltageDisplayColor(baseColor, group) {
  if (isPlannedStatusGroup(group)) {
    return mixWithColor(baseColor, "#ffffff", 0.4);
  }

  return mixWithColor(baseColor, "#000000", 0.06);
}

function createVoltageGroupedLayer(group, collection, state) {
  const featuresByVoltage = new Map();

  for (const feature of collection.features || []) {
    const voltageLabel = normalizeVoltageLabel(feature?.properties?.Tensao);
    if (!featuresByVoltage.has(voltageLabel)) {
      featuresByVoltage.set(voltageLabel, []);
    }
    featuresByVoltage.get(voltageLabel).push(feature);
  }

  const aggregateLayer = L.layerGroup();
  const boundsLayer = L.geoJSON(collection, {
    pointToLayer: (_feature, latlng) => L.marker(latlng),
  });

  state.voltageLayers = new Map();

  const sortedEntries = [...featuresByVoltage.entries()].sort((a, b) => {
    const aVal = voltageSortValue(a[0]);
    const bVal = voltageSortValue(b[0]);
    if (aVal !== bVal) {
      return bVal - aVal;
    }
    return a[0].localeCompare(b[0]);
  });

  sortedEntries.forEach(([voltageLabel, features], index) => {
    const baseColor = voltageLabel === "800" ? "#dc2626" : getVoltageColorByIndex(index);
    const color = getVoltageDisplayColor(baseColor, group);
    const visibleByDefault = Boolean(group.defaultVisible);

    const geoJsonOptions = {
      onEachFeature: (feature, featureLayer) => {
        bindFeaturePopup(feature, featureLayer, group);
      },
    };

    if (isSubstationGroup(group)) {
      const planned = isPlannedStatusGroup(group);
      geoJsonOptions.pointToLayer = (_feature, latlng) => {
        const opacity = planned ? 0.58 : 0.96;
        return L.marker(latlng, {
          icon: createSubstationIcon(color, opacity, planned),
        });
      };
    } else if (isTransmissionGroup(group)) {
      geoJsonOptions.style = () => ({
        color,
        weight: 1.6,
        opacity: isPlannedStatusGroup(group) ? 0.56 : 0.95,
        dashArray: isPlannedStatusGroup(group) ? "6 4" : null,
      });
    }

    const layer = L.geoJSON(
      {
        type: "FeatureCollection",
        features,
      },
      geoJsonOptions
    );

    if (visibleByDefault) {
      aggregateLayer.addLayer(layer);
    }

    state.voltageLayers.set(voltageLabel, {
      layer,
      visible: visibleByDefault,
      color,
      count: features.length,
      arrowLayer: isTransmissionGroup(group) && canUseFlowArrows() ? createFlowArrowLayer(layer, color) : null,
    });
  });

  state.dataLayer = aggregateLayer;
  state.dataBoundsLayer = boundsLayer;
  renderVoltageFilterControls(group, state);
}

function renderVoltageFilterControls(group, state) {
  const container = state.voltageFilterContainer;
  if (!container) {
    return;
  }

  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "voltage-filter-title";
  title.textContent = `${group.label} by voltage:`;
  container.appendChild(title);

  for (const [voltageLabel, voltageState] of state.voltageLayers.entries()) {
    const row = document.createElement("label");
    row.className = "voltage-filter-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = voltageState.visible;
    voltageState.checkbox = checkbox;

    let swatch;
    if (isSubstationGroup(group)) {
      swatch = createSubstationSwatch(voltageState.color, isPlannedStatusGroup(group));
    } else if (isTransmissionGroup(group)) {
      swatch = createTransmissionSwatch(voltageState.color, isPlannedStatusGroup(group));
    } else {
      swatch = document.createElement("span");
      swatch.className = "layer-swatch";
      swatch.style.backgroundColor = voltageState.color;
    }

    const text = document.createElement("span");
    text.textContent = getVoltageDisplayLabel(group, voltageLabel);

    checkbox.addEventListener("change", () => {
      voltageState.visible = checkbox.checked;
      if (checkbox.checked) {
        state.dataLayer.addLayer(voltageState.layer);
      } else {
        state.dataLayer.removeLayer(voltageState.layer);
      }

      const anyVisible = [...state.voltageLayers.values()].some((entry) => entry.visible);
      if (state.checkbox) {
        if (state.checkbox.checked !== anyVisible) {
          state.checkbox.checked = anyVisible;
          state.checkbox.dispatchEvent(new Event("change"));
        } else if (anyVisible && !map.hasLayer(state.dataLayer)) {
          state.dataLayer.addTo(map);
        }
      } else if (anyVisible) {
        state.dataLayer.addTo(map);
      } else if (map.hasLayer(state.dataLayer)) {
        map.removeLayer(state.dataLayer);
      }

      if (isTransmissionGroup(group)) {
        updateFlowArrowsForGroup(state);
      }

      renderVoltageStatus(group, state);
    });

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    container.appendChild(row);
  }
}

function getVoltageDisplayLabel(group, voltageLabel) {
  const isVoltageGroup = group.section === "Substations" || group.section === "Transmission lines";
  const isHvdcVoltage = voltageLabel === "800" || voltageLabel === "600";
  const useDc = isVoltageGroup && isHvdcVoltage && !isPlannedStatusGroup(group);
  const appendUnit = isVoltageGroup && voltageLabel !== "Unknown";
  return appendUnit ? `${voltageLabel} ${useDc ? "kV DC" : "kV AC"}` : voltageLabel;
}

function renderVoltageStatus(group, state) {
  if (!statusListEl || !isVoltageGroupedGroup(group) || !state?.voltageLayers) {
    return;
  }

  for (const [voltageLabel, voltageState] of state.voltageLayers.entries()) {
    const itemId = `${group.id}-${voltageLabel}`;
    let li = statusListEl.querySelector(`[data-status-voltage-id="${itemId}"]`);
    const shouldShow = Boolean(voltageState.visible) && Boolean(state.dataLayer && map.hasLayer(state.dataLayer));

    if (!shouldShow) {
      if (li) {
        li.remove();
      }
      continue;
    }

    if (!li) {
      li = document.createElement("li");
      li.dataset.statusVoltageId = itemId;
      statusListEl.appendChild(li);
    }

    const voltageText = getVoltageDisplayLabel(group, voltageLabel);
    let noun = "feature(s)";
    if (group.section === "Substations") {
      noun = "substation(s)";
    } else if (group.section === "Transmission lines") {
      noun = "line(s)";
    }
    li.textContent = `${group.label} ${voltageText}: ${voltageState.count} ${noun}`;
    li.className = "ok";
  }
}

function removeVoltageStatus(group, state) {
  if (!statusListEl || !state?.voltageLayers) {
    return;
  }

  for (const voltageLabel of state.voltageLayers.keys()) {
    const itemId = `${group.id}-${voltageLabel}`;
    const li = statusListEl.querySelector(`[data-status-voltage-id="${itemId}"]`);
    if (li) {
      li.remove();
    }
  }
}

function findRuntimeStateByCheckbox(layerCheckbox) {
  for (const state of runtime.values()) {
    if (state.checkbox === layerCheckbox) {
      return state;
    }
  }

  return null;
}

function setAllVoltageVisibility(state, checked) {
  if (!state?.dataLayer || !state?.voltageLayers) {
    return;
  }

  for (const voltageState of state.voltageLayers.values()) {
    voltageState.visible = checked;
    if (voltageState.checkbox) {
      voltageState.checkbox.checked = checked;
    }

    if (checked) {
      state.dataLayer.addLayer(voltageState.layer);
    } else {
      state.dataLayer.removeLayer(voltageState.layer);
    }
  }

  if (state.group && isTransmissionGroup(state.group)) {
    updateFlowArrowsForGroup(state);
  }

  if (state.group) {
    renderVoltageStatus(state.group, state);
  }
}

async function loadLayerGroup(group) {
  const state = runtime.get(group.id);
  if (!state || state.loading || state.loaded) {
    return;
  }

  state.loading = true;

  const loadedCollections = [];
  const errors = [];
  const parseShapefile = getShpParser();

  for (const baseName of group.files) {
    const encodedBase = encodeURIComponent(baseName);
    const basePath = `${DATA_ROOT}/${encodedBase}`;
    const shpUrl = makeAbsoluteUrl(`${basePath}.shp`);
    const dbfUrl = makeAbsoluteUrl(`${basePath}.dbf`);
    const prjUrl = makeAbsoluteUrl(`${basePath}.prj`);
    const cpgUrl = makeAbsoluteUrl(`${basePath}.cpg`);
    try {
      const [shpBuffer, dbfBuffer, prjText, cpgText] = await Promise.all([
        fetchArrayBuffer(shpUrl),
        fetchArrayBuffer(dbfUrl),
        fetchOptionalText(prjUrl),
        fetchOptionalText(cpgUrl),
      ]);

      const shapefilePayload = {
        shp: shpBuffer,
        dbf: dbfBuffer,
      };

      if (prjText) {
        shapefilePayload.prj = prjText;
      }

      if (cpgText) {
        shapefilePayload.cpg = cpgText;
      }

      const parsed = await parseShapefile(shapefilePayload);
      loadedCollections.push(toFeatureCollection(parsed, baseName));
    } catch (error) {
      errors.push(`${baseName}: ${formatErrorMessage(error)}`);
    }
  }

  const merged = {
    type: "FeatureCollection",
    features: loadedCollections.flatMap((collection) => collection.features),
  };
  state.featureCollection = merged;
  const thematicValues = getUniqueThematicValues(merged, group);

  if (isVoltageGroupedGroup(group)) {
    createVoltageGroupedLayer(group, merged, state);
  } else {
    state.dataLayer = createLeafletLayer(group, merged);
    state.dataBoundsLayer = state.dataLayer;
  }
  if (group.section !== "Power plants") {
    state.featureCollection = null;
  }
  state.loaded = true;
  state.loading = false;

  let labelNoun = "features";
  if (group.section === "Power plants") {
    labelNoun = "generator(s)";
  } else if (group.section === "Substations") {
    labelNoun = "substation(s)";
  } else if (group.section === "Transmission lines") {
    labelNoun = "line(s)";
  }

  if (errors.length > 0) {
    const firstError = errors[0];
    const thematicSuffix = thematicValues.length > 0 ? `; categories: ${thematicValues.length}` : "";
    const message = `${group.label}: loaded ${merged.features.length} ${labelNoun}${thematicSuffix} with ${errors.length} warning(s). First: ${firstError}`;
    state.statusMessage = message;
    state.statusKind = "warn";
    console.warn(`Layer warnings for ${group.id}:`, errors);
  } else {
    const thematicSuffix = thematicValues.length > 0 ? `; categories: ${thematicValues.length}` : "";
    const message = `${group.label}: loaded ${merged.features.length} ${labelNoun}${thematicSuffix}`;
    state.statusMessage = message;
    state.statusKind = "ok";
  }

  if (thematicValues.length > 0) {
    console.info(`${group.label} categories (${thematicValues.length}):`, thematicValues);
  }

  if (group.defaultVisible) {
    state.dataLayer.addTo(map);
  }

  if (flowArrowsEnabled && isTransmissionGroup(group)) {
    updateFlowArrowsForGroup(state);
  }
}

function buildLayerControl(group) {
  const sectionId = getGroupSectionName(group);
  const sectionCard = getOrCreateSectionCard(sectionId);
  if (!sectionCard) {
    return;
  }

  let targetContainer = sectionCard.body;
  let subgroupControl = null;
  const subgroupLabel = getStatusSubgroupLabel(group);
  if (subgroupLabel) {
    let subgroup = sectionCard.subgroupContainers.get(subgroupLabel);
    if (!subgroup) {
      subgroup = document.createElement("div");
      subgroup.className = "power-plant-subgroup";
      sectionCard.body.appendChild(subgroup);
      sectionCard.subgroupContainers.set(subgroupLabel, subgroup);

      const subgroupMasterRow = document.createElement("label");
      subgroupMasterRow.className = "layer-row power-plant-subgroup-master";

      const subgroupMasterCheckbox = document.createElement("input");
      subgroupMasterCheckbox.type = "checkbox";
      subgroupMasterCheckbox.checked = false;

      const subgroupMasterText = document.createElement("span");
      subgroupMasterText.className = "power-plant-subgroup-title";
      subgroupMasterText.textContent = subgroupLabel;

      subgroupMasterRow.appendChild(subgroupMasterCheckbox);
      subgroupMasterRow.appendChild(subgroupMasterText);
      subgroup.appendChild(subgroupMasterRow);

      subgroupControl = {
        container: subgroup,
        masterCheckbox: subgroupMasterCheckbox,
        childCheckboxes: [],
        isSyncing: false,
      };

      subgroupMasterCheckbox.addEventListener("change", () => {
        subgroupControl.isSyncing = true;
        const nextChecked = subgroupMasterCheckbox.checked;

        for (const childCheckbox of subgroupControl.childCheckboxes) {
          if (childCheckbox.checked !== nextChecked) {
            childCheckbox.checked = nextChecked;
            childCheckbox.dispatchEvent(new Event("change"));
          }

          // Keep voltage-level controls synchronized for grouped Substations/Transmission.
          const groupState = findRuntimeStateByCheckbox(childCheckbox);
          if (groupState && groupState.loaded && isVoltageGroupedGroup(groupState.group)) {
            setAllVoltageVisibility(groupState, nextChecked);
          }
        }

        subgroupControl.isSyncing = false;
        updateSubgroupMaster(subgroupControl);
      });

      sectionCard.subgroupControls.set(subgroupLabel, subgroupControl);
    }

    subgroupControl = sectionCard.subgroupControls.get(subgroupLabel) || null;
    targetContainer = subgroup;
  }

  const row = document.createElement("label");
  row.className = "layer-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = group.defaultVisible;

  let swatch;
  if (isSubstationGroup(group)) {
    swatch = createSubstationSwatch(group.color, isPlannedStatusGroup(group));
  } else if (isTransmissionGroup(group)) {
    swatch = createTransmissionSwatch(group.color, isPlannedStatusGroup(group));
  } else if (isIsolatedSystemsGroup(group)) {
    swatch = createTriangleSwatch(group.color);
  } else if (isPlannedGroup(group)) {
    swatch = createCircleSwatch(group.color, true);
  } else {
    swatch = document.createElement("span");
    swatch.className = "layer-swatch";
    swatch.style.backgroundColor = group.color;
  }

  const text = document.createElement("span");
  let rowLabel = group.label;
  let hideRow = false;

  // Prevent duplicate wording like "Planned" under a "Planned" subgroup header.
  if (subgroupLabel && normalizeLabelText(group.label) === normalizeLabelText(subgroupLabel)) {
    if (group.section === "Power plants") {
      rowLabel = group.section;
    } else {
      rowLabel = "";
      hideRow = true;
    }
  }

  text.textContent = rowLabel;

  row.appendChild(checkbox);
  row.appendChild(swatch);
  if (rowLabel) {
    text.textContent = rowLabel;
    row.appendChild(text);
  }
  if (!hideRow) {
    targetContainer.appendChild(row);
  }

  const voltageFilterContainer = document.createElement("div");
  voltageFilterContainer.className = "voltage-filter-container";
  targetContainer.appendChild(voltageFilterContainer);

  const state = runtime.get(group.id);
  state.checkbox = checkbox;
  state.group = group;
  state.voltageFilterContainer = voltageFilterContainer;
  voltageFilterContainer.style.display = isVoltageGroupedGroup(group) ? "block" : "none";

  if (subgroupControl) {
    subgroupControl.childCheckboxes.push(checkbox);
    updateSubgroupMaster(subgroupControl);
  }

  checkbox.addEventListener("change", async () => {
    if (!state.loaded) {
      await loadLayerGroup(group);
    }

    if (!state.dataLayer) {
      return;
    }

    if (checkbox.checked) {
      state.dataLayer.addTo(map);
    } else {
      map.removeLayer(state.dataLayer);
    }

    if (subgroupControl) {
      updateSubgroupMaster(subgroupControl);
    }

    if (isTransmissionGroup(group)) {
      updateFlowArrowsForGroup(state);
    }

    if (isVoltageGroupedGroup(group)) {
      if (!checkbox.checked) {
        removeStatus(group.id);
        removeVoltageStatus(group, state);
      } else {
        renderVoltageStatus(group, state);
      }
    } else if (!checkbox.checked) {
      removeStatus(group.id);
    } else if (state.loaded && state.statusMessage) {
      setStatus(group.id, state.statusKind || "ok", state.statusMessage);
    }
  });
}

async function initialize() {
  for (const group of LAYER_GROUPS) {
    buildLayerControl(group);
  }

  // Preload default-visible layers plus voltage-grouped groups so all voltage filters are ready.
  const preloadGroups = LAYER_GROUPS.filter(
    (entry) => entry.defaultVisible || isVoltageGroupedGroup(entry)
  );

  for (const group of preloadGroups) {
    await loadLayerGroup(group);
  }
}

setLoadingOverlayVisible(true);
const loadingOverlayStartMs = performance.now();
initializeCountrySwitcherNavigation();

initialize()
  .catch((error) => {
  if (!statusListEl) {
    console.error("Initialization failed", error);
    return;
  }

  const message = `Initialization failed: ${error?.message || "unknown error"}`;
  const li = document.createElement("li");
  li.className = "error";
  li.textContent = message;
  statusListEl.appendChild(li);
  console.error(message, error);
})
  .finally(() => {
    setLoadingOverlayVisible(false);
  });

initializeThemeToggle();
initializeStatusPanelToggle();
suppressMapGesturesOnElement(mapUiLeftEl);
suppressMapGesturesOnElement(mapUiRightEl);
suppressMapGesturesOnElement(statusPanelEl);
enableCardDrag(mapTitleCardEl);
enableCardDrag(statusPanelEl);
window.addEventListener("resize", refreshResponsiveCardLayout);
