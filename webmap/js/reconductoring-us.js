const REEDS_DEFAULT_MAP_BASE = "../geoinfo/us-data/US_PCA";
const REEDS_DEFAULT_HIERARCHY = "../geoinfo/us-data/hierarchy.csv";
const transmissionIndexCache = new WeakMap();

const ISO_RECONDUCTORING_CONFIG = [
  {
    key: "caiso",
    label: "CAISO",
    states: ["CA", "NV"],
    enabled: true,
    regionStyle: {
      color: "#9a6700",
      fillColor: "#fbbf24",
    },
    substationPairs: [
      ["JULIAN HINDS", "MIRAGE"],
      ["GWF 2", "KINGSBURG"],
      ["EAGLE ROCK", "FULTON"],
      ["FULTON", "SILVERADO"],
      ["SAN JOSE STA. A", "EL PATIO"],
      ["SAN JOSE STA. B", "TRIMBLE"],
      ["KIFER", "FMC"],
      ["MOUNTAIN VIEW", "MONTA VISTA"],
      ["WHISMAN", "MONTA VISTA"],
      ["PIERCY", "METCALF 2"],
      ["TESLA", "NEWARK"],
      ["TULUCAY", "NAPA"],
      ["MESA", "TALEGA"],
      ["RIO OSO", "WEST SACRAMENTO"],
      ["RIO OSO", "LINCOLN"],
      ["VACAVILLE", "PLAINFIELD"],
      ["WILSON", "ORO LOMA"],
      ["NORTH DUBLIN", "VINEYARD"],
      ["VICTOR", "KRAMER"],
      // ["CLEAR LAKE", "EAGLE ROCK"],
      // ["CORTINA", "WILLIAMS ST"],
      // ["EL DORADO", "MISSOURI CITY"],
      // ["MORAGA", "SAN LEANDRO U"],
      // ["MORAGA", "OAKLAND X"],
      // ["OAKLAND X", "SAN LEANDRO U"],
      
      // ["WARNERVILLE", "BELLOTA"],
      // ["WILSON", "LE GRAND"],
      // ["BORDEN CO", "STORY"],
      // ["CHRISTIE", "SOBRANTE"],
      // ["HERNDON", "BULLARD"],
      // ["MANTECA", "RIPON"],
      // ["RIPON", "RIVERBANK"],
      // ["RIVERBANK", "MELONES"],
      // ["MIDWAY", "KERN"],
      // ["MIDWAY", "TEMBLOR"],
    ],
  },
  {
    key: "iso-ne",
    label: "ISO-NE",
    states: ["CT", "ME", "MA", "NH", "RI", "VT"],
    enabled: true,
    regionStyle: {
      color: "#0f766e",
      fillColor: "#2dd4bf",
    },
    substationPairs: [
      ["TEWKSBURY SUBSTATION", "WOBURN"],
      ["SOUTH WRENTHAM", "UNION STREET"],
      ["SOUTH WRENTHAM", "BERRY STREET"],
      ["CROSSROADS ENERGY CENTER", "MOSHERS"],
      ["N. HAVEN", "WILLISTON"],
      ["WILLISTON", "TAFT"],
      ["COOLIDGE", "COLD RIVER"],
      ["VERNON VT", "NORTHFIELD"],
      ["SOMERSET", "BELL ROCK ROAD"],
    ],
  },
  {
    key: "miso",
    label: "MISO",
    states: ["MT", "ND", "SD", "MN", "IA", "WI", "MI", "IN", "IL", "MO", "KY", "AR", "MS", "LA", "TX"],
    enabled: true,
    regionStyle: {
      color: "#166534",
      fillColor: "#4ade80",
    },
    substationPairs: [
      ["GRAND TOWER", "CAMPBELL"],
      ["PORTAGE", "COLUMBIA"],
      ["HILL", "EDEN"],
      ["EDEN", "HIGHLAND"],
      ["BIG CREEK", "WARRENTON"],
      ["WARRENTON", "MONTGOMERY"],
      ["DIVISION", "EASTSIDE"],
      ["CRANE", "NAVAL SUBMARINE BASE KINGS BAY"],
      ["QUAD CITIES", "ROCK CREEK"],
      ["EAST PORT ORCHARD", "BARNARD CREEK"],
      ["CAYUGA", "NUCOR"],
      ["CAYUGA", "WOLF CREEK"],
      ["TIPTON WEST", "KOKOMO HIGHLAND PARK"],
    ],
  },
  {
    key: "westconnect",
    label: "WestConnect",
    states: [],
    extraStates: ["NE", "WY", "TX"],
    hierarchyStateFilter: {
      column: "transreg",
      value: "WestConnect",
    },
    enabled: true,
    regionStyle: {
      color: "#4338ca",
      fillColor: "#818cf8",
    },
    substationPairs: [],
    directMatchers: [
      { type: "containsAny", value: "Arroyo" },
      { type: "containsAny", value: "San Felipe" },
      { type: "containsAny", value: "Sparks" },
      { type: "containsAny", value: "Austin" },
      { type: "containsAny", value: "Wrangler" },
      { type: "containsAny", value: "Trowbridge" },
      { type: "containsAny", value: "Montwood" },
      { type: "containsAny", value: "Eastlake" },
      { type: "containsAny", value: "Newman" },
      { type: "containsAny", value: "Kyrene" },
      { type: "containsAny", value: "Pinto Valley" },
      { type: "containsAny", value: "Marvin" },
      { type: "containsAny", value: "Salopek" },
      { type: "containsAny", value: "Anthony" },
      { type: "containsAny", value: "Kantor" },
      { type: "pairContains", left: "Rinaldi", right: "Tarzana" },
      { type: "pairContains", left: "Orme", right: "Rudd" },
      { type: "pairContains", left: "Rio Grande", right: "Sunset" },
      { type: "pairContains", left: "Daniels Park", right: "Prairie" },
    ],
  },
  {
    key: "pjm",
    label: "PJM",
    states: ["DE", "IL", "IN", "KY", "MD", "MI", "NJ", "NC", "OH", "PA", "TN", "VA", "WV"],
    enabled: true,
    regionStyle: {
      color: "#7c2d12",
      fillColor: "#fb923c",
    },
    substationPairs: [
      ["DRESDEN", "MULBERRY"],
      ["EAST DANVILLE", "DANVILLE"],
      ["OTTER", "ALTAVISTA"],
      ["CHESTERFIELD", "TYLER"],
      ["REMINGTON CT", "MARSH RUN CT"],
      ["SMITH MOUNTAIN", "CANDLERS MOUNTAIN"],
      ["TYLER", "POE"],
      ["JUNIATA", "LOST DAUPHIN"],
      ["OAK RIDGE", "WINDSOR"],
      ["TAP152190", "OAK RIDGE SWITCHING STATION"],
      ["TAP152192", "OAK RIDGE SWITCHING STATION"],
      ["KILNER", "LAKE NELSON"],
      ["NORTHWEST", "CONASTONE"],
      ["CRETE ENERGY VENTURE LLC", "ST. JOHNS"],
      ["ELWOOD", "GOODINGS GROVE"],
      ["LEE COUNTY SOLID WASTE ENERGY", "BYRON"],
      ["CRETE ENERGY VENTURE LLC", "EAST FRANKFORT"],
      ["STUART", "SPURLOCK"],
      ["GILBERT", "SPRINGFIELD"],
      ["METUCHEN", "NEW DOVER"],
      ["DRAKE", "BELVEDERE"],
      ["LICK", "JEFFERSON"],
      ["TAP205375", "ROCKFORD"],
      ["MIDWAY", "RICHLAND"],
      ["RICHLAND", "STRYKER"],
      ["NORTH PHILADELPHIA", "MASTER"],
      ["WANEETA", "NORTH PHILADELPHIA"],
      ["TAP140646", "CHAPMAN"],
      ["CEDAR STATION", "CASCADE"],
      ["CANDLERS MOUNTAIN", "OPOSSUM CREEK"],
      ["LINTON", "WHEELER"],
      ["GAINESVILLE", "WHEELER"],
      ["GAINESVILLE", "TRIDENT"],
      ["LINTON", "ATLANTIC"],
      ["ATLANTIC", "TRIDENT"],
      ["JOHNSON", "NEW LONDON"],
      ["JOHNSON 1", "NEW LONDON"],
      ["JOHNSON 2", "NEW LONDON"],
      ["JOHNSON", "OTTER"],
      ["JOHNSON 1 ", "OTTER"],
      ["JOHNSON 2", "OTTER"],
      ["CARSON", "POE"],
    ],
  },
  {
    key: "spp",
    label: "SPP",
    states: ["AR", "IA", "KS", "LA", "MN", "MO", "MT", "NE", "NM", "ND", "OK", "SD", "TX"],
    enabled: true,
    regionStyle: {
      color: "#1d4ed8",
      fillColor: "#60a5fa",
    },
    substationPairs: [
      ["COUNCIL CREEK", "MUSTANG"],
      ["COUNCIL CREEK", "DOUGLAS"],
      ["OAKS", "GREAT FALLS (RAINBOW)"],
      ["WINFIELD", "GREAT FALLS (RAINBOW)"],
      ["PAULINE", "HASTINGS"],
    ],
  },
  {
    key: "ercot",
    label: "ERCOT",
    states: ["TX"],
    enabled: true,
    regionStyle: {
      color: "#7c3aed",
      fillColor: "#c084fc",
    },
    substationPairs: [
      ["MARION", "CIBOLO"],
      ["HILL COUNTRY 138", "U.T.S.A."],
      ["TEMPLE PECAN CREEK", "LAKE CREEK"],
      ["HILLJE", "GRASS CREEK"],
      ["PILOT KNOB", "SALADO"],
      ["E BELLEVILLE", "SALADO"],
      ["ELM CREEK", "UNKNOWN118212"],
      ["INTERMEDIATE", "SOUTHWYCK"],
      ["MONTICELLO", "SULPHUR"],
      ["TRINIDAD", "RICHLAND"],
      ["BAKER", "KEO SUBSTATION"],
      ["VALLEY", "BELLS MILL"],
      ["EAST LOOP", "WATERMILL"],
      ["WEST LOOP", "WATERMILL"],
      ["EAST LOOP", "WATERMILL"],
      ["POSSUM POINT", "TRADING POST"],
    ],
  },
  {
    key: "sertp",
    label: "SERTP",
    states: [],
    enabled: true,
    regionStyle: {
      color: "#0f766e",
      fillColor: "#34d399",
    },
    substationPairs: [],
  },
  {
    key: "frcc",
    label: "FRCC",
    states: [],
    enabled: true,
    regionStyle: {
      color: "#9d174d",
      fillColor: "#f472b6",
    },
    substationPairs: [],
  },
  {
    key: "northerngrid",
    label: "NorthernGrid",
    states: [],
    enabled: true,
    regionStyle: {
      color: "#155e75",
      fillColor: "#67e8f9",
    },
    substationPairs: [],
  },
  {
    key: "nyiso",
    label: "NYISO",
    states: ["NY"],
    enabled: true,
    regionStyle: {
      color: "#be185d",
      fillColor: "#f472b6",
    },
    substationPairs: [
      ["HUDSON", "HILL"],
      ["BAYPORT SW STA", "MCARTHUR"],
      ["MORTIMER", "PANNELL"],
      ["WAVERLY", "SAYREVILLE"],
      ["RAMAPO", "STERLING"],
      ["RAMAPO", "STATE LINE ENERGY"],
      ["JENNINGS", "NORWICH"],
      ["QUAKER", "SLEIGHT RD"],
      ["PACKARD", "HUNTLEY"],
      ["CORTLAND", "CLARK"],
      ["SPIER FALLS", "MOHICAN"],
      ["ELBRIDGE", "LOCKS"],
    ],
  },
];

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
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

function getShpParser() {
  if (window.shp) {
    return window.shp;
  }
  throw new Error("shp.js parser is not available.");
}

function toFeatureCollection(parsedData, sourceName) {
  if (Array.isArray(parsedData)) {
    const features = parsedData.flatMap((entry) => entry?.features || []);
    return {
      type: "FeatureCollection",
      features: features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          source_file: sourceName,
        },
      })),
    };
  }

  return {
    type: "FeatureCollection",
    features: (parsedData?.features || []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        source_file: sourceName,
      },
    })),
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.arrayBuffer();
}

function makeAbsoluteUrl(path) {
  return new URL(path, window.location.href).href;
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

function getBoundsCenter(bounds) {
  if (!bounds) {
    return { x: null, y: null };
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function boundsIntersect(a, b) {
  if (!a || !b) {
    return false;
  }

  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function aggregateFeatureGroup(groupKey, features) {
  const multipolygon = [];
  for (const feature of features) {
    for (const polygon of getGeometryParts(feature.geometry)) {
      multipolygon.push(polygon);
    }
  }

  const geometry = multipolygon.length
    ? { type: "MultiPolygon", coordinates: multipolygon }
    : null;
  const bounds = getGeometryBounds(geometry);
  const center = getBoundsCenter(bounds);

  return {
    type: "Feature",
    geometry,
    properties: {
      key: groupKey,
      x: center.x,
      y: center.y,
      centroid_x: center.x,
      centroid_y: center.y,
      memberCount: features.length,
    },
  };
}

function buildHierarchyMaps(zoneFeatures, hierarchyColumns) {
  const levels = new Map();

  const baseFeatures = zoneFeatures.filter((feature) => feature?.properties?.country);
  const baseMap = new Map();
  for (const feature of baseFeatures) {
    baseMap.set(feature.properties.r, feature);
  }
  levels.set("r", baseMap);

  for (const column of hierarchyColumns) {
    const grouped = new Map();
    for (const feature of zoneFeatures) {
      const value = feature.properties[column];
      if (!value) {
        continue;
      }
      if (!grouped.has(value)) {
        grouped.set(value, []);
      }
      grouped.get(value).push(feature);
    }

    const aggregated = new Map();
    for (const [value, features] of grouped.entries()) {
      aggregated.set(value, aggregateFeatureGroup(value, features));
    }
    levels.set(column, aggregated);
  }

  return levels;
}

async function getReedsZones(options = {}) {
  const pathMapBase = options.pathMapBase || REEDS_DEFAULT_MAP_BASE;
  const pathHierarchy = options.pathHierarchy || REEDS_DEFAULT_HIERARCHY;

  const hierarchyRows = parseCsvText(await fetchText(makeAbsoluteUrl(pathHierarchy)))
    .map((row) => {
      const zoneId = String(row["*r"] || row.ba || row.r || "").trim();
      return {
        ...row,
        r: zoneId,
      };
    })
    .filter((row) => row.r && String(row.country || "").trim().toLowerCase() === "usa");

  const hierarchyColumns = hierarchyRows.length
    ? Object.keys(hierarchyRows[0]).filter((key) => !["*r", "ba", "r", "st_interconnect", "offshore"].includes(key))
    : [];

  const parser = getShpParser();
  const basePath = makeAbsoluteUrl(pathMapBase);
  const [shpBuffer, dbfBuffer, prjText, cpgText] = await Promise.all([
    fetchArrayBuffer(`${basePath}.shp`),
    fetchArrayBuffer(`${basePath}.dbf`),
    fetchText(`${basePath}.prj`).catch(() => ""),
    fetchText(`${basePath}.cpg`).catch(() => ""),
  ]);

  const payload = { shp: shpBuffer, dbf: dbfBuffer };
  if (prjText) {
    payload.prj = prjText;
  }
  if (cpgText) {
    payload.cpg = cpgText;
  }

  const parsed = await parser(payload);
  const zoneCollection = toFeatureCollection(parsed, "US_PCA");

  const hierarchyByZone = new Map(hierarchyRows.map((row) => [row.r, row]));
  const zoneFeatures = (zoneCollection.features || []).map((feature) => {
    const zoneId = getFeatureProperty(feature?.properties, ["rb", "RB", "ba", "BA", "r"]);
    const hierarchy = hierarchyByZone.get(zoneId) || {};
    const bounds = getGeometryBounds(feature.geometry);
    const center = getBoundsCenter(bounds);
    const properties = {
      ...feature.properties,
      r: zoneId,
      centroid_x: center.x,
      centroid_y: center.y,
    };

    for (const column of hierarchyColumns) {
      properties[column] = hierarchy[column] ?? null;
    }

    return {
      ...feature,
      properties,
    };
  });

  return {
    hierarchyRows,
    hierarchyColumns,
    zoneFeatures,
    levels: buildHierarchyMaps(zoneFeatures, hierarchyColumns),
  };
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

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
  return (
    Math.min(a[0], c[0]) <= b[0] &&
    b[0] <= Math.max(a[0], c[0]) &&
    Math.min(a[1], c[1]) <= b[1] &&
    b[1] <= Math.max(a[1], c[1])
  );
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 * o2 < 0 && o3 * o4 < 0) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) {
    return true;
  }
  if (o2 === 0 && onSegment(p1, q2, q1)) {
    return true;
  }
  if (o3 === 0 && onSegment(p2, p1, q2)) {
    return true;
  }
  if (o4 === 0 && onSegment(p2, q1, q2)) {
    return true;
  }

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
      const ringStart = outerRing[j - 1];
      const ringEnd = outerRing[j];
      if (segmentsIntersect(lineStart, lineEnd, ringStart, ringEnd)) {
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
    return geometry.coordinates.some((polygon) =>
      lineStrings.some((lineCoords) => lineStringIntersectsPolygon(lineCoords, polygon))
    );
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
    const geometry = feature?.geometry;
    const featureBounds = getGeometryBounds(geometry);
    if (!geometry || !featureBounds) {
      continue;
    }
    geometries.push({ geometry, bounds: featureBounds });
    bounds.minX = Math.min(bounds.minX, featureBounds.minX);
    bounds.minY = Math.min(bounds.minY, featureBounds.minY);
    bounds.maxX = Math.max(bounds.maxX, featureBounds.maxX);
    bounds.maxY = Math.max(bounds.maxY, featureBounds.maxY);
  }

  return {
    bounds: Number.isFinite(bounds.minX) ? bounds : null,
    geometries,
  };
}

function getLineEndpoints(geometry) {
  const lineStrings = getLineStrings(geometry);
  if (!lineStrings.length) {
    return { start: null, end: null };
  }

  const firstLine = lineStrings[0];
  const lastLine = lineStrings[lineStrings.length - 1];
  return {
    start: firstLine[0] || null,
    end: lastLine[lastLine.length - 1] || null,
  };
}

function normalizeName(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeContainsValue(value) {
  return String(value || "").trim().toUpperCase();
}

function getSubstationCoordinates(source, substationName) {
  const target = normalizeName(substationName);
  if (!target) {
    return null;
  }

  if (source?.substationCoordinates instanceof Map) {
    return source.substationCoordinates.get(target) || null;
  }

  for (const feature of source || []) {
    const sub1 = normalizeName(feature?.properties?.SUB_1);
    const sub2 = normalizeName(feature?.properties?.SUB_2);
    const endpoints = getLineEndpoints(feature?.geometry);

    if (sub1 === target && endpoints.start) {
      return endpoints.start;
    }
    if (sub2 === target && endpoints.end) {
      return endpoints.end;
    }
  }

  return null;
}

function buildTransmissionGraph(features) {
  const adjacency = new Map();

  const addEdge = (from, to, lineId) => {
    if (!adjacency.has(from)) {
      adjacency.set(from, []);
    }
    adjacency.get(from).push({ node: to, lineId });
  };

  features.forEach((feature, index) => {
    const sub1 = normalizeName(feature?.properties?.SUB_1);
    const sub2 = normalizeName(feature?.properties?.SUB_2);
    if (!sub1 || !sub2) {
      return;
    }
    addEdge(sub1, sub2, index);
    addEdge(sub2, sub1, index);
  });

  return adjacency;
}

function buildTransmissionIndex(features) {
  const cached = transmissionIndexCache.get(features);
  if (cached) {
    return cached;
  }

  const enrichedFeatures = (features || []).map((feature, index) => {
    const clone = cloneFeature(feature);
    clone.properties = {
      ...(clone.properties || {}),
      __featureIndex: index,
    };
    clone.__bounds = getGeometryBounds(clone.geometry);
    clone.__endpoints = getLineEndpoints(clone.geometry);
    return clone;
  });

  const adjacency = buildTransmissionGraph(enrichedFeatures);
  const substationCoordinates = new Map();
  for (const feature of enrichedFeatures) {
    const sub1 = normalizeName(feature?.properties?.SUB_1);
    const sub2 = normalizeName(feature?.properties?.SUB_2);
    if (sub1 && feature.__endpoints?.start && !substationCoordinates.has(sub1)) {
      substationCoordinates.set(sub1, feature.__endpoints.start);
    }
    if (sub2 && feature.__endpoints?.end && !substationCoordinates.has(sub2)) {
      substationCoordinates.set(sub2, feature.__endpoints.end);
    }
  }

  const index = {
    features: enrichedFeatures,
    adjacency,
    substationCoordinates,
    pathCache: new Map(),
  };

  transmissionIndexCache.set(features, index);
  return index;
}

function findConnectedSubstations(source, sub1, sub2) {
  const start = normalizeName(sub1);
  const goal = normalizeName(sub2);
  const adjacency = source?.adjacency || buildTransmissionGraph(source);
  const cacheKey = source?.pathCache ? [start, goal].sort().join("||") : null;

  if (cacheKey && source.pathCache.has(cacheKey)) {
    return source.pathCache.get(cacheKey);
  }

  if (!adjacency.has(start) || !adjacency.has(goal)) {
    if (cacheKey) {
      source.pathCache.set(cacheKey, null);
    }
    return null;
  }

  const queue = [{ node: start, pathNodes: [start], lineIds: [] }];
  const visited = new Set([start]);

  while (queue.length) {
    const current = queue.shift();
    if (current.node === goal) {
      const result = new Set(current.lineIds);
      if (cacheKey) {
        source.pathCache.set(cacheKey, result);
      }
      return result;
    }

    for (const neighbor of adjacency.get(current.node) || []) {
      if (visited.has(neighbor.node)) {
        continue;
      }
      visited.add(neighbor.node);
      queue.push({
        node: neighbor.node,
        pathNodes: current.pathNodes.concat(neighbor.node),
        lineIds: current.lineIds.concat(neighbor.lineId),
      });
    }
  }

  if (cacheKey) {
    source.pathCache.set(cacheKey, null);
  }
  return null;
}

function processSubstationPair(source, sub1, sub2, newLineFeatures, isoLabel) {
  const lineIds = findConnectedSubstations(source, sub1, sub2);
  if (lineIds) {
    return lineIds;
  }

  const coord1 = getSubstationCoordinates(source, sub1);
  const coord2 = getSubstationCoordinates(source, sub2);
  if (!coord1 || !coord2) {
    return new Set();
  }

  newLineFeatures.push({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [coord1, coord2],
    },
    properties: {
      project_type: "new-reconductoring",
      iso_region: isoLabel,
      substation_pair: `${sub1} -> ${sub2}`,
      SUB_1: sub1,
      SUB_2: sub2,
    },
  });

  return new Set();
}

function featureIntersectsAnyRegion(feature, regionIndex) {
  if (!feature || !regionIndex?.bounds || !feature.__bounds || !boundsIntersect(feature.__bounds, regionIndex.bounds)) {
    return false;
  }

  const endpoints = feature.__endpoints || getLineEndpoints(feature.geometry);
  if (endpoints.start && regionIndex.geometries.some((entry) => pointInGeometry(endpoints.start, entry.geometry))) {
    return true;
  }
  if (endpoints.end && regionIndex.geometries.some((entry) => pointInGeometry(endpoints.end, entry.geometry))) {
    return true;
  }

  return regionIndex.geometries.some(
    (entry) => boundsIntersect(feature.__bounds, entry.bounds) && lineFeatureIntersectsGeometry(feature, entry.geometry)
  );
}

function buildPopupProperties(feature) {
  const props = feature?.properties || {};
  const projectRecords = Array.isArray(props.project_records) ? props.project_records : [];
  const primaryProject = projectRecords[0] || null;
  const projectNames = projectRecords
    .map((row) => String(row?.["Project Name"] || "").trim())
    .filter(Boolean);
  const rows = [
    ["Region", props.iso_region || "-"],
    ["Project", props.project_type === "new-reconductoring" ? "New reconductoring" : "Existing reconductoring"],
    ["Substation pair", props.substation_pair || "-"],
    ["SUB_1", props.SUB_1 || "-"],
    ["SUB_2", props.SUB_2 || "-"],
    [
      "Voltage",
      primaryProject?.["Voltage (kV)"] || primaryProject?.Voltage || props.reconductoring_voltage || props.VOLTAGE || "-",
    ],
  ];

  if (projectRecords.length > 1) {
    rows.push(["Matched workbook projects", String(projectRecords.length)]);
    rows.push(["Workbook project names", projectNames.join(" | ") || "-"]);
  } else if (primaryProject) {
    rows.push(["Project name", primaryProject["Project Name"] || "-"]);
  }

  if (primaryProject) {
    rows.push(["Utility", primaryProject.Utility || "-"]);
    rows.push(["Project type", primaryProject["Project Type"] || "-"]);
    rows.push(["Distance (mi)", primaryProject["Distance (mi)"] || "-"]);
    rows.push(["Rating", primaryProject.Rating || "-"]);
    rows.push(["Cost ($ M)", primaryProject["Cost ($ M)"] || "-"]);
    rows.push(["Status", primaryProject.Status || "-"]);
    rows.push(["Planned year", primaryProject["Planned Year"] || "-"]);
    rows.push(["Description", primaryProject.Description || "-"]);
  }

  return rows;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildReconductoringPopupHtml(feature) {
  const rows = buildPopupProperties(feature)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function cloneFeature(feature) {
  return {
    type: "Feature",
    geometry: JSON.parse(JSON.stringify(feature.geometry)),
    properties: { ...(feature.properties || {}) },
  };
}

function getIsoStates(isoConfig, reedsZones) {
  const states = new Set(isoConfig.states || []);

  if (isoConfig.hierarchyStateFilter?.column && isoConfig.hierarchyStateFilter?.value) {
    for (const row of reedsZones?.hierarchyRows || []) {
      if (String(row[isoConfig.hierarchyStateFilter.column] || "").trim() === isoConfig.hierarchyStateFilter.value) {
        const state = String(row.st || "").trim();
        if (state) {
          states.add(state);
        }
      }
    }
  }

  for (const state of isoConfig.extraStates || []) {
    states.add(state);
  }

  return [...states];
}

function getTransmissionRegionColumn(hierarchyRows) {
  if (!Array.isArray(hierarchyRows) || !hierarchyRows.length) {
    return null;
  }

  const candidates = ["transfreg", "transreg"];
  for (const column of candidates) {
    if (hierarchyRows.some((row) => String(row?.[column] || "").trim())) {
      return column;
    }
  }

  return null;
}

function normalizeRegionName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getIsoTransmissionGroups(isoConfig, reedsZones) {
  const hierarchyRows = reedsZones?.hierarchyRows || [];
  const regionColumn = getTransmissionRegionColumn(hierarchyRows);
  if (!regionColumn) {
    return { regionColumn: null, groups: [] };
  }

  const isoRegionAliases = new Set([normalizeRegionName(isoConfig.label), normalizeRegionName(isoConfig.key)]);
  const groups = new Set();
  for (const row of hierarchyRows) {
    const transmissionRegion = String(row?.[regionColumn] || "").trim();
    if (!isoRegionAliases.has(normalizeRegionName(transmissionRegion))) {
      continue;
    }
    const transmissionGroup = String(row?.transgrp || transmissionRegion).trim();
    if (transmissionGroup) {
      groups.add(transmissionGroup);
    }
  }

  return {
    regionColumn,
    groups: [...groups],
  };
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
    return (
      (sub1.includes(left) && sub2.includes(right)) ||
      (sub1.includes(right) && sub2.includes(left))
    );
  }

  return false;
}

function buildSubstationPairLabel(sub1, sub2) {
  return `${normalizeName(sub1)}||${normalizeName(sub2)}`;
}

function deriveSubstationPairsFromMatchers(features, matchers) {
  const uniquePairs = new Map();

  for (const feature of features || []) {
    if (!(matchers || []).some((matcher) => featureMatchesDirectMatcher(feature, matcher))) {
      continue;
    }

    const sub1 = String(feature?.properties?.SUB_1 || "").trim();
    const sub2 = String(feature?.properties?.SUB_2 || "").trim();
    if (!sub1 || !sub2) {
      continue;
    }

    const key = buildSubstationPairLabel(sub1, sub2);
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, [sub1, sub2]);
    }
  }

  return [...uniquePairs.values()];
}

async function buildIsoReconductoringDataset(options) {
  const isoKey = String(options?.isoKey || "").toLowerCase();
  const transmissionCollection = options?.transmissionFeatureCollection;
  const reedsZones = options?.reedsZones;
  const isoConfig = ISO_RECONDUCTORING_CONFIG.find((entry) => entry.key === isoKey);

  if (!isoConfig) {
    throw new Error(`Unknown ISO region '${isoKey}'.`);
  }
  if (!isoConfig.enabled) {
    throw new Error(`${isoConfig.label} reconductoring is not implemented yet.`);
  }
  if (!transmissionCollection?.features?.length) {
    throw new Error("Transmission feature collection is not loaded.");
  }
  if (!reedsZones?.levels?.get("transgrp")) {
    throw new Error("ReEDS transmission-group hierarchy is not available.");
  }

  const transgrpLevel = reedsZones.levels.get("transgrp");
  const { regionColumn, groups: isoTransmissionGroups } = getIsoTransmissionGroups(isoConfig, reedsZones);
  let regionFeatures = isoTransmissionGroups.map((group) => transgrpLevel.get(group)).filter(Boolean).map(cloneFeature);
  let regionSelectionMode = "transmission-group";
  let isoStates = [];

  if (!regionFeatures.length && reedsZones?.levels?.get("st")) {
    // Backward-compatible fallback when a region has no transgrp/transreg mapping.
    const stateLevel = reedsZones.levels.get("st");
    isoStates = getIsoStates(isoConfig, reedsZones);
    regionFeatures = isoStates.map((state) => stateLevel.get(state)).filter(Boolean).map(cloneFeature);
    regionSelectionMode = "state-fallback";
  }

  if (!regionFeatures.length) {
    throw new Error(
      `No PCA transmission-group geometry found for ${isoConfig.label}${regionColumn ? ` via ${regionColumn}` : ""}.`
    );
  }

  const transmissionIndex = buildTransmissionIndex(transmissionCollection.features);
  const regionIndex = buildRegionIndex(regionFeatures);
  const regionalTransmissionFeatures = transmissionIndex.features.filter((feature) =>
    featureIntersectsAnyRegion(feature, regionIndex)
  );
  const regionalTransmissionIndex = buildTransmissionIndex(regionalTransmissionFeatures);
  const derivedPairs = deriveSubstationPairsFromMatchers(regionalTransmissionIndex.features, isoConfig.directMatchers);
  const targetPairs = [...(isoConfig.substationPairs || []), ...derivedPairs];

  const newLineFeatures = [];
  const existingLineIds = new Set();
  for (const [sub1, sub2] of targetPairs) {
    const foundIds = processSubstationPair(regionalTransmissionIndex, sub1, sub2, newLineFeatures, isoConfig.label);
    for (const lineId of foundIds) {
      existingLineIds.add(lineId);
    }
  }

  const existingFeatures = regionalTransmissionIndex.features
    .filter((feature) => existingLineIds.has(feature.properties.__featureIndex))
    .map((feature) => {
      const clone = cloneFeature(feature);
      clone.properties.project_type = "existing-reconductoring";
      clone.properties.iso_region = isoConfig.label;
      clone.properties.substation_pair = `${feature.properties.SUB_1 || "-"} -> ${feature.properties.SUB_2 || "-"}`;
      clone.properties.reconductoring_voltage = getFeatureProperty(feature.properties, ["VOLTAGE", "Voltage", "voltage"]);
      return clone;
    });

  return {
    isoKey: isoConfig.key,
    label: isoConfig.label,
    regionStyle: {
      color: isoConfig.regionStyle?.color || "#9a6700",
      fillColor: isoConfig.regionStyle?.fillColor || "#fbbf24",
    },
    regionFeatures,
    linesInRegion: regionalTransmissionIndex.features,
    existingFeatures,
    newLineFeatures,
    summary: {
      regionSelectionMode,
      transmissionRegionColumn: regionColumn,
      transmissionGroups: isoTransmissionGroups,
      states: isoStates,
      candidateLineCount: regionalTransmissionIndex.features.length,
      existingSegmentCount: existingFeatures.length,
      newSegmentCount: newLineFeatures.length,
      substationPairCount: targetPairs.length,
    },
  };
}

export {
  ISO_RECONDUCTORING_CONFIG,
  buildReconductoringPopupHtml,
  buildIsoReconductoringDataset,
  findConnectedSubstations,
  getReedsZones,
  processSubstationPair,
};
