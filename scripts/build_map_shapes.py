import json
from pathlib import Path

import geopandas as gpd

from map_projection import build_usa_projector, project_world_point


ROOT = Path(__file__).resolve().parents[1]
WORLD_ZIP = ROOT / "data" / "ne_110m_admin_0_countries.zip"
OUTPUT_JS = ROOT / "js" / "mapShapes.js"

WORLD_DETAIL_TOLERANCES = {
    "coarse": 0.14,
    "medium": 0.06,
    "fine": None,
}

USA_DETAIL_TOLERANCES = {
    "coarse": 4000,
    "medium": 1000,
    "fine": None,
}


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


def build_path_levels(geometry, projector, tolerances):
    paths = {}

    for level, tolerance in tolerances.items():
        level_geometry = geometry if tolerance is None else geometry.simplify(tolerance, preserve_topology=True)
        paths[level] = geometry_to_svg_path(level_geometry, projector)

    return {
        "path": paths["medium"],
        "paths": paths,
    }


def build_world_shapes():
    world = gpd.read_file(f"zip://{WORLD_ZIP}")
    world = world[world["NAME"] != "Antarctica"].copy()
    countries = []

    for _, row in world.iterrows():
        label_point = row.geometry.representative_point()
        label_x, label_y = project_world_point(label_point.y, label_point.x)
        path_data = build_path_levels(
            row.geometry,
            lambda lon, lat: project_world_point(lat, lon),
            WORLD_DETAIL_TOLERANCES,
        )
        countries.append(
            {
                "name": row["NAME"],
                "continent": row["CONTINENT"],
                **path_data,
                "label": {
                    "x": label_x,
                    "y": label_y,
                },
            }
        )

    return countries


def build_usa_shapes():
    projection = build_usa_projector()
    states = projection["states_projected"].copy()
    state_paths = []

    for _, row in states.iterrows():
        label_point = row.geometry.representative_point()
        label_x, label_y = projection["project_projected"](label_point.x, label_point.y)
        path_data = build_path_levels(
            row.geometry,
            projection["project_projected"],
            USA_DETAIL_TOLERANCES,
        )
        state_paths.append(
            {
                "name": row["NAME"],
                "abbr": row["STUSPS"],
                **path_data,
                "label": {
                    "x": label_x,
                    "y": label_y,
                },
            }
        )

    outline_geometry = states.union_all()
    outline_data = build_path_levels(
        outline_geometry,
        projection["project_projected"],
        USA_DETAIL_TOLERANCES,
    )

    return {
        "states": state_paths,
        "outlinePath": outline_data["path"],
        "outlinePaths": outline_data["paths"],
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
