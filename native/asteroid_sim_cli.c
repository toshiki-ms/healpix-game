#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

unsigned char __heap_base;

#include "asteroid_sim.c"

typedef struct {
  const unsigned char *data;
  size_t length;
  size_t cursor;
} Reader;

static void fail(const char *message) {
  fprintf(stderr, "%s\n", message);
  exit(1);
}

static void read_exact(Reader *reader, void *target, size_t byte_count) {
  if (reader->cursor + byte_count > reader->length) {
    fail("native simulation fixture is truncated");
  }
  memcpy(target, reader->data + reader->cursor, byte_count);
  reader->cursor += byte_count;
}

static int32_t read_i32(Reader *reader) {
  int32_t value = 0;
  read_exact(reader, &value, sizeof(value));
  return value;
}

static float read_f32(Reader *reader) {
  float value = 0;
  read_exact(reader, &value, sizeof(value));
  return value;
}

static const void *read_array(Reader *reader, size_t byte_count) {
  if (reader->cursor + byte_count > reader->length) {
    fail("native simulation fixture array is truncated");
  }
  const void *ptr = reader->data + reader->cursor;
  reader->cursor += byte_count;
  return ptr;
}

static unsigned char *read_file(const char *path, size_t *length) {
  FILE *file = fopen(path, "rb");
  if (!file) {
    fail("failed to open input fixture");
  }
  if (fseek(file, 0, SEEK_END) != 0) {
    fail("failed to seek input fixture");
  }
  long file_size = ftell(file);
  if (file_size < 0) {
    fail("failed to tell input fixture size");
  }
  rewind(file);
  unsigned char *buffer = (unsigned char *)malloc((size_t)file_size);
  if (!buffer) {
    fail("failed to allocate input fixture");
  }
  if (fread(buffer, 1, (size_t)file_size, file) != (size_t)file_size) {
    fail("failed to read input fixture");
  }
  fclose(file);
  *length = (size_t)file_size;
  return buffer;
}

static void write_array(FILE *file, const void *data, size_t byte_count) {
  if (fwrite(data, 1, byte_count, file) != byte_count) {
    fail("failed to write native simulation output");
  }
}

int main(int argc, char **argv) {
  if (argc != 3) {
    fprintf(stderr, "usage: %s input.bin output.bin\n", argv[0]);
    return 2;
  }

  size_t input_length = 0;
  unsigned char *input = read_file(argv[1], &input_length);
  Reader reader = { input, input_length, 0 };

  char magic[8];
  read_exact(&reader, magic, sizeof(magic));
  if (memcmp(magic, "HPSIMC1", 8) != 0) {
    fail("native simulation fixture has bad magic");
  }

  const int32_t size = read_i32(&reader);
  const int32_t stencil_size = read_i32(&reader);
  const int32_t active_count = read_i32(&reader);
  const float dt_days = read_f32(&reader);
  const float cell_size_m = read_f32(&reader);
  const float surface_water_diff_m2_day = read_f32(&reader);
  const float surface_slope_velocity_m_day = read_f32(&reader);
  const float surface_slope_max_velocity_m_day = read_f32(&reader);
  const float nutrient_diff_m2_day = read_f32(&reader);
  const float baobab_seed_diffusion_m2_day = read_f32(&reader);
  const float rose_seed_diffusion_m2_day = read_f32(&reader);

  const size_t cell_bytes = (size_t)size * sizeof(float);
  const size_t soil_bytes = (size_t)size * 3u * sizeof(float);
  const size_t stencil_bytes = (size_t)size * (size_t)stencil_size * sizeof(int32_t);
  const size_t weight_bytes = (size_t)size * (size_t)stencil_size * sizeof(float);
  const int32_t *active_ids = active_count > 0 && active_count != size
    ? (const int32_t *)read_array(&reader, (size_t)active_count * sizeof(int32_t))
    : NULL;
  const int32_t *stencil = (const int32_t *)read_array(&reader, stencil_bytes);
  const float *lap_w = (const float *)read_array(&reader, weight_bytes);
  const float *gx_w = (const float *)read_array(&reader, weight_bytes);
  const float *gy_w = (const float *)read_array(&reader, weight_bytes);
  const float *h = (const float *)read_array(&reader, cell_bytes);
  const float *soil_water = (const float *)read_array(&reader, soil_bytes);
  const float *soil_head = (const float *)read_array(&reader, soil_bytes);
  const float *soil_transmissivity = (const float *)read_array(&reader, soil_bytes);
  const float *soil_residual = (const float *)read_array(&reader, soil_bytes);
  const float *soil_cap = (const float *)read_array(&reader, soil_bytes);
  const float *groundwater_storage = (const float *)read_array(&reader, cell_bytes);
  const float *groundwater_cap = (const float *)read_array(&reader, cell_bytes);
  const float *groundwater_head = (const float *)read_array(&reader, cell_bytes);
  const float *groundwater_t = (const float *)read_array(&reader, cell_bytes);
  const float *soil_mineral_n = (const float *)read_array(&reader, cell_bytes);
  const float *soil_carbon_active = (const float *)read_array(&reader, cell_bytes);
  const float *soil_carbon_stable = (const float *)read_array(&reader, cell_bytes);
  const float *baobab_seed = (const float *)read_array(&reader, cell_bytes);
  const float *rose_seed = (const float *)read_array(&reader, cell_bytes);
  const float *slope_x = (const float *)read_array(&reader, cell_bytes);
  const float *slope_y = (const float *)read_array(&reader, cell_bytes);

  float *soil_transport = (float *)calloc((size_t)size * 3u, sizeof(float));
  float *groundwater_transport = (float *)calloc((size_t)size, sizeof(float));
  float *h_transport = (float *)calloc((size_t)size, sizeof(float));
  float *soil_mineral_transport = (float *)calloc((size_t)size, sizeof(float));
  float *mobile_nutrient = (float *)calloc((size_t)size, sizeof(float));
  float *baobab_seed_transport = (float *)calloc((size_t)size, sizeof(float));
  float *rose_seed_transport = (float *)calloc((size_t)size, sizeof(float));
  float *surface_ux = (float *)calloc((size_t)size, sizeof(float));
  float *surface_uy = (float *)calloc((size_t)size, sizeof(float));
  float *top_soil_ux = (float *)calloc((size_t)size, sizeof(float));
  float *top_soil_uy = (float *)calloc((size_t)size, sizeof(float));
  float *groundwater_ux = (float *)calloc((size_t)size, sizeof(float));
  float *groundwater_uy = (float *)calloc((size_t)size, sizeof(float));
  if (
    !soil_transport ||
    !groundwater_transport ||
    !h_transport ||
    !soil_mineral_transport ||
    !mobile_nutrient ||
    !baobab_seed_transport ||
    !rose_seed_transport ||
    !surface_ux ||
    !surface_uy ||
    !top_soil_ux ||
    !top_soil_uy ||
    !groundwater_ux ||
    !groundwater_uy
  ) {
    fail("failed to allocate native simulation outputs");
  }

  sim_transport_darcy_water_columns(
    size,
    stencil_size,
    active_ids ? active_count : size,
    (uintptr_t)active_ids,
    dt_days,
    cell_size_m,
    surface_water_diff_m2_day,
    surface_slope_velocity_m_day,
    surface_slope_max_velocity_m_day,
    nutrient_diff_m2_day,
    baobab_seed_diffusion_m2_day,
    rose_seed_diffusion_m2_day,
    (uintptr_t)stencil,
    (uintptr_t)lap_w,
	    (uintptr_t)gx_w,
	    (uintptr_t)gy_w,
	    (uintptr_t)h,
	    0,
	    (uintptr_t)soil_water,
    (uintptr_t)soil_head,
    (uintptr_t)soil_transmissivity,
    (uintptr_t)soil_residual,
    (uintptr_t)soil_cap,
    (uintptr_t)groundwater_storage,
    (uintptr_t)groundwater_cap,
    (uintptr_t)groundwater_head,
    (uintptr_t)groundwater_t,
    (uintptr_t)soil_mineral_n,
    (uintptr_t)soil_carbon_active,
    (uintptr_t)soil_carbon_stable,
    (uintptr_t)mobile_nutrient,
    (uintptr_t)baobab_seed,
    (uintptr_t)rose_seed,
    (uintptr_t)slope_x,
    (uintptr_t)slope_y,
    (uintptr_t)soil_transport,
    (uintptr_t)groundwater_transport,
    (uintptr_t)h_transport,
    (uintptr_t)soil_mineral_transport,
    (uintptr_t)baobab_seed_transport,
    (uintptr_t)rose_seed_transport,
    (uintptr_t)surface_ux,
    (uintptr_t)surface_uy,
    (uintptr_t)top_soil_ux,
    (uintptr_t)top_soil_uy,
    (uintptr_t)groundwater_ux,
    (uintptr_t)groundwater_uy,
    0,
    0.0f,
    0,
    0
  );

  FILE *output = fopen(argv[2], "wb");
  if (!output) {
    fail("failed to open native simulation output");
  }
  write_array(output, "HPSIMO1", 8);
  write_array(output, &size, sizeof(size));
  write_array(output, soil_transport, soil_bytes);
  write_array(output, groundwater_transport, cell_bytes);
  write_array(output, h_transport, cell_bytes);
  write_array(output, soil_mineral_transport, cell_bytes);
  write_array(output, baobab_seed_transport, cell_bytes);
  write_array(output, rose_seed_transport, cell_bytes);
  write_array(output, surface_ux, cell_bytes);
  write_array(output, surface_uy, cell_bytes);
  write_array(output, top_soil_ux, cell_bytes);
  write_array(output, top_soil_uy, cell_bytes);
  write_array(output, groundwater_ux, cell_bytes);
  write_array(output, groundwater_uy, cell_bytes);
  fclose(output);

  free(input);
  free(soil_transport);
  free(groundwater_transport);
  free(h_transport);
  free(soil_mineral_transport);
  free(mobile_nutrient);
  free(baobab_seed_transport);
  free(rose_seed_transport);
  free(surface_ux);
  free(surface_uy);
  free(top_soil_ux);
  free(top_soil_uy);
  free(groundwater_ux);
  free(groundwater_uy);
  return 0;
}
