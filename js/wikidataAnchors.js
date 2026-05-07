/**
 * wikidataAnchors.js
 * ------------------
 * Queries the Wikidata SPARQL endpoint to find the historically FIRST place
 * in the United States for each tracked place name, then patches the
 * window.placeDiffusionData anchor records so all coordinated views use the
 * historically earliest known US location rather than the earliest GNIS
 * database-entry date.
 *
 * How it works
 * ------------
 * 1. Collect every unique place name across all origins in placeData.js.
 * 2. For each name, run a Wikidata SPARQL query that finds US settlements
 *    with that exact English label, ordered by inception date (earliest first).
 * 3. If Wikidata returns a result with coordinates, find the closest matching
 *    record in place.records[] (by haversine distance) and promote it to
 *    place.anchorRecord.  If no close GNIS record exists, we build a synthetic
 *    anchor stub from the Wikidata result so the map still has a valid origin
 *    point.
 * 4. All patches happen in-memory before the first renderApp() call so the
 *    rest of main.js sees consistent data with no code changes.
 *
 * Fallback strategy
 * -----------------
 * - If the SPARQL call fails (network error, CORS, rate-limit) the original
 *   anchorRecord is left untouched and a console.warn is emitted.
 * - Results are cached in sessionStorage keyed by place name so navigating
 *   back-and-forth inside the same session avoids redundant API calls.
 * - A 1-second inter-query delay prevents hammering the public endpoint.
 */

(function () {
    "use strict";

    // ── Constants ────────────────────────────────────────────────────────────

    const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
    const CACHE_PREFIX    = "wdAnchor:";
    const INTER_QUERY_MS  = 1000;   // polite delay between SPARQL calls
    const COORD_MATCH_KM  = 150;    // max distance to consider a GNIS record a match

    // Promise exposed on window so main.js can await it before first render.
    let resolveReady;
    window.wikidataAnchorsReady = new Promise((res) => { resolveReady = res; });

    // ── Haversine helper (mirrors the one in main.js) ─────────────────────────

    function haversineKm(lat1, lon1, lat2, lon2) {
        const R   = 6371;
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const dPhi = (lat2 - lat1) * Math.PI / 180;
        const dLam = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dPhi / 2) ** 2
                + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ── SVG coordinate conversion ─────────────────────────────────────────────
    // Mirrors the projection baked into placeData.js (simple equirectangular
    // scaled to the 1000 × 560 USA viewBox used by the prototype).

    const USA_BOUNDS = { latMin: 24.4, latMax: 49.4, lonMin: -124.8, lonMax: -66.9 };
    const SVG_W = 1000, SVG_H = 560;

    function latLonToSvg(lat, lon) {
        const x = ((lon - USA_BOUNDS.lonMin) / (USA_BOUNDS.lonMax - USA_BOUNDS.lonMin)) * SVG_W;
        const y = SVG_H - ((lat - USA_BOUNDS.latMin) / (USA_BOUNDS.latMax - USA_BOUNDS.latMin)) * SVG_H;
        return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    // ── Region helper ─────────────────────────────────────────────────────────

    function inferRegion(lat, lon) {
        // Very rough US region bucket — exact enough for display purposes
        if (lon > -100) {
            if (lat > 40)  return "northeast";
            return "south";
        }
        if (lat > 42) return "west";
        return "midwest";   // catches Mountain West too; acceptable approximation
    }

    // ── Era helper ────────────────────────────────────────────────────────────

    function yearToEra(year) {
        if (!year || year < 1650) return "early";
        if (year <= 1796)         return "early";
        if (year <= 1850)         return "expansion";
        return "modern";
    }

    // ── SessionStorage cache ──────────────────────────────────────────────────

    function cacheGet(name) {
        try {
            const raw = sessionStorage.getItem(CACHE_PREFIX + name);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function cacheSet(name, value) {
        try { sessionStorage.setItem(CACHE_PREFIX + name, JSON.stringify(value)); }
        catch { /* quota exceeded – silently skip */ }
    }

    // ── SPARQL query builder ──────────────────────────────────────────────────

    /**
     * Returns the earliest US settlement with the given English label that has:
     *   - instance of: human settlement / city / town / village / municipality
     *   - country: United States (Q30)
     *   - coordinates
     *   - optionally: inception date
     *
     * The result is sorted so the earliest inception year comes first; ties are
     * broken by Wikidata QID (lower = older editorial entry, reasonable heuristic).
     */
    function buildSparqlQuery(placeName) {
        // Escape single quotes inside the name for safe SPARQL injection
        const safe = placeName.replace(/'/g, "\\'");
        return `
SELECT ?item ?itemLabel ?inception ?lat ?lon ?stateLabel WHERE {
  ?item rdfs:label "${safe}"@en .
  ?item wdt:P17 wd:Q30 .          # country = United States
  ?item wdt:P625 ?coord .          # has coordinates
  BIND(geof:latitude(?coord)  AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL {
    ?item wdt:P131+ ?state .
    ?state wdt:P31/wdt:P279* wd:Q35657 .   # administrative territorial entity of the US
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  ?item wdt:P31/wdt:P279* wd:Q486972 .    # instance of human settlement (broad)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ASC(?inception) ASC(?item)
LIMIT 5`;
    }

    // ── Fetch one place from Wikidata ─────────────────────────────────────────

    async function fetchWikidataResult(placeName) {
        const cached = cacheGet(placeName);
        if (cached !== null) return cached;

        const url = SPARQL_ENDPOINT
            + "?format=json&query="
            + encodeURIComponent(buildSparqlQuery(placeName));

        const response = await fetch(url, {
            headers: { Accept: "application/sparql-results+json" }
        });

        if (!response.ok) {
            throw new Error(`SPARQL HTTP ${response.status} for "${placeName}"`);
        }

        const data    = await response.json();
        const results = data.results?.bindings || [];

        if (!results.length) {
            cacheSet(placeName, null);
            return null;
        }

        // Pick the earliest result that has a valid coordinate pair
        const best = results.find(r => r.lat?.value && r.lon?.value) || null;
        if (!best) {
            cacheSet(placeName, null);
            return null;
        }

        const inceptionRaw = best.inception?.value;           // ISO 8601 or undefined
        const inceptionYear = inceptionRaw
            ? parseInt(inceptionRaw.slice(0, 4), 10)
            : null;

        const result = {
            wikidataId:    best.item.value.split("/").pop(),
            label:         best.itemLabel?.value || placeName,
            lat:           parseFloat(best.lat.value),
            lon:           parseFloat(best.lon.value),
            inceptionYear,
            stateLabel:    best.stateLabel?.value || null
        };

        cacheSet(placeName, result);
        return result;
    }

    // ── Patch a single place object ───────────────────────────────────────────

    function patchPlaceAnchor(place, wdResult) {
        const { lat, lon, inceptionYear, wikidataId, label, stateLabel } = wdResult;
        const svgCoord = latLonToSvg(lat, lon);
        const region   = inferRegion(lat, lon);
        const era      = yearToEra(inceptionYear);

        // Try to find the closest matching record already in place.records[]
        let bestRecord   = null;
        let bestDistance = Infinity;

        for (const rec of (place.records || [])) {
            const d = haversineKm(lat, lon, rec.lat, rec.lon);
            if (d < bestDistance) {
                bestDistance = d;
                bestRecord   = rec;
            }
        }

        if (bestRecord && bestDistance <= COORD_MATCH_KM) {
            // Promote the closest GNIS record — it's the same physical place
            place.anchorRecord = { ...bestRecord };

            console.info(
                `[wikidataAnchors] "${place.name}" → promoted GNIS record`
                + ` "${bestRecord.label}" (${Math.round(bestDistance)} km from Wikidata`
                + ` Q${wikidataId}, inception ${inceptionYear ?? "unknown"})`
            );
        } else {
            // No close GNIS record: build a synthetic stub from Wikidata data
            const syntheticLabel = stateLabel
                ? `${place.name}, ${stateLabel}`
                : label;

            const distanceKm = bestRecord
                ? haversineKm(lat, lon, bestRecord.lat, bestRecord.lon)
                : 0;

            place.anchorRecord = {
                id:           `${place.id}-wikidata-${wikidataId}`,
                featureId:    `wikidata-${wikidataId}`,
                label:        syntheticLabel,
                state:        stateLabel || "",
                county:       "",
                mapName:      "",
                dateCreated:  inceptionYear ? `${inceptionYear}` : "",
                dateEdited:   "",
                bgnDate:      inceptionYear ? String(inceptionYear) : "",
                bgnType:      "wikidata",
                lat,
                lon,
                x:            svgCoord.x,
                y:            svgCoord.y,
                region,
                featureKey:   region,
                era,
                radius:       6,
                distanceKm,
                distanceBand: distanceKm < 500 ? "short" : distanceKm < 1500 ? "medium" : "long",
                tooltip:      `${syntheticLabel} | Wikidata Q${wikidataId}`
                              + (inceptionYear ? ` | founded ~${inceptionYear}` : ""),
                detailNote:   `Anchor sourced from Wikidata (Q${wikidataId})`
                              + (inceptionYear ? `; earliest known inception ${inceptionYear}` : "")
                              + ". GNIS does not record this as the founding date."
            };

            console.info(
                `[wikidataAnchors] "${place.name}" → synthetic stub`
                + ` from Q${wikidataId} (no GNIS record within ${COORD_MATCH_KM} km)`
            );
        }

        // Also update the place-level year used by the timeline chart so it
        // reflects the Wikidata inception rather than the earliest statehood proxy.
        if (inceptionYear && inceptionYear > 1400 && inceptionYear < 2100) {
            place.wikidataInceptionYear = inceptionYear;
        }
    }

    // ── Delay helper ──────────────────────────────────────────────────────────

    function delay(ms) {
        return new Promise((res) => setTimeout(res, ms));
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    async function resolveAllAnchors() {
        const DATA = window.placeDiffusionData;
        if (!DATA?.origins) {
            console.warn("[wikidataAnchors] placeDiffusionData not found — skipping.");
            resolveReady();
            return;
        }

        // Collect all (originKey, place) pairs
        const pairs = [];
        for (const [, origin] of Object.entries(DATA.origins)) {
            for (const place of (origin.places || [])) {
                pairs.push(place);
            }
        }

        console.info(`[wikidataAnchors] Resolving ${pairs.length} place(s) via Wikidata SPARQL…`);

        for (let i = 0; i < pairs.length; i++) {
            const place = pairs[i];
            if (i > 0) await delay(INTER_QUERY_MS);   // be polite to the public endpoint

            try {
                const wdResult = await fetchWikidataResult(place.name);
                if (wdResult) {
                    patchPlaceAnchor(place, wdResult);
                } else {
                    console.info(
                        `[wikidataAnchors] No Wikidata result for "${place.name}" — keeping GNIS anchor.`
                    );
                }
            } catch (err) {
                console.warn(
                    `[wikidataAnchors] Failed to resolve "${place.name}":`, err.message,
                    "— keeping original GNIS anchor."
                );
            }
        }

        console.info("[wikidataAnchors] All anchors resolved.");
        resolveReady();
    }

    // Kick off as soon as the script is parsed (data files load before this one)
    resolveAllAnchors();

})();
