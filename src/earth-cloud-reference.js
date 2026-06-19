import { earthLatitudeDeg, earthLongitudeDeg } from "./earth-reference.js";

const ERA5_CLOUD_ASSET_PATH = "assets/earth-cloud/era5-total-cloud-cover-monthly-1deg-u8.bin";
const ERA5_CLOUD_WIDTH = 361;
const ERA5_CLOUD_HEIGHT = 181;
const ERA5_CLOUD_MONTHS = 12;
const ERA5_CLOUD_EXPECTED_BYTES = ERA5_CLOUD_WIDTH * ERA5_CLOUD_HEIGHT * ERA5_CLOUD_MONTHS;

let era5CloudCover = null;
let era5CloudCoverPromise = null;

export async function preloadEra5CloudClimatology() {
  if (era5CloudCover) {
    return era5CloudCover;
  }

  if (!era5CloudCoverPromise) {
    const base = typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
    const url = `${base.replace(/\/?$/, "/")}${ERA5_CLOUD_ASSET_PATH}`;
    era5CloudCoverPromise = fetch(url)
      .then((response) => {
        if (!response.ok) {
          return null;
        }
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!buffer) {
          return null;
        }
        if (buffer.byteLength !== ERA5_CLOUD_EXPECTED_BYTES) {
          throw new Error("ERA5 cloud climatology asset has an unexpected size.");
        }
        era5CloudCover = new Uint8Array(buffer);
        return era5CloudCover;
      })
      .catch((error) => {
        console.warn("ERA5 cloud climatology is unavailable; cloud display will use the rain field.", error);
        return null;
      });
  }

  return era5CloudCoverPromise;
}

export function hasEra5CloudClimatology() {
  return !!era5CloudCover;
}

export function era5CloudCoverData() {
  return era5CloudCover;
}

export function era5CloudCoverForCell(cell, modelDay = 1) {
  if (!era5CloudCover) {
    return null;
  }

  const day = modulo(modelDay - 1, 365);
  const monthFloat = (day / 365) * ERA5_CLOUD_MONTHS;
  const month0 = Math.floor(monthFloat) % ERA5_CLOUD_MONTHS;
  const month1 = (month0 + 1) % ERA5_CLOUD_MONTHS;
  const weight = monthFloat - Math.floor(monthFloat);
  const lon = earthLongitudeDeg(cell);
  const lat = earthLatitudeDeg(cell);
  const c0 = sampleCloudMonth(month0, lon, lat);
  const c1 = sampleCloudMonth(month1, lon, lat);
  return clamp01(c0 * (1 - weight) + c1 * weight);
}

function sampleCloudMonth(monthIndex, lon, lat) {
  const x = clamp(lon + 180, 0, 360);
  const y = clamp(lat + 90, 0, 180);
  const x0 = Math.floor(x);
  const x1 = Math.min(ERA5_CLOUD_WIDTH - 1, x0 + 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(ERA5_CLOUD_HEIGHT - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const offset = monthIndex * ERA5_CLOUD_WIDTH * ERA5_CLOUD_HEIGHT;
  const v00 = era5CloudCover[offset + y0 * ERA5_CLOUD_WIDTH + x0] / 255;
  const v10 = era5CloudCover[offset + y0 * ERA5_CLOUD_WIDTH + x1] / 255;
  const v01 = era5CloudCover[offset + y1 * ERA5_CLOUD_WIDTH + x0] / 255;
  const v11 = era5CloudCover[offset + y1 * ERA5_CLOUD_WIDTH + x1] / 255;
  const south = v00 * (1 - fx) + v10 * fx;
  const north = v01 * (1 - fx) + v11 * fx;
  return south * (1 - fy) + north * fy;
}

function modulo(value, period) {
  return ((value % period) + period) % period;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}
