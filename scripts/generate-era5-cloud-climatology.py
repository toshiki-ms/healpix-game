#!/usr/bin/env python3
"""Build the browser ERA5 monthly total-cloud-cover asset.

The output is a raw uint8 array with shape:

    month(12), latitude(-90..90, 181), longitude(-180..180, 361)

Each value stores ERA5 total cloud cover in [0, 1] scaled by 255.

Examples:
    python scripts/generate-era5-cloud-climatology.py --input era5_tcc_monthly.nc
    python scripts/generate-era5-cloud-climatology.py --download --years 2014:2023
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "public/assets/earth-cloud/era5-total-cloud-cover-monthly-1deg-u8.bin"
WIDTH = 361
HEIGHT = 181
MONTHS = 12


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve() if args.input else None
    input_label = (
        f"CDS download: {input_path.name}" if args.download and input_path
        else str(input_path) if input_path
        else "CDS temporary NetCDF download"
    )

    if args.download:
        if input_path is None:
            temp_dir = tempfile.TemporaryDirectory()
            input_path = Path(temp_dir.name) / "era5-total-cloud-cover-monthly.nc"
        download_era5(input_path, args.years)

    if input_path is None:
        raise SystemExit("Pass --input ERA5_NETCDF or --download.")

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cloud = load_monthly_cloud_cover(input_path)
    output_path.write_bytes(cloud.tobytes(order="C"))
    metadata = {
        "source": "ERA5 monthly averaged data on single levels",
        "variable": "total_cloud_cover",
        "shape": [MONTHS, HEIGHT, WIDTH],
        "dtype": "uint8",
        "scale": "value / 255",
        "latitude": "south_to_north_-90_to_90_inclusive_1deg",
        "longitude": "west_to_east_-180_to_180_inclusive_1deg",
        "input": input_label,
        "years": args.years,
    }
    output_path.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {output_path} ({cloud.size} bytes)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="ERA5 NetCDF file containing total cloud cover.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output raw uint8 asset path.")
    parser.add_argument("--download", action="store_true", help="Download ERA5 from CDS before conversion.")
    parser.add_argument("--years", default="2014:2023", help="Year or inclusive range, for example 2020 or 2014:2023.")
    return parser.parse_args()


def download_era5(output_path: Path, years_spec: str) -> None:
    try:
        import cdsapi
    except ImportError as exc:
        raise SystemExit("Install cdsapi or provide --input with a downloaded ERA5 NetCDF file.") from exc

    years = parse_years(years_spec)
    request = {
        "product_type": ["monthly_averaged_reanalysis"],
        "variable": ["total_cloud_cover"],
        "year": years,
        "month": [f"{month:02d}" for month in range(1, 13)],
        "time": ["00:00"],
        "data_format": "netcdf",
        "download_format": "unarchived",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    client = cdsapi.Client()
    client.retrieve("reanalysis-era5-single-levels-monthly-means", request, str(output_path))


def parse_years(spec: str) -> list[str]:
    if ":" not in spec:
        return [spec]
    start, end = (int(part) for part in spec.split(":", 1))
    if end < start:
        raise SystemExit("--years range must be start:end")
    return [str(year) for year in range(start, end + 1)]


def load_monthly_cloud_cover(path: Path) -> np.ndarray:
    try:
        import xarray as xr
    except ImportError as exc:
        raise SystemExit("Install xarray and netCDF4 to convert ERA5 NetCDF input.") from exc

    ds = xr.open_dataset(path)
    var_name = first_existing(ds.data_vars, ["tcc", "total_cloud_cover"])
    if var_name is None:
        raise SystemExit(f"Could not find total cloud cover in {path}. Variables: {list(ds.data_vars)}")

    lat_name = first_existing(ds.coords, ["latitude", "lat"])
    lon_name = first_existing(ds.coords, ["longitude", "lon"])
    if lat_name is None or lon_name is None:
        raise SystemExit("Could not find latitude/longitude coordinates in ERA5 file.")

    cloud = ds[var_name]
    time_name = first_existing(cloud.coords, ["valid_time", "time"])
    if time_name and time_name in cloud.dims:
        cloud = cloud.groupby(f"{time_name}.month").mean(time_name)
        month_dim = "month"
    else:
        month_dim = first_month_dimension(cloud)

    if month_dim is None:
        raise SystemExit("ERA5 cloud field must contain 12 months or a time coordinate.")

    cloud = normalize_longitude(cloud, lon_name)
    if cloud[lat_name][0] > cloud[lat_name][-1]:
        cloud = cloud.sortby(lat_name)

    target_lat = np.linspace(-90, 90, HEIGHT)
    target_lon = np.linspace(-180, 180, WIDTH)
    monthly = []
    for month in range(1, MONTHS + 1):
        if month_dim == "month":
            field = cloud.sel(month=month)
        else:
            field = cloud.isel({month_dim: month - 1})
        field = field.interp(
            {lat_name: target_lat, lon_name: target_lon},
            method="linear",
            kwargs={"fill_value": "extrapolate"},
        )
        field = field.fillna(
            field.interp({lat_name: target_lat, lon_name: target_lon}, method="nearest")
        )
        values = np.asarray(field, dtype=np.float32)
        monthly.append(np.clip(values, 0.0, 1.0))

    stacked = np.stack(monthly, axis=0)
    return np.rint(stacked * 255).astype(np.uint8)


def normalize_longitude(field, lon_name: str):
    lon = np.asarray(field[lon_name])
    normalized = ((lon + 180) % 360) - 180
    field = field.assign_coords({lon_name: normalized}).sortby(lon_name)

    lon_values = np.asarray(field[lon_name])
    if lon_values[0] > -180:
        west = field.isel({lon_name: -1}).assign_coords({lon_name: -180.0})
        field = field.combine_first(west)
    if lon_values[-1] < 180:
        east = field.isel({lon_name: 0}).assign_coords({lon_name: 180.0})
        field = field.combine_first(east)
    return field.sortby(lon_name)


def first_existing(container, names: list[str]) -> str | None:
    for name in names:
        if name in container:
            return name
    return None


def first_month_dimension(cloud) -> str | None:
    for dim in cloud.dims:
        if cloud.sizes.get(dim) == MONTHS:
            return dim
    return None


if __name__ == "__main__":
    main()
