import fs from "node:fs/promises";
import path from "node:path";
import shp from "shpjs";
import { ISO_RECONDUCTORING_CONFIG } from "../webmap/js/reconductoring-us.js";

globalThis.self = globalThis;

const ROOT = process.cwd();
const US_DATA_DIR = path.join(ROOT, "geoinfo", "us-data");
const OUTPUT_DIR = path.join(ROOT, "webmap", "data", "reconductoring-us");
const RECONDUCTORING_PROJECTS_JSON = path.join(ROOT, "reference", "us_reconductoring_projects.json");

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
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function cloneFeature(feature) {
  return JSON.parse(JSON.stringify(feature));
}

function getFeatureProperty(properties, keys) {
  const props = properties || {};
  for (const key of keys) {
    const value = props[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function getGeometryParts(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  return [];
}

function getLineStrings(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }
  return [];
}

function updateBounds(bounds, coordinate) {
  const [x, y] = coordinate;
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function getGeometryBounds(geometry) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const visit = (coords) => {
    if (!Array.isArray(coords)) {
      return;
    }
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      updateBounds(bounds, coords);
      return;
    }
    coords.forEach(visit);
  };
  visit(geometry?.coordinates);
  if (!Number.isFinite(bounds.minX)) {
    return null;
  }
  return bounds;
}

function boundsIntersect(a, b) {
  if (!a || !b) {
    return false;
  }
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, polygonCoords) {
  if (!polygonCoords?.length || !pointInRing(point, polygonCoords[0])) {
    return false;
  }
  for (let i = 1; i < polygonCoords.length; i += 1) {
    if (pointInRing(point, polygonCoords[i])) {
      return false;
    }
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) {
    return false;
  }
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function orientation(a, b, c) {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function onSegment(a, b, c) {
  return Math.min(a[0], c[0]) <= b[0] && b[0] <= Math.max(a[0], c[0]) && Math.min(a[1], c[1]) <= b[1] && b[1] <= Math.max(a[1], c[1]);
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if (o1 * o2 < 0 && o3 * o4 < 0) {
    return true;
  }
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function lineStringIntersectsPolygon(lineCoords, polygonCoords) {
  for (const point of lineCoords) {
    if (pointInPolygon(point, polygonCoords)) {
      return true;
    }
  }
  const outerRing = polygonCoords[0] || [];
  for (let i = 1; i < lineCoords.length; i += 1) {
    const lineStart = lineCoords[i - 1];
    const lineEnd = lineCoords[i];
    for (let j = 1; j < outerRing.length; j += 1) {
      if (segmentsIntersect(lineStart, lineEnd, outerRing[j - 1], outerRing[j])) {
        return true;
      }
    }
  }
  return false;
}

function lineFeatureIntersectsGeometry(feature, geometry) {
  const lineStrings = getLineStrings(feature?.geometry);
  if (!lineStrings.length || !geometry) {
    return false;
  }
  if (geometry.type === "Polygon") {
    return lineStrings.some((lineCoords) => lineStringIntersectsPolygon(lineCoords, geometry.coordinates));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => lineStrings.some((lineCoords) => lineStringIntersectsPolygon(lineCoords, polygon)));
  }
  return false;
}

function buildRegionIndex(regionFeatures) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const geometries = [];
  for (const feature of regionFeatures || []) {
    const featureBounds = getGeometryBounds(feature.geometry);
    if (!featureBounds) continue;
    geometries.push({ geometry: feature.geometry, bounds: featureBounds });
    bounds.minX = Math.min(bounds.minX, featureBounds.minX);
    bounds.minY = Math.min(bounds.minY, featureBounds.minY);
    bounds.maxX = Math.max(bounds.maxX, featureBounds.maxX);
    bounds.maxY = Math.max(bounds.maxY, featureBounds.maxY);
  }
  return { bounds, geometries };
}

function getLineEndpoints(geometry) {
  const lineStrings = getLineStrings(geometry);
  if (!lineStrings.length) {
    return { start: null, end: null };
  }
  const firstLine = lineStrings[0];
  const lastLine = lineStrings[lineStrings.length - 1];
  return { start: firstLine[0] || null, end: lastLine[lastLine.length - 1] || null };
}

function normalizeName(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeContainsValue(value) {
  return String(value || "").trim().toUpperCase();
}

function buildCanonicalPairLabel(sub1, sub2) {
  const left = normalizeName(sub1);
  const right = normalizeName(sub2);
  return [left, right].sort().join("||");
}

function buildTransmissionGraph(features) {
  const adjacency = new Map();
  const addEdge = (from, to, lineId) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ node: to, lineId });
  };
  features.forEach((feature, index) => {
    const sub1 = normalizeName(feature?.properties?.SUB_1);
    const sub2 = normalizeName(feature?.properties?.SUB_2);
    if (!sub1 || !sub2) return;
    addEdge(sub1, sub2, index);
    addEdge(sub2, sub1, index);
  });
  return adjacency;
}

function buildTransmissionIndex(features) {
  const enrichedFeatures = (features || []).map((feature, index) => {
    const clone = cloneFeature(feature);
    clone.properties = { ...(clone.properties || {}), __featureIndex: index };
    clone.__bounds = getGeometryBounds(clone.geometry);
    clone.__endpoints = getLineEndpoints(clone.geometry);
    return clone;
  });
  const adjacency = buildTransmissionGraph(enrichedFeatures);
  const substationCoordinates = new Map();
  for (const feature of enrichedFeatures) {
    const sub1 = normalizeName(feature?.properties?.SUB_1);
    const sub2 = normalizeName(feature?.properties?.SUB_2);
    if (sub1 && feature.__endpoints?.start && !substationCoordinates.has(sub1)) substationCoordinates.set(sub1, feature.__endpoints.start);
    if (sub2 && feature.__endpoints?.end && !substationCoordinates.has(sub2)) substationCoordinates.set(sub2, feature.__endpoints.end);
  }
  return { features: enrichedFeatures, adjacency, substationCoordinates, pathCache: new Map() };
}

function featureIntersectsAnyRegion(feature, regionIndex) {
  if (!feature || !regionIndex?.bounds || !feature.__bounds || !boundsIntersect(feature.__bounds, regionIndex.bounds)) {
    return false;
  }
  const endpoints = feature.__endpoints;
  if (endpoints.start && regionIndex.geometries.some((entry) => pointInGeometry(endpoints.start, entry.geometry))) return true;
  if (endpoints.end && regionIndex.geometries.some((entry) => pointInGeometry(endpoints.end, entry.geometry))) return true;
  return regionIndex.geometries.some((entry) => boundsIntersect(feature.__bounds, entry.bounds) && lineFeatureIntersectsGeometry(feature, entry.geometry));
}

function findConnectedSubstations(source, sub1, sub2) {
  const start = normalizeName(sub1);
  const goal = normalizeName(sub2);
  const cacheKey = [start, goal].sort().join("||");
  if (source.pathCache.has(cacheKey)) {
    return source.pathCache.get(cacheKey);
  }
  if (!source.adjacency.has(start) || !source.adjacency.has(goal)) {
    source.pathCache.set(cacheKey, null);
    return null;
  }
  const queue = [{ node: start, lineIds: [] }];
  const visited = new Set([start]);
  while (queue.length) {
    const current = queue.shift();
    if (current.node === goal) {
      const result = new Set(current.lineIds);
      source.pathCache.set(cacheKey, result);
      return result;
    }
    for (const neighbor of source.adjacency.get(current.node) || []) {
      if (visited.has(neighbor.node)) continue;
      visited.add(neighbor.node);
      queue.push({ node: neighbor.node, lineIds: current.lineIds.concat(neighbor.lineId) });
    }
  }
  source.pathCache.set(cacheKey, null);
  return null;
}

function processSubstationPair(source, sub1, sub2, newLineFeatures, isoLabel) {
  const lineIds = findConnectedSubstations(source, sub1, sub2);
  if (lineIds) return lineIds;
  const coord1 = source.substationCoordinates.get(normalizeName(sub1));
  const coord2 = source.substationCoordinates.get(normalizeName(sub2));
  if (!coord1 || !coord2) return new Set();
  newLineFeatures.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [coord1, coord2] },
    properties: { project_type: "new-reconductoring", iso_region: isoLabel, substation_pair: `${sub1} -> ${sub2}`, SUB_1: sub1, SUB_2: sub2 },
  });
  return new Set();
}

function featureMatchesDirectMatcher(feature, matcher) {
  const sub1 = normalizeContainsValue(feature?.properties?.SUB_1);
  const sub2 = normalizeContainsValue(feature?.properties?.SUB_2);
  if (matcher.type === "containsAny") {
    const needle = normalizeContainsValue(matcher.value);
    return sub1.includes(needle) || sub2.includes(needle);
  }
  if (matcher.type === "pairContains") {
    const left = normalizeContainsValue(matcher.left);
    const right = normalizeContainsValue(matcher.right);
    return (sub1.includes(left) && sub2.includes(right)) || (sub1.includes(right) && sub2.includes(left));
  }
  return false;
}

function buildSubstationPairLabel(sub1, sub2) {
  return `${normalizeName(sub1)}||${normalizeName(sub2)}`;
}

function deriveSubstationPairsFromMatchers(features, matchers) {
  const uniquePairs = new Map();
  for (const feature of features || []) {
    if (!(matchers || []).some((matcher) => featureMatchesDirectMatcher(feature, matcher))) continue;
    const sub1 = String(feature?.properties?.SUB_1 || "").trim();
    const sub2 = String(feature?.properties?.SUB_2 || "").trim();
    if (!sub1 || !sub2) continue;
    const key = buildSubstationPairLabel(sub1, sub2);
    if (!uniquePairs.has(key)) uniquePairs.set(key, [sub1, sub2]);
  }
  return [...uniquePairs.values()];
}

function dedupeSubstationPairs(pairs) {
  const uniquePairs = new Map();
  for (const pair of pairs || []) {
    if (!Array.isArray(pair) || pair.length < 2) {
      continue;
    }
    const sub1 = String(pair[0] || "").trim();
    const sub2 = String(pair[1] || "").trim();
    if (!sub1 || !sub2) {
      continue;
    }
    const key = buildCanonicalPairLabel(sub1, sub2);
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, [sub1, sub2]);
    }
  }
  return [...uniquePairs.values()];
}

async function loadWorkbookProjectsByIso() {
  try {
    const text = await fs.readFile(RECONDUCTORING_PROJECTS_JSON, "utf8");
    const parsed = JSON.parse(String(text || "{}"));
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return {};
  } catch (error) {
    console.warn(`Workbook metadata unavailable at ${RECONDUCTORING_PROJECTS_JSON}: ${error?.message || "unknown error"}`);
    return {};
  }
}

function buildProjectsByPair(projectRows) {
  const projectsByPair = new Map();
  for (const row of projectRows || []) {
    const sub1 = String(row?.SUB_1 || "").trim();
    const sub2 = String(row?.SUB_2 || "").trim();
    if (!sub1 || !sub2) {
      continue;
    }
    const key = buildCanonicalPairLabel(sub1, sub2);
    if (!projectsByPair.has(key)) {
      projectsByPair.set(key, []);
    }
    projectsByPair.get(key).push(row);
  }
  return projectsByPair;
}

function getPairsFromWorkbookRows(projectRows) {
  return dedupeSubstationPairs(
    (projectRows || []).map((row) => [String(row?.SUB_1 || "").trim(), String(row?.SUB_2 || "").trim()])
  );
}

function dedupeProjectRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = [
      String(row?.["Project Name"] || "").trim(),
      String(row?.SUB_1 || "").trim().toUpperCase(),
      String(row?.SUB_2 || "").trim().toUpperCase(),
      String(row?.Status || "").trim(),
      String(row?.["Planned Year"] || "").trim(),
    ].join("||");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}

function normalizeTextToken(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getFeatureOwnerLabel(feature) {
  return String(
    feature?.properties?.OWNER ||
      feature?.properties?.UTILITY ||
      feature?.properties?.UTILNAME ||
      ""
  ).trim();
}

function getUtilityAliases(utilityValue) {
  const utility = normalizeTextToken(utilityValue);
  if (!utility) {
    return [];
  }
  const aliases = new Set([utility]);
  if (utility === "PGE") {
    aliases.add("PACIFICGASELECTRIC");
  }
  if (utility === "SCE") {
    aliases.add("SOUTHERNCALIFORNIAEDISON");
  }
  if (utility === "SDGE") {
    aliases.add("SANDIEGOGASELECTRIC");
  }
  return [...aliases];
}

function parseDistanceMiles(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function lineLengthMiles(geometry) {
  const lines = getLineStrings(geometry);
  const R = 3958.7613;
  let total = 0;
  for (const coords of lines) {
    for (let i = 1; i < coords.length; i += 1) {
      const [lon1, lat1] = coords[i - 1];
      const [lon2, lat2] = coords[i];
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += R * c;
    }
  }
  return total;
}

function findDirectPairLineIds(source, sub1, sub2, projectRows) {
  const target1 = normalizeName(sub1);
  const target2 = normalizeName(sub2);
  const directCandidates = [];

  for (const feature of source?.features || []) {
    const f1 = normalizeName(feature?.properties?.SUB_1);
    const f2 = normalizeName(feature?.properties?.SUB_2);
    const matchesPair = (f1 === target1 && f2 === target2) || (f1 === target2 && f2 === target1);
    if (!matchesPair) {
      continue;
    }
    directCandidates.push(feature);
  }

  if (!directCandidates.length) {
    return new Set();
  }

  const utilityAliases = new Set(
    (projectRows || []).flatMap((row) => getUtilityAliases(row?.Utility))
  );
  let narrowed = directCandidates;
  if (utilityAliases.size) {
    const utilityMatched = directCandidates.filter((feature) => {
      const owner = normalizeTextToken(getFeatureOwnerLabel(feature));
      if (!owner) {
        return false;
      }
      for (const alias of utilityAliases) {
        if (owner.includes(alias) || alias.includes(owner)) {
          return true;
        }
      }
      return false;
    });
    if (utilityMatched.length) {
      narrowed = utilityMatched;
    }
  }

  const targetDistance = (projectRows || [])
    .map((row) => parseDistanceMiles(row?.["Distance (mi)"]))
    .find((value) => Number.isFinite(value));

  let selected = narrowed[0];
  if (Number.isFinite(targetDistance) && narrowed.length > 1) {
    selected = narrowed
      .map((feature) => ({
        feature,
        delta: Math.abs(lineLengthMiles(feature.geometry) - targetDistance),
      }))
      .sort((a, b) => a.delta - b.delta)[0]?.feature || narrowed[0];
  }

  return new Set([selected.properties.__featureIndex]);
}

function chooseBestFeatureForWorkbookPair(features, projectRows) {
  if (!features.length) {
    return null;
  }

  const utilityAliases = new Set(
    (projectRows || []).flatMap((row) => getUtilityAliases(row?.Utility))
  );
  let narrowed = features;
  if (utilityAliases.size) {
    const utilityMatched = features.filter((feature) => {
      const owner = normalizeTextToken(getFeatureOwnerLabel(feature));
      if (!owner) {
        return false;
      }
      for (const alias of utilityAliases) {
        if (owner.includes(alias) || alias.includes(owner)) {
          return true;
        }
      }
      return false;
    });
    if (utilityMatched.length) {
      narrowed = utilityMatched;
    }
  }

  const targetDistance = (projectRows || [])
    .map((row) => parseDistanceMiles(row?.["Distance (mi)"]))
    .find((value) => Number.isFinite(value));
  if (Number.isFinite(targetDistance) && narrowed.length > 1) {
    return narrowed
      .map((feature) => ({
        feature,
        delta: Math.abs(lineLengthMiles(feature.geometry) - targetDistance),
      }))
      .sort((a, b) => a.delta - b.delta)[0]?.feature || narrowed[0];
  }

  return narrowed[0];
}

function dedupeWorkbookBackedPairFeatures(features, workbookRowsByPair) {
  const grouped = new Map();
  for (const feature of features || []) {
    const props = feature?.properties || {};
    const pairKey = buildCanonicalPairLabel(props.SUB_1, props.SUB_2);
    if (!grouped.has(pairKey)) {
      grouped.set(pairKey, []);
    }
    grouped.get(pairKey).push(feature);
  }

  const selected = [];
  for (const [pairKey, group] of grouped.entries()) {
    const projectRows = workbookRowsByPair.get(pairKey) || [];
    if (projectRows.length && group.length > 1) {
      const winner = chooseBestFeatureForWorkbookPair(group, projectRows);
      if (winner) {
        selected.push(winner);
      }
      continue;
    }
    selected.push(...group);
  }
  return selected;
}

function applyWorkbookProjectMetadata(properties, projectRows) {
  const rows = dedupeProjectRows(projectRows || []);
  if (!rows.length) {
    return properties;
  }

  const primary = rows[0];
  const sub1 = String(primary?.SUB_1 || "").trim();
  const sub2 = String(primary?.SUB_2 || "").trim();
  if (sub1 && sub2) {
    properties.substation_pair = `${sub1} -> ${sub2}`;
    properties.SUB_1 = sub1;
    properties.SUB_2 = sub2;
  }
  properties.project_records = rows;
  return properties;
}

function getIsoStates(isoConfig, hierarchyRows) {
  const states = new Set(isoConfig.states || []);
  if (isoConfig.hierarchyStateFilter?.column && isoConfig.hierarchyStateFilter?.value) {
    for (const row of hierarchyRows) {
      if (String(row[isoConfig.hierarchyStateFilter.column] || "").trim() === isoConfig.hierarchyStateFilter.value) {
        const state = String(row.st || "").trim().toUpperCase();
        if (state) states.add(state);
      }
    }
  }
  for (const state of isoConfig.extraStates || []) states.add(state);
  return [...states];
}

function getTransmissionRegionColumn(hierarchyRows) {
  if (!Array.isArray(hierarchyRows) || !hierarchyRows.length) return null;
  for (const column of ["transfreg", "transreg"]) {
    if (hierarchyRows.some((row) => String(row?.[column] || "").trim())) return column;
  }
  return null;
}

function normalizeRegionName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getIsoTransmissionGroups(isoConfig, hierarchyRows) {
  const regionColumn = getTransmissionRegionColumn(hierarchyRows);
  if (!regionColumn) return { regionColumn: null, groups: [] };

  const isoRegionAliases = new Set([normalizeRegionName(isoConfig.label), normalizeRegionName(isoConfig.key)]);
  const groups = new Set();
  for (const row of hierarchyRows) {
    const transmissionRegion = String(row?.[regionColumn] || "").trim();
    if (!isoRegionAliases.has(normalizeRegionName(transmissionRegion))) continue;
    const transmissionGroup = String(row?.transgrp || transmissionRegion).trim();
    if (transmissionGroup) groups.add(transmissionGroup);
  }
  return { regionColumn, groups: [...groups] };
}

function aggregateFeatureGroup(groupKey, features) {
  const multipolygon = [];
  for (const feature of features) {
    for (const polygon of getGeometryParts(feature.geometry)) {
      multipolygon.push(polygon);
    }
  }
  return { type: "Feature", geometry: { type: "MultiPolygon", coordinates: multipolygon }, properties: { key: groupKey } };
}

async function loadTransmissionCollection() {
  const zip = await fs.readFile(path.join(US_DATA_DIR, "Electric_Power_Transmission_Lines.zip"));
  const parsed = await shp(zip);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

async function loadPcaCollection() {
  const [shpBuf, dbfBuf, prj, cpg] = await Promise.all([
    fs.readFile(path.join(US_DATA_DIR, "US_PCA.shp")),
    fs.readFile(path.join(US_DATA_DIR, "US_PCA.dbf")),
    fs.readFile(path.join(US_DATA_DIR, "US_PCA.prj"), "utf8"),
    fs.readFile(path.join(US_DATA_DIR, "US_PCA.cpg"), "utf8"),
  ]);
  const parsed = await shp({ shp: shpBuf, dbf: dbfBuf, prj, cpg });
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

async function loadHierarchyRows() {
  const csvText = await fs.readFile(path.join(US_DATA_DIR, "hierarchy.csv"), "utf8");
  return parseCsvText(csvText)
    .map((row) => ({ ...row, r: String(row["*r"] || row.ba || row.r || "").trim(), st: String(row.st || "").trim().toUpperCase() }))
    .filter((row) => row.r && String(row.country || "").trim().toLowerCase() === "usa");
}

function buildHierarchyRegionFeatures(pcaCollection, hierarchyRows, column) {
  const hierarchyByZone = new Map(hierarchyRows.map((row) => [row.r, row]));
  const featuresByKey = new Map();
  for (const feature of pcaCollection.features || []) {
    const zoneId = getFeatureProperty(feature.properties, ["rb", "RB", "ba", "BA", "r"]);
    const hierarchy = hierarchyByZone.get(zoneId);
    const value = String(hierarchy?.[column] || "").trim();
    const key = column === "st" ? value.toUpperCase() : value;
    if (!key) continue;
    if (!featuresByKey.has(key)) featuresByKey.set(key, []);
    featuresByKey.get(key).push(feature);
  }
  const byKeyMap = new Map();
  for (const [key, features] of featuresByKey.entries()) {
    byKeyMap.set(key, aggregateFeatureGroup(key, features));
  }
  return byKeyMap;
}

async function generate() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const [transmissionCollection, pcaCollection, hierarchyRows] = await Promise.all([
    loadTransmissionCollection(),
    loadPcaCollection(),
    loadHierarchyRows(),
  ]);
  const workbookProjectsByIso = await loadWorkbookProjectsByIso();

  const transmissionIndex = buildTransmissionIndex(transmissionCollection.features);
  const stateMap = buildHierarchyRegionFeatures(pcaCollection, hierarchyRows, "st");
  const transgrpMap = buildHierarchyRegionFeatures(pcaCollection, hierarchyRows, "transgrp");

  for (const isoConfig of ISO_RECONDUCTORING_CONFIG.filter((entry) => entry.enabled)) {
    const { regionColumn, groups: isoTransmissionGroups } = getIsoTransmissionGroups(isoConfig, hierarchyRows);
    let regionFeatures = isoTransmissionGroups.map((group) => transgrpMap.get(group)).filter(Boolean).map(cloneFeature);
    let regionSelectionMode = "transmission-group";
    let isoStates = [];

    if (!regionFeatures.length) {
      isoStates = getIsoStates(isoConfig, hierarchyRows);
      regionFeatures = isoStates.map((state) => stateMap.get(state)).filter(Boolean).map(cloneFeature);
      regionSelectionMode = "state-fallback";
    }

    const regionIndex = buildRegionIndex(regionFeatures);
    const regionalFeatures = transmissionIndex.features.filter((feature) => featureIntersectsAnyRegion(feature, regionIndex));
    const regionalIndex = buildTransmissionIndex(regionalFeatures.map((feature) => cloneFeature(feature)));
    const derivedPairs = deriveSubstationPairsFromMatchers(regionalIndex.features, isoConfig.directMatchers);
    const workbookRows = workbookProjectsByIso[isoConfig.key] || [];
    const workbookPairs = getPairsFromWorkbookRows(workbookRows);
    const basePairs = workbookPairs.length ? workbookPairs : (isoConfig.substationPairs || []);
    const targetPairs = dedupeSubstationPairs([...basePairs, ...derivedPairs]);
    const projectsByPair = buildProjectsByPair(workbookRows);
    const newLineFeatures = [];
    const existingLineIds = new Set();
    const lineProjectsById = new Map();
    const lineIntendedPairById = new Map(); // featureIndex -> [sub1, sub2]
    const pairRowsMatchCount = new Set();
    for (const [sub1, sub2] of targetPairs) {
      const pairKey = buildCanonicalPairLabel(sub1, sub2);
      const projectRows = projectsByPair.get(pairKey) || [];
      if (projectRows.length) {
        pairRowsMatchCount.add(pairKey);
      }
      const beforeNewLineCount = newLineFeatures.length;
      let ids = findDirectPairLineIds(regionalIndex, sub1, sub2, projectRows);
      if (!ids.size) {
        ids = processSubstationPair(regionalIndex, sub1, sub2, newLineFeatures, isoConfig.label);
      }
      for (const id of ids) {
        existingLineIds.add(id);
        if (!lineIntendedPairById.has(id)) {
          lineIntendedPairById.set(id, [sub1, sub2]);
        }
        if (projectRows.length) {
          if (!lineProjectsById.has(id)) {
            lineProjectsById.set(id, []);
          }
          lineProjectsById.get(id).push(...projectRows);
        }
      }
      if (newLineFeatures.length > beforeNewLineCount && projectRows.length) {
        const newest = newLineFeatures[newLineFeatures.length - 1];
        newest.properties = applyWorkbookProjectMetadata(newest.properties || {}, projectRows);
      }
    }
    let existingFeatures = regionalIndex.features
      .filter((feature) => existingLineIds.has(feature.properties.__featureIndex))
      .map((feature) => {
        const clone = cloneFeature(feature);
        const lineId = feature.properties.__featureIndex;
        const projectRows = lineProjectsById.get(lineId) || [];
        const intendedPair = lineIntendedPairById.get(lineId);
        clone.properties.project_type = "existing-reconductoring";
        clone.properties.iso_region = isoConfig.label;
        // Default to intended pair for display; applyWorkbookProjectMetadata will
        // override with project record SUB_1/SUB_2 if records are available.
        if (intendedPair) {
          const [pSub1, pSub2] = intendedPair;
          clone.properties.substation_pair = `${pSub1} -> ${pSub2}`;
          clone.properties.SUB_1 = pSub1;
          clone.properties.SUB_2 = pSub2;
        } else {
          clone.properties.substation_pair = `${feature.properties.SUB_1 || "-"} -> ${feature.properties.SUB_2 || "-"}`;
        }
        clone.properties.reconductoring_voltage = getFeatureProperty(feature.properties, ["VOLTAGE", "Voltage", "voltage"]);
        clone.properties = applyWorkbookProjectMetadata(clone.properties, projectRows);
        return clone;
      });
    existingFeatures = dedupeWorkbookBackedPairFeatures(existingFeatures, projectsByPair);
    const projectsUnmatchedToPairs = (workbookRows || []).filter((row) => {
      const key = buildCanonicalPairLabel(row?.SUB_1, row?.SUB_2);
      return !pairRowsMatchCount.has(key);
    });
    const dataset = {
      isoKey: isoConfig.key,
      label: isoConfig.label,
      regionStyle: {
        color: isoConfig.regionStyle?.color || "#9a6700",
        fillColor: isoConfig.regionStyle?.fillColor || "#fbbf24",
      },
      regionFeatures,
      existingFeatures,
      newLineFeatures,
      summary: {
        regionSelectionMode,
        transmissionRegionColumn: regionColumn,
        transmissionGroups: isoTransmissionGroups,
        states: isoStates,
        workbookProjectRowCount: workbookRows.length,
        workbookMatchedPairCount: pairRowsMatchCount.size,
        workbookUnmatchedRowCount: projectsUnmatchedToPairs.length,
        candidateLineCount: regionalIndex.features.length,
        existingSegmentCount: existingFeatures.length,
        newSegmentCount: newLineFeatures.length,
        substationPairCount: targetPairs.length,
      },
    };
    await fs.writeFile(path.join(OUTPUT_DIR, `${isoConfig.key}.json`), JSON.stringify(dataset));
    console.log(`wrote ${isoConfig.key}.json`);
  }
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
