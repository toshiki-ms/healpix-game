ERA5 cloud climatology assets live here.

Generate `era5-total-cloud-cover-monthly-1deg-u8.bin` with:

```sh
python scripts/generate-era5-cloud-climatology.py --download --years 2014:2023
```

or convert an existing ERA5 NetCDF file containing `total_cloud_cover`:

```sh
python scripts/generate-era5-cloud-climatology.py --input era5_tcc_monthly.nc
```
