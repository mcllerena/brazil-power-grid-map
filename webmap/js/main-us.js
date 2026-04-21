import {
  ISO_RECONDUCTORING_CONFIG,
  buildReconductoringPopupHtml,
} from "./reconductoring-us.js";

// Canvas-rendered square marker with diagonal line (substation symbol)
const SquareMarker = L.CircleMarker.extend({
  _updatePath() {
    const renderer = this._renderer;
    if (!renderer || !renderer._ctx) return;
    if (this._empty()) return;
    const ctx = renderer._ctx;
    const p = this._point;
    const r = Math.max(Math.round(this._radius), 1);
    ctx.beginPath();
    ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
    renderer._fillStroke(ctx, this);
    // diagonal line from bottom-left to top-right
    ctx.beginPath();
    ctx.moveTo(p.x - r, p.y + r);
    ctx.lineTo(p.x + r, p.y - r);
    if (this.options.stroke && this.options.weight !== 0) {
      if (ctx.setLineDash) {
        ctx.setLineDash(this.options.dashArray || []);
      }
      ctx.globalAlpha = this.options.opacity ?? 1;
      ctx.lineWidth = this.options.weight;
      ctx.strokeStyle = this.options.color;
      ctx.lineCap = this.options.lineCap || "round";
      ctx.lineJoin = this.options.lineJoin || "round";
      ctx.stroke();
    }
  },
  _containsPoint(p) {
    const r = this._radius + (this.options.weight || 0);
    return Math.abs(p.x - this._point.x) <= r && Math.abs(p.y - this._point.y) <= r;
  },
});

// Canvas-rendered triangle marker (TAP symbol)
const TriangleMarker = L.CircleMarker.extend({
  _updatePath() {
    const renderer = this._renderer;
    if (!renderer || !renderer._ctx) return;
    if (this._empty()) return;
    const ctx = renderer._ctx;
    const p = this._point;
    const r = Math.max(Math.round(this._radius), 1);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);           // top
    ctx.lineTo(p.x + r, p.y + r);       // bottom-right
    ctx.lineTo(p.x - r, p.y + r);       // bottom-left
    ctx.closePath();
    renderer._fillStroke(ctx, this);
  },
  _containsPoint(p) {
    const r = this._radius + (this.options.weight || 0);
    return Math.abs(p.x - this._point.x) <= r && Math.abs(p.y - this._point.y) <= r;
  },
});

// Load and render US substations and TAPs from CSV
async function loadUsSubstationLayer() {
  // Load the substations CSV file
  const csvUrl = makeAbsoluteUrl(`${US_DATA_ROOT}/${encodeURIComponent(US_SUBSTATIONS_FILENAME)}`);
  const csvText = await fetchText(csvUrl);
  const records = parseCsvText(csvText);

  // Group records by voltage and by TAP/substation
  const substationRecordsByVoltage = new Map();
  const tapRecordsByVoltage = new Map();
  let filteredOutCount = 0;

  for (const record of records) {
    const latitude = parseNumericValue(record.LATITUDE);
    const longitude = parseNumericValue(record.LONGITUDE);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      filteredOutCount += 1;
      continue;
    }

    const normalizedVoltage = normalizeVoltageValueLabel(record.MAX_VOLT);
    let group = "other-range";
    let displayLabel = String(record.MAX_VOLT || "Unknown").trim() || "Unknown";
    let sortVoltage = -1;
    let sortPrimaryRank = Number.POSITIVE_INFINITY;

    if (normalizedVoltage && normalizedVoltage !== "-99999") {
      group = US_SUBSTATION_PRIMARY_LEVELS.has(normalizedVoltage) ? "primary" : "other-range";
      displayLabel = formatSubstationVoltageDisplayLabel(normalizedVoltage);
      sortVoltage = Number(normalizedVoltage);
      sortPrimaryRank = getPrimaryVoltageSortRank(normalizedVoltage);
    } else if (normalizedVoltage === "-99999") {
      displayLabel = "-99999";
    }

    const targetMap = isTapRecord(record) ? tapRecordsByVoltage : substationRecordsByVoltage;
    const key = `${displayLabel}||${group}`;
    if (!targetMap.has(key)) {
      targetMap.set(key, {
        rows: [],
        displayLabel,
        group,
        sortVoltage,
        sortPrimaryRank,
      });
    }

    targetMap.get(key).rows.push({
      ...record,
      __lat: latitude,
      __lon: longitude,
      __voltage: normalizedVoltage,
    });
  }

  // Create layer groups and voltage layers
  usSubstationLayer = L.layerGroup();
  usSubstationVoltageLayers = new Map();
  usTapLayer = L.layerGroup();
  usTapVoltageLayers = new Map();

  const groupOrder = { primary: 0, "other-range": 1 };
  const sortEntries = (inputMap) => [...inputMap.values()].sort((a, b) => {
    const groupDelta = (groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99);
    if (groupDelta !== 0) {
      return groupDelta;
    }
    if (a.group === "primary" && b.group === "primary" && a.sortPrimaryRank !== b.sortPrimaryRank) {
      return a.sortPrimaryRank - b.sortPrimaryRank;
    }
    if (a.sortVoltage !== b.sortVoltage) {
      return b.sortVoltage - a.sortVoltage;
    }
    return a.displayLabel.localeCompare(b.displayLabel);
  });

  const sortedSubstationEntries = sortEntries(substationRecordsByVoltage);
  const sortedTapEntries = sortEntries(tapRecordsByVoltage);

  const buildLayerEntries = (entries, targetLayer, targetMap, markerFactory) => {
    entries.forEach((entry, index) => {
      const levelRecords = entry.rows || [];
      const color = getVoltageColorByIndex(index);
      const defaultVoltageMatch = entry.displayLabel.match(/^-?\d+(?:\.\d+)?/);
      const defaultVoltage = defaultVoltageMatch ? defaultVoltageMatch[0] : null;
      const visibleByDefault = entry.group === "primary" && US_DEFAULT_VISIBLE_SUBSTATION_LEVELS.has(defaultVoltage);
      const levelLayer = L.layerGroup();

      for (const row of levelRecords) {
        const marker = markerFactory(row, color);
        bindHoverPersistentPopup(marker, buildSubstationPopupHTML(row));
        levelLayer.addLayer(marker);
      }

      if (visibleByDefault) {
        targetLayer.addLayer(levelLayer);
      }

      targetMap.set(entry.displayLabel, {
        layer: levelLayer,
        visible: visibleByDefault,
        color,
        elementCount: levelRecords.length,
        displayLabel: entry.displayLabel,
        group: entry.group,
      });
    });
  };

  const substationMarker = (row, color) =>
    new SquareMarker([row.__lat, row.__lon], {
      radius: 2,
      color: "#0b0f0f",
      weight: 0.5,
      fillColor: color,
      fillOpacity: 0.88,
    });
  const tapMarker = (row, color) =>
    new TriangleMarker([row.__lat, row.__lon], {
      radius: 1.8,
      color: "#0b0f0f",
      weight: 0.4,
      fillColor: color,
      fillOpacity: 0.85,
    });

  buildLayerEntries(sortedSubstationEntries, usSubstationLayer, usSubstationVoltageLayers, substationMarker);
  buildLayerEntries(sortedTapEntries, usTapLayer, usTapVoltageLayers, tapMarker);

  usSubstationLayer.addTo(map);
  usTapLayer.addTo(map);
  renderUsSubstationVoltageControls();
  renderUsTapVoltageControls();
  updateUsSubstationMasterCheckbox();
}
const US_BOUNDS = [
  [24.4, -125.0],
  [49.6, -66.8],
];
const US_DEFAULT_CENTER = [39.5, -98.35];
const US_DEFAULT_ZOOM = 5;

const THEME_STORAGE_KEY = "webmap-theme";
const US_DATA_ROOT = "../geoinfo/us-data";
const US_TRANSMISSION_BASENAME = "Electric_Power_Transmission_Lines";
const US_PCA_BASENAME = "US_PCA";
const US_SUBSTATIONS_FILENAME = "Substations.csv";
const US_POWER_PLANTS_FILENAME = "Power_Plants.csv";
const US_DATA_CENTERS_ATLAS_CSV = "im3_open_source_data_center_atlas/im3_open_source_data_center_atlas.csv";
const US_DATA_CENTERS_POWER_CSV = "im3_open_source_data_center_atlas/data_centers.csv";
const US_VOLTAGE_PALETTE = [
  "#2563eb",
  "#0891b2",
  "#10b981",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#db2777",
  "#7c3aed",
  "#0f766e",
  "#52525b",
];
const US_ALLOWED_VOLTAGE_LEVELS = ["765", "500", "345", "230", "161", "138", "115", "69", "34.5"];
const US_DEFAULT_VISIBLE_TRANSMISSION_LEVELS = new Set(["765", "500", "345", "230", "161", "138", "115", "69"]);
const US_DEFAULT_VISIBLE_SUBSTATION_LEVELS = new Set();
const US_TRANSMISSION_PRIMARY_LEVELS = new Set(["1000", "765", "500", "450", "400", "348", "169", "115", "69"]);
const US_SUBSTATION_PRIMARY_LEVELS = new Set(["1000", "765", "500", "450", "400", "348", "169", "115", "69"]);
const US_PRIMARY_LEVEL_SORT_ORDER = ["1000", "765", "500", "450", "400", "348", "345", "230", "169", "161", "138", "115", "69", "34.5"];
const US_TYPE_PALETTE = [
  "#e67e22",
  "#1d7db8",
  "#2a9d8f",
  "#9b5f3f",
  "#845ec2",
  "#f2b705",
  "#27ae60",
  "#e07a5f",
  "#6d597a",
  "#ef476f",
  "#0ea5e9",
  "#84cc16",
];
const US_POWER_PLANT_CATEGORY_COLORS = {
  Wind: "#38bdf8",
  Solar: "#facc15",
  Hydroelectric: "#2563eb",
  "Small Hydro": "#3b82f6",
  Biomass: "#22c55e",
  "Fossil Fuel": "#9a3412",
  Nuclear: "#a855f7",
  Geothermal: "#f97316",
  Batteries: "#14b8a6",
  "Flywheel (MES)": "#0ea5a4",
  Other: "#64748b",
  "Not Available": "#6b7280",
};


const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true,
  minZoom: 2.5,
  maxZoom: 17,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 180,
  wheelDebounceTime: 90,
  tap: false, // Fixes Safari map panning bug
}).setView(US_DEFAULT_CENTER, US_DEFAULT_ZOOM);

L.control.zoom({ position: "bottomleft" }).addTo(map);

function recenterMapToDefault() {
  map.setView(US_DEFAULT_CENTER, US_DEFAULT_ZOOM);
}

function addRecenterControlButton() {
  const zoomControl = document.querySelector(".leaflet-control-zoom");
  if (!zoomControl || zoomControl.querySelector(".leaflet-control-recenter")) {
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

let activeBaseLayer = null;
let activeHoverPopupLayer = null;
let usTransmissionLayer = null;
let usTransmissionVoltageLayers = new Map();
let usTransmissionMasterCheckbox = null;
let usTransmissionVoltageContainer = null;
let usTransmissionOtherVoltageContainer = null;
let usTransmissionOtherVoltageCard = null;
let usSubstationLayer = null;
let usSubstationVoltageLayers = new Map();
let usSubstationMasterCheckbox = null;
let usSubstationVoltageContainer = null;
let usSubstationOtherVoltageContainer = null;
let usSubstationOtherVoltageCard = null;
let usTapLayer = null;
let usTapVoltageLayers = new Map();
let usTapVoltageContainer = null;
let usTapOtherVoltageContainer = null;
let usTapOtherVoltageCard = null;
let usPowerPlantLayer = null;
let usPowerPlantTypeLayers = new Map();
let usPowerPlantMasterCheckbox = null;
let usPowerPlantTypeContainer = null;
let usPcaLayer = null;
let usPcaFeatureCollection = null;
let usPcaVisible = false;
let usPcaLoaded = false;
let usDataCenterLayer = null;
let usDataCenterVisible = false;
let usDataCenterLoaded = false;
const usReconductoringLayers = new Map();
const usReconductoringCheckboxes = new Map();
const usReconductoringSummaries = new Map();
const usActiveReconductoringIsos = new Set();
let usStatusTrackingActive = false;

const mapShellEl = document.getElementById("map-shell");
const mapUiLeftEl = document.getElementById("map-ui-left");
const mapUiRightEl = document.getElementById("map-ui-right");
const statusListEl = document.getElementById("status-list");
const statusPanelEl = document.getElementById("status-panel");
const mapTitleCardEl = document.getElementById("map-title-card");

map.getContainer().addEventListener("mouseleave", () => {
  if (activeHoverPopupLayer) {
    activeHoverPopupLayer.closePopup();
    activeHoverPopupLayer = null;
  }
});

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

  const themeToggleEl = document.getElementById("theme-toggle");
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
  const themeToggleEl = document.getElementById("theme-toggle");
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
  const setCollapsedState = (collapsed) => {
    statusPanelEl.classList.toggle("is-collapsed", collapsed);
    body.hidden = collapsed;
    body.setAttribute("aria-hidden", String(collapsed));
    toggleButton.textContent = collapsed ? "Show" : "Hide";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} Status Window`);
  };

  setCollapsedState(false);

  toggleButton.addEventListener("click", () => {
    setCollapsedState(!statusPanelEl.classList.contains("is-collapsed"));
  });
  header.appendChild(toggleButton);
}

function positionUsStatusPanelNearSubstations() {
  if (!statusPanelEl || !mapShellEl) {
    return;
  }

  const substationCard = document.getElementById("section-us-substations");
  if (!substationCard) {
    return;
  }

  const shellRect = mapShellEl.getBoundingClientRect();
  const substationRect = substationCard.getBoundingClientRect();
  const statusRect = statusPanelEl.getBoundingClientRect();

  const gap = 12;
  let left = substationRect.right - shellRect.left + gap;
  const bottom = gap;

  const maxLeft = Math.max(0, shellRect.width - statusRect.width - gap);

  if (left > maxLeft) {
    left = substationRect.left - shellRect.left;
  }

  statusPanelEl.classList.add("draggable-card", "is-floating");
  statusPanelEl.style.left = `${clamp(left, gap, maxLeft)}px`;
  statusPanelEl.style.top = "auto";
  statusPanelEl.style.bottom = `${bottom}px`;
  statusPanelEl.style.right = "auto";
  statusPanelEl.style.width = `${statusRect.width}px`;
  storeCardRelativePosition(statusPanelEl);
}

const loadingOverlayEl = document.getElementById("loading-overlay");

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

function setStatus(statusId, kind, message) {
  if (!statusListEl) {
    return;
  }

  let li = statusListEl.querySelector(`[data-status-id='${statusId}']`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.statusId = statusId;
    statusListEl.appendChild(li);
  }

  li.className = kind;
  li.textContent = message;
}

function setStatusById(statusId, kind, message) {
  setStatus(statusId, kind, message);
}

function removeStatus(statusId) {
  if (!statusListEl) {
    return;
  }

  const li = statusListEl.querySelector(`[data-status-id='${statusId}']`);
  if (li) {
    li.remove();
  }
}

function clearStatusWindow() {
  if (!statusListEl) {
    return;
  }
  statusListEl.innerHTML = "";
}

function countVisibleElements(entryMap) {
  if (!entryMap || !entryMap.size) {
    return 0;
  }
  let count = 0;
  for (const entry of entryMap.values()) {
    if (entry?.visible) {
      count += Number(entry?.elementCount || 0);
    }
  }
  return count;
}

function formatCountLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function appendVisibleEntryStatuses(addItem, options) {
  const { entryMap, idPrefix, nounSingular, nounPlural } = options;
  if (!entryMap || !entryMap.size) {
    return;
  }

  for (const [entryKey, entry] of entryMap.entries()) {
    if (!entry?.visible) {
      continue;
    }

    const label = String(entry.displayLabel || entryKey || "Unknown").trim() || "Unknown";
    const count = Number(entry.elementCount || 0);
    addItem(`${idPrefix}-${label}`, `${label}: ${formatCountLabel(count, nounSingular, nounPlural)}`);
  }
}

function refreshStatusFromVisibility() {
  if (!statusListEl) {
    return;
  }

  statusListEl.innerHTML = "";
  if (!usStatusTrackingActive) {
    return;
  }

  const addItem = (id, text) => {
    const li = document.createElement("li");
    li.dataset.statusId = id;
    li.className = "ok";
    li.textContent = text;
    statusListEl.appendChild(li);
  };

  const pcaVisible = Boolean(usPcaVisible && usPcaLayer && map.hasLayer(usPcaLayer));
  if (pcaVisible) {
    const pcaFeatureCount = (usPcaFeatureCollection?.features || []).length;
    addItem("us-pca", `PCA areas: ${pcaFeatureCount} feature(s) visible`);
  }

  const dataCentersVisible = Boolean(usDataCenterVisible && usDataCenterLayer && map.hasLayer(usDataCenterLayer));
  if (dataCentersVisible) {
    const dataCenterCount = usDataCenterLayer.getLayers().length;
    addItem("us-data-centers", `Data centers: ${dataCenterCount} site(s) visible`);
  }

  appendVisibleEntryStatuses(addItem, {
    entryMap: usTransmissionVoltageLayers,
    idPrefix: "us-transmission",
    nounSingular: "line",
    nounPlural: "lines",
  });

  appendVisibleEntryStatuses(addItem, {
    entryMap: usSubstationVoltageLayers,
    idPrefix: "us-substations",
    nounSingular: "substation",
    nounPlural: "substations",
  });

  appendVisibleEntryStatuses(addItem, {
    entryMap: usTapVoltageLayers,
    idPrefix: "us-taps",
    nounSingular: "tap",
    nounPlural: "taps",
  });

  appendVisibleEntryStatuses(addItem, {
    entryMap: usPowerPlantTypeLayers,
    idPrefix: "us-power-plants",
    nounSingular: "generator",
    nounPlural: "generators",
  });

  for (const isoKey of usActiveReconductoringIsos) {
    const summary = usReconductoringSummaries.get(isoKey);
    if (!summary) {
      continue;
    }
    addItem(`us-reconductoring-${isoKey}`, buildReconductoringStatusText({ label: summary.label, summary }));
  }
}

function activateStatusTracking() {
  usStatusTrackingActive = true;
  refreshStatusFromVisibility();
}

function buildReconductoringStatusText(dataset) {
  const summary = dataset?.summary;
  if (!summary) {
    return "Reconductoring dataset ready";
  }

  return `${dataset.label}: ${summary.existingSegmentCount} existing segment(s)`;
}

function renderUsReconductoringSummary(messageHtml = null) {
  void messageHtml;
}

const US_RECONDUCTORING_STATUS_COLORS = {
  planned: "#2563eb",
  "in operation": "#16a34a",
  "in flight": "#f59e0b",
  initiating: "#7c3aed",
  mixed: "#be185d",
  unknown: "#dc2626",
};

function normalizeReconductoringStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getReconductoringFeatureStatusKey(feature) {
  const projectRecords = Array.isArray(feature?.properties?.project_records)
    ? feature.properties.project_records
    : [];
  const statuses = [...new Set(projectRecords.map((row) => normalizeReconductoringStatus(row?.Status)).filter(Boolean))];
  if (!statuses.length) {
    const fallbackStatus = normalizeReconductoringStatus(feature?.properties?.Status);
    return fallbackStatus || "unknown";
  }
  if (statuses.length > 1) {
    return "mixed";
  }
  return statuses[0];
}

function getReconductoringStatusColor(feature) {
  const statusKey = getReconductoringFeatureStatusKey(feature);
  return US_RECONDUCTORING_STATUS_COLORS[statusKey] || US_RECONDUCTORING_STATUS_COLORS.unknown;
}

function buildUsReconductoringLeafletLayer(dataset) {
  const layerGroup = L.layerGroup();

  const bindPopup = (featureLayer, feature) => {
    bindHoverPersistentPopup(featureLayer, buildReconductoringPopupHtml(feature));
  };

  if (dataset.regionFeatures?.length) {
    const regionLayer = L.geoJSON(
      {
        type: "FeatureCollection",
        features: dataset.regionFeatures,
      },
      {
        style: {
          color: dataset.regionStyle?.color || "#9a6700",
          weight: 1.1,
          fillColor: dataset.regionStyle?.fillColor || "#fbbf24",
          fillOpacity: 0.14,
          dashArray: "6 4",
        },
      }
    );
    layerGroup.addLayer(regionLayer);
  }

  if (dataset.existingFeatures?.length) {
    const existingLayer = L.geoJSON(
      {
        type: "FeatureCollection",
        features: dataset.existingFeatures,
      },
      {
        style: (feature) => ({
          color: getReconductoringStatusColor(feature),
          weight: 3,
          opacity: 0.95,
        }),
        onEachFeature: (feature, featureLayer) => bindPopup(featureLayer, feature),
      }
    );
    layerGroup.addLayer(existingLayer);
  }

  if (dataset.newLineFeatures?.length) {
    const newLayer = L.geoJSON(
      {
        type: "FeatureCollection",
        features: dataset.newLineFeatures,
      },
      {
        style: (feature) => ({
          color: getReconductoringStatusColor(feature),
          weight: 3.2,
          opacity: 0.96,
        }),
        onEachFeature: (feature, featureLayer) => bindPopup(featureLayer, feature),
      }
    );
    layerGroup.addLayer(newLayer);
  }

  return layerGroup;
}

async function ensureUsReconductoringDataset(isoKey) {
  const datasetUrl = makeAbsoluteUrl(`./data/reconductoring-us/${encodeURIComponent(isoKey)}.json`);
  const response = await fetch(datasetUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${datasetUrl}`);
  }
  return response.json();
}

async function ensureUsReconductoringLayerPrepared(isoKey) {
  if (usReconductoringLayers.has(isoKey)) {
    return usReconductoringLayers.get(isoKey);
  }

  const dataset = await ensureUsReconductoringDataset(isoKey);
  const layer = buildUsReconductoringLeafletLayer(dataset);
  usReconductoringLayers.set(isoKey, layer);
  return layer;
}

async function syncUsReconductoringLayer(isoKey, shouldShow) {
  const statusId = `us-reconductoring-${isoKey}`;
  const checkbox = usReconductoringCheckboxes.get(isoKey);

  if (!shouldShow) {
    const existingLayer = usReconductoringLayers.get(isoKey);
    if (existingLayer && map.hasLayer(existingLayer)) {
      map.removeLayer(existingLayer);
    }
    usReconductoringLayers.delete(isoKey);
    usReconductoringSummaries.delete(isoKey);
    usActiveReconductoringIsos.delete(isoKey);
    removeStatus(statusId);
    renderUsReconductoringSummary();
    activateStatusTracking();
    return;
  }

  try {
    if (checkbox) {
      checkbox.disabled = true;
    }
    renderUsReconductoringSummary(`
      <strong>${isoKey.toUpperCase()}</strong><br />
      Preparing reconductoring dataset...
    `);
    const dataset = await ensureUsReconductoringDataset(isoKey);
    const layer = await ensureUsReconductoringLayerPrepared(isoKey);

    if (!map.hasLayer(layer)) {
      layer.addTo(map);
    }

    usActiveReconductoringIsos.add(isoKey);
    usReconductoringSummaries.set(isoKey, {
      ...dataset.summary,
      label: dataset.label,
    });
    setStatusById(statusId, "ok", buildReconductoringStatusText(dataset));
    renderUsReconductoringSummary(`
      <strong>${dataset.label}</strong><br />
      States: ${dataset.summary.states.join(", ")}<br />
      ReEDS candidate lines in region: ${dataset.summary.candidateLineCount}<br />
      Existing reconductoring segments: ${dataset.summary.existingSegmentCount}<br />
      New direct reconductoring links: ${dataset.summary.newSegmentCount}<br />
      Substation pairs tracked: ${dataset.summary.substationPairCount}
    `);
    activateStatusTracking();
  } catch (error) {
    if (checkbox) {
      checkbox.checked = false;
    }
    usActiveReconductoringIsos.delete(isoKey);
    setStatusById(statusId, "warn", `${isoKey.toUpperCase()} reconductoring unavailable: ${error?.message || "unknown error"}`);
    renderUsReconductoringSummary(`
      <strong>${isoKey.toUpperCase()} reconductoring unavailable.</strong><br />
      ${error?.message || "Unknown error"}
    `);
  } finally {
    if (checkbox && ISO_RECONDUCTORING_CONFIG.find((entry) => entry.key === isoKey)?.enabled) {
      checkbox.disabled = false;
    }
  }
}

function normalizeVoltageValueLabel(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return String(Number(numeric.toFixed(3))).replace(/\.0+$/, "");
}

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

function getVoltClassValue(properties) {
  const props = properties || {};
  const direct = props.VOLT_CLASS ?? props.volt_class ?? props.Volt_Class;
  if (direct !== null && direct !== undefined) {
    const text = String(direct).trim().toUpperCase();
    if (text) {
      return text;
    }
  }

  for (const [key, value] of Object.entries(props)) {
    if (!/volt.*class/i.test(key)) {
      continue;
    }

    const text = String(value ?? "").trim().toUpperCase();
    if (text) {
      return text;
    }
  }

  return "";
}

function getCurrentTypeFromVoltClass(properties) {
  const voltClass = getVoltClassValue(properties);
  return /\bDC\b/.test(voltClass) ? "DC" : "AC";
}

function getPrimaryVoltageSortRank(voltageLabel) {
  const index = US_PRIMARY_LEVEL_SORT_ORDER.indexOf(voltageLabel);
  if (index >= 0) {
    return index;
  }

  const value = Number(voltageLabel);
  if (Number.isFinite(value)) {
    return 1000 - value;
  }

  return Number.POSITIVE_INFINITY;
}

function formatTransmissionVoltageDisplayLabel(voltageLabel, currentType) {
  if (!voltageLabel || voltageLabel === "Unknown") {
    return "Unknown";
  }
  return `${voltageLabel} kV ${currentType}`;
}

function formatSubstationVoltageDisplayLabel(voltageLabel) {
  if (!voltageLabel || voltageLabel === "Unknown") {
    return "Unknown";
  }

  const currentType = voltageLabel === "348" || voltageLabel === "1000" ? "DC" : "AC";
  return `${voltageLabel} kV ${currentType}`;
}

function setCardVisibility(card, visible) {
  if (!card) {
    return;
  }

  card.classList.toggle("is-hidden-card", !visible);
}

function positionPopupCardNearAnchor(card, anchorElement) {
  if (!card || !anchorElement || !mapShellEl) {
    return;
  }

  const shellRect = mapShellEl.getBoundingClientRect();
  const anchorRect = anchorElement.getBoundingClientRect();
  const cardWidth = card.offsetWidth || 360;
  const cardHeight = card.offsetHeight || 260;

  let left = anchorRect.right - shellRect.left + 10;
  if (left + cardWidth > shellRect.width - 8) {
    left = anchorRect.left - shellRect.left - cardWidth - 10;
  }

  let top = anchorRect.top - shellRect.top;
  // Clamp left/top so card stays in viewport
  left = Math.max(8, Math.min(left, shellRect.width - cardWidth - 8));
  top = Math.max(8, Math.min(top, shellRect.height - cardHeight - 8));

  // On small screens, force card fully visible
  if (window.innerWidth < cardWidth + 16) {
    left = 8;
    card.style.width = `calc(100vw - 16px)`;
  }
  if (window.innerHeight < cardHeight + 16) {
    top = 8;
    card.style.maxHeight = `calc(100vh - 16px)`;
    card.style.overflow = 'auto';
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  storeCardRelativePosition(card);
}

function togglePopupCard(card, anchorElement) {
  if (!card) {
    return;
  }

  const shouldShow = card.classList.contains("is-hidden-card");
  setCardVisibility(card, shouldShow);
  if (shouldShow) {
    positionPopupCardNearAnchor(card, anchorElement);
  }
}

function isTapRecord(record) {
  const type = String(record?.TYPE || "").trim().toUpperCase();
  return type.includes("TAP");
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
    card.style.left = `${Math.min(Math.max(0, nextX), Math.max(0, maxX))}px`;
    card.style.top = `${Math.min(Math.max(0, nextY), Math.max(0, maxY))}px`;
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
    if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, input, a, label")) {
      return;
    }

    const cardRect = card.getBoundingClientRect();
    shellRect = mapShellEl.getBoundingClientRect();
    offsetX = event.clientX - cardRect.left;
    offsetY = event.clientY - cardRect.top;
    pointerId = event.pointerId;

    const isAlreadyFloating = card.classList.contains("is-floating");
    card.classList.add("draggable-card", "is-dragging");

    if (!isAlreadyFloating) {
      card.classList.add("is-floating");
      card.style.width = `${cardRect.width}px`;

      originalParent = card.parentElement;
      if (originalParent && originalParent !== mapShellEl && !placeholder) {
        placeholder = document.createElement("div");
        placeholder.className = "card-placeholder";
        placeholder.style.width = `${cardRect.width}px`;
        placeholder.style.height = `${cardRect.height}px`;
        placeholder.style.flex = "0 0 auto";

        const computedOrder = window.getComputedStyle(card).order;
        if (computedOrder) {
          placeholder.style.order = computedOrder;
        }

        originalParent.insertBefore(placeholder, card.nextSibling);
      }

      mapShellEl.appendChild(card);
    }

    card.style.left = `${cardRect.left - shellRect.left}px`;
    card.style.top = `${cardRect.top - shellRect.top}px`;
    storeCardRelativePosition(card);
    clampCardPositionToShell(card);
    card.setPointerCapture(pointerId);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

function enableSectionCardDrag(card) {
  if (!card) {
    return;
  }

  const header = card.querySelector(".section-card-header");
  enableCardDrag(card, header || card);
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

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function getShpParser() {
  const parser = window.shp || window.shpjs;
  if (typeof parser !== "function") {
    throw new Error("shpjs parser is unavailable (window.shp)");
  }
  return parser;
}

function toFeatureCollection(parsedData, sourceName) {
  if (Array.isArray(parsedData)) {
    const features = parsedData.flatMap((item) => item?.features || []);
    return {
      type: "FeatureCollection",
      features: features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature?.properties || {}),
          source_file: sourceName,
        },
      })),
    };
  }

  if (parsedData?.type === "FeatureCollection") {
    return {
      type: "FeatureCollection",
      features: (parsedData.features || []).map((feature) => ({
        ...feature,
        properties: {
          ...(feature?.properties || {}),
          source_file: sourceName,
        },
      })),
    };
  }

  return { type: "FeatureCollection", features: [] };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPopupHTML(feature) {
  const properties = feature?.properties || {};
  const keys = Object.keys(properties).slice(0, 20);
  if (!keys.length) {
    return "No attributes available.";
  }

  const rows = keys
    .map((key) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(properties[key] ?? "-")}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function bindHoverPersistentPopup(layer, popupHtml) {
  layer.bindPopup(popupHtml, {
    closeButton: true,
    autoClose: true,
    closeOnClick: false,
    closeOnEscapeKey: true,
  });

  layer.on("mouseover", () => {
    if (activeHoverPopupLayer && activeHoverPopupLayer !== layer) {
      activeHoverPopupLayer.closePopup();
    }

    layer.openPopup();
    activeHoverPopupLayer = layer;
  });

  layer.on("popupclose", () => {
    if (activeHoverPopupLayer === layer) {
      activeHoverPopupLayer = null;
    }
  });
}

function buildSubstationPopupHTML(properties) {
  const fields = [
    ["NAME", properties.NAME],
    ["CITY", properties.CITY],
    ["STATE", properties.STATE],
    ["ZIP", properties.ZIP],
    ["TYPE", properties.TYPE],
    ["STATUS", properties.STATUS],
    ["COUNTY", properties.COUNTY],
    ["MAX_VOLT", properties.MAX_VOLT],
    ["MIN_VOLT", properties.MIN_VOLT],
  ];

  const rows = fields
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "-")}</td></tr>`)
    .join("");

  return `<table>${rows}</table>`;
}

function buildPowerPlantPopupHTML(properties) {
  const category = resolvePowerPlantCategoryLabel(properties, null);
  const fields = [
    ["NAME", properties.NAME],
    ["ADDRESS", properties.ADDRESS],
    ["CITY", properties.CITY],
    ["STATE", properties.STATE],
    ["ZIP", properties.ZIP],
    ["CATEGORY", category],
    ["NAICS_DESC", properties.NAICS_DESC],
    ["TYPE", properties.TYPE],
    ["STATUS", properties.STATUS],
    ["COUNTY", properties.COUNTY],
    ["CAP_FACTOR", properties.CAP_FACTOR],
    ["SUB_1", properties.SUB_1],
    ["SUB_2", properties.SUB_2],
  ];

  const rows = fields
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "-")}</td></tr>`)
    .join("");

  return `<table>${rows}</table>`;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => String(header).trim());
  const records = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    records.push(row);
  }

  return records;
}

function parseNumericValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseLooseNumericValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const cleaned = text.replaceAll(",", "");
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractPowerPlantCapacityMw(record) {
  const preferredFields = ["OPER_CAP", "SUMMER_CAP", "WINTER_CAP", "PLAN_CAP", "RETIRE_CAP", "NET_GEN"];
  for (const field of preferredFields) {
    const value = parseLooseNumericValue(record?.[field]);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  for (const [field, rawValue] of Object.entries(record || {})) {
    if (!/(?:\bmw\b|\bcap\b|capacity|nameplate)/i.test(field)) {
      continue;
    }

    const value = parseLooseNumericValue(rawValue);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return null;
}

function getPowerPlantRadiusForMw(capacityMw, minCapacityMw, maxCapacityMw) {
  const minRadius = 3.2;
  const maxRadius = 10.5;

  if (!Number.isFinite(capacityMw) || !Number.isFinite(minCapacityMw) || !Number.isFinite(maxCapacityMw)) {
    return 4.8;
  }

  if (maxCapacityMw <= minCapacityMw) {
    return (minRadius + maxRadius) / 2;
  }

  // Use sqrt scaling so very large plants do not dominate marker size.
  const safeValue = Math.max(0, capacityMw);
  const t = (Math.sqrt(safeValue) - Math.sqrt(minCapacityMw)) / (Math.sqrt(maxCapacityMw) - Math.sqrt(minCapacityMw));
  const clamped = Math.max(0, Math.min(1, t));
  return minRadius + clamped * (maxRadius - minRadius);
}

function toTitleCase(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cleanNaicsLabel(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  let normalized = text.toUpperCase();
  normalized = normalized.replace(/\bELECTRIC POWER GENERATION\b/g, "");
  normalized = normalized.replace(/\bPOWER GENERATION\b/g, "");
  normalized = normalized.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return toTitleCase(normalized);
}

function cleanTypeLabel(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return "Unknown";
  }
  return toTitleCase(text);
}

function normalizeTypeKey(raw) {
  return String(raw || "").trim().toUpperCase();
}

function isOtherNaics(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (!text) {
    return false;
  }

  return text.startsWith("OTHER") || /\bOTHER\b/.test(text);
}

function isNotAvailableNaics(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (!text) {
    return false;
  }

  return (
    text.includes("NOT AVAILABLE") ||
    text === "N/A" ||
    text === "NA" ||
    text === "UNKNOWN"
  );
}

function isNotAvailableType(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (!text) {
    return true;
  }

  return (
    text.includes("NOT AVAILABLE") ||
    text === "N/A" ||
    text === "NA" ||
    text === "UNKNOWN" ||
    text === "UNK"
  );
}

function inferCategoryFromTypeWhenNaicsIsOther(typeKey) {
  const key = String(typeKey || "").trim().toUpperCase();
  if (!key) {
    return null;
  }

  if (key.includes("BATTERIES") || key.includes("BATTERY")) {
    return "Batteries";
  }

  if (key.includes("FLYWHEEL")) {
    return "Flywheel (MES)";
  }

  if (key.includes("SOLAR PHOTOVOLTAIC") || key.includes("SOLAR")) {
    return "Solar";
  }

  if (key.includes("NATURAL GAS FIRED COMBINED CYCLE")) {
    return "Fossil Fuel";
  }

  if (key.includes("HYDRO")) {
    return "Hydroelectric";
  }

  if (key.includes("NUCLEAR")) {
    return "Nuclear";
  }

  if (key.includes("WIND")) {
    return "Wind";
  }

  if (
    key.includes("NATURAL GAS") ||
    key.includes("COAL") ||
    key.includes("PETROLEUM") ||
    key.includes("OIL") ||
    key.includes("DIESEL") ||
    key.includes("COMBUSTION TURBINE") ||
    key.includes("STEAM")
  ) {
    return "Fossil Fuel";
  }

  if (key.includes("GEOTHERMAL")) {
    return "Geothermal";
  }

  if (key.includes("BIOMASS") || key.includes("WOOD") || key.includes("WASTE")) {
    return "Biomass";
  }

  return null;
}

function resolvePowerPlantCategoryLabel(record, fallbackByType) {
  const naicsRaw = record?.NAICS_DESC;
  const fromNaics = cleanNaicsLabel(naicsRaw);
  const typeKey = normalizeTypeKey(record?.TYPE);
  const naicsUnavailable = isNotAvailableNaics(naicsRaw) || fromNaics === "Not Available";
  const typeUnavailable = isNotAvailableType(record?.TYPE);

  // Special handling: when NAICS is OTHER*/NOT AVAILABLE*, infer from TYPE.
  if (isOtherNaics(naicsRaw) || naicsUnavailable || fromNaics === "Other") {
    if (naicsUnavailable && typeUnavailable) {
      return "Not Available";
    }

    const inferredFromType = inferCategoryFromTypeWhenNaicsIsOther(typeKey);
    if (inferredFromType) {
      return inferredFromType;
    }

    if (fallbackByType && typeKey && fallbackByType.has(typeKey)) {
      const fallbackLabel = fallbackByType.get(typeKey);
      if (fallbackLabel && fallbackLabel !== "Other") {
        return fallbackLabel;
      }
    }

    return naicsUnavailable ? "Not Available" : "Other";
  }

  if (fromNaics) {
    return fromNaics;
  }

  const inferredFromType = inferCategoryFromTypeWhenNaicsIsOther(typeKey);
  if (inferredFromType) {
    return inferredFromType;
  }

  if (fallbackByType && typeKey && fallbackByType.has(typeKey)) {
    return fallbackByType.get(typeKey);
  }

  return cleanTypeLabel(record?.TYPE);
}

function normalizeVoltageLabel(feature) {
  const properties = feature?.properties || {};
  const exact = properties.VOLTAGE ?? properties.Voltage ?? properties.voltage;
  if (exact !== null && exact !== undefined && String(exact).trim()) {
    return String(exact).trim();
  }

  for (const [key, value] of Object.entries(properties)) {
    if (!/voltage/i.test(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return "Unknown";
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

function getVoltageColorByIndex(index) {
  if (index < US_VOLTAGE_PALETTE.length) {
    return US_VOLTAGE_PALETTE[index];
  }

  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 70%, 50%)`;
}

function getVoltageColorForLabel(label) {
  const transmissionEntry = usTransmissionVoltageLayers.get(label);
  if (transmissionEntry?.color) {
    return transmissionEntry.color;
  }

  const index = US_ALLOWED_VOLTAGE_LEVELS.indexOf(label);
  return getVoltageColorByIndex(index >= 0 ? index : 0);
}

function normalizeTypeLabel(value) {
  const text = String(value || "").trim();
  return text || "Unknown";
}

function getTypeColorByIndex(index) {
  if (index < US_TYPE_PALETTE.length) {
    return US_TYPE_PALETTE[index];
  }
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 68%, 52%)`;
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getPcaStateKey(properties) {
  const props = properties || {};
  return String(props.st ?? props.ST ?? props.rb ?? props.RB ?? "Unknown").trim() || "Unknown";
}

function getPcaColorForStateKey(stateKey) {
  const hue = hashString(stateKey) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

function rebuildUsPcaLayer() {
  if (!usPcaFeatureCollection) {
    return;
  }

  if (usPcaLayer && map.hasLayer(usPcaLayer)) {
    map.removeLayer(usPcaLayer);
  }

  const colorByStateKey = new Map();
  for (const feature of usPcaFeatureCollection.features || []) {
    const key = getPcaStateKey(feature?.properties || {});
    if (!colorByStateKey.has(key)) {
      colorByStateKey.set(key, getPcaColorForStateKey(key));
    }
  }

  usPcaLayer = L.geoJSON(usPcaFeatureCollection, {
    style: (feature) => {
      const stateKey = getPcaStateKey(feature?.properties || {});
      return {
      color: "#1f2937",
      weight: 0.7,
      fillColor: colorByStateKey.get(stateKey) || "#4f46e5",
      fillOpacity: 0.28,
      };
    },
    onEachFeature: (feature, featureLayer) => {
      bindHoverPersistentPopup(featureLayer, buildPopupHTML(feature));
    },
  });

  if (usPcaVisible) {
    usPcaLayer.addTo(map);
  }
}

function buildUsPcaControl() {
  if (!mapUiRightEl) {
    return;
  }

  const card = document.createElement("section");
  card.id = "section-us-pca";
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";
  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "PCA Areas";
  header.appendChild(title);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";

  const showRow = document.createElement("label");
  showRow.className = "voltage-filter-row";
  const showCheckbox = document.createElement("input");
  showCheckbox.type = "checkbox";
  showCheckbox.checked = usPcaVisible;
  const showText = document.createElement("span");
  showText.textContent = "Show PCA areas";
  showRow.appendChild(showCheckbox);
  showRow.appendChild(showText);
  body.appendChild(showRow);
  card.appendChild(body);

  if (mapUiRightEl.firstChild) {
    mapUiRightEl.insertBefore(card, mapUiRightEl.firstChild);
  } else {
    mapUiRightEl.appendChild(card);
  }

  enableSectionCardDrag(card);

  showCheckbox.addEventListener("change", () => {
    const applyToggle = async () => {
      usPcaVisible = showCheckbox.checked;

      if (usPcaVisible && !usPcaLoaded) {
        try {
          await loadUsPcaLayer();
        } catch (pcaError) {
          setStatusById("us-pca", "warn", `US PCA load skipped: ${pcaError?.message || "unknown error"}`);
          console.warn("US PCA load skipped", pcaError);
          usPcaVisible = false;
          showCheckbox.checked = false;
          activateStatusTracking();
          return;
        }
      }

      if (!usPcaLayer) {
        activateStatusTracking();
        return;
      }

      if (usPcaVisible) {
        usPcaLayer.addTo(map);
      } else if (map.hasLayer(usPcaLayer)) {
        map.removeLayer(usPcaLayer);
      }

      activateStatusTracking();
    };

    applyToggle();
  });

}

function buildDataCenterPopupHTML(record) {
  const powerMw = parseLooseNumericValue(record.power_mw);
  const powerLabel = Number.isFinite(powerMw) ? `${powerMw.toLocaleString(undefined, { maximumFractionDigits: 2 })} MW` : "-";

  const rows = [
    ["Name", record.name || "-"],
    ["Operator", record.operator || "-"],
    ["Power", powerLabel],
    ["Type", record.type || "-"],
    ["State", record.state_abb || record.state || "-"],
    ["County", record.county || "-"],
    ["Sqft", record.sqft || "-"],
  ];

  const tableRows = rows
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "-")}</td></tr>`)
    .join("");

  return `<table>${tableRows}</table>`;
}

function normalizeDataCenterMatchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPowerMatchForAtlasRecord(atlasRecord, indexedPowerRecords) {
  const atlasName = normalizeDataCenterMatchKey(atlasRecord?.name);
  if (atlasName && indexedPowerRecords.byName.has(atlasName)) {
    return indexedPowerRecords.byName.get(atlasName);
  }

  // Conservative fuzzy name match for long names only.
  if (atlasName.length >= 10) {
    const fuzzy = indexedPowerRecords.records.find((row) => row.name.includes(atlasName) || atlasName.includes(row.name));
    if (fuzzy) {
      return fuzzy;
    }
  }

  // Fallback: match on operator + state hints when available.
  const operator = normalizeDataCenterMatchKey(atlasRecord?.operator);
  const stateAbb = String(atlasRecord?.state_abb || "").toUpperCase().trim();
  if (!operator || !stateAbb) {
    return null;
  }

  const byOperator = indexedPowerRecords.byOperator.get(operator) || [];
  const stateMatch = byOperator.find((row) => row.address.includes(`, ${stateAbb} `));
  return stateMatch || null;
}

async function loadUsDataCenterLayer() {
  const atlasCsvUrl = makeAbsoluteUrl(`${US_DATA_ROOT}/${US_DATA_CENTERS_ATLAS_CSV}`);
  const powerCsvUrl = makeAbsoluteUrl(`${US_DATA_ROOT}/${US_DATA_CENTERS_POWER_CSV}`);
  const [atlasCsvText, powerCsvText] = await Promise.all([
    fetchText(atlasCsvUrl),
    fetchText(powerCsvUrl),
  ]);
  const records = parseCsvText(atlasCsvText);
  const powerRecords = parseCsvText(powerCsvText);

  const indexedPowerRecords = {
    byName: new Map(),
    byOperator: new Map(),
    records: [],
  };

  for (const row of powerRecords) {
    const powerMw = parseLooseNumericValue(row["Current power (MW)"]);
    if (!Number.isFinite(powerMw)) {
      continue;
    }

    const normalizedName = normalizeDataCenterMatchKey(row.Name);
    const normalizedOwner = normalizeDataCenterMatchKey(row.Owner);
    const normalizedAddress = String(row.Address || "").toUpperCase();
    const indexedRow = {
      name: normalizedName,
      owner: normalizedOwner,
      address: normalizedAddress,
      powerMw,
    };

    if (normalizedName && !indexedPowerRecords.byName.has(normalizedName)) {
      indexedPowerRecords.byName.set(normalizedName, indexedRow);
    }

    if (normalizedOwner) {
      if (!indexedPowerRecords.byOperator.has(normalizedOwner)) {
        indexedPowerRecords.byOperator.set(normalizedOwner, []);
      }
      indexedPowerRecords.byOperator.get(normalizedOwner).push(indexedRow);
    }

    indexedPowerRecords.records.push(indexedRow);
  }

  usDataCenterLayer = L.layerGroup();

  for (const record of records) {
    const latitude = parseNumericValue(record.lat);
    const longitude = parseNumericValue(record.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const marker = L.circleMarker([latitude, longitude], {
      radius: 5,
      color: "#0b0f0f",
      weight: 0.8,
      fillColor: "#22d3ee",
      fillOpacity: 0.9,
    });

    const powerMatch = findPowerMatchForAtlasRecord(record, indexedPowerRecords);
    if (powerMatch && Number.isFinite(powerMatch.powerMw)) {
      record.power_mw = powerMatch.powerMw;
    }

    bindHoverPersistentPopup(marker, buildDataCenterPopupHTML(record));
    usDataCenterLayer.addLayer(marker);
  }

  usDataCenterLoaded = true;
  if (usDataCenterVisible) {
    usDataCenterLayer.addTo(map);
  }
}

function buildUsDataCenterControl() {
  if (!mapUiRightEl) {
    return;
  }

  const card = document.createElement("section");
  card.id = "section-us-data-centers";
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "Data Centers";
  header.appendChild(title);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";

  const showRow = document.createElement("label");
  showRow.className = "voltage-filter-row";
  const showCheckbox = document.createElement("input");
  showCheckbox.type = "checkbox";
  showCheckbox.checked = usDataCenterVisible;
  const showText = document.createElement("span");
  showText.textContent = "Show data centers";
  showRow.appendChild(showCheckbox);
  showRow.appendChild(showText);
  body.appendChild(showRow);

  card.appendChild(body);
  mapUiRightEl.appendChild(card);
  enableSectionCardDrag(card);

  showCheckbox.addEventListener("change", () => {
    const applyToggle = async () => {
      usDataCenterVisible = showCheckbox.checked;

      if (usDataCenterVisible && !usDataCenterLoaded) {
        try {
          await loadUsDataCenterLayer();
        } catch (error) {
          setStatusById("us-data-centers", "warn", `US data centers load skipped: ${error?.message || "unknown error"}`);
          console.warn("US data centers load skipped", error);
          usDataCenterVisible = false;
          showCheckbox.checked = false;
          activateStatusTracking();
          return;
        }
      }

      if (!usDataCenterLayer) {
        activateStatusTracking();
        return;
      }

      if (usDataCenterVisible) {
        usDataCenterLayer.addTo(map);
      } else if (map.hasLayer(usDataCenterLayer)) {
        map.removeLayer(usDataCenterLayer);
      }

      activateStatusTracking();
    };

    applyToggle();
  });
}

function buildUsReconductoringControl() {
  if (!mapUiRightEl) {
    return;
  }

  const card = document.createElement("section");
  card.id = "section-us-reconductoring";
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "Reconductoring projects";
  header.appendChild(title);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "voltage-filter-container";

  const optionsTitle = document.createElement("label");
  optionsTitle.className = "voltage-filter-title";

  const reconductoringSelectAll = document.createElement("input");
  reconductoringSelectAll.type = "checkbox";

  const optionsTitleSpan = document.createElement("span");
  optionsTitleSpan.textContent = "ISO regions:";

  optionsTitle.appendChild(reconductoringSelectAll);
  optionsTitle.appendChild(optionsTitleSpan);
  optionsWrap.appendChild(optionsTitle);

  const enabledCheckboxes = [];

  for (const iso of ISO_RECONDUCTORING_CONFIG) {
    const row = document.createElement("label");
    row.className = "voltage-filter-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = false;
    checkbox.disabled = !iso.enabled;

    const text = document.createElement("span");
    text.textContent = iso.enabled ? iso.label : `${iso.label} (coming soon)`;

    row.appendChild(checkbox);
    row.appendChild(text);
    optionsWrap.appendChild(row);
    usReconductoringCheckboxes.set(iso.key, checkbox);

    if (iso.enabled) {
      checkbox.addEventListener("change", () => {
        syncUsReconductoringLayer(iso.key, checkbox.checked);
        updateReconductoringSelectAll();
      });
      enabledCheckboxes.push(checkbox);
    } else {
      row.title = `${iso.label} reconductoring is not implemented yet.`;
    }
  }

  const updateReconductoringSelectAll = () => {
    const checkedCount = enabledCheckboxes.filter((cb) => cb.checked).length;
    reconductoringSelectAll.checked = checkedCount > 0;
    reconductoringSelectAll.indeterminate = checkedCount > 0 && checkedCount < enabledCheckboxes.length;
  };

  reconductoringSelectAll.addEventListener("change", () => {
    const nextChecked = reconductoringSelectAll.checked;
    for (const cb of enabledCheckboxes) {
      if (cb.checked !== nextChecked) {
        cb.checked = nextChecked;
        cb.dispatchEvent(new Event("change"));
      }
    }
  });

  updateReconductoringSelectAll();

  body.appendChild(optionsWrap);

  card.appendChild(body);

  const pcaCard = document.getElementById("section-us-pca");
  if (pcaCard?.parentNode) {
    pcaCard.parentNode.insertBefore(card, pcaCard.nextSibling);
  } else {
    mapUiRightEl.appendChild(card);
  }

  enableSectionCardDrag(card);
}

async function loadUsPcaLayer() {
  const parser = getShpParser();
  const basePath = `${US_DATA_ROOT}/${encodeURIComponent(US_PCA_BASENAME)}`;
  const shpUrl = makeAbsoluteUrl(`${basePath}.shp`);
  const dbfUrl = makeAbsoluteUrl(`${basePath}.dbf`);
  const prjUrl = makeAbsoluteUrl(`${basePath}.prj`);
  const cpgUrl = makeAbsoluteUrl(`${basePath}.cpg`);

  const [shpBuffer, dbfBuffer, prjText, cpgText] = await Promise.all([
    fetchArrayBuffer(shpUrl),
    fetchArrayBuffer(dbfUrl),
    fetchOptionalText(prjUrl),
    fetchOptionalText(cpgUrl),
  ]);

  const payload = { shp: shpBuffer, dbf: dbfBuffer };
  if (prjText) {
    payload.prj = prjText;
  }
  if (cpgText) {
    payload.cpg = cpgText;
  }

  const parsed = await parser(payload);
  usPcaFeatureCollection = toFeatureCollection(parsed, US_PCA_BASENAME);
  usPcaLoaded = true;
  rebuildUsPcaLayer();
}

function getPowerPlantCategoryColor(categoryLabel, index) {
  const key = String(categoryLabel || "").trim();
  if (key && US_POWER_PLANT_CATEGORY_COLORS[key]) {
    return US_POWER_PLANT_CATEGORY_COLORS[key];
  }

  return getTypeColorByIndex(index);
}

function updateUsTransmissionMasterCheckbox() {
  if (!usTransmissionMasterCheckbox || !usTransmissionVoltageLayers.size) {
    return;
  }

  const values = [...usTransmissionVoltageLayers.values()];
  const visibleCount = values.filter((entry) => entry.visible).length;
  usTransmissionMasterCheckbox.indeterminate = visibleCount > 0 && visibleCount < values.length;
  usTransmissionMasterCheckbox.checked = visibleCount > 0;
}

function createUsTransmissionSwatch(color) {
  const w = 20;
  const h = 12;
  const el = document.createElement("span");
  el.className = "layer-swatch transmission-swatch";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${color}" stroke-width="2"/></svg>`;
  return el;
}

function usSubstationSvg(size, color, strokeColor) {
  const sw = size > 12 ? 0.8 : 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="${sw / 2}" y="${sw / 2}" width="${size - sw}" height="${size - sw}" fill="${color}" stroke="${strokeColor}" stroke-width="${sw}"/><line x1="${sw / 2}" y1="${size - sw / 2}" x2="${size - sw / 2}" y2="${sw / 2}" stroke="${strokeColor}" stroke-width="${sw}"/></svg>`;
}

function createUsSubstationIcon(color) {
  const size = 12;
  return L.divIcon({
    html: usSubstationSvg(size, color, "#0b0f0f"),
    className: "substation-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createUsSubstationSwatch(color) {
  const el = document.createElement("span");
  el.className = "layer-swatch substation-swatch";
  el.innerHTML = usSubstationSvg(12, color, "#0b0f0f");
  return el;
}

function usTriangleSvg(size, color, strokeColor) {
  const sw = 0.6;
  const cx = size / 2;
  const points = `${cx},${sw / 2} ${size - sw / 2},${size - sw / 2} ${sw / 2},${size - sw / 2}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${points}" fill="${color}" stroke="${strokeColor}" stroke-width="${sw}"/></svg>`;
}

function createUsTapIcon(color) {
  const size = 12;
  return L.divIcon({
    html: usTriangleSvg(size, color, "#0b0f0f"),
    className: "triangle-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createUsTapSwatch(color) {
  const el = document.createElement("span");
  el.className = "layer-swatch triangle-swatch";
  el.innerHTML = usTriangleSvg(12, color, "#0b0f0f");
  return el;
}

function renderUsVoltageControls() {
  if (!usTransmissionVoltageContainer) {
    return;
  }

  const renderContainer = (container, titleText, filterGroup, multiColumn) => {
    if (!container) {
      return;
    }

    container.innerHTML = "";
    container.classList.toggle("is-multi-column", multiColumn);

    const titleRow = document.createElement("label");
    titleRow.className = "voltage-filter-title";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = titleText;

    titleRow.appendChild(selectAllCheckbox);
    titleRow.appendChild(titleSpan);
    container.appendChild(titleRow);

    const target = multiColumn ? document.createElement("div") : container;
    if (multiColumn) {
      target.className = "voltage-filter-grid";
      container.appendChild(target);
    }

    const groupCheckboxes = [];

    for (const [, voltageState] of usTransmissionVoltageLayers.entries()) {
      if (voltageState.group !== filterGroup) {
        continue;
      }

      const row = document.createElement("label");
      row.className = "voltage-filter-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = voltageState.visible;

      const swatch = createUsTransmissionSwatch(voltageState.color);

      const text = document.createElement("span");
      text.textContent = voltageState.displayLabel;

      checkbox.addEventListener("change", () => {
        voltageState.visible = checkbox.checked;
        if (!usTransmissionLayer) {
          return;
        }

        if (checkbox.checked) {
          usTransmissionLayer.addLayer(voltageState.layer);
        } else {
          usTransmissionLayer.removeLayer(voltageState.layer);
        }

        updateUsTransmissionMasterCheckbox();
        updateSelectAllState();
        activateStatusTracking();
      });

      groupCheckboxes.push({ checkbox, voltageState });

      row.appendChild(checkbox);
      row.appendChild(swatch);
      row.appendChild(text);
      target.appendChild(row);
    }

    const updateSelectAllState = () => {
      const checkedCount = groupCheckboxes.filter((entry) => entry.checkbox.checked).length;
      selectAllCheckbox.checked = checkedCount > 0;
      selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupCheckboxes.length;
    };

    selectAllCheckbox.addEventListener("change", () => {
      const nextChecked = selectAllCheckbox.checked;
      for (const entry of groupCheckboxes) {
        if (entry.checkbox.checked !== nextChecked) {
          entry.checkbox.checked = nextChecked;
          entry.checkbox.dispatchEvent(new Event("change"));
        }
      }
    });

    updateSelectAllState();
  };

  renderContainer(usTransmissionVoltageContainer, "Main Voltage Levels:", "primary", false);
  renderContainer(usTransmissionOtherVoltageContainer, "Other Voltage Levels:", "other-levels", true);
}

function updateUsSubstationMasterCheckbox() {
  if (!usSubstationMasterCheckbox || !usSubstationVoltageLayers.size) {
    return;
  }

  const values = [...usSubstationVoltageLayers.values()];
  const visibleCount = values.filter((entry) => entry.visible).length;
  usSubstationMasterCheckbox.indeterminate = visibleCount > 0 && visibleCount < values.length;
  usSubstationMasterCheckbox.checked = visibleCount > 0;
}

function renderUsSubstationVoltageControls() {
  if (!usSubstationVoltageContainer) {
    return;
  }

  const renderContainer = (container, titleText, filterGroup, multiColumn) => {
    if (!container) {
      return;
    }

    container.innerHTML = "";
    container.classList.toggle("is-multi-column", multiColumn);

    const titleRow = document.createElement("label");
    titleRow.className = "voltage-filter-title";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = titleText;

    titleRow.appendChild(selectAllCheckbox);
    titleRow.appendChild(titleSpan);
    container.appendChild(titleRow);

    const target = multiColumn ? document.createElement("div") : container;
    if (multiColumn) {
      target.className = "voltage-filter-grid";
      container.appendChild(target);
    }

    const groupCheckboxes = [];

    for (const [, voltageState] of usSubstationVoltageLayers.entries()) {
      if (voltageState.group !== filterGroup) {
        continue;
      }

      const row = document.createElement("label");
      row.className = "voltage-filter-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = voltageState.visible;

      const swatch = createUsSubstationSwatch(voltageState.color);

      const text = document.createElement("span");
      text.textContent = voltageState.displayLabel;

      checkbox.addEventListener("change", () => {
        voltageState.visible = checkbox.checked;
        if (!usSubstationLayer) {
          return;
        }

        if (checkbox.checked) {
          usSubstationLayer.addLayer(voltageState.layer);
        } else {
          usSubstationLayer.removeLayer(voltageState.layer);
        }

        updateUsSubstationMasterCheckbox();
        updateSelectAllState();
        activateStatusTracking();
      });

      groupCheckboxes.push({ checkbox, voltageState });

      row.appendChild(checkbox);
      row.appendChild(swatch);
      row.appendChild(text);
      target.appendChild(row);
    }

    const updateSelectAllState = () => {
      const checkedCount = groupCheckboxes.filter((entry) => entry.checkbox.checked).length;
      selectAllCheckbox.checked = checkedCount > 0;
      selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupCheckboxes.length;
    };

    selectAllCheckbox.addEventListener("change", () => {
      const nextChecked = selectAllCheckbox.checked;
      for (const entry of groupCheckboxes) {
        if (entry.checkbox.checked !== nextChecked) {
          entry.checkbox.checked = nextChecked;
          entry.checkbox.dispatchEvent(new Event("change"));
        }
      }
    });

    updateSelectAllState();
  };

  renderContainer(usSubstationVoltageContainer, "Main Voltage Levels:", "primary", false);
  renderContainer(usSubstationOtherVoltageContainer, "Other Voltage Range:", "other-range", true);
}

function renderUsTapVoltageControls() {
  if (!usTapVoltageContainer) {
    return;
  }

  const renderContainer = (container, titleText, filterGroup, multiColumn) => {
    if (!container) {
      return;
    }

    container.innerHTML = "";
    container.classList.toggle("is-multi-column", multiColumn);

    const titleRow = document.createElement("label");
    titleRow.className = "voltage-filter-title";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = titleText;

    titleRow.appendChild(selectAllCheckbox);
    titleRow.appendChild(titleSpan);
    container.appendChild(titleRow);

    const target = multiColumn ? document.createElement("div") : container;
    if (multiColumn) {
      target.className = "voltage-filter-grid";
      container.appendChild(target);
    }

    const groupCheckboxes = [];

    for (const [, voltageState] of usTapVoltageLayers.entries()) {
      if (voltageState.group !== filterGroup) {
        continue;
      }

      const row = document.createElement("label");
      row.className = "voltage-filter-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = voltageState.visible;

      const swatch = createUsTapSwatch(voltageState.color);

      const text = document.createElement("span");
      text.textContent = voltageState.displayLabel;

      checkbox.addEventListener("change", () => {
        voltageState.visible = checkbox.checked;
        if (!usTapLayer) {
          return;
        }

        if (checkbox.checked) {
          usTapLayer.addLayer(voltageState.layer);
        } else {
          usTapLayer.removeLayer(voltageState.layer);
        }

        updateSelectAllState();
        activateStatusTracking();
      });

      groupCheckboxes.push({ checkbox, voltageState });

      row.appendChild(checkbox);
      row.appendChild(swatch);
      row.appendChild(text);
      target.appendChild(row);
    }

    const updateSelectAllState = () => {
      const checkedCount = groupCheckboxes.filter((entry) => entry.checkbox.checked).length;
      selectAllCheckbox.checked = checkedCount > 0;
      selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupCheckboxes.length;
    };

    selectAllCheckbox.addEventListener("change", () => {
      const nextChecked = selectAllCheckbox.checked;
      for (const entry of groupCheckboxes) {
        if (entry.checkbox.checked !== nextChecked) {
          entry.checkbox.checked = nextChecked;
          entry.checkbox.dispatchEvent(new Event("change"));
        }
      }
    });

    updateSelectAllState();
  };

  renderContainer(usTapVoltageContainer, "Main Voltage Levels:", "primary", false);
  renderContainer(usTapOtherVoltageContainer, "Other Voltage Range:", "other-range", true);
}

function updateUsPowerPlantMasterCheckbox() {
  if (!usPowerPlantMasterCheckbox || !usPowerPlantTypeLayers.size) {
    return;
  }

  const values = [...usPowerPlantTypeLayers.values()];
  const visibleCount = values.filter((entry) => entry.visible).length;
  usPowerPlantMasterCheckbox.indeterminate = visibleCount > 0 && visibleCount < values.length;
  usPowerPlantMasterCheckbox.checked = visibleCount > 0;
}

function renderUsPowerPlantTypeControls() {
  if (!usPowerPlantTypeContainer) {
    return;
  }

  usPowerPlantTypeContainer.innerHTML = "";

  const titleRow = document.createElement("label");
  titleRow.className = "voltage-filter-title";

  const selectAllCheckbox = document.createElement("input");
  selectAllCheckbox.type = "checkbox";

  const titleSpan = document.createElement("span");
  titleSpan.textContent = "By TYPE:";

  titleRow.appendChild(selectAllCheckbox);
  titleRow.appendChild(titleSpan);
  usPowerPlantTypeContainer.appendChild(titleRow);

  const groupCheckboxes = [];

  for (const [typeLabel, typeState] of usPowerPlantTypeLayers.entries()) {
    const row = document.createElement("label");
    row.className = "voltage-filter-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = typeState.visible;

      const swatch = document.createElement("span");
      swatch.className = "layer-swatch";
      swatch.style.backgroundColor = typeState.color;

    const text = document.createElement("span");
    text.textContent = typeLabel;

    checkbox.addEventListener("change", () => {
      typeState.visible = checkbox.checked;
      if (!usPowerPlantLayer) {
        return;
      }

      if (checkbox.checked) {
        usPowerPlantLayer.addLayer(typeState.layer);
      } else {
        usPowerPlantLayer.removeLayer(typeState.layer);
      }

      updateUsPowerPlantMasterCheckbox();
      updatePowerPlantSelectAllState();
      activateStatusTracking();
    });

    groupCheckboxes.push({ checkbox, typeState });

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    usPowerPlantTypeContainer.appendChild(row);
  }

  const updatePowerPlantSelectAllState = () => {
    const checkedCount = groupCheckboxes.filter((entry) => entry.checkbox.checked).length;
    selectAllCheckbox.checked = checkedCount > 0;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupCheckboxes.length;
  };

  selectAllCheckbox.addEventListener("change", () => {
    const nextChecked = selectAllCheckbox.checked;
    for (const entry of groupCheckboxes) {
      if (entry.checkbox.checked !== nextChecked) {
        entry.checkbox.checked = nextChecked;
        entry.checkbox.dispatchEvent(new Event("change"));
      }
    }
  });

  updatePowerPlantSelectAllState();
}

function buildUsTransmissionControl() {
  if (!mapUiLeftEl) {
    return;
  }

  const card = document.createElement("section");
  card.id = "section-us-transmission";
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "Transmission lines";
  header.appendChild(title);

  // Add hide/show toggle button
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "section-toggle-btn";
  toggleButton.textContent = "Hide";
  toggleButton.setAttribute("aria-expanded", "true");
  toggleButton.setAttribute("title", "Hide Transmission lines");
  toggleButton.addEventListener("click", () => {
    const collapsed = card.classList.toggle("is-collapsed");
    toggleButton.textContent = collapsed ? "Show" : "Hide";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} Transmission lines`);
  });
  header.appendChild(toggleButton);

  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";

  const voltageContainer = document.createElement("div");
  voltageContainer.className = "voltage-filter-container";
  body.appendChild(voltageContainer);

  const actions = document.createElement("div");
  actions.className = "section-inline-actions";

  const otherLevelsButton = document.createElement("button");
  otherLevelsButton.type = "button";
  otherLevelsButton.className = "section-toggle-btn";
  otherLevelsButton.textContent = "Other Voltage Levels";
  actions.appendChild(otherLevelsButton);
  body.appendChild(actions);

  card.appendChild(body);
  // Insert as first child of mapUiLeftEl (above substations)
  mapUiLeftEl.insertBefore(card, mapUiLeftEl.firstChild);
  enableSectionCardDrag(card);

  const otherLevelsCard = document.createElement("section");
  otherLevelsCard.id = "section-us-transmission-other-levels";
  otherLevelsCard.className = "section-card floating-popup-card is-hidden-card";

  const otherLevelsHeader = document.createElement("div");
  otherLevelsHeader.className = "section-card-header";
  const otherLevelsTitle = document.createElement("h2");
  otherLevelsTitle.className = "section-card-title";
  otherLevelsTitle.textContent = "Transmission - Other Voltage Levels";
  otherLevelsHeader.appendChild(otherLevelsTitle);
  otherLevelsCard.appendChild(otherLevelsHeader);

  const otherLevelsBody = document.createElement("div");
  otherLevelsBody.className = "section-card-body";
  const otherLevelsContainer = document.createElement("div");
  otherLevelsContainer.className = "voltage-filter-container is-multi-column";
  otherLevelsBody.appendChild(otherLevelsContainer);
  otherLevelsCard.appendChild(otherLevelsBody);
  mapShellEl?.appendChild(otherLevelsCard);
  enableSectionCardDrag(otherLevelsCard);

  usTransmissionVoltageContainer = voltageContainer;
  usTransmissionOtherVoltageContainer = otherLevelsContainer;
  usTransmissionOtherVoltageCard = otherLevelsCard;

  otherLevelsButton.addEventListener("click", () => {
    togglePopupCard(usTransmissionOtherVoltageCard, otherLevelsButton);
  });
}

function buildUsSubstationControl() {
  if (!mapUiLeftEl) {
    return;
  }


  // Substations card
  const card = document.createElement("section");
  card.id = "section-us-substations";
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "Substations";
  header.appendChild(title);

  // Add hide/show toggle button
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "section-toggle-btn";
  toggleButton.textContent = "Hide";
  toggleButton.setAttribute("aria-expanded", "true");
  toggleButton.setAttribute("title", "Hide Substations");
  toggleButton.addEventListener("click", () => {
    const collapsed = card.classList.toggle("is-collapsed");
    toggleButton.textContent = collapsed ? "Show" : "Hide";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} Substations`);
  });
  header.appendChild(toggleButton);

  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";

  const voltageContainer = document.createElement("div");
  voltageContainer.className = "voltage-filter-container";
  body.appendChild(voltageContainer);

  const actions = document.createElement("div");
  actions.className = "section-inline-actions";

  const otherRangeButton = document.createElement("button");
  otherRangeButton.type = "button";
  otherRangeButton.className = "section-toggle-btn";
  otherRangeButton.textContent = "Other Voltage Range";
  actions.appendChild(otherRangeButton);
  body.appendChild(actions);

  card.appendChild(body);
  mapUiLeftEl.appendChild(card);
  enableSectionCardDrag(card);

  // TAPs card
  const tapCard = document.createElement("section");
  tapCard.id = "section-us-taps";
  tapCard.className = "section-card";

  const tapHeader = document.createElement("div");
  tapHeader.className = "section-card-header";

  const tapTitle = document.createElement("h2");
  tapTitle.className = "section-card-title";
  tapTitle.textContent = "US TAPs";
  tapHeader.appendChild(tapTitle);

  // Add hide/show toggle button
  const tapToggleButton = document.createElement("button");
  tapToggleButton.type = "button";
  tapToggleButton.className = "section-toggle-btn";
  tapToggleButton.textContent = "Hide";
  tapToggleButton.setAttribute("aria-expanded", "true");
  tapToggleButton.setAttribute("title", "Hide US TAPs");
  tapToggleButton.addEventListener("click", () => {
    const collapsed = tapCard.classList.toggle("is-collapsed");
    tapToggleButton.textContent = collapsed ? "Show" : "Hide";
    tapToggleButton.setAttribute("aria-expanded", String(!collapsed));
    tapToggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} US TAPs`);
  });
  tapHeader.appendChild(tapToggleButton);

  tapCard.appendChild(tapHeader);

  const tapBody = document.createElement("div");
  tapBody.className = "section-card-body";

  const tapVoltageContainer = document.createElement("div");
  tapVoltageContainer.className = "voltage-filter-container";
  tapBody.appendChild(tapVoltageContainer);

  const tapActions = document.createElement("div");
  tapActions.className = "section-inline-actions";

  const tapOtherRangeButton = document.createElement("button");
  tapOtherRangeButton.type = "button";
  tapOtherRangeButton.className = "section-toggle-btn";
  tapOtherRangeButton.textContent = "Other Voltage Range";
  tapActions.appendChild(tapOtherRangeButton);
  tapBody.appendChild(tapActions);

  tapCard.appendChild(tapBody);
  // Insert TAPs card just after the power plants card (on the right column)
  const powerPlantsCard = document.getElementById("section-us-power-plants");
  const pcaCard = document.getElementById("section-us-pca");
  if (powerPlantsCard && powerPlantsCard.parentNode) {
    // Insert after power plants card
    powerPlantsCard.parentNode.insertBefore(tapCard, powerPlantsCard.nextSibling);
  } else if (pcaCard && pcaCard.parentNode) {
    // Fallback: insert after PCA card
    pcaCard.parentNode.insertBefore(tapCard, pcaCard.nextSibling);
  } else {
    // Fallback: append to right column
    if (mapUiRightEl) {
      mapUiRightEl.appendChild(tapCard);
    } else {
      mapUiLeftEl.appendChild(tapCard);
    }
  }
  enableSectionCardDrag(tapCard);

  const otherRangeCard = document.createElement("section");
  otherRangeCard.id = "section-us-substations-other-range";
  otherRangeCard.className = "section-card floating-popup-card is-hidden-card";

  const otherHeader = document.createElement("div");
  otherHeader.className = "section-card-header";
  const otherTitle = document.createElement("h2");
  otherTitle.className = "section-card-title";
  otherTitle.textContent = "Substations - Other Voltage Range";
  otherHeader.appendChild(otherTitle);
  otherRangeCard.appendChild(otherHeader);

  const otherBody = document.createElement("div");
  otherBody.className = "section-card-body";
  const otherContainer = document.createElement("div");
  otherContainer.className = "voltage-filter-container is-multi-column";
  otherBody.appendChild(otherContainer);
  otherRangeCard.appendChild(otherBody);
  mapShellEl?.appendChild(otherRangeCard);
  enableSectionCardDrag(otherRangeCard);

  const tapOtherRangeCard = document.createElement("section");
  tapOtherRangeCard.id = "section-us-taps-other-range";
  tapOtherRangeCard.className = "section-card floating-popup-card is-hidden-card";

  const tapOtherHeader = document.createElement("div");
  tapOtherHeader.className = "section-card-header";
  const tapOtherTitle = document.createElement("h2");
  tapOtherTitle.className = "section-card-title";
  tapOtherTitle.textContent = "US TAPs - Other Voltage Range";
  tapOtherHeader.appendChild(tapOtherTitle);
  tapOtherRangeCard.appendChild(tapOtherHeader);

  const tapOtherBody = document.createElement("div");
  tapOtherBody.className = "section-card-body";
  const tapOtherContainer = document.createElement("div");
  tapOtherContainer.className = "voltage-filter-container is-multi-column";
  tapOtherBody.appendChild(tapOtherContainer);
  tapOtherRangeCard.appendChild(tapOtherBody);
  mapShellEl?.appendChild(tapOtherRangeCard);
  enableSectionCardDrag(tapOtherRangeCard);

  usSubstationVoltageContainer = voltageContainer;
  usSubstationOtherVoltageContainer = otherContainer;
  usSubstationOtherVoltageCard = otherRangeCard;
  usTapVoltageContainer = tapVoltageContainer;
  usTapOtherVoltageContainer = tapOtherContainer;
  usTapOtherVoltageCard = tapOtherRangeCard;

  otherRangeButton.addEventListener("click", () => {
    togglePopupCard(usSubstationOtherVoltageCard, otherRangeButton);
  });

  tapOtherRangeButton.addEventListener("click", () => {
    togglePopupCard(usTapOtherVoltageCard, tapOtherRangeButton);
  });
}

function buildUsPowerPlantControl() {
  if (!mapUiRightEl) {
    return;
  }

  const card = document.createElement("section");
  card.id = "section-us-power-plants";
  card.className = "section-card";

  const header = document.createElement("div");
  header.className = "section-card-header";

  const title = document.createElement("h2");
  title.className = "section-card-title";
  title.textContent = "Power plants";
  header.appendChild(title);

  // Add hide/show toggle button
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "section-toggle-btn";
  toggleButton.textContent = "Hide";
  toggleButton.setAttribute("aria-expanded", "true");
  toggleButton.setAttribute("title", "Hide Power plants");
  toggleButton.addEventListener("click", () => {
    const collapsed = card.classList.toggle("is-collapsed");
    toggleButton.textContent = collapsed ? "Show" : "Hide";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute("title", `${collapsed ? "Show" : "Hide"} Power plants`);
  });
  header.appendChild(toggleButton);

  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-card-body";

  const typeContainer = document.createElement("div");
  typeContainer.className = "voltage-filter-container";
  body.appendChild(typeContainer);

  card.appendChild(body);
  mapUiRightEl.appendChild(card);
  enableSectionCardDrag(card);

  usPowerPlantTypeContainer = typeContainer;
}

async function loadUsTransmissionLayer() {
  const parser = getShpParser();
  const zipUrl = makeAbsoluteUrl(`${US_DATA_ROOT}/${encodeURIComponent(US_TRANSMISSION_BASENAME)}.zip`);
  const zipBuffer = await fetchArrayBuffer(zipUrl);
  const parsed = await parser(zipBuffer);
  const collection = toFeatureCollection(parsed, US_TRANSMISSION_BASENAME);

  // Group features by voltage
  const featuresByVoltage = new Map();
  for (const feature of collection.features || []) {
    const rawVoltageLabel = normalizeVoltageLabel(feature);
    const normalizedVoltage = normalizeVoltageValueLabel(rawVoltageLabel);
    const currentType = getCurrentTypeFromVoltClass(feature?.properties || {});

    let group = "other-levels";
    let displayLabel = String(rawVoltageLabel || "Unknown").trim() || "Unknown";
    let sortVoltage = -1;
    let sortPrimaryRank = Number.POSITIVE_INFINITY;

    if (normalizedVoltage && normalizedVoltage !== "-99999") {
      const isPrimary = US_TRANSMISSION_PRIMARY_LEVELS.has(normalizedVoltage);
      group = isPrimary ? "primary" : "other-levels";
      displayLabel = formatTransmissionVoltageDisplayLabel(normalizedVoltage, currentType);
      sortVoltage = Number(normalizedVoltage);
      sortPrimaryRank = getPrimaryVoltageSortRank(normalizedVoltage);
    } else if (normalizedVoltage === "-99999") {
      group = "other-levels";
      displayLabel = "-99999";
    }

    const key = `${displayLabel}||${group}`;
    if (!featuresByVoltage.has(key)) {
      featuresByVoltage.set(key, {
        features: [],
        displayLabel,
        group,
        sortVoltage,
        sortPrimaryRank,
      });
    }
    featuresByVoltage.get(key).features.push(feature);
  }

  usTransmissionLayer = L.layerGroup();
  usTransmissionVoltageLayers = new Map();

  // Sort voltage groups for display order
  const groupOrder = { primary: 0, "other-levels": 1 };
  const sortedEntries = [...featuresByVoltage.values()].sort((a, b) => {
    const groupDelta = (groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99);
    if (groupDelta !== 0) {
      return groupDelta;
    }
    if (a.group === "primary" && b.group === "primary" && a.sortPrimaryRank !== b.sortPrimaryRank) {
      return a.sortPrimaryRank - b.sortPrimaryRank;
    }
    if (a.sortVoltage !== b.sortVoltage) {
      return b.sortVoltage - a.sortVoltage;
    }
    return a.displayLabel.localeCompare(b.displayLabel);
  });

  sortedEntries.forEach((entry, index) => {
    const color = getVoltageColorByIndex(index);
    const defaultVoltageMatch = entry.displayLabel.match(/^-?\d+(?:\.\d+)?/);
    const defaultVoltage = defaultVoltageMatch ? defaultVoltageMatch[0] : null;
    const visibleByDefault = entry.group === "primary" && US_DEFAULT_VISIBLE_TRANSMISSION_LEVELS.has(defaultVoltage);
    const voltageLayer = L.geoJSON(entry.features, {
      style: {
        color,
        weight: 1.6,
        opacity: 0.88,
      },
      onEachFeature: (feature, layer) => {
        bindHoverPersistentPopup(layer, buildPopupHTML(feature));
      },
    });
    if (visibleByDefault) {
      usTransmissionLayer.addLayer(voltageLayer);
    }
    usTransmissionVoltageLayers.set(entry.displayLabel, {
      layer: voltageLayer,
      visible: visibleByDefault,
      color,
      elementCount: entry.features.length,
      displayLabel: entry.displayLabel,
      group: entry.group,
    });
  });

  usTransmissionLayer.addTo(map);
  renderUsVoltageControls();
  updateUsTransmissionMasterCheckbox();
}

async function loadUsPowerPlantLayer() {
  const csvUrl = makeAbsoluteUrl(`${US_DATA_ROOT}/${encodeURIComponent(US_POWER_PLANTS_FILENAME)}`);
  const csvText = await fetchText(csvUrl);
  const records = parseCsvText(csvText);

  const preferredCategoryByType = new Map();
  const categoryCountByType = new Map();

  for (const record of records) {
    const typeKey = normalizeTypeKey(record.TYPE);
    const category = cleanNaicsLabel(record.NAICS_DESC);
    if (!typeKey || !category || category === "Other" || category === "Not Available") {
      continue;
    }

    if (!categoryCountByType.has(typeKey)) {
      categoryCountByType.set(typeKey, new Map());
    }
    const counts = categoryCountByType.get(typeKey);
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  for (const [typeKey, counts] of categoryCountByType.entries()) {
    const preferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (preferred) {
      preferredCategoryByType.set(typeKey, preferred);
    }
  }

  const recordsByCategory = new Map();
  const capacityValuesMw = [];
  let filteredOutCount = 0;

  for (const record of records) {
    const latitude = parseNumericValue(record.LATITUDE);
    const longitude = parseNumericValue(record.LONGITUDE);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      filteredOutCount += 1;
      continue;
    }

    const categoryLabel = resolvePowerPlantCategoryLabel(record, preferredCategoryByType);
    const capacityMw = extractPowerPlantCapacityMw(record);
    if (!recordsByCategory.has(categoryLabel)) {
      recordsByCategory.set(categoryLabel, []);
    }
    recordsByCategory.get(categoryLabel).push({
      ...record,
      __lat: latitude,
      __lon: longitude,
      __category: categoryLabel,
      __capacityMw: capacityMw,
    });
    if (Number.isFinite(capacityMw)) {
      capacityValuesMw.push(capacityMw);
    }
  }

  const minCapacityMw = capacityValuesMw.length ? Math.min(...capacityValuesMw) : null;
  const maxCapacityMw = capacityValuesMw.length ? Math.max(...capacityValuesMw) : null;

  const sortedTypes = [...recordsByCategory.keys()].sort((a, b) => a.localeCompare(b));
  usPowerPlantLayer = L.layerGroup();
  usPowerPlantTypeLayers = new Map();

  sortedTypes.forEach((typeLabel, index) => {
    const typeRows = recordsByCategory.get(typeLabel) || [];
    const color = getPowerPlantCategoryColor(typeLabel, index);
    const visibleByDefault = false;
    const typeLayer = L.layerGroup();

    for (const row of typeRows) {
      const markerRadius = getPowerPlantRadiusForMw(row.__capacityMw, minCapacityMw, maxCapacityMw);
      const marker = L.circleMarker([row.__lat, row.__lon], {
        radius: markerRadius,
        color,
        weight: 1.1,
        fillColor: color,
        fillOpacity: 0.9,
      });

      bindHoverPersistentPopup(marker, buildPowerPlantPopupHTML(row));

      typeLayer.addLayer(marker);
    }

    if (visibleByDefault) {
      usPowerPlantLayer.addLayer(typeLayer);
    }

    usPowerPlantTypeLayers.set(typeLabel, {
      layer: typeLayer,
      visible: visibleByDefault,
      color,
      count: typeRows.length,
      elementCount: typeRows.length,
    });
  });

  usPowerPlantLayer.addTo(map);
  renderUsPowerPlantTypeControls();
  updateUsPowerPlantMasterCheckbox();
}

async function initializeUsMap() {
  initializeThemeToggle();
  initializeStatusPanelToggle();
  initializeCountrySwitcherNavigation();
  buildUsSubstationControl();
  buildUsTransmissionControl();
  buildUsPcaControl();
  buildUsReconductoringControl();
  buildUsDataCenterControl();
  buildUsPowerPlantControl();
  requestAnimationFrame(() => {
    positionUsStatusPanelNearSubstations();
  });
  enableCardDrag(mapTitleCardEl);
  enableCardDrag(statusPanelEl);
  window.addEventListener("resize", refreshResponsiveCardLayout);
  clearStatusWindow();

  setLoadingOverlayVisible(true);

  try {
    await Promise.all([
      loadUsTransmissionLayer(),
      loadUsSubstationLayer(),
    ]);
  } catch (error) {
    setStatus("us-map", "error", `US data load failed: ${error?.message || "unknown error"}`);
    console.error("US data load failed", error);
  } finally {
    setLoadingOverlayVisible(false);
    if (!usStatusTrackingActive) {
      clearStatusWindow();
    }
  }

  // Load heavy, non-default content after first paint.
  loadUsPowerPlantLayer().catch((error) => {
    setStatus("us-power-plants", "warn", `US power plants load delayed/failed: ${error?.message || "unknown error"}`);
    console.warn("US power plants load delayed/failed", error);
  });
}

initializeUsMap();
