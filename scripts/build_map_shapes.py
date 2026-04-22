import json
from pathlib import Path

import geopandas as gpd

from map_projection import CONTIGUOUS_EXCLUDE, STATE_ZIP, build_usa_projector, project_world_point


ROOT = Path(__file__).resolve().parents[1]
WORLD_ZIP = ROOT / "data" / "ne_110m_admin_0_countries.zip"
OUTPUT_JS = ROOT / "js" / "mapShapes.js"


def format_point(point):
    return f"{round(point[0], 1)} {round(point[1], 1)}"


def geometry_to_svg_path(geometry, projector):
    if geometry.is_empty:
        return ""

    def ring_to_path(ring):
        coords = [projector(x, y) for x, y in ring.coords]
        return "M " + " L ".join(format_point(point) for point in coords) + " Z"

    if geometry.geom_type == "Polygon":
        parts = [ring_to_path(geometry.exterior)]
        parts.extend(ring_to_path(interior) for interior in geometry.interiors)
        return " ".join(parts)

    if geometry.geom_type == "MultiPolygon":
        return " ".join(geometry_to_svg_path(part, projector) for part in geometry.geoms)

    if geometry.geom_type == "GeometryCollection":
        return " ".join(geometry_to_svg_path(part, projector) for part in geometry.geoms)

    return ""


def build_world_shapes():
    world = gpd.read_file(f"zip://{WORLD_ZIP}")
    world = world[world["NAME"] != "Antarctica"].copy()
    world["geometry"] = world["geometry"].simplify(0.08, preserve_topology=True)
    countries = []

    for _, row in world.iterrows():
        path = geometry_to_svg_path(
            row.geometry,
            lambda lon, lat: project_world_point(lat, lon),
        )
        countries.append(
            {
                "name": row["NAME"],
                "continent": row["CONTINENT"],
                "path": path,
            }
        )

    return countries


def build_usa_shapes():
    projection = build_usa_projector()
    states = projection["states_projected"].copy()
    states["geometry"] = states["geometry"].simplify(8000, preserve_topology=True)
    state_paths = []

    for _, row in states.iterrows():
        path = geometry_to_svg_path(
            row.geometry,
            projection["project_projected"],
        )
        state_paths.append(
            {
                "name": row["NAME"],
                "abbr": row["STUSPS"],
                "path": path,
            }
        )

    outline = geometry_to_svg_path(
        states.union_all(),
        projection["project_projected"],
    )

    return {
        "states": state_paths,
        "outlinePath": outline,
    }


def main():
    output = {
        "meta": {
            "sources": [
                "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_5m.zip",
                "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip",
            ],
            "notes": [
                "U.S. map uses 2024 Census cartographic boundary state polygons with non-contiguous states and territories excluded for the main national view.",
                "World map uses Natural Earth 110m Admin 0 countries with Antarctica omitted to keep the main stage focused on inhabited land areas.",
            ],
        },
        "global": {
            "countries": build_world_shapes(),
        },
        "usa": build_usa_shapes(),
    }

    OUTPUT_JS.write_text(
        "window.realMapShapes = " + json.dumps(output, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_JS}")


if __name__ == "__main__":
    main()
