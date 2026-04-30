import json
import math
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from map_projection import build_usa_projector, project_world_point


ROOT = Path(__file__).resolve().parents[1]
POPULATED_ZIP = ROOT / "data" / "PopulatedPlaces_National_Text.zip"
DESCRIPTION_ZIP = ROOT / "data" / "FeatureDescriptionHistory_National_Text.zip"
OUTPUT_JS = ROOT / "js" / "placeData.js"

STATEHOOD = {
    "Alabama": 1819,
    "Arizona": 1912,
    "Arkansas": 1836,
    "California": 1850,
    "Colorado": 1876,
    "Connecticut": 1788,
    "Delaware": 1787,
    "Florida": 1845,
    "Georgia": 1788,
    "Idaho": 1890,
    "Illinois": 1818,
    "Indiana": 1816,
    "Iowa": 1846,
    "Kansas": 1861,
    "Kentucky": 1792,
    "Louisiana": 1812,
    "Maine": 1820,
    "Maryland": 1788,
    "Massachusetts": 1788,
    "Michigan": 1837,
    "Minnesota": 1858,
    "Mississippi": 1817,
    "Missouri": 1821,
    "Montana": 1889,
    "Nebraska": 1867,
    "Nevada": 1864,
    "New Hampshire": 1788,
    "New Jersey": 1787,
    "New Mexico": 1912,
    "New York": 1788,
    "North Carolina": 1789,
    "North Dakota": 1889,
    "Ohio": 1803,
    "Oklahoma": 1907,
    "Oregon": 1859,
    "Pennsylvania": 1787,
    "Rhode Island": 1790,
    "South Carolina": 1788,
    "South Dakota": 1889,
    "Tennessee": 1796,
    "Texas": 1845,
    "Utah": 1896,
    "Vermont": 1791,
    "Virginia": 1788,
    "Washington": 1889,
    "West Virginia": 1863,
    "Wisconsin": 1848,
    "Wyoming": 1890,
}

REGION = {
    "Connecticut": "northeast",
    "Maine": "northeast",
    "Massachusetts": "northeast",
    "New Hampshire": "northeast",
    "Rhode Island": "northeast",
    "Vermont": "northeast",
    "New Jersey": "northeast",
    "New York": "northeast",
    "Pennsylvania": "northeast",
    "Illinois": "midwest",
    "Indiana": "midwest",
    "Michigan": "midwest",
    "Ohio": "midwest",
    "Wisconsin": "midwest",
    "Iowa": "midwest",
    "Kansas": "midwest",
    "Minnesota": "midwest",
    "Missouri": "midwest",
    "Nebraska": "midwest",
    "North Dakota": "midwest",
    "South Dakota": "midwest",
    "Delaware": "south",
    "Florida": "south",
    "Georgia": "south",
    "Maryland": "south",
    "North Carolina": "south",
    "South Carolina": "south",
    "Virginia": "south",
    "West Virginia": "south",
    "Alabama": "south",
    "Kentucky": "south",
    "Mississippi": "south",
    "Tennessee": "south",
    "Arkansas": "south",
    "Louisiana": "south",
    "Oklahoma": "south",
    "Texas": "south",
    "Arizona": "west",
    "Colorado": "west",
    "Idaho": "west",
    "Montana": "west",
    "Nevada": "west",
    "New Mexico": "west",
    "Utah": "west",
    "Wyoming": "west",
    "Alaska": "west",
    "California": "west",
    "Hawaii": "west",
    "Oregon": "west",
    "Washington": "west",
}

REGION_LABELS = {
    "northeast": "Northeast",
    "midwest": "Midwest",
    "south": "South",
    "west": "West",
}

ERAS = {
    "early": "1650-1796 proxy",
    "expansion": "1797-1850 proxy",
    "modern": "1851+ proxy",
}

ORIGIN_CONFIG = [
    {
        "name": "England",
        "accent": "#0f9eab",
        "origin_coord": {"lat": 52.3555, "lon": -1.1743},
        "entry_hub": {"label": "Atlantic entry corridor", "lat": 40.7128, "lon": -74.0060},
        "description": "English-derived place names appear widely in the Northeast and then diffuse inland across later settlement fronts.",
        "places": [
            {"name": "Kingston", "focus_state": "New York", "note": "A recurring English name that appears from the Atlantic seaboard into the interior."},
            {"name": "Oxford", "focus_state": "Mississippi", "note": "Frequently reused across U.S. towns and small settlements, not just the Northeast."},
            {"name": "Windsor", "focus_state": "Connecticut", "note": "Useful for comparing an early New England anchor with later inland reuse."},
            {"name": "Bristol", "focus_state": "Tennessee", "note": "Extends the English sample with a heavily reused town name that spans both eastern and interior settlement geographies."},
        ],
    },
    {
        "name": "Germany",
        "accent": "#5b9d46",
        "origin_coord": {"lat": 51.1657, "lon": 10.4515},
        "entry_hub": {"label": "Great Lakes corridor", "lat": 42.3314, "lon": -83.0458},
        "description": "German-derived names show a strong interior pattern, especially around Midwestern and Great Lakes settlement geographies.",
        "places": [
            {"name": "Berlin", "focus_state": "Wisconsin", "note": "A high-frequency German sample with both Northeast and Midwest appearances."},
            {"name": "Hanover", "focus_state": "Pennsylvania", "note": "Strong enough to show how one origin name can recur across many states."},
            {"name": "Dresden", "focus_state": "Ohio", "note": "A smaller but still geographically legible German-derived sample."},
            {"name": "Hamburg", "focus_state": "New York", "note": "Adds a major German city name that diffuses widely through northeastern and interior U.S. records."},
        ],
    },
    {
        "name": "Greece",
        "accent": "#b06bc8",
        "origin_coord": {"lat": 39.0742, "lon": 21.8243},
        "entry_hub": {"label": "Atlantic and inland classical corridor", "lat": 39.9526, "lon": -75.1652},
        "description": "Classical Greek names such as Athens, Sparta, and Corinth are heavily reused in the United States as civic and symbolic place names.",
        "places": [
            {"name": "Athens", "focus_state": "Georgia", "note": "A classical name with broad national reuse."},
            {"name": "Sparta", "focus_state": "Georgia", "note": "Provides a strong comparison case for Greek-derived symbolic naming."},
            {"name": "Corinth", "focus_state": "Mississippi", "note": "Useful because it forms dense state-level repetition rather than one dominant hub."},
            {"name": "Troy", "focus_state": "Alabama", "note": "Expands the classical sample with another heavily reused ancient place name in U.S. civic naming."},
        ],
    },
    {
        "name": "Spain",
        "accent": "#d4782c",
        "origin_coord": {"lat": 40.4637, "lon": -3.7492},
        "entry_hub": {"label": "Gulf and Southwest corridor", "lat": 29.4241, "lon": -98.4936},
        "description": "Spanish-origin names concentrate in the Southwest, Gulf Coast, and former colonial corridors, but still diffuse well beyond them.",
        "places": [
            {"name": "Santa Fe", "focus_state": "New Mexico", "note": "An iconic Spanish-origin name with a strong Southwest anchor."},
            {"name": "Toledo", "focus_state": "Ohio", "note": "A durable Spanish city name that shows how Iberian toponyms diffuse well beyond the Southwest."},
            {"name": "Madrid", "focus_state": "Iowa", "note": "Useful for comparing a capital-city name with more regionally anchored Spanish samples."},
            {"name": "Valencia", "focus_state": "California", "note": "A compact Spanish-origin sample with a strong western pull."},
        ],
    },
    {
        "name": "Mexico",
        "accent": "#cc5a5a",
        "origin_coord": {"lat": 23.6345, "lon": -102.5528},
        "entry_hub": {"label": "Borderlands corridor", "lat": 31.7619, "lon": -106.4850},
        "description": "This prototype treats selected Mexican and borderlands place names as a neighboring-origin group concentrated in the Southwest and interior South.",
        "places": [
            {"name": "Sonora", "focus_state": "Texas", "note": "A Mexican-state name that appears across multiple U.S. states in GNIS."},
            {"name": "Durango", "focus_state": "Colorado", "note": "A lower-frequency borderlands sample anchored in the interior West."},
            {"name": "Guadalupe", "focus_state": "California", "note": "Included as a borderlands and Hispanic toponymic bridge in the prototype."},
            {"name": "Tampico", "focus_state": "Illinois", "note": "Adds a Gulf-facing Mexican place name whose GNIS points extend into the Midwest and interior South."},
        ],
    },
    {
        "name": "France",
        "accent": "#4e7ac7",
        "origin_coord": {"lat": 46.2276, "lon": 2.2137},
        "entry_hub": {"label": "Mississippi and colonial corridor", "lat": 29.9511, "lon": -90.0715},
        "description": "French-derived place names are strongly tied to colonial corridors in the Mississippi Valley and Northeast, but many diffuse well beyond those regions.",
        "places": [
            {"name": "Paris", "focus_state": "Texas", "note": "One of the most recognizable French-origin place names in the U.S. GNIS sample."},
            {"name": "Orleans", "focus_state": "Vermont", "note": "Useful for contrasting a colonial-era French name with later inland reuse."},
            {"name": "Versailles", "focus_state": "Kentucky", "note": "Shows how elite and courtly French toponyms were repeatedly adopted in U.S. settlement naming."},
        ],
    },
    {
        "name": "Italy",
        "accent": "#4fa56c",
        "origin_coord": {"lat": 41.8719, "lon": 12.5674},
        "entry_hub": {"label": "Northeast immigrant corridor", "lat": 40.7128, "lon": -74.0060},
        "description": "Italian place names in the U.S. GNIS sample cluster around the Northeast and diffuse into the South and Midwest through later migration and civic naming.",
        "places": [
            {"name": "Florence", "focus_state": "South Carolina", "note": "A high-frequency Italian sample with especially broad state coverage."},
            {"name": "Rome", "focus_state": "Georgia", "note": "Pairs a major Italian city name with a strong southeastern anchor in the U.S."},
            {"name": "Venice", "focus_state": "Florida", "note": "Shows how a famous Italian place name was reused in coastal and resort geographies as well as inland settlements."},
        ],
    },
    {
        "name": "Ireland",
        "accent": "#3a9d8f",
        "origin_coord": {"lat": 53.1424, "lon": -7.6921},
        "entry_hub": {"label": "Atlantic migration corridor", "lat": 42.3601, "lon": -71.0589},
        "description": "Irish-derived place names appear strongly along Atlantic settlement fronts and continue into interior U.S. migration corridors.",
        "places": [
            {"name": "Dublin", "focus_state": "Ohio", "note": "A strong Irish sample with broad national reuse and a clear Midwestern anchor."},
            {"name": "Shannon", "focus_state": "Georgia", "note": "Useful for comparing river- and town-based Irish naming carried into the U.S. South and Midwest."},
            {"name": "Limerick", "focus_state": "Maine", "note": "A smaller but still multi-state Irish-origin sample that complements the stronger Dublin pattern."},
        ],
    },
    {
        "name": "Netherlands",
        "accent": "#d38a3d",
        "origin_coord": {"lat": 52.1326, "lon": 5.2913},
        "entry_hub": {"label": "Hudson Valley corridor", "lat": 42.6526, "lon": -73.7562},
        "description": "Dutch-derived place names are most legible around the Hudson Valley and Great Lakes, but GNIS still shows wider diffusion beyond those early settlement geographies.",
        "places": [
            {"name": "Amsterdam", "focus_state": "New York", "note": "Anchors the Dutch sample with a clear New York and Hudson Valley connection."},
            {"name": "Holland", "focus_state": "Michigan", "note": "Adds a high-frequency Dutch regional name that diffuses well into the interior U.S."},
            {"name": "Zeeland", "focus_state": "Michigan", "note": "A smaller Dutch sample that keeps the Netherlands group tied to real GNIS-populated-place records."},
        ],
    },
]


def read_pipe_zip(zip_path, inner_path):
    with zipfile.ZipFile(zip_path) as archive:
        with archive.open(inner_path) as handle:
            text = handle.read().decode("utf-8-sig")
    lines = [line for line in text.splitlines() if line.strip()]
    header = lines[0].split("|")
    rows = []
    for line in lines[1:]:
        parts = line.split("|")
        if len(parts) < len(header):
            parts.extend([""] * (len(header) - len(parts)))
        rows.append(dict(zip(header, parts)))
    return rows


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def haversine_km(lat1, lon1, lat2, lon2):
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def infer_era(state_name):
    year = STATEHOOD[state_name]
    if year <= 1796:
        return "early"
    if year <= 1850:
        return "expansion"
    return "modern"


def infer_distance_band(km):
    if km < 900:
        return "short"
    if km < 1800:
        return "medium"
    return "long"


def format_history(description, history):
    parts = []
    if description:
        parts.append(description.strip())
    if history:
        parts.append(history.strip())
    return " ".join(part for part in parts if part)


def build_dataset():
    usa_projection = build_usa_projector()
    populated_rows = read_pipe_zip(POPULATED_ZIP, "Text/PopulatedPlaces_National.txt")
    target_names = {
        place["name"]
        for origin in ORIGIN_CONFIG
        for place in origin["places"]
    }

    rows_by_name = defaultdict(list)
    feature_ids = set()

    for row in populated_rows:
        name = row["feature_name"]
        state_name = row["state_name"]
        lat = to_float(row["prim_lat_dec"])
        lon = to_float(row["prim_long_dec"])

        if name not in target_names:
            continue
        if state_name not in STATEHOOD:
            continue
        if lat is None or lon is None or lat == 0 or lon == 0:
            continue

        row["lat"] = lat
        row["lon"] = lon
        rows_by_name[name].append(row)
        feature_ids.add(row["feature_id"])

    descriptions = {}
    description_rows = read_pipe_zip(
        DESCRIPTION_ZIP, "Text/FeatureDescriptionHistory_National.txt"
    )
    for row in description_rows:
        feature_id = row["feature_id"]
        if feature_id in feature_ids:
            descriptions[feature_id] = {
                "description": row.get("description", "").strip(),
                "history": row.get("history", "").strip(),
            }

    origins = {}

    for origin_config in ORIGIN_CONFIG:
        origin_lat = origin_config["origin_coord"]["lat"]
        origin_lon = origin_config["origin_coord"]["lon"]
        anchor_x, anchor_y = project_world_point(origin_lat, origin_lon)
        entry_x, entry_y = usa_projection["project_lon_lat"](
            origin_config["entry_hub"]["lat"],
            origin_config["entry_hub"]["lon"],
        )

        origin_data = {
            "id": origin_config["name"].lower(),
            "name": origin_config["name"],
            "accent": origin_config["accent"],
            "description": origin_config["description"],
            "anchor": {
                "x": anchor_x,
                "y": anchor_y,
                "label": origin_config["name"],
                "lat": origin_lat,
                "lon": origin_lon,
            },
            "entryHub": {
                "label": origin_config["entry_hub"]["label"],
                "x": entry_x,
                "y": entry_y,
                "lat": origin_config["entry_hub"]["lat"],
                "lon": origin_config["entry_hub"]["lon"],
            },
            "places": [],
        }

        for place_config in origin_config["places"]:
            raw_records = rows_by_name[place_config["name"]]
            enriched_records = []

            for row in raw_records:
                state_name = row["state_name"]
                era = infer_era(state_name)
                region = REGION[state_name]
                x, y = usa_projection["project_lon_lat"](row["lat"], row["lon"])
                distance_km = haversine_km(
                    origin_config["entry_hub"]["lat"],
                    origin_config["entry_hub"]["lon"],
                    row["lat"],
                    row["lon"],
                )
                desc = descriptions.get(row["feature_id"], {})
                note = format_history(desc.get("description", ""), desc.get("history", ""))
                tooltip_parts = [
                    f"{row['feature_name']}, {state_name}",
                    f"{row['county_name']} County" if row["county_name"] else "",
                    f"GNIS created: {row['date_created']}" if row["date_created"] else "",
                    f"Board date: {row['bgn_date']}" if row["bgn_date"] else "",
                ]
                tooltip = " | ".join(part for part in tooltip_parts if part)
                enriched_records.append(
                    {
                        "id": f"{place_config['name'].lower().replace(' ', '-')}-{row['feature_id']}",
                        "featureId": row["feature_id"],
                        "label": f"{row['feature_name']}, {state_name}",
                        "state": state_name,
                        "county": row["county_name"],
                        "mapName": row["map_name"],
                        "dateCreated": row["date_created"],
                        "dateEdited": row["date_edited"],
                        "bgnDate": row["bgn_date"],
                        "bgnType": row["bgn_type"],
                        "lat": row["lat"],
                        "lon": row["lon"],
                        "x": x,
                        "y": y,
                        "region": region,
                        "featureKey": region,
                        "era": era,
                        "radius": 6,
                        "distanceKm": round(distance_km, 1),
                        "distanceBand": infer_distance_band(distance_km),
                        "tooltip": tooltip,
                        "detailNote": note,
                    }
                )

            enriched_records.sort(
                key=lambda item: (
                    STATEHOOD[item["state"]],
                    -item["lon"],
                    item["state"],
                    item["county"],
                )
            )

            state_counts = Counter(record["state"] for record in enriched_records)
            region_counts = Counter(record["region"] for record in enriched_records)
            era_counts = Counter(record["era"] for record in enriched_records)
            timeline_by_year = []
            cumulative = 0
            year_counts = Counter(STATEHOOD[record["state"]] for record in enriched_records)
            for year in sorted(year_counts):
                cumulative += year_counts[year]
                timeline_by_year.append({"year": year, "value": cumulative})

            distance_bars = {
                band: {"early": 0, "expansion": 0, "modern": 0}
                for band in ("short", "medium", "long")
            }
            for record in enriched_records:
                distance_bars[record["distanceBand"]][record["era"]] += 1

            rank_points = []
            for index, (_, count) in enumerate(
                sorted(state_counts.items(), key=lambda item: (-item[1], item[0]))
            ):
                rank_points.append(
                    {
                        "rank": index + 1,
                        "value": count,
                        "highlight": index == 0,
                    }
                )

            anchor_record = next(
                (record for record in enriched_records if record["state"] == place_config["focus_state"]),
                enriched_records[0],
            )
            narrative_record = next(
                (record for record in enriched_records if record["detailNote"]),
                anchor_record,
            )
            global_target_x, global_target_y = project_world_point(
                anchor_record["lat"], anchor_record["lon"]
            )

            state_count = len(state_counts)
            summary = (
                f"{place_config['name']} appears in {len(enriched_records)} GNIS populated-place records "
                f"across {state_count} contiguous U.S. states in this prototype subset."
            )
            note = (
                narrative_record["detailNote"]
                if narrative_record["detailNote"]
                else place_config["note"]
            )

            origin_data["places"].append(
                {
                    "id": place_config["name"].lower().replace(" ", "-"),
                    "name": place_config["name"],
                    "stateName": place_config["focus_state"],
                    "label": f"{place_config['name']}, {place_config['focus_state']}",
                    "type": "GNIS populated places",
                    "summary": summary,
                    "note": note,
                    "totalRecords": len(enriched_records),
                    "regionCounts": dict(region_counts),
                    "eraCounts": dict(era_counts),
                    "timelinePoints": timeline_by_year,
                    "distanceBars": distance_bars,
                    "rankPoints": rank_points,
                    "topStates": [
                        {"state": state, "count": count}
                        for state, count in sorted(
                            state_counts.items(),
                            key=lambda item: (-item[1], item[0])
                        )[:6]
                    ],
                    "anchorRecord": anchor_record,
                    "records": enriched_records,
                    "usaPoints": enriched_records,
                    "globalTarget": {
                        "x": global_target_x,
                        "y": global_target_y,
                    },
                    "year": timeline_by_year[0]["year"] if timeline_by_year else None,
                }
            )

        origins[origin_config["name"]] = origin_data

    return {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceName": "USGS GNIS topical downloads",
            "sourceNote": "This prototype uses the March 25, 2026 Populated Places national extract plus the March 17, 2026 Feature Description/History national extract.",
            "curationNote": "Origin groups and exemplar names are a curated sample of clearly non-U.S. toponyms matched against official GNIS populated-place records; GNIS itself does not encode etymology.",
            "timeProxyNote": "Time is inferred here from statehood-year bands rather than actual naming dates, because GNIS does not provide a consistent historical naming year for every record.",
            "regionLabels": REGION_LABELS,
            "eraLabels": ERAS,
            "sources": [
                "https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data",
                "https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/Topical/PopulatedPlaces_National_Text.zip",
                "https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/Topical/FeatureDescriptionHistory_National_Text.zip",
            ],
        },
        "origins": origins,
    }


def main():
    dataset = build_dataset()
    OUTPUT_JS.write_text(
        "window.placeDiffusionData = " + json.dumps(dataset, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_JS}")


if __name__ == "__main__":
    main()
