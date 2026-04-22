const DATA = window.placeDiffusionData;
const SHAPES = window.realMapShapes;

const ORIGIN_COUNTRY_LOOKUP = {
    England: "United Kingdom",
    Germany: "Germany",
    Greece: "Greece",
    Spain: "Spain",
    Mexico: "Mexico"
};

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

const VIEW_DEFAULT_STATS = {
    global: "timeline",
    usa: "distance",
    local: "rank"
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
    activeFeatures: new Set(FEATURE_OPTIONS.map((feature) => feature.key))
};

const elements = {};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hexToRgba(hex, alpha) {
    const sanitized = hex.replace("#", "");
    const value = parseInt(sanitized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getOriginEntries() {
    return Object.entries(DATA.origins);
}

function getFilteredOrigins() {
    const query = state.search.trim().toLowerCase();

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

    const query = state.search.trim().toLowerCase();
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
        state.activeEras.has(point.era) && state.activeFeatures.has(point.featureKey)
    );
}

function getTopState(place) {
    return place.topStates?.[0] || null;
}

function countUniqueStates(place) {
    return new Set(place.records.map((record) => record.state)).size;
}

function getOriginCountryName(origin) {
    return ORIGIN_COUNTRY_LOOKUP[origin.name] || origin.name;
}

function renderWorldPolygons(origin) {
    const originCountry = getOriginCountryName(origin);
    return SHAPES.global.countries
        .map((country) => `
            <path class="world-country ${country.name === originCountry ? "is-origin" : ""}" d="${country.path}"></path>
        `)
        .join("");
}

function renderUsaPolygons(activeStates = new Set()) {
    const states = SHAPES.usa.states
        .map((shape) => `
            <path class="us-state-real ${activeStates.has(shape.name) ? "is-active" : ""}" d="${shape.path}"></path>
        `)
        .join("");

    return `
        <path class="us-outline-real" d="${SHAPES.usa.outlinePath}"></path>
        ${states}
    `;
}

function normalizeSelection() {
    const filteredOrigins = getFilteredOrigins();

    if (!filteredOrigins.length) {
        return false;
    }

    if (!filteredOrigins.some(([originName]) => originName === state.selectedOrigin)) {
        state.selectedOrigin = filteredOrigins[0][0];
    }

    const visiblePlaces = getVisiblePlacesForOrigin(state.selectedOrigin);
    const fallbackPlaces = getSelectedOrigin().places;
    const candidate = visiblePlaces[0] || fallbackPlaces[0];

    if (!candidate) {
        return false;
    }

    if (!visiblePlaces.some((place) => place.id === state.selectedPlaceId)) {
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
        elements.originList.innerHTML = `<div class="empty-state">No matching origins found.</div>`;
        return;
    }

    elements.originList.innerHTML = filteredOrigins
        .map(([originName, origin]) => `
            <button class="origin-button ${originName === state.selectedOrigin ? "is-active" : ""}" type="button" data-origin="${originName}">
                <span class="origin-button__swatch" style="background:${origin.accent}"></span>
                <span>
                    <strong>${originName}</strong>
                    <small>${origin.places.length} tracked names</small>
                </span>
                <span class="origin-button__arrow" aria-hidden="true">&rsaquo;</span>
            </button>
        `)
        .join("");
}

function renderPlaceList() {
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
    const counts = place.usaPoints.reduce((memo, point) => {
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
            <text class="axis-label" x="${width - padding.right}" y="${height - 14}" text-anchor="end">Statehood year proxy</text>
            <text class="chart-note" x="${highlighted.x + 10}" y="${highlighted.y - 12}">proxy timeline ends at ${highlighted.year}</text>
        </svg>
    `;
}

function renderDistanceChart(place) {
    const width = 760;
    const height = 230;
    const padding = { top: 24, right: 24, bottom: 44, left: 52 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const categories = ["short", "medium", "long"];
    const maxValue = Math.max(
        ...categories.flatMap((category) =>
            ERAS.map((era) => place.distanceBars[category][era.key])
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
                        const value = place.distanceBars[category][era.key];
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
            <text class="axis-label" x="${width - padding.right}" y="${height - 14}" text-anchor="end">Distance from entry corridor</text>
        </svg>
    `;
}

function renderRankChart(place) {
    const width = 760;
    const height = 230;
    const padding = { top: 24, right: 26, bottom: 46, left: 52 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...place.rankPoints.map((point) => point.value), 1) + 1;

    return `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rank scatter chart">
            <rect class="plot-surface" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24"></rect>
            ${buildGrid(width, height, 90)}
            <line class="grid-line" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}"></line>
            <line class="grid-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}"></line>
            ${place.rankPoints
                .map((point, index) => {
                    const x = padding.left + (index * innerWidth) / Math.max(place.rankPoints.length - 1, 1);
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
            <text class="axis-label" x="${width - padding.right}" y="${height - 14}" text-anchor="end">State rank</text>
        </svg>
    `;
}

function renderStatChart(origin, place) {
    elements.statTitle.textContent = STAT_OPTIONS[state.selectedStat].title(place);
    elements.statSummary.textContent = STAT_OPTIONS[state.selectedStat].summary(origin, place);
    elements.statSelect.value = state.selectedStat;

    if (state.selectedStat === "distance") {
        elements.statChart.innerHTML = renderDistanceChart(place);
        return;
    }

    if (state.selectedStat === "rank") {
        elements.statChart.innerHTML = renderRankChart(place);
        return;
    }

    elements.statChart.innerHTML = renderTimelineChart(place);
}

function curvedPath(from, to, lift = 120) {
    const controlX = (from.x + to.x) / 2;
    const controlY = Math.min(from.y, to.y) - lift;
    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function renderGlobalView(origin, place) {
    const route = curvedPath(origin.anchor, place.globalTarget, 132);
    const topState = getTopState(place);

    return `
        <div class="viz-layout viz-layout--global">
            <div class="viz-frame">
                <svg class="viz-svg" viewBox="0 0 1000 560" role="img" aria-label="Global diffusion view">
                    <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
                    ${buildGrid(1000, 560, 84)}
                    ${renderWorldPolygons(origin)}
                    <path class="route route--wide" d="${route}" stroke="${origin.accent}"></path>
                    <circle class="marker marker--origin" cx="${origin.anchor.x}" cy="${origin.anchor.y}" r="13"></circle>
                    <circle class="marker" cx="${place.globalTarget.x}" cy="${place.globalTarget.y}" r="12"></circle>
                    <text class="map-label" x="${origin.anchor.x + 18}" y="${origin.anchor.y - 8}">${origin.anchor.label}</text>
                    <text class="map-label" x="${place.globalTarget.x + 18}" y="${place.globalTarget.y + 4}">${place.label}</text>
                    <text class="chart-label chart-label--muted" x="62" y="86">North America</text>
                    <text class="chart-label chart-label--muted" x="740" y="82">Europe / Mediterranean</text>
                    <text class="chart-note" x="58" y="518">Origin coordinates are country centroids; the U.S. point uses the selected anchor record from GNIS.</text>
                </svg>
            </div>

            <div class="annotation-stack">
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">Data Snapshot</p>
                    <h3>${place.totalRecords} GNIS records</h3>
                    <p>${place.summary}</p>
                </article>
                <article class="annotation-card">
                    <p class="annotation-card__eyebrow">Top State</p>
                    <h3>${topState ? `${topState.state} (${topState.count})` : "Not available"}</h3>
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
    const hub = {
        x: origin.entryHub.x,
        y: origin.entryHub.y
    };
    const visiblePoints = getVisibleUsPoints(place);
    const activeStates = new Set(visiblePoints.map((point) => point.state));

    const routes = visiblePoints
        .map((point) => {
            const target = { x: point.x, y: point.y };
            return `<path class="route" d="${curvedPath(hub, target, 74)}" stroke="${ERAS.find((era) => era.key === point.era).color}"></path>`;
        })
        .join("");

    const points = visiblePoints
        .map((point) => `
            <circle class="dot-point" cx="${point.x}" cy="${point.y}" r="${point.radius}" fill="${REGION_COLORS[point.region] || origin.accent}">
                <title>${point.tooltip}</title>
            </circle>
        `)
        .join("");

    return `
        <div class="viz-layout viz-layout--usa">
            <div class="viz-frame">
                <svg class="viz-svg" viewBox="0 0 1000 560" role="img" aria-label="National diffusion view">
                    <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
                    ${buildGrid(1000, 560, 84)}
                    ${renderUsaPolygons(activeStates)}
                    <text class="chart-label chart-label--muted" x="118" y="116">Pacific</text>
                    <text class="chart-label chart-label--muted" x="844" y="182" text-anchor="end">Atlantic</text>
                    <circle class="marker marker--hub" cx="${hub.x}" cy="${hub.y}" r="12"></circle>
                    <text class="map-label" x="${hub.x - 10}" y="${hub.y - 18}" text-anchor="end">${origin.entryHub.label}</text>
                    ${routes}
                    ${points}
                    ${
                        !visiblePoints.length
                            ? `<text class="map-label" x="500" y="280" text-anchor="middle">Current filters hide all visible records.</text>`
                            : ""
                    }
                </svg>
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
                    <p>${state.activeFeatures.size} regional filters active · ${state.activeEras.size} proxy eras active</p>
                </article>
            </div>
        </div>
    `;
}

function buildLocalNetwork(origin, place) {
    const selectedNode = {
        id: "selected",
        x: 520,
        y: 250,
        size: 26 + place.totalRecords / 6,
        color: origin.accent,
        label: place.name,
        selected: true
    };

    const siblingNodes = origin.places
        .filter((candidate) => candidate.id !== place.id)
        .map((candidate, index) => ({
            id: `sibling-${candidate.id}`,
            x: 250,
            y: 170 + index * 120,
            size: 16 + candidate.totalRecords / 8,
            color: origin.accent,
            label: `${candidate.name} (${candidate.totalRecords})`,
            group: "sibling"
        }));

    const stateNodes = place.topStates.map((entry, index) => ({
        id: `state-${entry.state.toLowerCase().replace(/\s+/g, "-")}`,
        x: 785,
        y: 120 + index * 62,
        size: 14 + entry.count * 5,
        color: REGION_COLORS[
            place.records.find((record) => record.state === entry.state)?.region || "south"
        ],
        label: `${entry.state} (${entry.count})`,
        group: "state",
        state: entry.state
    }));

    const regionEntries = Object.entries(place.regionCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .map(([region, count], index) => ({
            id: `region-${region}`,
            x: 280 + index * 160,
            y: 430,
            size: 14 + count * 2,
            color: REGION_COLORS[region],
            label: `${DATA.meta.regionLabels[region]} (${count})`,
            group: "region",
            region
        }));

    const nodes = [selectedNode, ...siblingNodes, ...stateNodes, ...regionEntries];
    const edges = [];

    siblingNodes.forEach((node) => edges.push({ from: "selected", to: node.id, primary: true }));
    stateNodes.forEach((node) => edges.push({ from: "selected", to: node.id, primary: true }));
    stateNodes.forEach((node) => {
        const linkedRegion = place.records.find((record) => record.state === node.state)?.region;
        if (linkedRegion) {
            edges.push({ from: node.id, to: `region-${linkedRegion}`, primary: false });
        }
    });

    return { nodes, edges, selectedNode };
}

function renderMiniMap(origin, place) {
    const visiblePoints = getVisibleUsPoints(place);
    const hub = {
        x: origin.entryHub.x,
        y: origin.entryHub.y
    };
    const activeStates = new Set(visiblePoints.map((point) => point.state));

    return `
        <svg class="viz-svg" viewBox="0 0 1000 560" role="img" aria-label="Inset map">
            <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
            ${buildGrid(1000, 560, 84)}
            ${renderUsaPolygons(activeStates)}
            ${visiblePoints
                .map((point) => {
                    const target = { x: point.x, y: point.y };
                    return `<path class="route" d="${curvedPath(hub, target, 36)}" stroke="${ERAS.find((era) => era.key === point.era).color}"></path>`;
                })
                .join("")}
            <circle class="marker marker--hub" cx="${hub.x}" cy="${hub.y}" r="8"></circle>
            ${visiblePoints
                .map((point) => `
                    <circle class="dot-point" cx="${point.x}" cy="${point.y}" r="4" fill="${REGION_COLORS[point.region] || origin.accent}">
                        <title>${point.tooltip}</title>
                    </circle>
                `)
                .join("")}
        </svg>
    `;
}

function renderLocalView(origin, place) {
    const network = buildLocalNetwork(origin, place);

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
                        <svg class="viz-svg" viewBox="0 0 1000 560" role="img" aria-label="Local network view">
                            <rect class="map-surface" x="20" y="20" width="960" height="520" rx="34"></rect>
                            ${buildGrid(1000, 560, 84)}
                            ${network.edges
                                .map((edge) => {
                                    const from = network.nodes.find((node) => node.id === edge.from);
                                    const to = network.nodes.find((node) => node.id === edge.to);
                                    return `<line class="network-edge ${edge.primary ? "is-primary" : ""}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
                                })
                                .join("")}
                            ${network.nodes
                                .map((node) => `
                                    <circle class="network-node ${node.selected ? "is-selected" : ""}" cx="${node.x}" cy="${node.y}" r="${node.size}" fill="${node.color}"></circle>
                                    <text class="network-label" x="${node.x + node.size + 10}" y="${node.y + 4}">${node.label}</text>
                                `)
                                .join("")}
                            <text class="chart-note" x="48" y="520">Left: sibling names from the same origin group. Right: top states. Bottom: filtered regional communities.</text>
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
    elements.viewDescription.textContent = viewConfig.description(origin, place);

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
    const visiblePoints = getVisibleUsPoints(place);
    const topState = getTopState(place);
    const anchor = place.anchorRecord;

    elements.detailCopy.textContent =
        `${place.note} ${DATA.meta.sourceNote} ${DATA.meta.timeProxyNote}`;

    const metrics = [
        ["Origin group", origin.name],
        ["Selected name", place.name],
        ["GNIS records", place.totalRecords],
        ["States covered", countUniqueStates(place)],
        ["Top state", topState ? `${topState.state} (${topState.count})` : "N/A"],
        ["Anchor record", `${anchor.state}${anchor.county ? `, ${anchor.county} County` : ""}`],
        ["Visible after filters", visiblePoints.length]
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

function renderApp() {
    const valid = normalizeSelection();
    renderOriginList(getFilteredOrigins());
    renderFeatureFilters();
    syncViewButtons();
    elements.searchInput.value = state.search;

    if (!valid) {
        renderEmptyState();
        return;
    }

    const origin = getSelectedOrigin();
    const place = getSelectedPlace();

    updateTheme(origin);
    renderPlaceList();
    renderEraLegend(place);
    renderStatChart(origin, place);
    renderVizStage(origin, place);
    renderDetails(origin, place);
}

function resetCurrentFocus() {
    const origin = getSelectedOrigin();
    state.search = "";
    state.activeEras = new Set(ERAS.map((era) => era.key));
    state.activeFeatures = new Set(FEATURE_OPTIONS.map((feature) => feature.key));
    state.selectedPlaceId = origin.places[0].id;
    state.selectedStat = VIEW_DEFAULT_STATS[state.selectedView];
    renderApp();
}

function handleClick(event) {
    const originButton = event.target.closest("[data-origin]");
    if (originButton) {
        state.selectedOrigin = originButton.dataset.origin;
        state.selectedPlaceId = DATA.origins[state.selectedOrigin].places[0].id;
        renderApp();
        return;
    }

    const placeButton = event.target.closest("[data-place-id]");
    if (placeButton) {
        state.selectedPlaceId = placeButton.dataset.placeId;
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

    const actionButton = event.target.closest("[data-action='reset']");
    if (actionButton) {
        resetCurrentFocus();
    }
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

    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    elements.searchInput.addEventListener("input", handleSearch);

    renderApp();
}

document.addEventListener("DOMContentLoaded", init);
