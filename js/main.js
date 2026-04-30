const DATA = window.placeDiffusionData;
const SHAPES = window.realMapShapes;

const ORIGIN_COUNTRY_LOOKUP = {
    England: "United Kingdom",
    Germany: "Germany",
    Greece: "Greece",
    Spain: "Spain",
    Mexico: "Mexico",
    France: "France",
    Italy: "Italy",
    Ireland: "Ireland",
    Netherlands: "Netherlands"
};

const COUNTRY_ORIGIN_LOOKUP = Object.fromEntries(
    Object.entries(ORIGIN_COUNTRY_LOOKUP).map(([originName, countryName]) => [countryName, originName])
);

const FEATURE_OPTIONS = Object.entries(DATA.meta.regionLabels).map(([key, label]) => ({
    key,
    label
}));

const ERAS = [
    { key: "early", label: DATA.meta.eraLabels.early, detail: "statehood proxy", color: "#5ec7e6" },
    { key: "expansion", label: DATA.meta.eraLabels.expansion, detail: "statehood proxy", color: "#7fbe47" },
    { key: "modern", label: DATA.meta.eraLabels.modern, detail: "statehood proxy", color: "#9944d6" }
];

const REGION_COLORS = {
    northeast: "#3576d3",
    midwest: "#5b9d46",
    south: "#d4782c",
    west: "#b06bc8"
};

const MAP_VIEWBOX = {
    width: 1000,
    height: 560
};

const LOCAL_INSET_VIEWBOX = {
    width: 480,
    height: 290
};

const MAP_LABEL_COUNTRIES = new Set([
    "United States of America",
    "United Kingdom",
    "Germany",
    "Greece",
    "Spain",
    "Mexico",
    "France",
    "Italy",
    "Ireland",
    "Netherlands",
    "Canada"
]);

const INSET_SCALE_LIMITS = {
    min: 0.68,
    max: 1.2,
    step: 0.1
};

const MAP_DETAIL_THRESHOLDS = {
    global: [
        { maxScale: 0.95, level: "coarse" },
        { maxScale: 2.8, level: "medium" },
        { maxScale: Infinity, level: "fine" }
    ],
    usa: [
        { maxScale: 0.95, level: "coarse" },
        { maxScale: 2.55, level: "medium" },
        { maxScale: Infinity, level: "fine" }
    ]
};

const VIEW_DEFAULT_STATS = {
    global: "timeline",
    usa: "distance",
    local: "rank"
};

const NETWORK_LAYOUT_LIMITS = {
    mainStateNodes: 10,
    insetStateNodes: 5,
    regionEdgeStateNodes: 6
};

const STAT_OPTIONS = {
    timeline: {
        title: (place) => `${place.name} cumulative spread by statehood year`,
        summary: (origin, place) =>
            `${place.totalRecords} GNIS populated-place records, accumulated using a statehood-year proxy rather than a literal naming date for the ${origin.name} sample.`
    },
    distance: {
        title: (place) => `${place.name} distance from entry corridor`,
        summary: (origin, place) =>
            `Distances are measured from ${origin.entryHub.label}. The bars summarize how ${place.name} fans out by proxy era band.`
    },
    rank: {
        title: (place) => `${place.name} state rank by repeated occurrence`,
        summary: (origin, place) =>
            `Each point shows how many GNIS populated-place records for "${place.name}" fall inside a state, ranked from highest to lowest.`
    }
};

const VIEW_COPY = {
    global: {
        kicker: "Global diffusion view",
        title: (origin, place) => `${origin.name} to ${place.label}`,
        description: (origin, place) =>
            `The origin marker uses a country centroid and the U.S. endpoint uses the anchor record for ${place.name} in the GNIS-backed prototype.`
    },
    usa: {
        kicker: "National diffusion view",
        title: (origin, place) => `${place.name} across the contiguous United States`,
        description: () =>
            "Every point in this view is an exact GNIS populated-place record from the contiguous U.S. subset, filtered by region and a proxy era band."
    },
    local: {
        kicker: "Local network view",
        title: (origin, place) => `${place.name} in relational space`,
        description: (origin) =>
            `This schematic network links one selected name to sibling names, top states, and regional communities inside the ${origin.name} group.`
    }
};

const state = {
    search: "",
    selectedOrigin: "Germany",
    selectedPlaceId: "berlin",
    selectedView: "usa",
    selectedStat: "distance",
    activeEras: new Set(ERAS.map((era) => era.key)),
    activeFeatures: new Set(FEATURE_OPTIONS.map((feature) => feature.key)),
    focusedState: null,
    mapViews: {
        global: { scale: 1, tx: 0, ty: 0 },
        usa: { scale: 1, tx: 0, ty: 0 },
        "local-main": { scale: 1, tx: 0, ty: 0 },
        "local-inset-global": { scale: 1, tx: 0, ty: 0 },
        "local-inset-usa": { scale: 1, tx: 0, ty: 0 }
    },
    floatingPanels: {
        leftCollapsed: false,
        rightCollapsed: false
    },
    localInsets: {
        global: { x: null, y: null, scale: 1, collapsed: false },
        usa: { x: null, y: null, scale: 1, collapsed: false }
    },
    linkedKeys: "",
    pinnedInteraction: null,
    insetInteraction: null,
    mapDrag: null
};

const GLOBAL_COUNTRY_SHAPES = new Map(
    SHAPES.global.countries.map((country) => [country.name, country])
);

const USA_STATE_SHAPES = new Map(
    SHAPES.usa.states.map((shape) => [shape.name, shape])
);

const elements = {};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function escapeAttr(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function createLinkKey(type, value) {
    return `${type}:${encodeURIComponent(String(value).toLowerCase())}`;
}

function buildLinkKeys(entries = []) {
    return entries
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([type, value]) => createLinkKey(type, value))
        .join(" ");
}

function renderLinkKeysAttr(entries = []) {
    const keys = buildLinkKeys(entries);
    return keys ? `data-link-keys="${escapeAttr(keys)}"` : "";
}

function renderFocusKeysAttr(entries = []) {
    const keys = buildLinkKeys(entries);
    return keys ? `data-focus-keys="${escapeAttr(keys)}"` : "";
}

function parseLinkKeys(value) {
    return String(value || "")
        .split(/\s+/)
        .filter(Boolean);
}

function getHighlightPayload(target) {
    if (target?.dataset?.focusKeys) {
        const keys = parseLinkKeys(target.dataset.focusKeys);
        return {
            mode: "focus",
            keys,
            signature: `focus|${getKeySignature(keys)}`,
            tooltip: target.dataset.tooltip || ""
        };
    }

    const keys = parseLinkKeys(target?.dataset?.linkKeys || "");
    return {
        mode: "link",
        keys,
        signature: `link|${getKeySignature(keys)}`,
        tooltip: target?.dataset?.tooltip || ""
    };
}

function hexToRgba(hex, alpha) {
    const sanitized = hex.replace("#", "");
    const value = parseInt(sanitized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hashString(value) {
    let hash = 2166136261;
    const text = String(value);

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function seededUnit(seedKey, salt = 0) {
    const seed = hashString(`${seedKey}:${salt}`);
    const raw = Math.sin(seed * 0.00000123 + salt * 17.137) * 43758.5453123;
    return raw - Math.floor(raw);
}

function seededRange(seedKey, min, max, salt = 0) {
    return min + (max - min) * seededUnit(seedKey, salt);
}

function polarPoint(cx, cy, radius, angleDegrees) {
    const radians = angleDegrees * (Math.PI / 180);
    return {
        x: cx + Math.cos(radians) * radius,
        y: cy + Math.sin(radians) * radius
    };
}

function buildOrganicArcPlacement(seedKey, index, count, options) {
    const t = count <= 1 ? 0.5 : index / (count - 1);
    const baseAngle = options.angleStart + (options.angleEnd - options.angleStart) * t;
    const angle = baseAngle + seededRange(seedKey, -options.angleJitter, options.angleJitter, 1);
    const radius = seededRange(seedKey, options.radiusMin, options.radiusMax, 2);
    const point = polarPoint(options.cx, options.cy, radius, angle);

    return {
        x: point.x,
        y: point.y,
        driftX: seededRange(seedKey, -options.driftX, options.driftX, 3),
        driftY: seededRange(seedKey, -options.driftY, options.driftY, 4),
        driftDuration: seededRange(seedKey, options.durationMin, options.durationMax, 5),
        driftDelay: seededRange(seedKey, options.delayMin, options.delayMax, 6)
    };
}

function buildOrganicFanPlacement(seedKey, index, count, options) {
    const perRing = Math.max(options.perRing || count || 1, 1);
    const ringIndex = Math.floor(index / perRing);
    const ringOffset = ringIndex * perRing;
    const ringCount = Math.max(Math.min(perRing, count - ringOffset), 1);
    const slotIndex = index - ringOffset;
    const t = ringCount <= 1 ? 0.5 : slotIndex / (ringCount - 1);
    const baseAngle = options.angleStart + (options.angleEnd - options.angleStart) * t;
    const angle = baseAngle + seededRange(seedKey, -options.angleJitter, options.angleJitter, 1);
    const radius = options.radiusStart
        + ringIndex * options.radiusStep
        + seededRange(seedKey, -options.radiusJitter, options.radiusJitter, 2);
    const point = polarPoint(options.cx, options.cy, radius, angle);

    return {
        x: point.x,
        y: point.y,
        driftX: seededRange(seedKey, -options.driftX, options.driftX, 3),
        driftY: seededRange(seedKey, -options.driftY, options.driftY, 4),
        driftDuration: seededRange(seedKey, options.durationMin, options.durationMax, 5),
        driftDelay: seededRange(seedKey, options.delayMin, options.delayMax, 6)
    };
}

function curvedNetworkPath(from, to, amount = 40, direction = 1) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const normalX = -dy / length;
    const normalY = dx / length;
    const midpointX = (from.x + to.x) / 2;
    const midpointY = (from.y + to.y) / 2;
    const controlX = midpointX + normalX * amount * direction;
    const controlY = midpointY + normalY * amount * direction;

    return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function getOrganicMotionStyle(node) {
    return [
        `--drift-x:${(node.driftX || 0).toFixed(1)}px`,
        `--drift-y:${(node.driftY || 0).toFixed(1)}px`,
        `--drift-duration:${(node.driftDuration || 12).toFixed(2)}s`,
        `--drift-delay:${(node.driftDelay || 0).toFixed(2)}s`
    ].join(";");
}

function getNetworkLabelLayout(node, context = "main") {
    const centerX = context === "inset" ? 240 : 500;
    const gap = context === "inset" ? 10 : 12;
    const baseline = context === "inset" ? 4 : 5;
    const belowGap = context === "inset" ? 18 : 20;

    if (node.kind === "selected" || node.kind === "origin" || node.kind === "region") {
        const labelY = node.y + node.size + belowGap;
        return {
            anchor: "middle",
            labelX: node.x,
            labelY,
            detailY: labelY + 15
        };
    }

    if (node.x < centerX) {
        return {
            anchor: "end",
            labelX: node.x - node.size - gap,
            labelY: node.y + baseline,
            detailY: node.y + baseline + 15
        };
    }

    return {
        anchor: "start",
        labelX: node.x + node.size + gap,
        labelY: node.y + baseline,
        detailY: node.y + baseline + 15
    };
}

function getOriginEntries() {
    return Object.entries(DATA.origins);
}

function getSearchQuery() {
    return state.search.trim().toLowerCase();
}

function buildSearchPlaceResults(query = getSearchQuery()) {
    if (!query) {
        return [];
    }

    return getOriginEntries().flatMap(([originName, origin]) => {
        const originMatches = originName.toLowerCase().includes(query);

        return origin.places
            .filter((place) =>
                originMatches || `${place.name} ${place.label}`.toLowerCase().includes(query)
            )
            .map((place) => ({ originName, origin, place }));
    });
}

function getFilteredOrigins() {
    const query = getSearchQuery();

    if (!query) {
        return getOriginEntries();
    }

    return getOriginEntries().filter(([originName, origin]) => {
        if (originName.toLowerCase().includes(query)) {
            return true;
        }

        return origin.places.some((place) =>
            `${place.name} ${place.label}`.toLowerCase().includes(query)
        );
    });
}

function getSelectedOrigin() {
    return DATA.origins[state.selectedOrigin];
}

function getVisiblePlacesForOrigin(originName) {
    const origin = DATA.origins[originName];
    if (!origin) {
        return [];
    }

    const query = getSearchQuery();
    if (!query) {
        return origin.places;
    }

    const originMatches = originName.toLowerCase().includes(query);
    return origin.places.filter((place) =>
        originMatches || `${place.name} ${place.label}`.toLowerCase().includes(query)
    );
}

function getSelectedPlace() {
    const origin = getSelectedOrigin();
    return origin?.places.find((place) => place.id === state.selectedPlaceId);
}

function getVisibleUsPoints(place) {
    return place.usaPoints.filter((point) =>
        state.activeEras.has(point.era) &&
        state.activeFeatures.has(point.featureKey) &&
        (!state.focusedState || point.state === state.focusedState)
    );
}

function getTopState(place) {
    return place.topStates?.[0] || null;
}

function countUniqueStates(place) {
    return new Set(place.records.map((record) => record.state)).size;
}

function getPanZoomViewbox(viewType) {
    if (String(viewType).startsWith("local-inset-")) {
        return LOCAL_INSET_VIEWBOX;
    }

    return MAP_VIEWBOX;
}

function getOriginCountryName(origin) {
    return ORIGIN_COUNTRY_LOOKUP[origin.name] || origin.name;
}

function getShapePathByDetail(shape, detailLevel) {
    return shape?.paths?.[detailLevel] || shape?.path || "";
}

function getUsaOutlinePathByDetail(detailLevel) {
    return SHAPES.usa.outlinePaths?.[detailLevel] || SHAPES.usa.outlinePath || "";
}

function getMapDetailLevel(mapType, scale = state.mapViews[mapType]?.scale || 1) {
    const thresholds = MAP_DETAIL_THRESHOLDS[mapType] || MAP_DETAIL_THRESHOLDS.usa;
    return thresholds.find((entry) => scale <= entry.maxScale)?.level || "fine";
}

function hasActiveDataFilters() {
    return (
        state.activeEras.size !== ERAS.length ||
        state.activeFeatures.size !== FEATURE_OPTIONS.length ||
        Boolean(state.focusedState)
    );
}

function getMapTransformString(mapType) {
    const view = state.mapViews[mapType];
    return `translate(${view.tx.toFixed(1)} ${view.ty.toFixed(1)}) scale(${view.scale.toFixed(3)})`;
}

function getScaledLabelSize(baseSize, scale) {
    return Math.max(baseSize * 0.5, baseSize / Math.pow(Math.max(scale, 1), 0.78));
}

function getScaledStrokeWidth(baseWidth, scale) {
    return Math.max(baseWidth * 0.42, baseWidth / Math.pow(Math.max(scale, 1), 0.9));
}

function clampMapView(mapType) {
    const view = state.mapViews[mapType];
    const viewbox = getPanZoomViewbox(mapType);

    if (view.scale <= 1) {
        view.scale = 1;
        view.tx = 0;
        view.ty = 0;
        return;
    }

    const minTx = viewbox.width - viewbox.width * view.scale;
    const minTy = viewbox.height - viewbox.height * view.scale;

    view.tx = clamp(view.tx, minTx, 0);
    view.ty = clamp(view.ty, minTy, 0);
}

function transformMapPoint(mapType, x, y) {
    const view = state.mapViews[mapType] || { scale: 1, tx: 0, ty: 0 };
    return {
        x: view.tx + x * view.scale,
        y: view.ty + y * view.scale
    };
}

function renderOverlayPointAttrs(mapType, x, y, kind = "text") {
    const point = transformMapPoint(mapType, x, y);

    if (kind === "circle") {
        return `cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" data-map-x="${x}" data-map-y="${y}"`;
    }

    return `x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" data-map-x="${x}" data-map-y="${y}"`;
}

function buildOverlayCurvePath(mapType, from, to, lift) {
    const start = transformMapPoint(mapType, from.x, from.y);
    const end = transformMapPoint(mapType, to.x, to.y);
    return curvedPath(start, end, lift);
}

function renderOverlayCurveAttrs(mapType, from, to, lift) {
    return `d="${buildOverlayCurvePath(mapType, from, to, lift)}" data-overlay-path="quadratic" data-map-from-x="${from.x}" data-map-from-y="${from.y}" data-map-to-x="${to.x}" data-map-to-y="${to.y}" data-map-lift="${lift}"`;
}

function applyMapTransform(mapType) {
    const layer = document.querySelector(`[data-map-zoom-layer="${mapType}"]`);
    const readout = document.querySelector(`[data-map-zoom-readout="${mapType}"]`);

    if (layer) {
        layer.setAttribute("transform", getMapTransformString(mapType));
    }

    syncMapDetail(mapType);
    syncMapOverlays(mapType);
    syncScaledLabels(mapType);

    if (readout) {
        readout.textContent = `${Math.round(state.mapViews[mapType].scale * 100)}%`;
    }
}

function syncMapOverlays(mapType) {
    const svg = document.querySelector(`[data-map-svg="${mapType}"]`);

    if (!svg) {
        return;
    }

    svg.querySelectorAll("[data-map-x][data-map-y]").forEach((element) => {
        const point = transformMapPoint(
            mapType,
            Number(element.dataset.mapX),
            Number(element.dataset.mapY)
        );

        if (element.tagName.toLowerCase() === "circle") {
            element.setAttribute("cx", point.x.toFixed(1));
            element.setAttribute("cy", point.y.toFixed(1));
            return;
        }

        element.setAttribute("x", point.x.toFixed(1));
        element.setAttribute("y", point.y.toFixed(1));
    });

    svg.querySelectorAll('[data-overlay-path="quadratic"]').forEach((element) => {
        const from = {
            x: Number(element.dataset.mapFromX),
            y: Number(element.dataset.mapFromY)
        };
        const to = {
            x: Number(element.dataset.mapToX),
            y: Number(element.dataset.mapToY)
        };
        const lift = Number(element.dataset.mapLift || 0);
        element.setAttribute("d", buildOverlayCurvePath(mapType, from, to, lift));
    });
}

function syncScaledLabels(mapType) {
    const svg = document.querySelector(`[data-map-svg="${mapType}"]`);
    const scale = state.mapViews[mapType]?.scale || 1;

    if (!svg) {
        return;
    }

    svg.querySelectorAll("[data-scale-label]").forEach((element) => {
        const baseFontSize = Number(element.dataset.baseFontSize || 12);
        const baseStrokeWidth = Number(element.dataset.baseStrokeWidth || 0);
        element.style.fontSize = `${getScaledLabelSize(baseFontSize, scale).toFixed(2)}px`;

        if (baseStrokeWidth > 0) {
            element.style.strokeWidth = `${getScaledStrokeWidth(baseStrokeWidth, scale).toFixed(2)}px`;
        }
    });
}

function syncMapDetail(mapType) {
    const svg = document.querySelector(`[data-map-svg="${mapType}"]`);

    if (!svg) {
        return;
    }

    const detailLevel = getMapDetailLevel(mapType);

    if (svg.dataset.detailLevel === detailLevel) {
        return;
    }

    svg.dataset.detailLevel = detailLevel;

    if (mapType === "global") {
        svg.querySelectorAll('[data-map-detail="global-country"]').forEach((element) => {
            const shape = GLOBAL_COUNTRY_SHAPES.get(element.dataset.shapeName);
            if (shape) {
                element.setAttribute("d", getShapePathByDetail(shape, detailLevel));
            }
        });
        return;
    }

    if (mapType === "usa") {
        const outline = svg.querySelector('[data-map-detail="usa-outline"]');
        if (outline) {
            outline.setAttribute("d", getUsaOutlinePathByDetail(detailLevel));
        }

        svg.querySelectorAll('[data-map-detail="usa-state"]').forEach((element) => {
            const shape = USA_STATE_SHAPES.get(element.dataset.shapeName);
            if (shape) {
                element.setAttribute("d", getShapePathByDetail(shape, detailLevel));
            }
        });
    }
}

function zoomMapAt(mapType, targetScale, anchorX, anchorY) {
    const view = state.mapViews[mapType];
    const nextScale = clamp(targetScale, 1, 8);

    if (nextScale === view.scale) {
        return;
    }

    const scaleRatio = nextScale / view.scale;
    view.tx = anchorX - (anchorX - view.tx) * scaleRatio;
    view.ty = anchorY - (anchorY - view.ty) * scaleRatio;
    view.scale = nextScale;
    clampMapView(mapType);
    applyMapTransform(mapType);
}

function resetMapView(mapType) {
    state.mapViews[mapType] = { scale: 1, tx: 0, ty: 0 };
    applyMapTransform(mapType);
}

function renderMapControls(mapType) {
    return `
        <div class="map-ui">
            <div class="map-controls">
                <button class="map-control-button" type="button" data-map-zoom="in" data-map-type="${mapType}" aria-label="Zoom in">+</button>
                <button class="map-control-button" type="button" data-map-zoom="out" data-map-type="${mapType}" aria-label="Zoom out">−</button>
                <button class="map-control-button map-control-button--wide" type="button" data-map-zoom="reset" data-map-type="${mapType}">Reset View</button>
                <span class="map-zoom-readout" data-map-zoom-readout="${mapType}">100%</span>
            </div>
            <p class="map-hint">Scroll to zoom, drag to pan after zooming, click or tap features to pin details.</p>
        </div>
    `;
}

function renderWorldPolygons(origin, options = {}) {
    const originCountry = getOriginCountryName(origin);
    const detailLevel = options.detailLevel || (options.mapType ? getMapDetailLevel(options.mapType) : "medium");
    const countryPaths = SHAPES.global.countries
        .map((country) => {
            const mappedOrigin = COUNTRY_ORIGIN_LOOKUP[country.name];
            const isCurrentOrigin = country.name === originCountry;
            const tooltip = mappedOrigin
                ? `${mappedOrigin} origin group${mappedOrigin === origin.name ? " (selected)" : ""} · click to select`
                : country.name;

            return `
                <path
                    class="world-country ${isCurrentOrigin ? "is-origin" : ""} ${mappedOrigin ? "is-selectable" : ""}"
                    d="${getShapePathByDetail(country, detailLevel)}"
                    data-map-detail="global-country"
                    data-shape-name="${escapeAttr(country.name)}"
                    data-tooltip="${escapeAttr(tooltip)}"
                    ${mappedOrigin ? `data-origin="${escapeAttr(mappedOrigin)}"` : ""}
                    ${isCurrentOrigin ? renderLinkKeysAttr([["origin", origin.id]]) : ""}
                    ${isCurrentOrigin ? renderFocusKeysAttr([["focus-origin", origin.id]]) : ""}
                ></path>
            `;
        })
        .join("");

    const countryLabels = SHAPES.global.countries
        .filter((country) => MAP_LABEL_COUNTRIES.has(country.name) || country.name === originCountry)
        .map((country) => {
            const mappedOrigin = COUNTRY_ORIGIN_LOOKUP[country.name];
            const isCurrentOrigin = country.name === originCountry;
            const label = country.name === "United States of America" ? "USA" : country.name;
            const tooltip = mappedOrigin
                ? `${mappedOrigin} origin group${mappedOrigin === origin.name ? " (selected)" : ""} · click to select`
                : label;

            return `
                <text
                    class="country-label ${isCurrentOrigin ? "is-origin" : ""} ${mappedOrigin ? "is-selectable" : ""}"
                    x="${country.label.x}"
                    y="${country.label.y}"
                    text-anchor="middle"
                    data-scale-label="true"
                    data-base-font-size="13"
                    data-base-stroke-width="5"
                    data-tooltip="${escapeAttr(tooltip)}"
                    ${mappedOrigin ? `data-origin="${escapeAttr(mappedOrigin)}"` : ""}
                    ${isCurrentOrigin ? renderLinkKeysAttr([["origin", origin.id]]) : ""}
                    ${isCurrentOrigin ? renderFocusKeysAttr([["focus-origin", origin.id]]) : ""}
                >${label}</text>
            `;
        })
        .join("");

    return `${countryPaths}<g class="map-label-layer">${countryLabels}</g>`;
}

function renderUsaPolygons(activeStates = new Set(), stateCounts = new Map(), options = {}) {
    const showLabels = options.showLabels !== false;
    const detailLevel = options.detailLevel || (options.mapType ? getMapDetailLevel(options.mapType) : "medium");
    const states = SHAPES.usa.states
        .map((shape) => {
            const count = stateCounts.get(shape.name) || 0;
            const isFocused = state.focusedState === shape.name;
            const tooltip = count
                ? `${shape.name} · ${count} visible GNIS record${count === 1 ? "" : "s"}${isFocused ? " · click to clear focus" : " · click to focus this state"}`
                : `${shape.name}${isFocused ? " · click to clear focus" : " · click to focus this state"}`;
            return `
                <path
                    class="us-state-real ${activeStates.has(shape.name) ? "is-active" : ""} ${isFocused ? "is-focused" : ""}"
                    d="${getShapePathByDetail(shape, detailLevel)}"
                    data-map-detail="usa-state"
                    data-shape-name="${escapeAttr(shape.name)}"
                    data-tooltip="${escapeAttr(tooltip)}"
                    data-state-focus="${escapeAttr(shape.name)}"
                    ${renderLinkKeysAttr([["state", shape.name]])}
                    ${renderFocusKeysAttr([["focus-state", shape.name]])}
                ></path>
            `;
        })
        .join("");

    const labels = showLabels
        ? SHAPES.usa.states
            .map((shape) => {
                const count = stateCounts.get(shape.name) || 0;
                const isFocused = state.focusedState === shape.name;
                const tooltip = count
                    ? `${shape.name} · ${count} visible GNIS record${count === 1 ? "" : "s"}${isFocused ? " · click to clear focus" : " · click to focus this state"}`
                    : `${shape.name}${isFocused ? " · click to clear focus" : " · click to focus this state"}`;

                return `
                    <text
                        class="state-abbr-label ${activeStates.has(shape.name) ? "is-active" : ""} ${isFocused ? "is-focused" : ""}"
                        x="${shape.label.x}"
                        y="${shape.label.y}"
                        text-anchor="middle"
                        data-scale-label="true"
                        data-base-font-size="12"
                        data-base-stroke-width="5"
                        data-tooltip="${escapeAttr(tooltip)}"
                        data-state-focus="${escapeAttr(shape.name)}"
                        ${renderLinkKeysAttr([["state", shape.name]])}
                        ${renderFocusKeysAttr([["focus-state", shape.name]])}
                    >${shape.abbr}</text>
                `;
            })
            .join("")
        : "";

    return `
        <path class="us-outline-real" d="${getUsaOutlinePathByDetail(detailLevel)}" data-map-detail="usa-outline"></path>
        ${states}
        ${showLabels ? `<g class="map-label-layer">${labels}</g>` : ""}
    `;
}

function normalizeSelection() {
    const originEntries = getOriginEntries();

    if (!originEntries.length) {
        return false;
    }

    if (!DATA.origins[state.selectedOrigin]) {
        state.selectedOrigin = originEntries[0][0];
    }

    const candidate = getSelectedOrigin()?.places?.[0];

    if (!candidate) {
        return false;
    }

    if (!getSelectedOrigin().places.some((place) => place.id === state.selectedPlaceId)) {
        state.selectedPlaceId = candidate.id;
    }

    return true;
}

function updateTheme(origin) {
    document.documentElement.style.setProperty("--accent", origin.accent);
    document.documentElement.style.setProperty("--accent-soft", hexToRgba(origin.accent, 0.16));
    document.documentElement.style.setProperty("--accent-strong", hexToRgba(origin.accent, 0.32));
}

function renderOriginList(filteredOrigins) {
    if (!filteredOrigins.length) {
        elements.originList.innerHTML = `<div class="empty-state">No matching origins found. The current map selection stays in place.</div>`;
        return;
    }

    elements.originList.innerHTML = filteredOrigins
        .map(([originName, origin]) => `
            <button class="origin-button ${originName === state.selectedOrigin ? "is-active" : ""}" type="button" data-origin="${originName}">
                <span class="origin-button__swatch" style="background:${origin.accent}"></span>
                <span>
                    <strong>${originName}</strong>
                    <small>${
                        getSearchQuery()
                            ? `${getVisiblePlacesForOrigin(originName).length} matching name${getVisiblePlacesForOrigin(originName).length === 1 ? "" : "s"}`
                            : `${origin.places.length} tracked names`
                    }</small>
                </span>
                <span class="origin-button__arrow" aria-hidden="true">&rsaquo;</span>
            </button>
        `)
        .join("");
}

function renderPlaceList() {
    const query = getSearchQuery();

    if (query) {
        const results = buildSearchPlaceResults(query);

        if (!results.length) {
            elements.placeList.innerHTML = `<div class="empty-state">No names match the current search. Click a result in the origin list or clear the search to keep browsing.</div>`;
            return;
        }

        elements.placeList.innerHTML = results
            .map(({ originName, place }) => {
                const topState = getTopState(place);
                const isActive =
                    originName === state.selectedOrigin && place.id === state.selectedPlaceId;

                return `
                    <button
                        class="place-button ${isActive ? "is-active" : ""}"
                        type="button"
                        data-origin="${originName}"
                        data-place-id="${place.id}"
                    >
                        <span>
                            <strong>${place.name}</strong>
                            <small>${originName} · ${place.totalRecords} GNIS records${topState ? ` · top state ${topState.state}` : ""}</small>
                        </span>
                        <span class="place-pill">${place.totalRecords}</span>
                    </button>
                `;
            })
            .join("");
        return;
    }

    const places = getVisiblePlacesForOrigin(state.selectedOrigin);

    if (!places.length) {
        elements.placeList.innerHTML = `<div class="empty-state">No names match the current search.</div>`;
        return;
    }

    elements.placeList.innerHTML = places
        .map((place) => {
            const topState = getTopState(place);
            return `
                <button class="place-button ${place.id === state.selectedPlaceId ? "is-active" : ""}" type="button" data-place-id="${place.id}">
                    <span>
                        <strong>${place.name}</strong>
                        <small>${place.totalRecords} GNIS records${topState ? ` · top state ${topState.state}` : ""}</small>
                    </span>
                    <span class="place-pill">${place.totalRecords}</span>
                </button>
            `;
        })
        .join("");
}

function renderFeatureFilters() {
    elements.featureFilters.innerHTML = FEATURE_OPTIONS
        .map((feature) => `
            <label class="filter-chip">
                <input type="checkbox" data-feature="${feature.key}" ${state.activeFeatures.has(feature.key) ? "checked" : ""}>
                <span>${feature.label}</span>
            </label>
        `)
        .join("");
}

function renderEraLegend(place) {
    const counts = place.usaPoints
        .filter((point) =>
            state.activeFeatures.has(point.featureKey) &&
            (!state.focusedState || point.state === state.focusedState)
        )
        .reduce((memo, point) => {
            memo[point.era] = (memo[point.era] || 0) + 1;
            return memo;
        }, {});

    elements.eraLegend.innerHTML = ERAS
        .map((era) => `
            <button class="legend-chip ${state.activeEras.has(era.key) ? "is-active" : ""}" type="button" data-era="${era.key}" style="--chip-color:${era.color}">
                <span class="legend-chip__dot"></span>
                <span class="legend-chip__copy">
                    <strong>${era.label}</strong>
                    <small>${counts[era.key] || 0} records · ${era.detail}</small>
                </span>
            </button>
        `)
        .join("");
}

function buildGrid(width, height, step) {
    let lines = "";

    for (let x = 0; x <= width; x += step) {
        lines += `<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${height}"></line>`;
    }

    for (let y = 0; y <= height; y += step) {
        lines += `<line class="grid-line" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`;
    }

    return lines;
}

function renderTimelineChart(place) {
    const width = 760;
    const height = 230;
    const padding = { top: 20, right: 24, bottom: 42, left: 52 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = place.timelinePoints;
    const maxValue = Math.max(...points.map((point) => point.value), 1) + 2;

    const scaledPoints = points.map((point, index) => ({
        ...point,
        x: padding.left + (index * innerWidth) / Math.max(points.length - 1, 1),
        y: padding.top + innerHeight - (point.value / maxValue) * innerHeight
    }));

    const path = scaledPoints
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    const labelEvery = Math.max(1, Math.ceil(points.length / 8));
    const highlighted = scaledPoints[Math.max(0, scaledPoints.length - 1)];

    const filterNote = hasActiveDataFilters()
        ? "Filters update the maps and linked networks. This timeline remains a full-name proxy summary."
        : `proxy timeline ends at ${highlighted.year}`;

    return `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Timeline chart">
            <rect class="plot-surface" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24"></rect>
            ${buildGrid(width, height, 90)}
            <line class="grid-line" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}"></line>
            <line class="grid-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}"></line>
            <path class="timeline-line" d="${path}"></path>
            ${scaledPoints
                .map((point, index) => `
                    <circle class="timeline-point ${index === scaledPoints.length - 1 ? "is-highlight" : ""}" cx="${point.x}" cy="${point.y}" r="${index === scaledPoints.length - 1 ? 7 : 4.5}"></circle>
                    ${index % labelEvery === 0 || index === scaledPoints.length - 1
                        ? `<text class="chart-note" x="${point.x}" y="${height - 14}" text-anchor="middle">${point.year}</text>`
                        : ""
                    }
                `)
                .join("")}
            ${[0, Math.round(maxValue / 2), maxValue]
                .map((tick) => {
                    const y = padding.top + innerHeight - (tick / maxValue) * innerHeight;
                    return `<text class="chart-note" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${tick}</text>`;
                })
                .join("")}
            <text class="axis-label" x="${padding.left}" y="18">Cumulative count</text>
            <text class="axis-label" x="${width - padding.right}" y="${height + 1}" text-anchor="end">Statehood year proxy</text>
            <text class="chart-note" x="${highlighted.x + 10}" y="${highlighted.y - 12}">${filterNote}</text>
        </svg>
    `;
}

function renderDistanceChart(place, visibleContext) {
    const width = 760;
    const height = 230;
    const padding = { top: 24, right: 24, bottom: 44, left: 52 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const categories = ["short", "medium", "long"];
    const maxValue = Math.max(
        ...categories.flatMap((category) =>
            ERAS.map((era) => visibleContext.distanceBars[category][era.key])
        ),
        1
    ) + 1;
    const groupWidth = innerWidth / categories.length;
    const barWidth = 34;

    return `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distance chart">
            <rect class="plot-surface" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24"></rect>
            ${buildGrid(width, height, 90)}
            <line class="grid-line" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}"></line>
            <line class="grid-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}"></line>
            ${categories
                .map((category, groupIndex) => {
                    const groupStart = padding.left + groupIndex * groupWidth + groupWidth / 2 - 55;
                    return ERAS.map((era, eraIndex) => {
                        const value = visibleContext.distanceBars[category][era.key];
                        const x = groupStart + eraIndex * (barWidth + 10);
                        const y = padding.top + innerHeight - (value / maxValue) * innerHeight;
                        const heightValue = (value / maxValue) * innerHeight;
                        return `
                            <rect class="bar" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="12" fill="${hexToRgba(era.color, 0.3)}" stroke="${era.color}"></rect>
                            <text class="chart-note" x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle">${value}</text>
                        `;
                    }).join("");
                })
                .join("")}
            ${categories
                .map((category, index) => {
                    const x = padding.left + index * groupWidth + groupWidth / 2;
                    return `<text class="chart-note" x="${x}" y="${height - 14}" text-anchor="middle">${category[0].toUpperCase()}${category.slice(1)}</text>`;
                })
                .join("")}
            ${[0, Math.round(maxValue / 2), maxValue]
                .map((tick) => {
                    const y = padding.top + innerHeight - (tick / maxValue) * innerHeight;
                    return `<text class="chart-note" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${tick}</text>`;
                })
                .join("")}
            <text class="axis-label" x="${padding.left}" y="18">Records</text>
            <text class="axis-label" x="${width - padding.right}" y="${height + 1}" text-anchor="end">Distance from entry corridor</text>
            ${
                !visibleContext.visiblePoints.length
                    ? `<text class="chart-note" x="${width / 2}" y="${height / 2}" text-anchor="middle">No visible records remain under the current filters.</text>`
                    : ""
            }
        </svg>
    `;
}

function renderRankChart(place, visibleContext) {
    const width = 760;
    const height = 230;
    const padding = { top: 24, right: 26, bottom: 46, left: 52 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const rankPoints = visibleContext.rankPoints;
    const maxValue = Math.max(...rankPoints.map((point) => point.value), 1) + 1;

    return `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rank scatter chart">
            <rect class="plot-surface" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24"></rect>
            ${buildGrid(width, height, 90)}
            <line class="grid-line" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}"></line>
            <line class="grid-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}"></line>
            ${rankPoints
                .map((point, index) => {
                    const x = padding.left + (index * innerWidth) / Math.max(rankPoints.length - 1, 1);
                    const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight;
                    return `
                        <circle class="scatter-point ${point.highlight ? "is-highlight" : ""}" cx="${x}" cy="${y}" r="${point.highlight ? 8 : 5}"></circle>
                        <text class="chart-note" x="${x}" y="${height - 14}" text-anchor="middle">${point.rank}</text>
                        ${point.highlight ? `<text class="chart-note" x="${x + 12}" y="${y - 12}">top state count ${point.value}</text>` : ""}
                    `;
                })
                .join("")}
            ${[0, Math.round(maxValue / 2), maxValue]
                .map((tick) => {
                    const y = padding.top + innerHeight - (tick / maxValue) * innerHeight;
                    return `<text class="chart-note" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${tick}</text>`;
                })
                .join("")}
            <text class="axis-label" x="${padding.left}" y="18">Occurrences in one state</text>
            <text class="axis-label" x="${width - padding.right}" y="${height + 1}" text-anchor="end">State rank</text>
            ${
                !rankPoints.length
                    ? `<text class="chart-note" x="${width / 2}" y="${height / 2}" text-anchor="middle">No state ranks remain under the current filters.</text>`
                    : ""
            }
        </svg>
    `;
}

function renderStatChart(origin, place, visibleContext) {
    elements.statTitle.textContent = STAT_OPTIONS[state.selectedStat].title(place);
    elements.statSelect.value = state.selectedStat;

    if (state.selectedStat === "distance") {
        elements.statSummary.textContent =
            `${visibleContext.visiblePoints.length} visible GNIS records remain after the current region, era, and state filters. Bars are recomputed live from those records.`;
        elements.statChart.innerHTML = renderDistanceChart(place, visibleContext);
        return;
    }

    if (state.selectedStat === "rank") {
        elements.statSummary.textContent =
            `${visibleContext.topStates.length} states currently contribute visible ${place.name} records${state.focusedState ? ` inside the ${state.focusedState} focus` : ""}.`;
        elements.statChart.innerHTML = renderRankChart(place, visibleContext);
        return;
    }

    elements.statSummary.textContent = hasActiveDataFilters()
        ? `${place.totalRecords} GNIS populated-place records are available overall. The proxy timeline stays at full-name coverage even while map filters are active.`
        : STAT_OPTIONS[state.selectedStat].summary(origin, place);
    elements.statChart.innerHTML = renderTimelineChart(place);
}

function buildSvgPoint(svg, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox?.baseVal;
    const width = viewBox?.width || MAP_VIEWBOX.width;
    const height = viewBox?.height || MAP_VIEWBOX.height;
    return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height
    };
}

function buildStateCountMap(points) {
    return points.reduce((memo, point) => {
        memo.set(point.state, (memo.get(point.state) || 0) + 1);
        return memo;
    }, new Map());
}

function buildRegionCountMap(points) {
    return points.reduce((memo, point) => {
        memo.set(point.region, (memo.get(point.region) || 0) + 1);
        return memo;
    }, new Map());
}

function sortCountEntries(countMap, keyName) {
    return Array.from(countMap.entries())
        .map(([name, count]) => ({ [keyName]: name, count }))
        .sort((entryA, entryB) =>
            entryB.count - entryA.count ||
            String(entryA[keyName]).localeCompare(String(entryB[keyName]))
        );
}

function buildDistanceBars(points) {
    return ["short", "medium", "long"].reduce((memo, band) => {
        memo[band] = ERAS.reduce((eraMemo, era) => {
            eraMemo[era.key] = 0;
            return eraMemo;
        }, {});
        return memo;
    }, {});
}

function buildVisibleContext(place) {
    const visiblePoints = getVisibleUsPoints(place);
    const stateCounts = buildStateCountMap(visiblePoints);
    const regionCounts = buildRegionCountMap(visiblePoints);
    const distanceBars = buildDistanceBars(visiblePoints);

    visiblePoints.forEach((point) => {
        if (distanceBars[point.distanceBand]?.[point.era] !== undefined) {
            distanceBars[point.distanceBand][point.era] += 1;
        }
    });

    const topStates = sortCountEntries(stateCounts, "state");
    const topRegions = sortCountEntries(regionCounts, "region");
    const rankPoints = topStates.map((entry, index) => ({
        rank: index + 1,
        value: entry.count,
        highlight: index === 0,
        state: entry.state
    }));

    return {
        visiblePoints,
        stateCounts,
        regionCounts,
        topStates,
        topRegions,
        distanceBars,
        rankPoints
    };
}

function setupMapInteractions() {
    document.querySelectorAll("[data-map-svg]").forEach((svg) => {
        if (svg.dataset.interactionsReady === "true") {
            return;
        }

        svg.dataset.interactionsReady = "true";
        const mapType = svg.dataset.mapSvg;

        svg.addEventListener("wheel", (event) => {
            event.preventDefault();
            const point = buildSvgPoint(svg, event.clientX, event.clientY);
            const zoomFactor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
            zoomMapAt(mapType, state.mapViews[mapType].scale * zoomFactor, point.x, point.y);
        }, { passive: false });

        svg.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }

            if ((state.mapViews[mapType]?.scale || 1) <= 1) {
                return;
            }

            const startPoint = buildSvgPoint(svg, event.clientX, event.clientY);
            state.mapDrag = {
                mapType,
                pointerId: event.pointerId,
                startX: startPoint.x,
                startY: startPoint.y,
                startTx: state.mapViews[mapType].tx,
                startTy: state.mapViews[mapType].ty
            };
            svg.setPointerCapture(event.pointerId);
            svg.classList.add("is-dragging");
            hideTooltip();
        });

        svg.addEventListener("pointermove", (event) => {
            if (!state.mapDrag || state.mapDrag.mapType !== mapType || state.mapDrag.pointerId !== event.pointerId) {
                return;
            }

            const currentPoint = buildSvgPoint(svg, event.clientX, event.clientY);
            const view = state.mapViews[mapType];
            view.tx = state.mapDrag.startTx + (currentPoint.x - state.mapDrag.startX);
            view.ty = state.mapDrag.startTy + (currentPoint.y - state.mapDrag.startY);
            clampMapView(mapType);
            applyMapTransform(mapType);
        });

        const endDrag = (event) => {
            if (!state.mapDrag || state.mapDrag.mapType !== mapType || state.mapDrag.pointerId !== event.pointerId) {
                return;
            }

            state.mapDrag = null;
            svg.classList.remove("is-dragging");
            if (svg.hasPointerCapture?.(event.pointerId)) {
                svg.releasePointerCapture(event.pointerId);
            }
            syncPinnedInteractionDisplay();
        };

        svg.addEventListener("pointerup", endDrag);
        svg.addEventListener("pointercancel", endDrag);
        svg.addEventListener("dblclick", (event) => {
            event.preventDefault();
            resetMapView(mapType);
        });
    });

    document.querySelectorAll("[data-map-svg]").forEach((svg) => {
        applyMapTransform(svg.dataset.mapSvg);
    });
}

function ensureTooltip() {
    if (elements.mapTooltip) {
        return;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "map-tooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    elements.mapTooltip = tooltip;
}

function hideTooltip() {
    if (!elements.mapTooltip) {
        return;
    }

    elements.mapTooltip.hidden = true;
}

function showTooltip(text, clientX, clientY) {
    ensureTooltip();
    elements.mapTooltip.textContent = text;
    elements.mapTooltip.hidden = false;

    const offset = 16;
    const maxX = window.innerWidth - elements.mapTooltip.offsetWidth - 12;
    const maxY = window.innerHeight - elements.mapTooltip.offsetHeight - 12;
    const left = clamp(clientX + offset, 12, Math.max(12, maxX));
    const top = clamp(clientY + offset, 12, Math.max(12, maxY));

    elements.mapTooltip.style.left = `${left}px`;
    elements.mapTooltip.style.top = `${top}px`;
}

function getKeySignature(keys = []) {
    return Array.from(new Set(keys)).sort().join(" ");
}

function syncPinnedInteractionDisplay() {
    if (!state.pinnedInteraction) {
        return;
    }

    syncLinkedHighlights(state.pinnedInteraction.keys, state.pinnedInteraction.mode);

    if (state.pinnedInteraction.tooltip) {
        showTooltip(
            state.pinnedInteraction.tooltip,
            state.pinnedInteraction.clientX,
            state.pinnedInteraction.clientY
        );
        return;
    }

    hideTooltip();
}

function clearPinnedInteraction() {
    state.pinnedInteraction = null;
    hideTooltip();
    syncLinkedHighlights();
}

function togglePinnedInteraction(target, event) {
    const { keys, mode, signature, tooltip } = getHighlightPayload(target);

    if (
        state.pinnedInteraction &&
        state.pinnedInteraction.signature === signature &&
        state.pinnedInteraction.tooltip === tooltip
    ) {
        clearPinnedInteraction();
        return;
    }

    state.pinnedInteraction = {
        signature,
        mode,
        keys,
        tooltip,
        clientX: event.clientX,
        clientY: event.clientY
    };
    syncPinnedInteractionDisplay();
}

function handleVizPointerMove(event) {
    if (state.mapDrag || state.insetInteraction) {
        hideTooltip();
        if (!state.pinnedInteraction) {
            syncLinkedHighlights();
        }
        return;
    }

    if (state.pinnedInteraction) {
        return;
    }

    const tooltipTarget = event.target.closest("[data-tooltip]");
    const highlightTarget = event.target.closest("[data-focus-keys], [data-link-keys]");

    if (highlightTarget && elements.vizStage.contains(highlightTarget)) {
        const payload = getHighlightPayload(highlightTarget);
        syncLinkedHighlights(payload.keys, payload.mode);
    } else {
        syncLinkedHighlights();
    }

    if (!tooltipTarget || !elements.vizStage.contains(tooltipTarget)) {
        hideTooltip();
        return;
    }

    showTooltip(tooltipTarget.dataset.tooltip, event.clientX, event.clientY);
}

function handleVizPointerLeave() {
    if (state.pinnedInteraction) {
        return;
    }

    hideTooltip();
    syncLinkedHighlights();
}

function curvedPath(from, to, lift = 120) {
    const controlX = (from.x + to.x) / 2;
    const controlY = Math.min(from.y, to.y) - lift;
    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function renderGlobalView(origin, place) {
    const visibleContext = buildVisibleContext(place);
    const topState = hasActiveDataFilters()
        ? (visibleContext.topStates[0] || null)
        : getTopState(place);
    const placeLinkEntries = [["place", place.id], ["origin", origin.id]];
    const originLinkEntries = [["origin", origin.id]];
    const clipId = "map-clip-global-main";

    return `
        <div class="viz-layout viz-layout--global">
            <div class="viz-frame map-frame">
                ${renderMapControls("global")}
                <svg class="viz-svg interactive-map" data-map-svg="global" viewBox="0 0 1000 560" role="img" aria-label="Global diffusion view">
                    <defs>
                        <clipPath id="${clipId}">
                            <rect x="20" y="20" width="960" height="520" rx="34"></rect>
                        </clipPath>
                    </defs>
                    <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
                    ${buildGrid(1000, 560, 84)}
                    <g clip-path="url(#${clipId})">
                        <g class="map-zoom-layer" data-map-zoom-layer="global" transform="${getMapTransformString("global")}">
                            ${renderWorldPolygons(origin, { mapType: "global" })}
                        </g>
                        <g class="map-overlay-layer" data-map-overlay-layer="global">
                            <path class="route route--wide" ${renderOverlayCurveAttrs("global", origin.anchor, place.globalTarget, 132)} stroke="${origin.accent}" data-tooltip="${escapeAttr(`Global route from ${origin.name} to ${place.name}`)}" ${renderLinkKeysAttr(placeLinkEntries)} ${renderFocusKeysAttr([["focus-relation", `origin-selected:${origin.id}:${place.id}`]])}></path>
                            <circle class="marker marker--origin" ${renderOverlayPointAttrs("global", origin.anchor.x, origin.anchor.y, "circle")} r="13" data-origin="${escapeAttr(origin.name)}" data-tooltip="${escapeAttr(`${origin.anchor.label} · selected origin group`)}" ${renderLinkKeysAttr(originLinkEntries)} ${renderFocusKeysAttr([["focus-origin", origin.id]])}></circle>
                            <circle class="marker" ${renderOverlayPointAttrs("global", place.globalTarget.x, place.globalTarget.y, "circle")} r="12" data-tooltip="${escapeAttr(place.label)}" ${renderLinkKeysAttr(placeLinkEntries)} ${renderFocusKeysAttr([["focus-selected-place", place.id]])}></circle>
                            <text class="map-label map-label--important" ${renderOverlayPointAttrs("global", origin.anchor.x + 18, origin.anchor.y - 8)} data-origin="${escapeAttr(origin.name)}" data-tooltip="${escapeAttr(`${origin.anchor.label} · selected origin group`)}" ${renderLinkKeysAttr(originLinkEntries)} ${renderFocusKeysAttr([["focus-origin", origin.id]])}>${origin.anchor.label}</text>
                            <text class="map-label map-label--important" ${renderOverlayPointAttrs("global", place.globalTarget.x + 18, place.globalTarget.y + 4)} data-tooltip="${escapeAttr(place.label)}" ${renderLinkKeysAttr(placeLinkEntries)} ${renderFocusKeysAttr([["focus-selected-place", place.id]])}>${place.label}</text>
                            <text class="chart-label chart-label--muted map-context-label" ${renderOverlayPointAttrs("global", 62, 86)}>North America</text>
                            <text class="chart-label chart-label--muted map-context-label" ${renderOverlayPointAttrs("global", 740, 82)}>Europe / Mediterranean</text>
                        </g>
                    </g>
                    <text class="chart-note" x="58" y="518">Origin coordinates are country centroids; the U.S. point uses the selected anchor record from GNIS.</text>
                </svg>
                ${renderLocalInset(origin, place, "global")}
            </div>

            <div class="annotation-stack">
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">Data Snapshot</p>
                    <h3>${place.totalRecords} GNIS records</h3>
                    <p>${place.summary}</p>
                </article>
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">Top State</p>
                    <h3>${topState ? `${topState.state} (${topState.count})` : "No visible state"}</h3>
                    <p>${origin.description}</p>
                </article>
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">Method Note</p>
                    <p>${DATA.meta.timeProxyNote}</p>
                </article>
            </div>
        </div>
    `;
}

function renderUsaView(origin, place) {
    const visibleContext = buildVisibleContext(place);
    const hub = {
        x: origin.entryHub.x,
        y: origin.entryHub.y
    };
    const { visiblePoints, stateCounts } = visibleContext;
    const activeStates = new Set(visiblePoints.map((point) => point.state));
    const clipId = "map-clip-usa-main";

    const routes = visiblePoints
        .map((point) => {
            const target = { x: point.x, y: point.y };
            return `
                <path
                    class="route"
                    ${renderOverlayCurveAttrs("usa", hub, target, 74)}
                    stroke="${ERAS.find((era) => era.key === point.era).color}"
                    data-tooltip="${escapeAttr(`${point.label} diffusion route`)}"
                    ${renderLinkKeysAttr([["place", place.id], ["state", point.state], ["region", point.region], ["origin", origin.id]])}
                    ${renderFocusKeysAttr([["focus-route", point.id]])}
                ></path>
            `;
        })
        .join("");

    const points = visiblePoints
        .map((point) => `
            <circle
                class="dot-point"
                ${renderOverlayPointAttrs("usa", point.x, point.y, "circle")}
                r="${point.radius}"
                fill="${REGION_COLORS[point.region] || origin.accent}"
                data-tooltip="${escapeAttr(point.tooltip)}"
                ${renderLinkKeysAttr([["place", place.id], ["state", point.state], ["region", point.region], ["origin", origin.id]])}
                ${renderFocusKeysAttr([["focus-point", point.id]])}
            ></circle>
        `)
        .join("");

    return `
        <div class="viz-layout viz-layout--usa">
            <div class="viz-frame map-frame">
                ${renderMapControls("usa")}
                <svg class="viz-svg interactive-map" data-map-svg="usa" viewBox="0 0 1000 560" role="img" aria-label="National diffusion view">
                    <defs>
                        <clipPath id="${clipId}">
                            <rect x="20" y="20" width="960" height="520" rx="34"></rect>
                        </clipPath>
                    </defs>
                    <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
                    ${buildGrid(1000, 560, 84)}
                    <g clip-path="url(#${clipId})">
                        <g class="map-zoom-layer" data-map-zoom-layer="usa" transform="${getMapTransformString("usa")}">
                            ${renderUsaPolygons(activeStates, stateCounts, { mapType: "usa" })}
                        </g>
                        <g class="map-overlay-layer" data-map-overlay-layer="usa">
                            <circle class="marker marker--hub" ${renderOverlayPointAttrs("usa", hub.x, hub.y, "circle")} r="12" data-tooltip="${escapeAttr(origin.entryHub.label)}" ${renderLinkKeysAttr([["origin", origin.id]])} ${renderFocusKeysAttr([["focus-origin", origin.id]])}></circle>
                            <text class="map-label map-label--important" ${renderOverlayPointAttrs("usa", hub.x - 10, hub.y - 18)} text-anchor="end" data-tooltip="${escapeAttr(origin.entryHub.label)}" ${renderLinkKeysAttr([["origin", origin.id]])} ${renderFocusKeysAttr([["focus-origin", origin.id]])}>${origin.entryHub.label}</text>
                            ${routes}
                            ${points}
                            <text class="chart-label chart-label--muted map-context-label" ${renderOverlayPointAttrs("usa", 118, 116)}>Pacific</text>
                            <text class="chart-label chart-label--muted map-context-label" ${renderOverlayPointAttrs("usa", 844, 182)} text-anchor="end">Atlantic</text>
                        </g>
                    </g>
                    ${
                        !visiblePoints.length
                            ? `<text class="map-label" x="500" y="280" text-anchor="middle">Current filters hide all visible records.</text>`
                            : ""
                    }
                </svg>
                ${renderLocalInset(origin, place, "usa")}
            </div>

            <div class="annotation-row">
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">How To Read This</p>
                    <p>
                        The hub is a hand-picked entry corridor for the selected origin group. Each visible dot is a real GNIS record,
                        and the curved routes are a symbolic diffusion layer drawn from that corridor to each occurrence.
                    </p>
                </article>
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">Visible Records</p>
                    <div class="annotation-card__metric">${visiblePoints.length}</div>
                    <p>${state.activeFeatures.size} regional filters active · ${state.activeEras.size} proxy eras active${state.focusedState ? ` · focused on ${state.focusedState}` : ""}</p>
                </article>
            </div>
        </div>
    `;
}

function buildLocalNetwork(origin, place) {
    const visibleContext = buildVisibleContext(place);
    const seedRoot = `${origin.id}:${place.id}:local`;
    const originNode = {
        id: "origin",
        kind: "origin",
        x: 500 + seededRange(`${seedRoot}:origin-x`, -24, 24),
        y: 84 + seededRange(`${seedRoot}:origin-y`, -10, 10),
        size: 16,
        color: "#223249",
        label: origin.name,
        detail: "origin group",
        tooltip: `${origin.name} is the origin anchor for this network`,
        linkEntries: [["origin", origin.id]],
        focusEntries: [["focus-origin", origin.id]],
        driftX: seededRange(`${seedRoot}:origin-drift`, -4, 4, 1),
        driftY: seededRange(`${seedRoot}:origin-drift`, -5, 5, 2),
        driftDuration: seededRange(`${seedRoot}:origin-drift`, 9.5, 13.5, 3),
        driftDelay: seededRange(`${seedRoot}:origin-drift`, -5, 0, 4)
    };
    const selectedNode = {
        id: "selected",
        kind: "selected",
        x: 500 + seededRange(`${seedRoot}:selected-x`, -14, 14),
        y: 244 + seededRange(`${seedRoot}:selected-y`, -10, 10),
        size: Math.min(26 + place.totalRecords / 6, 38),
        color: origin.accent,
        label: place.name,
        detail: `${place.totalRecords} GNIS records`,
        selected: true,
        tooltip: `${place.name} is the current main-view place`,
        linkEntries: [["place", place.id], ["origin", origin.id]],
        focusEntries: [["focus-selected-place", place.id]],
        driftX: seededRange(`${seedRoot}:selected-drift`, -6, 6, 1),
        driftY: seededRange(`${seedRoot}:selected-drift`, -7, 7, 2),
        driftDuration: seededRange(`${seedRoot}:selected-drift`, 10.5, 15.5, 3),
        driftDelay: seededRange(`${seedRoot}:selected-drift`, -6, 0, 4)
    };

    const siblings = origin.places.filter((candidate) => candidate.id !== place.id);
    const siblingCount = Math.max(siblings.length, 1);
    const siblingNodes = siblings.map((candidate, index) => {
        const placement = buildOrganicArcPlacement(
            `${seedRoot}:sibling:${candidate.id}`,
            index,
            siblingCount,
            {
                cx: selectedNode.x,
                cy: selectedNode.y + 2,
                angleStart: 198,
                angleEnd: 322,
                angleJitter: 9,
                radiusMin: 244,
                radiusMax: 312,
                driftX: 8,
                driftY: 10,
                durationMin: 11,
                durationMax: 18,
                delayMin: -8,
                delayMax: 0
            }
        );

        return {
            id: `sibling-${candidate.id}`,
            kind: "sibling",
            ...placement,
            size: Math.min(16 + candidate.totalRecords / 8, 28),
            color: origin.accent,
            label: candidate.name,
            detail: `${candidate.totalRecords} records`,
            group: "sibling",
            placeId: candidate.id,
            tooltip: `Click to switch the main view to ${candidate.name}`,
            linkEntries: [["place", candidate.id], ["origin", origin.id]],
            focusEntries: [["focus-sibling-place", candidate.id]]
        };
    });

    const visibleStateEntries = visibleContext.topStates.slice(0, NETWORK_LAYOUT_LIMITS.mainStateNodes);
    const hiddenStateEntries = visibleContext.topStates.slice(NETWORK_LAYOUT_LIMITS.mainStateNodes);
    const stateNodes = visibleStateEntries.map((entry, index) => {
        const placement = buildOrganicFanPlacement(
            `${seedRoot}:state:${entry.state}`,
            index,
            Math.max(visibleStateEntries.length, 1),
            {
                cx: selectedNode.x,
                cy: selectedNode.y - 2,
                angleStart: -50,
                angleEnd: 74,
                angleJitter: 5,
                perRing: 5,
                radiusStart: 248,
                radiusStep: 50,
                radiusJitter: 8,
                driftX: 8,
                driftY: 9,
                durationMin: 11.5,
                durationMax: 17.5,
                delayMin: -7,
                delayMax: 0
            }
        );

        return {
            id: `state-${entry.state.toLowerCase().replace(/\s+/g, "-")}`,
            kind: "state",
            ...placement,
            size: Math.min(13 + entry.count * 3.5, 22),
            color: REGION_COLORS[
                place.records.find((record) => record.state === entry.state)?.region || "south"
            ],
            label: entry.state,
            detail: entry.count > 1 ? `${entry.count} visible` : "",
            count: entry.count,
            group: "state",
            state: entry.state,
            tooltip: `${entry.state} has ${entry.count} visible record${entry.count === 1 ? "" : "s"}${state.focusedState === entry.state ? " · click to clear focus" : " · click to focus this state"}`,
            linkEntries: [["state", entry.state], ["place", place.id], ["origin", origin.id]],
            focusEntries: [["focus-state", entry.state]]
        };
    });

    const hiddenStateCount = hiddenStateEntries.reduce((sum, entry) => sum + entry.count, 0);
    const hiddenStateNode = hiddenStateEntries.length
        ? {
            id: "state-summary-hidden",
            kind: "state-summary",
            ...buildOrganicArcPlacement(
                `${seedRoot}:state-summary`,
                0,
                1,
                {
                    cx: selectedNode.x,
                    cy: selectedNode.y + 14,
                    angleStart: 38,
                    angleEnd: 38,
                    angleJitter: 4,
                    radiusMin: 320,
                    radiusMax: 348,
                    driftX: 6,
                    driftY: 7,
                    durationMin: 11,
                    durationMax: 15.5,
                    delayMin: -6,
                    delayMax: 0
                }
            ),
            size: 16 + Math.min(hiddenStateEntries.length, 5),
            color: hexToRgba(origin.accent, 0.82),
            label: `+${hiddenStateEntries.length} more`,
            detail: `${hiddenStateCount} visible`,
            tooltip: `${hiddenStateEntries.length} lower-frequency states are collapsed here to keep the network readable.`,
            linkEntries: [["place", place.id], ["origin", origin.id]],
            focusEntries: [["focus-state-summary", `${place.id}:${hiddenStateEntries.length}`]]
        }
        : null;

    const regionList = visibleContext.topRegions.map((entry) => [entry.region, entry.count]);
    const regionCount = Math.max(regionList.length, 1);
    const regionEntries = regionList.map(([region, count], index) => {
        const placement = buildOrganicFanPlacement(
            `${seedRoot}:region:${region}`,
            index,
            regionCount,
            {
                cx: selectedNode.x,
                cy: selectedNode.y + 12,
                angleStart: 62,
                angleEnd: 118,
                angleJitter: 6,
                perRing: 4,
                radiusStart: 208,
                radiusStep: 44,
                radiusJitter: 6,
                driftX: 7,
                driftY: 7,
                durationMin: 10,
                durationMax: 15,
                delayMin: -6,
                delayMax: 0
            }
        );

        return {
            id: `region-${region}`,
            kind: "region",
            ...placement,
            size: Math.min(14 + count * 2, 26),
            color: REGION_COLORS[region],
            label: DATA.meta.regionLabels[region],
            detail: `${count} visible`,
            group: "region",
            region,
            tooltip: `${DATA.meta.regionLabels[region]} contributes ${count} visible record${count === 1 ? "" : "s"}`,
            linkEntries: [["region", region], ["place", place.id], ["origin", origin.id]],
            focusEntries: [["focus-region", region]]
        };
    });

    const nodes = [
        originNode,
        selectedNode,
        ...siblingNodes,
        ...stateNodes,
        ...(hiddenStateNode ? [hiddenStateNode] : []),
        ...regionEntries
    ];
    const edges = [];

    edges.push({
        id: "origin-selected",
        from: "origin",
        to: "selected",
        primary: true,
        linkEntries: [["origin", origin.id], ["place", place.id]],
        focusEntries: [["focus-relation", `origin-selected:${origin.id}:${place.id}`]]
    });
    siblingNodes.forEach((node) => edges.push({
        id: `selected-${node.id}`,
        from: "selected",
        to: node.id,
        primary: true,
        linkEntries: node.linkEntries,
        focusEntries: [["focus-edge", `selected-sibling:${node.placeId}`]]
    }));
    stateNodes.forEach((node) => edges.push({
        id: `selected-${node.id}`,
        from: "selected",
        to: node.id,
        primary: true,
        linkEntries: node.linkEntries,
        focusEntries: [["focus-edge", `selected-state:${node.state}`]]
    }));
    if (hiddenStateNode) {
        edges.push({
            id: "selected-state-summary-hidden",
            from: "selected",
            to: hiddenStateNode.id,
            primary: true,
            linkEntries: hiddenStateNode.linkEntries,
            focusEntries: hiddenStateNode.focusEntries
        });
    }

    const regionEdgeStates = stateNodes
        .filter((node) => node.count > 1)
        .slice(0, NETWORK_LAYOUT_LIMITS.regionEdgeStateNodes);
    const statesForRegionEdges = regionEdgeStates.length
        ? regionEdgeStates
        : stateNodes.slice(0, Math.min(4, stateNodes.length));

    statesForRegionEdges.forEach((node) => {
        const linkedRegion = place.records.find((record) => record.state === node.state)?.region;
        if (linkedRegion) {
            edges.push({
                id: `${node.id}-region-${linkedRegion}`,
                from: node.id,
                to: `region-${linkedRegion}`,
                primary: false,
                linkEntries: [["state", node.state], ["region", linkedRegion], ["place", place.id], ["origin", origin.id]],
                focusEntries: [["focus-relation", `state-region:${node.state}:${linkedRegion}`]]
            });
        }
    });

    return { nodes, edges, selectedNode, visibleCount: visibleContext.visiblePoints.length };
}

function buildInsetLocalNetwork(origin, place) {
    const visibleContext = buildVisibleContext(place);
    const seedRoot = `${origin.id}:${place.id}:inset`;
    const siblingPlaces = origin.places
        .filter((candidate) => candidate.id !== place.id)
        .sort((placeA, placeB) => placeB.totalRecords - placeA.totalRecords)
        .slice(0, 3);
    const topStates = visibleContext.topStates.slice(0, NETWORK_LAYOUT_LIMITS.insetStateNodes);
    const hiddenInsetStates = visibleContext.topStates.slice(NETWORK_LAYOUT_LIMITS.insetStateNodes);
    const topRegions = visibleContext.topRegions.slice(0, 3);

    const originNode = {
        id: "origin",
        kind: "origin",
        x: 240 + seededRange(`${seedRoot}:origin-x`, -10, 10),
        y: 42 + seededRange(`${seedRoot}:origin-y`, -6, 4),
        size: 14,
        color: "#223249",
        label: origin.name,
        detail: "origin group",
        tooltip: `${origin.name} origin group`,
        linkEntries: [["origin", origin.id]],
        focusEntries: [["focus-origin", origin.id]],
        driftX: seededRange(`${seedRoot}:origin-drift`, -3, 3, 1),
        driftY: seededRange(`${seedRoot}:origin-drift`, -3, 3, 2),
        driftDuration: seededRange(`${seedRoot}:origin-drift`, 8.5, 12.5, 3),
        driftDelay: seededRange(`${seedRoot}:origin-drift`, -5, 0, 4)
    };

    const selectedNode = {
        id: "selected",
        kind: "selected",
        x: 240 + seededRange(`${seedRoot}:selected-x`, -8, 8),
        y: 114 + seededRange(`${seedRoot}:selected-y`, -5, 6),
        size: 22,
        color: origin.accent,
        label: place.name,
        detail: `${visibleContext.visiblePoints.length} visible`,
        tooltip: `${place.name} is the current main-view place`,
        linkEntries: [["place", place.id], ["origin", origin.id]],
        focusEntries: [["focus-selected-place", place.id]],
        driftX: seededRange(`${seedRoot}:selected-drift`, -4, 4, 1),
        driftY: seededRange(`${seedRoot}:selected-drift`, -4, 4, 2),
        driftDuration: seededRange(`${seedRoot}:selected-drift`, 9, 13, 3),
        driftDelay: seededRange(`${seedRoot}:selected-drift`, -5, 0, 4)
    };

    const siblingNodes = siblingPlaces.map((candidate, index) => {
        const placement = buildOrganicArcPlacement(
            `${seedRoot}:sibling:${candidate.id}`,
            index,
            Math.max(siblingPlaces.length, 1),
            {
                cx: selectedNode.x,
                cy: selectedNode.y + 2,
                angleStart: 196,
                angleEnd: 300,
                angleJitter: 8,
                radiusMin: 126,
                radiusMax: 158,
                driftX: 4,
                driftY: 4,
                durationMin: 8.5,
                durationMax: 12.5,
                delayMin: -5,
                delayMax: 0
            }
        );

        return {
            id: `sibling-${candidate.id}`,
            kind: "sibling",
            ...placement,
            size: 14 + Math.min(candidate.totalRecords / 12, 6),
            color: origin.accent,
            label: candidate.name,
            detail: `${candidate.totalRecords} records`,
            tooltip: `Click to switch the main view to ${candidate.name}`,
            placeId: candidate.id,
            linkEntries: [["place", candidate.id], ["origin", origin.id]],
            focusEntries: [["focus-sibling-place", candidate.id]]
        };
    });

    const stateNodes = topStates.map((entry, index) => {
        const placement = buildOrganicFanPlacement(
            `${seedRoot}:state:${entry.state}`,
            index,
            Math.max(topStates.length, 1),
            {
                cx: selectedNode.x,
                cy: selectedNode.y - 2,
                angleStart: -40,
                angleEnd: 56,
                angleJitter: 5,
                perRing: 3,
                radiusStart: 124,
                radiusStep: 28,
                radiusJitter: 5,
                driftX: 4,
                driftY: 4,
                durationMin: 8.5,
                durationMax: 12.5,
                delayMin: -5,
                delayMax: 0
            }
        );

        return {
            id: `state-${entry.state.toLowerCase().replace(/\s+/g, "-")}`,
            kind: "state",
            ...placement,
            size: 13 + entry.count * 1.5,
            color: REGION_COLORS[
                place.records.find((record) => record.state === entry.state)?.region || "south"
            ],
            label: entry.state,
            detail: entry.count > 1 ? `${entry.count} visible` : "",
            count: entry.count,
            state: entry.state,
            tooltip: `${entry.state} contains ${entry.count} visible record${entry.count === 1 ? "" : "s"} for ${place.name}${state.focusedState === entry.state ? " · click to clear focus" : " · click to focus this state"}`,
            linkEntries: [["state", entry.state], ["place", place.id], ["origin", origin.id]],
            focusEntries: [["focus-state", entry.state]]
        };
    });

    const hiddenInsetCount = hiddenInsetStates.reduce((sum, entry) => sum + entry.count, 0);
    const hiddenInsetNode = hiddenInsetStates.length
        ? {
            id: "state-summary-hidden",
            kind: "state-summary",
            ...buildOrganicArcPlacement(
                `${seedRoot}:state-summary`,
                0,
                1,
                {
                    cx: selectedNode.x,
                    cy: selectedNode.y + 8,
                    angleStart: 34,
                    angleEnd: 34,
                    angleJitter: 4,
                    radiusMin: 164,
                    radiusMax: 178,
                    driftX: 3,
                    driftY: 3,
                    durationMin: 8,
                    durationMax: 11,
                    delayMin: -4,
                    delayMax: 0
                }
            ),
            size: 12 + Math.min(hiddenInsetStates.length, 4),
            color: hexToRgba(origin.accent, 0.8),
            label: `+${hiddenInsetStates.length} more`,
            detail: `${hiddenInsetCount} visible`,
            tooltip: `${hiddenInsetStates.length} lower-frequency states are collapsed here in the inset view.`,
            linkEntries: [["place", place.id], ["origin", origin.id]],
            focusEntries: [["focus-state-summary", `${place.id}:inset:${hiddenInsetStates.length}`]]
        }
        : null;

    const regionNodes = topRegions.map((entry, index) => {
        const region = entry.region;
        const count = entry.count;
        const placement = buildOrganicFanPlacement(
            `${seedRoot}:region:${region}`,
            index,
            Math.max(topRegions.length, 1),
            {
                cx: selectedNode.x,
                cy: selectedNode.y + 10,
                angleStart: 64,
                angleEnd: 116,
                angleJitter: 5,
                perRing: 3,
                radiusStart: 104,
                radiusStep: 24,
                radiusJitter: 4,
                driftX: 3,
                driftY: 3,
                durationMin: 8,
                durationMax: 11.5,
                delayMin: -4,
                delayMax: 0
            }
        );

        return {
            id: `region-${region}`,
            kind: "region",
            ...placement,
            size: 11 + count * 1.1,
            color: REGION_COLORS[region],
            label: DATA.meta.regionLabels[region],
            detail: `${count} visible`,
            tooltip: `${DATA.meta.regionLabels[region]} contributes ${count} visible records`,
            linkEntries: [["region", region], ["place", place.id], ["origin", origin.id]],
            focusEntries: [["focus-region", region]]
        };
    });

    const nodes = [
        originNode,
        selectedNode,
        ...siblingNodes,
        ...stateNodes,
        ...(hiddenInsetNode ? [hiddenInsetNode] : []),
        ...regionNodes
    ];
    const edges = [
        {
            id: "origin-selected",
            from: "origin",
            to: "selected",
            primary: true,
            linkEntries: [["origin", origin.id], ["place", place.id]],
            focusEntries: [["focus-relation", `origin-selected:${origin.id}:${place.id}`]]
        },
        ...siblingNodes.map((node) => ({
            id: `selected-${node.id}`,
            from: "selected",
            to: node.id,
            primary: true,
            linkEntries: node.linkEntries,
            focusEntries: [["focus-edge", `selected-sibling:${node.placeId}`]]
        })),
        ...stateNodes.map((node) => ({
            id: `selected-${node.id}`,
            from: "selected",
            to: node.id,
            primary: true,
            linkEntries: node.linkEntries,
            focusEntries: [["focus-edge", `selected-state:${node.state}`]]
        })),
        ...(hiddenInsetNode ? [{
            id: "selected-state-summary-hidden",
            from: "selected",
            to: hiddenInsetNode.id,
            primary: true,
            linkEntries: hiddenInsetNode.linkEntries,
            focusEntries: hiddenInsetNode.focusEntries
        }] : []),
        ...regionNodes.map((node) => ({
            id: `selected-${node.id}`,
            from: "selected",
            to: node.id,
            primary: false,
            linkEntries: node.linkEntries,
            focusEntries: [["focus-edge", `selected-region:${node.id}`]]
        }))
    ];

    return { nodes, edges, visibleCount: visibleContext.visiblePoints.length };
}

function renderNetworkEdge(edge, nodesById, context = "main") {
    const from = typeof edge.from === "string" ? nodesById.get(edge.from) : edge.from;
    const to = typeof edge.to === "string" ? nodesById.get(edge.to) : edge.to;

    if (!from || !to) {
        return "";
    }

    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const baseCurve = context === "inset" ? (edge.primary ? 16 : 10) : (edge.primary ? 28 : 18);
    const curveAmount = Math.min(
        baseCurve + distance * (context === "inset" ? 0.045 : 0.06),
        context === "inset" ? 30 : 54
    );
    const direction = seededUnit(edge.id || `${from.id}:${to.id}`) > 0.5 ? 1 : -1;

    return `
        <path
            class="network-edge ${edge.primary ? "is-primary" : ""} ${context === "inset" ? "network-edge--inset" : ""}"
            d="${curvedNetworkPath(from, to, curveAmount, direction)}"
            ${renderLinkKeysAttr(edge.linkEntries)}
            ${renderFocusKeysAttr(edge.focusEntries)}
        ></path>
    `;
}

function renderLocalNetworkNode(node) {
    const labelLayout = getNetworkLabelLayout(node, "main");
    const className = [
        "local-network-node",
        node.selected ? "is-selected" : "",
        node.kind === "state-summary" ? "is-summary" : "",
        node.placeId ? "is-clickable" : "",
        node.state ? "is-focusable-state" : ""
    ].filter(Boolean).join(" ");

    return `
        <g
            class="${className}"
            ${node.placeId ? `data-place-id="${node.placeId}" tabindex="0" role="button" focusable="true"` : ""}
            ${node.state ? `data-state-focus="${escapeAttr(node.state)}" tabindex="0" role="button" focusable="true"` : ""}
            ${node.tooltip ? `data-tooltip="${escapeAttr(node.tooltip)}"` : ""}
            ${renderLinkKeysAttr(node.linkEntries)}
            ${renderFocusKeysAttr(node.focusEntries)}
            style="${getOrganicMotionStyle(node)}"
        >
            <circle class="network-node ${node.selected ? "is-selected" : ""} ${node.kind === "state-summary" ? "is-summary" : ""} ${node.state && state.focusedState === node.state ? "is-focused" : ""}" cx="${node.x}" cy="${node.y}" r="${node.size}" fill="${node.color}"></circle>
            <text class="network-label" x="${labelLayout.labelX}" y="${labelLayout.labelY}" text-anchor="${labelLayout.anchor}" data-scale-label="true" data-base-font-size="14" data-base-stroke-width="6">${node.label}</text>
            ${node.detail ? `<text class="network-detail" x="${labelLayout.labelX}" y="${labelLayout.detailY}" text-anchor="${labelLayout.anchor}" data-scale-label="true" data-base-font-size="12" data-base-stroke-width="5">${node.detail}</text>` : ""}
        </g>
    `;
}

function renderInsetNetworkNode(node) {
    const labelLayout = getNetworkLabelLayout(node, "inset");

    return `
        <g
            class="local-inset-node ${node.kind === "selected" ? "is-selected" : ""} ${node.kind === "state-summary" ? "is-summary" : ""} ${node.placeId ? "is-clickable" : ""}"
            ${node.placeId ? `data-place-id="${node.placeId}"` : ""}
            ${node.state ? `data-state-focus="${escapeAttr(node.state)}"` : ""}
            ${(node.placeId || node.state) ? `tabindex="0" role="button" focusable="true"` : ""}
            ${renderLinkKeysAttr(node.linkEntries)}
            ${renderFocusKeysAttr(node.focusEntries)}
            data-tooltip="${escapeAttr(node.tooltip)}"
            style="${getOrganicMotionStyle(node)}"
        >
            <circle class="network-node network-node--inset ${node.kind === "selected" ? "is-selected" : ""} ${node.kind === "state-summary" ? "is-summary" : ""} ${node.state && state.focusedState === node.state ? "is-focused" : ""}" cx="${node.x}" cy="${node.y}" r="${node.size}" fill="${node.color}"></circle>
            <text class="network-label network-label--inset" x="${labelLayout.labelX}" y="${labelLayout.labelY}" text-anchor="${labelLayout.anchor}" data-scale-label="true" data-base-font-size="13" data-base-stroke-width="6">${node.label}</text>
            ${node.detail ? `<text class="chart-note local-inset-note" x="${labelLayout.labelX}" y="${labelLayout.detailY}" text-anchor="${labelLayout.anchor}" data-scale-label="true" data-base-font-size="11" data-base-stroke-width="4.5">${node.detail}</text>` : ""}
        </g>
    `;
}

function renderLocalInset(origin, place, contextLabel) {
    const network = buildInsetLocalNetwork(origin, place);
    const inset = getInsetWindowState(contextLabel);
    const collapsed = Boolean(inset?.collapsed);
    const nodeLookup = new Map(network.nodes.map((node) => [node.id, node]));
    const panZoomType = `local-inset-${contextLabel}`;
    const clipId = `local-inset-clip-${contextLabel}`;
    const hint = network.visibleCount
        ? `Drag the title bar to move the card. Scroll to zoom the network, drag inside the inset to pan, and click a sibling name to switch the main-view place.`
        : `No visible records remain under the current filters. Scroll still zooms the network canvas; clear filters to restore linked state and region nodes.`;

    return `
        <aside class="local-inset-card local-inset-card--${contextLabel} ${collapsed ? "is-collapsed" : ""}" data-local-inset-view="${contextLabel}">
            <div class="local-inset-card__toolbar" data-local-inset-drag="${contextLabel}">
                <div class="local-inset-card__toolbar-copy">
                    <p class="annotation-card__eyebrow">Local Inset</p>
                    <h3>${place.name} relationship view</h3>
                    <span class="local-inset-card__collapsed-label">Local</span>
                </div>

                <div class="local-inset-card__actions">
                    <button
                        class="local-inset-card__action local-inset-card__action--toggle"
                        type="button"
                        data-local-inset-toggle="${contextLabel}"
                        aria-label="${collapsed ? "Expand" : "Collapse"} local inset"
                    >${collapsed ? "+" : "−"}</button>
                    <span class="local-inset-card__readout" data-local-inset-readout="${contextLabel}">100%</span>
                    <button class="local-inset-card__action" type="button" data-local-inset-scale="down" data-local-inset-view="${contextLabel}" aria-label="Shrink local inset">−</button>
                    <button class="local-inset-card__action" type="button" data-local-inset-scale="up" data-local-inset-view="${contextLabel}" aria-label="Enlarge local inset">+</button>
                    <button class="local-inset-card__action local-inset-card__action--wide" type="button" data-local-inset-scale="reset" data-local-inset-view="${contextLabel}">Reset</button>
                </div>
            </div>

            <div class="local-inset-card__content">
                <div class="local-inset-card__header">
                    <p class="local-inset-card__hint">${hint}</p>
                </div>

                <svg class="local-inset-svg interactive-map" data-map-svg="${panZoomType}" viewBox="0 0 480 290" role="img" aria-label="Linked local inset">
                    <defs>
                        <clipPath id="${clipId}">
                            <rect x="6" y="6" width="468" height="278" rx="22"></rect>
                        </clipPath>
                    </defs>
                    <rect class="map-surface" x="6" y="6" width="468" height="278" rx="22"></rect>
                    <g clip-path="url(#${clipId})">
                        <g class="map-zoom-layer" data-map-zoom-layer="${panZoomType}" transform="${getMapTransformString(panZoomType)}">
                            ${network.edges.map((edge) => renderNetworkEdge(edge, nodeLookup, "inset")).join("")}
                            ${network.nodes.map((node) => renderInsetNetworkNode(node)).join("")}
                        </g>
                    </g>
                    ${
                        !network.visibleCount
                            ? `<text class="chart-note" x="240" y="270" text-anchor="middle">No visible state or region links under the current filters.</text>`
                            : ""
                    }
                </svg>
            </div>
        </aside>
    `;
}

function renderMiniMap(origin, place) {
    const visibleContext = buildVisibleContext(place);
    const { visiblePoints, stateCounts } = visibleContext;
    const hub = {
        x: origin.entryHub.x,
        y: origin.entryHub.y
    };
    const activeStates = new Set(visiblePoints.map((point) => point.state));

    return `
        <svg class="viz-svg" viewBox="0 0 1000 560" role="img" aria-label="Inset map">
            <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
            ${buildGrid(1000, 560, 84)}
            ${renderUsaPolygons(activeStates, stateCounts, { showLabels: false, detailLevel: "medium" })}
            ${visiblePoints
                .map((point) => {
                    const target = { x: point.x, y: point.y };
                    return `<path class="route" d="${curvedPath(hub, target, 36)}" stroke="${ERAS.find((era) => era.key === point.era).color}" data-tooltip="${escapeAttr(`${point.label} diffusion route`)}" ${renderLinkKeysAttr([["place", place.id], ["state", point.state], ["region", point.region], ["origin", origin.id]])} ${renderFocusKeysAttr([["focus-route", point.id]])}></path>`;
                })
                .join("")}
            <circle class="marker marker--hub" cx="${hub.x}" cy="${hub.y}" r="8" data-tooltip="${escapeAttr(origin.entryHub.label)}" ${renderLinkKeysAttr([["origin", origin.id]])} ${renderFocusKeysAttr([["focus-origin", origin.id]])}></circle>
            ${visiblePoints
                .map((point) => `
                    <circle class="dot-point" cx="${point.x}" cy="${point.y}" r="4" fill="${REGION_COLORS[point.region] || origin.accent}" data-tooltip="${escapeAttr(point.tooltip)}" ${renderLinkKeysAttr([["place", place.id], ["state", point.state], ["region", point.region], ["origin", origin.id]])} ${renderFocusKeysAttr([["focus-point", point.id]])}></circle>
                `)
                .join("")}
            ${
                !visiblePoints.length
                    ? `<text class="chart-note" x="500" y="290" text-anchor="middle">No visible records remain under the current filters.</text>`
                    : ""
            }
        </svg>
    `;
}

function renderLocalView(origin, place) {
    const network = buildLocalNetwork(origin, place);
    const nodeLookup = new Map(network.nodes.map((node) => [node.id, node]));
    const panZoomType = "local-main";
    const clipId = "local-main-clip";

    return `
        <div class="viz-layout viz-layout--local">
            <div class="local-shell">
                <div class="local-column">
                    <article class="mini-card">
                        <p class="annotation-card__eyebrow">Inset Diffusion Map</p>
                        <h3>${place.name} routes</h3>
                        ${renderMiniMap(origin, place)}
                    </article>
                    <article class="annotation-card">
                        <p class="annotation-card__eyebrow">Source Note</p>
                        <h3>${place.label}</h3>
                        <p>${place.note}</p>
                    </article>
                </div>

                <div>
                    <div class="viz-frame">
                        ${renderMapControls(panZoomType)}
                        <svg class="viz-svg interactive-map" data-map-svg="${panZoomType}" viewBox="0 0 1000 560" role="img" aria-label="Local network view">
                            <defs>
                                <clipPath id="${clipId}">
                                    <rect x="20" y="20" width="960" height="520" rx="34"></rect>
                                </clipPath>
                            </defs>
                            <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
                            ${buildGrid(1000, 560, 84)}
                            <g clip-path="url(#${clipId})">
                                <g class="map-zoom-layer" data-map-zoom-layer="${panZoomType}" transform="${getMapTransformString(panZoomType)}">
                                    ${network.edges.map((edge) => renderNetworkEdge(edge, nodeLookup, "main")).join("")}
                                    ${network.nodes.map((node) => renderLocalNetworkNode(node)).join("")}
                                </g>
                            </g>
                            <text class="chart-note" x="48" y="540">Top: origin anchor. Left: sibling names. Right: top visible states; lower-frequency ones collapse into a summary node. Bottom: filtered regional communities.</text>
                            ${
                                !network.visibleCount
                                    ? `<text class="chart-note" x="500" y="500" text-anchor="middle">Current filters remove all state and region links for this name.</text>`
                                    : ""
                            }
                        </svg>
                    </div>

                    <div class="community-legend">
                        ${FEATURE_OPTIONS
                            .map((feature) => `
                                <span class="community-chip" style="--chip-color:${REGION_COLORS[feature.key]}">
                                    <span class="community-chip__dot"></span>
                                    <span>${feature.label}</span>
                                </span>
                            `)
                            .join("")}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderVizStage(origin, place) {
    const viewConfig = VIEW_COPY[state.selectedView];
    elements.viewKicker.textContent = viewConfig.kicker;
    elements.viewTitle.textContent = viewConfig.title(origin, place);
    elements.viewDescription.textContent = state.focusedState && state.selectedView !== "global"
        ? `${viewConfig.description(origin, place)} Current state focus: ${state.focusedState}.`
        : viewConfig.description(origin, place);

    if (state.selectedView === "usa") {
        elements.vizStage.innerHTML = renderUsaView(origin, place);
        return;
    }

    if (state.selectedView === "local") {
        elements.vizStage.innerHTML = renderLocalView(origin, place);
        return;
    }

    elements.vizStage.innerHTML = renderGlobalView(origin, place);
}

function renderDetails(origin, place) {
    const visibleContext = buildVisibleContext(place);
    const topState = hasActiveDataFilters()
        ? (visibleContext.topStates[0] || null)
        : getTopState(place);
    const anchor = place.anchorRecord;

    elements.detailCopy.textContent =
        `${place.note} ${DATA.meta.sourceNote} ${DATA.meta.timeProxyNote}`;

    const metrics = [
        ["Origin group", origin.name],
        ["Selected name", place.name],
        ["GNIS records", place.totalRecords],
        ["States covered", countUniqueStates(place)],
        ["Focused state", state.focusedState || "All visible states"],
        ["Top state", topState ? `${topState.state} (${topState.count})` : "N/A"],
        ["Anchor record", `${anchor.state}${anchor.county ? `, ${anchor.county} County` : ""}`],
        ["Visible after filters", visibleContext.visiblePoints.length]
    ];

    elements.metricList.innerHTML = metrics
        .map(
            ([label, value]) => `
                <div class="metric-row">
                    <dt>${label}</dt>
                    <dd>${value}</dd>
                </div>
            `
        )
        .join("");
}

function renderEmptyState() {
    elements.viewKicker.textContent = "Search state";
    elements.viewTitle.textContent = "No matching place names";
    elements.viewDescription.textContent = "No names in the current curated subset match this query.";
    elements.placeList.innerHTML = `<div class="empty-state">Try a different search term.</div>`;
    elements.statTitle.textContent = "No matching place names";
    elements.statSummary.textContent = "The current search does not match any names in the curated GNIS subset.";
    elements.statChart.innerHTML = `<div class="empty-state">No chart to display.</div>`;
    elements.eraLegend.innerHTML = `<div class="empty-state">No era filters available.</div>`;
    elements.vizStage.innerHTML = `<div class="empty-state">No view to render.</div>`;
    elements.detailCopy.textContent = "Clear or change the search to restore the prototype views.";
    elements.metricList.innerHTML = "";
}

function syncViewButtons() {
    document.querySelectorAll("[data-view]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.view === state.selectedView);
    });
}

function syncFloatingPanels() {
    const config = {
        left: {
            collapsed: state.floatingPanels.leftCollapsed,
            label: "browse",
            expandedIcon: "‹",
            collapsedIcon: "›"
        },
        right: {
            collapsed: state.floatingPanels.rightCollapsed,
            label: "layers",
            expandedIcon: "›",
            collapsedIcon: "‹"
        }
    };

    Object.entries(config).forEach(([side, panelConfig]) => {
        const panel = document.querySelector(`[data-floating-panel="${side}"]`);
        const button = document.querySelector(`[data-panel-toggle="${side}"]`);
        const icon = document.querySelector(`[data-panel-toggle-icon="${side}"]`);

        if (!panel || !button || !icon) {
            return;
        }

        panel.classList.toggle("is-collapsed", panelConfig.collapsed);
        button.setAttribute("aria-expanded", String(!panelConfig.collapsed));
        button.setAttribute(
            "aria-label",
            `${panelConfig.collapsed ? "Expand" : "Collapse"} ${panelConfig.label} panel`
        );
        icon.textContent = panelConfig.collapsed ? panelConfig.collapsedIcon : panelConfig.expandedIcon;
    });
}

function syncLinkedHighlights(keys = [], mode = "link") {
    const normalized = `${mode}|${Array.from(new Set(keys)).sort().join(" ")}`;

    if (normalized === state.linkedKeys) {
        return;
    }

    state.linkedKeys = normalized;
    const [, keyString = ""] = normalized.split("|");
    const activeKeys = new Set(parseLinkKeys(keyString));

    document.querySelectorAll("[data-link-keys], [data-focus-keys]").forEach((element) => {
        const sourceValue =
            mode === "focus"
                ? element.dataset.focusKeys
                : element.dataset.linkKeys;
        const elementKeys = parseLinkKeys(sourceValue);
        const isLinked =
            activeKeys.size > 0 && elementKeys.some((key) => activeKeys.has(key));

        element.classList.toggle("is-linked", isLinked);
    });
}

function getInsetWindowState(viewType) {
    return state.localInsets[viewType];
}

function clampInsetWindow(viewType, frame, card) {
    const inset = getInsetWindowState(viewType);

    if (!inset || !frame || !card) {
        return;
    }

    inset.scale = clamp(inset.scale, INSET_SCALE_LIMITS.min, INSET_SCALE_LIMITS.max);

    const margin = 14;
    const scaledWidth = card.offsetWidth * inset.scale;
    const scaledHeight = card.offsetHeight * inset.scale;
    const maxX = Math.max(margin, frame.clientWidth - scaledWidth - margin);
    const maxY = Math.max(margin, frame.clientHeight - scaledHeight - margin);

    inset.x = clamp(inset.x ?? margin, margin, maxX);
    inset.y = clamp(inset.y ?? margin, margin, maxY);
}

function applyInsetWindow(viewType) {
    const card = document.querySelector(`[data-local-inset-view="${viewType}"]`);
    const frame = card?.closest(".map-frame");

    if (!card || !frame) {
        return;
    }

    if (window.matchMedia("(max-width: 1180px)").matches || getComputedStyle(card).position !== "absolute") {
        card.style.transform = "";
        return;
    }

    const inset = getInsetWindowState(viewType);

    if (inset.x === null || inset.y === null) {
        const margin = 24;
        inset.x = Math.max(margin, (frame.clientWidth - card.offsetWidth) / 2);
        inset.y = Math.max(margin, frame.clientHeight - card.offsetHeight - margin);
    }

    clampInsetWindow(viewType, frame, card);
    card.style.transform = `translate(${inset.x}px, ${inset.y}px) scale(${inset.scale})`;
}

function updateInsetToggle(viewType) {
    const card = document.querySelector(`[data-local-inset-view="${viewType}"]`);
    const inset = getInsetWindowState(viewType);
    const toggleButton = card?.querySelector(`[data-local-inset-toggle="${viewType}"]`);

    if (!card || !inset || !toggleButton) {
        return;
    }

    card.classList.toggle("is-collapsed", inset.collapsed);
    toggleButton.textContent = inset.collapsed ? "+" : "−";
    toggleButton.setAttribute("aria-label", `${inset.collapsed ? "Expand" : "Collapse"} local inset`);
}

function updateInsetReadout(viewType) {
    const readout = document.querySelector(`[data-local-inset-readout="${viewType}"]`);
    const inset = getInsetWindowState(viewType);

    if (readout && inset) {
        readout.textContent = `${Math.round(inset.scale * 100)}%`;
    }
}

function syncInsetWindows() {
    ["global", "usa"].forEach((viewType) => {
        updateInsetToggle(viewType);
        applyInsetWindow(viewType);
        updateInsetReadout(viewType);
    });
}

function setupInsetInteractions() {
    document.querySelectorAll("[data-local-inset-view]").forEach((card) => {
        if (card.dataset.insetReady === "true") {
            return;
        }

        card.dataset.insetReady = "true";
        const viewType = card.dataset.localInsetView;
        const dragHandle = card.querySelector("[data-local-inset-drag]");

        if (dragHandle) {
            dragHandle.addEventListener("pointerdown", (event) => {
                if (event.button !== 0 || window.matchMedia("(max-width: 1180px)").matches) {
                    return;
                }

                if (event.target.closest("[data-local-inset-scale]") || event.target.closest("[data-local-inset-toggle]")) {
                    return;
                }

                const inset = getInsetWindowState(viewType);
                state.insetInteraction = {
                    type: "drag",
                    viewType,
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startX: inset.x ?? 0,
                    startY: inset.y ?? 0
                };
                card.classList.add("is-dragging");
                hideTooltip();
                syncLinkedHighlights();
                event.preventDefault();
            });
        }
    });

    syncInsetWindows();
}

function handleGlobalPointerMove(event) {
    if (!state.insetInteraction) {
        return;
    }

    const { viewType, pointerId, startClientX, startClientY, startX, startY } = state.insetInteraction;
    if (pointerId !== event.pointerId) {
        return;
    }

    const inset = getInsetWindowState(viewType);
    const card = document.querySelector(`[data-local-inset-view="${viewType}"]`);
    const frame = card?.closest(".map-frame");

    if (!inset || !card || !frame) {
        return;
    }

    inset.x = startX + (event.clientX - startClientX);
    inset.y = startY + (event.clientY - startClientY);
    clampInsetWindow(viewType, frame, card);
    applyInsetWindow(viewType);
}

function endInsetInteraction() {
    if (!state.insetInteraction) {
        return;
    }

    const { viewType } = state.insetInteraction;
    const card = document.querySelector(`[data-local-inset-view="${viewType}"]`);
    card?.classList.remove("is-dragging");
    state.insetInteraction = null;
    syncPinnedInteractionDisplay();
}

function renderApp() {
    const valid = normalizeSelection();
    state.mapDrag = null;
    state.insetInteraction = null;
    state.linkedKeys = "";
    state.pinnedInteraction = null;
    hideTooltip();
    renderOriginList(getFilteredOrigins());
    renderFeatureFilters();
    syncViewButtons();
    syncFloatingPanels();
    elements.searchInput.value = state.search;

    if (!valid) {
        renderEmptyState();
        return;
    }

    const origin = getSelectedOrigin();
    const place = getSelectedPlace();

    if (state.focusedState && !place.records.some((record) => record.state === state.focusedState)) {
        state.focusedState = null;
    }

    updateTheme(origin);
    renderPlaceList();
    renderEraLegend(place);
    renderStatChart(origin, place, buildVisibleContext(place));
    renderVizStage(origin, place);
    setupMapInteractions();
    setupInsetInteractions();
    renderDetails(origin, place);
}

function resetCurrentFocus() {
    const origin = getSelectedOrigin();
    state.search = "";
    state.activeEras = new Set(ERAS.map((era) => era.key));
    state.activeFeatures = new Set(FEATURE_OPTIONS.map((feature) => feature.key));
    state.focusedState = null;
    state.selectedPlaceId = origin.places[0].id;
    state.selectedStat = VIEW_DEFAULT_STATS[state.selectedView];
    state.mapViews.global = { scale: 1, tx: 0, ty: 0 };
    state.mapViews.usa = { scale: 1, tx: 0, ty: 0 };
    state.mapViews["local-main"] = { scale: 1, tx: 0, ty: 0 };
    state.mapViews["local-inset-global"] = { scale: 1, tx: 0, ty: 0 };
    state.mapViews["local-inset-usa"] = { scale: 1, tx: 0, ty: 0 };
    renderApp();
}

function handleClick(event) {
    const insetToggleButton = event.target.closest("[data-local-inset-toggle]");
    if (insetToggleButton) {
        const viewType = insetToggleButton.dataset.localInsetToggle;
        const inset = getInsetWindowState(viewType);

        if (!inset) {
            return;
        }

        inset.collapsed = !inset.collapsed;
        syncInsetWindows();
        return;
    }

    const insetScaleButton = event.target.closest("[data-local-inset-scale]");
    if (insetScaleButton) {
        const viewType = insetScaleButton.dataset.localInsetView;
        const action = insetScaleButton.dataset.localInsetScale;
        const inset = getInsetWindowState(viewType);

        if (!inset) {
            return;
        }

        if (action === "reset") {
            inset.scale = 1;
            inset.x = null;
            inset.y = null;
        } else {
            const delta = action === "up" ? INSET_SCALE_LIMITS.step : -INSET_SCALE_LIMITS.step;
            inset.scale = clamp(inset.scale + delta, INSET_SCALE_LIMITS.min, INSET_SCALE_LIMITS.max);
        }

        syncInsetWindows();
        return;
    }

    const panelToggle = event.target.closest("[data-panel-toggle]");
    if (panelToggle) {
        const side = panelToggle.dataset.panelToggle;
        const stateKey = side === "left" ? "leftCollapsed" : "rightCollapsed";
        state.floatingPanels[stateKey] = !state.floatingPanels[stateKey];
        syncFloatingPanels();
        return;
    }

    const mapZoomButton = event.target.closest("[data-map-zoom]");
    if (mapZoomButton) {
        const mapType = mapZoomButton.dataset.mapType;
        const action = mapZoomButton.dataset.mapZoom;
        const viewbox = getPanZoomViewbox(mapType);

        if (action === "reset") {
            resetMapView(mapType);
            return;
        }

        const scale = state.mapViews[mapType]?.scale || 1;
        const nextScale = action === "in" ? scale * 1.25 : scale / 1.25;
        zoomMapAt(mapType, nextScale, viewbox.width / 2, viewbox.height / 2);
        return;
    }

    const placeButton = event.target.closest("[data-place-id]");
    if (placeButton) {
        if (placeButton.dataset.origin) {
            state.selectedOrigin = placeButton.dataset.origin;
        }
        state.selectedPlaceId = placeButton.dataset.placeId;
        renderApp();
        return;
    }

    const originButton = event.target.closest("[data-origin]");
    if (originButton) {
        const nextOrigin = originButton.dataset.origin;
        if (nextOrigin === state.selectedOrigin) {
            if (elements.vizStage.contains(originButton) && originButton.dataset.tooltip) {
                togglePinnedInteraction(originButton, event);
            }
            return;
        }

        state.selectedOrigin = nextOrigin;
        state.selectedPlaceId = DATA.origins[state.selectedOrigin].places[0].id;
        renderApp();
        return;
    }

    const stateFocusTarget = event.target.closest("[data-state-focus]");
    if (stateFocusTarget && elements.vizStage.contains(stateFocusTarget)) {
        const nextState = stateFocusTarget.dataset.stateFocus;
        state.focusedState = state.focusedState === nextState ? null : nextState;
        renderApp();
        return;
    }

    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
        state.selectedView = viewButton.dataset.view;
        state.selectedStat = VIEW_DEFAULT_STATS[state.selectedView];
        renderApp();
        return;
    }

    const eraButton = event.target.closest("[data-era]");
    if (eraButton) {
        const { era } = eraButton.dataset;
        if (state.activeEras.has(era)) {
            state.activeEras.delete(era);
        } else {
            state.activeEras.add(era);
        }

        if (!state.activeEras.size) {
            state.activeEras.add(era);
        }

        renderApp();
        return;
    }

    const interactiveTarget = elements.vizStage.contains(event.target)
        ? event.target.closest("[data-tooltip], [data-link-keys]")
        : null;
    if (interactiveTarget) {
        togglePinnedInteraction(interactiveTarget, event);
        return;
    }

    if (state.pinnedInteraction && event.target.closest(".viz-svg")) {
        clearPinnedInteraction();
        return;
    }

    const actionButton = event.target.closest("[data-action='reset']");
    if (actionButton) {
        resetCurrentFocus();
    }
}

function handleKeydown(event) {
    if (event.key === "Escape") {
        if (state.pinnedInteraction) {
            clearPinnedInteraction();
            return;
        }

        if (state.focusedState) {
            state.focusedState = null;
            renderApp();
        }
        return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const target = event.target.closest("[data-place-id], [data-state-focus]");
    if (!target || !elements.vizStage.contains(target)) {
        return;
    }

    event.preventDefault();
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function handleChange(event) {
    const featureInput = event.target.closest("[data-feature]");
    if (featureInput) {
        const { feature } = featureInput.dataset;
        if (featureInput.checked) {
            state.activeFeatures.add(feature);
        } else {
            state.activeFeatures.delete(feature);
        }

        if (!state.activeFeatures.size) {
            state.activeFeatures.add(feature);
            featureInput.checked = true;
        }

        renderApp();
        return;
    }

    if (event.target === elements.statSelect) {
        state.selectedStat = event.target.value;
        renderApp();
    }
}

function handleSearch(event) {
    state.search = event.target.value;
    renderApp();
}

function init() {
    elements.originList = document.getElementById("origin-list");
    elements.placeList = document.getElementById("place-list");
    elements.featureFilters = document.getElementById("feature-filters");
    elements.eraLegend = document.getElementById("era-legend");
    elements.statTitle = document.getElementById("stat-title");
    elements.statSummary = document.getElementById("stat-summary");
    elements.statSelect = document.getElementById("stat-select");
    elements.statChart = document.getElementById("stat-chart");
    elements.viewKicker = document.getElementById("view-kicker");
    elements.viewTitle = document.getElementById("view-title");
    elements.viewDescription = document.getElementById("view-description");
    elements.vizStage = document.getElementById("viz-stage");
    elements.detailCopy = document.getElementById("detail-copy");
    elements.metricList = document.getElementById("metric-list");
    elements.searchInput = document.getElementById("search-input");

    ensureTooltip();
    syncFloatingPanels();
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("pointermove", handleGlobalPointerMove);
    document.addEventListener("pointerup", endInsetInteraction);
    document.addEventListener("pointercancel", endInsetInteraction);
    elements.searchInput.addEventListener("input", handleSearch);
    elements.vizStage.addEventListener("pointermove", handleVizPointerMove);
    elements.vizStage.addEventListener("pointerleave", handleVizPointerLeave);
    window.addEventListener("resize", syncInsetWindows);

    renderApp();
}

document.addEventListener("DOMContentLoaded", init);
