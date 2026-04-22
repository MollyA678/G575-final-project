from pathlib import Path

import geopandas as gpd
from pyproj import Transformer


ROOT = Path(__file__).resolve().parents[1]
STATE_ZIP = ROOT / "data" / "cb_2024_us_state_5m.zip"

WORLD_VIEW = {
    "width": 1000,
    "height": 560,
    "padding_x": 26,
    "padding_y": 28,
    "drawable_width": 948,
    "drawable_height": 504,
    "lon_min": -180.0,
    "lon_max": 180.0,
    "lat_min": -58.0,
    "lat_max": 84.0,
}

USA_VIEW = {
    "width": 1000,
    "height": 560,
    "padding_x": 58,
    "padding_y": 46,
}

CONTIGUOUS_EXCLUDE = {"AK", "HI", "PR", "VI", "MP", "GU", "AS"}


def project_world_point(lat, lon):
    lon_range = WORLD_VIEW["lon_max"] - WORLD_VIEW["lon_min"]
    lat_range = WORLD_VIEW["lat_max"] - WORLD_VIEW["lat_min"]
    x = WORLD_VIEW["padding_x"] + (
        (lon - WORLD_VIEW["lon_min"]) / lon_range
    ) * WORLD_VIEW["drawable_width"]
    y = WORLD_VIEW["padding_y"] + (
        (WORLD_VIEW["lat_max"] - lat) / lat_range
    ) * WORLD_VIEW["drawable_height"]
    return round(x, 1), round(y, 1)


def _fit_bounds(min_x, min_y, max_x, max_y, width, height, padding_x, padding_y):
    usable_width = width - (padding_x * 2)
    usable_height = height - (padding_y * 2)
    scale = min(usable_width / (max_x - min_x), usable_height / (max_y - min_y))
    extra_x = (usable_width - ((max_x - min_x) * scale)) / 2
    extra_y = (usable_height - ((max_y - min_y) * scale)) / 2
    return {
        "min_x": min_x,
        "min_y": min_y,
        "scale": scale,
        "offset_x": padding_x + extra_x,
        "offset_y": height - padding_y - extra_y,
        "width": width,
        "height": height,
    }


def build_usa_projector():
    states = gpd.read_file(f"zip://{STATE_ZIP}")
    states = states[~states["STUSPS"].isin(CONTIGUOUS_EXCLUDE)].copy()
    states = states.to_crs("EPSG:2163")
    min_x, min_y, max_x, max_y = states.total_bounds
    fit = _fit_bounds(
        min_x,
        min_y,
        max_x,
        max_y,
        USA_VIEW["width"],
        USA_VIEW["height"],
        USA_VIEW["padding_x"],
        USA_VIEW["padding_y"],
    )
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:2163", always_xy=True)

    def project_lon_lat(lat, lon):
        proj_x, proj_y = transformer.transform(lon, lat)
        return project_projected(proj_x, proj_y)

    def project_projected(proj_x, proj_y):
        x = fit["offset_x"] + ((proj_x - fit["min_x"]) * fit["scale"])
        y = fit["offset_y"] - ((proj_y - fit["min_y"]) * fit["scale"])
        return round(x, 1), round(y, 1)

    return {
        "states_projected": states,
        "fit": fit,
        "project_lon_lat": project_lon_lat,
        "project_projected": project_projected,
    }
