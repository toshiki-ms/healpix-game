#include <stdint.h>

#if defined(__wasm__)
#define SIM_EXPORT __attribute__((visibility("default")))
#else
#define SIM_EXPORT
#endif

#define SIM_RESTRICT __restrict
#define SIM_RBF_STENCIL_SIZE 12
#define SIM_ACTIVE_RANGE_FLAG ((uintptr_t)1u)
#define SIM_CELL_KERNEL_BLOCK_SIZE 1024
#define SIM_PHOTOSYNTHESIS_PICARD_ITERATIONS 2
#define SIM_ROSE_ARRIVAL_BLOCK_SIZE 4096
#define SIM_BAOBAB_SEED_NPP_ALLOCATION_FRACTION 0.45f
#define SIM_BAOBAB_SEED_STORE_FRACTION_PER_DAY 0.32f
#define SIM_ROSE_SEED_NPP_ALLOCATION_FRACTION 0.38f
#define SIM_BAOBAB_GERMINATION_RESPIRATION_FRACTION 0.08f
#define SIM_ROSE_GERMINATION_RESPIRATION_FRACTION 0.08f
#define SIM_ROSE_SEED_STORE_FRACTION_PER_DAY 0.18f
#define SIM_ROSE_SEED_PRODUCTION_COEFF 0.03f
#define SIM_ROSE_SEED_BASE_MORTALITY 0.0035f
#define SIM_ROSE_SEED_STRESS_MORTALITY 0.026f
#define SIM_ROSE_BACKGROUND_MORTALITY 0.00002f
#define SIM_ROSE_KERNEL_SCRATCH_SIZE 4096
#define SIM_TRANSPORT_SCRATCH_FIELDS 16
#define SIM_TRANSPORT_SCRATCH_H 0
#define SIM_TRANSPORT_SCRATCH_MOBILE_N 1
#define SIM_TRANSPORT_SCRATCH_BAOBAB_SEED 2
#define SIM_TRANSPORT_SCRATCH_ROSE_SEED 3
#define SIM_TRANSPORT_SCRATCH_SOIL_HEAD0 4
#define SIM_TRANSPORT_SCRATCH_SOIL_HEAD1 5
#define SIM_TRANSPORT_SCRATCH_SOIL_HEAD2 6
#define SIM_TRANSPORT_SCRATCH_SOIL_T0 7
#define SIM_TRANSPORT_SCRATCH_SOIL_T1 8
#define SIM_TRANSPORT_SCRATCH_SOIL_T2 9
#define SIM_TRANSPORT_SCRATCH_GW_HEAD 10
#define SIM_TRANSPORT_SCRATCH_GW_T 11
#define SIM_TRANSPORT_SCRATCH_SURFACE_UX 12
#define SIM_TRANSPORT_SCRATCH_SURFACE_UY 13
#define SIM_TRANSPORT_SCRATCH_FLUX_X 14
#define SIM_TRANSPORT_SCRATCH_FLUX_Y 15
#define SIM_FAST_TRIG_TABLE_SIZE 4096

#if defined(__clang__)
#define SIM_VECTORIZE_LOOP _Pragma("clang loop vectorize(enable) interleave(enable)")
#define SIM_UNROLL_LOOP _Pragma("clang loop unroll(full)")
#else
#define SIM_VECTORIZE_LOOP
#define SIM_UNROLL_LOOP
#endif

extern unsigned char __heap_base;

static uintptr_t sim_heap_offset = 0;
static float sim_fast_exp_neg_table[1025];
static float sim_fast_cloud_exp16_table[1025];
static float sim_fast_daylight_power058_table[257];
static float sim_fast_sin_table[SIM_FAST_TRIG_TABLE_SIZE + 1];
static float sim_fast_vapor_pressure_table[513];
static float sim_fast_temperature_response_table[9][513];
static int32_t sim_fast_tables_ready = 0;
static int32_t sim_rose_kernel_targets[SIM_ROSE_KERNEL_SCRATCH_SIZE];

enum {
  SIM_TEMP_RESPONSE_ROSE_REPRO = 0,
  SIM_TEMP_RESPONSE_BAOBAB_READINESS = 1,
  SIM_TEMP_RESPONSE_ROSE_READINESS = 2,
  SIM_TEMP_RESPONSE_DECOMPOSITION = 3,
  SIM_TEMP_RESPONSE_ACTIVE_SOC = 4,
  SIM_TEMP_RESPONSE_STABLE_SOC = 5,
  SIM_TEMP_RESPONSE_WEATHERING = 6,
  SIM_TEMP_RESPONSE_ORGANIC_N = 7,
  SIM_TEMP_RESPONSE_BAOBAB_CARBON = 8
};

#if defined(__wasm__)
__attribute__((import_module("env"), import_name("sim_now_ms")))
extern double sim_now_ms(void);
#else
static inline double sim_now_ms(void) {
  return 0.0;
}
#endif

enum {
  SIM_PROFILE_SETUP = 0,
  SIM_PROFILE_HYDRAULIC_ZERO = 1,
  SIM_PROFILE_SUNLIGHT_RAIN = 2,
  SIM_PROFILE_MOBILE_NUTRIENT = 3,
  SIM_PROFILE_RAIN_SERIAL = 4,
  SIM_PROFILE_RAIN_SCALE_MEMORY = 5,
  SIM_PROFILE_DARCY_CORE = 6,
  SIM_PROFILE_DARCY_BARRIER = 7,
  SIM_PROFILE_DIVERGENCE = 8,
  SIM_PROFILE_ROSE_PRODUCE = 9,
  SIM_PROFILE_ROSE_DISTRIBUTE = 10,
  SIM_PROFILE_CELL_UPDATES = 11,
  SIM_PROFILE_SWAP_SETUP = 12,
  SIM_PROFILE_CELL_CANOPY_PHOTOSYNTHESIS = 13,
  SIM_PROFILE_CELL_PLANT_WATER = 14,
  SIM_PROFILE_CELL_PLANT_CARBON = 15,
  SIM_PROFILE_CELL_SOIL_BIO = 16,
  SIM_PROFILE_CELL_RICHARDS_HYDRAULIC = 17,
  SIM_PROFILE_DARCY_CORE_HALO = 18,
  SIM_PROFILE_DARCY_CORE_STENCIL = 19,
  SIM_PROFILE_DIVERGENCE_HALO = 20,
  SIM_PROFILE_DIVERGENCE_STENCIL = 21,
  SIM_PROFILE_PHASE_COUNT = 22
};

static inline double sim_profile_clock(uintptr_t profile_offset) {
  return profile_offset ? sim_now_ms() : 0.0;
}

static inline void sim_profile_add(uintptr_t profile_offset, int32_t profile_stride, int32_t thread_id, int32_t phase, double started_at) {
  if (!profile_offset || profile_stride <= 0 || phase < 0 || phase >= profile_stride) {
    return;
  }
  float *profile = (float *)(uintptr_t)profile_offset;
  profile[(int32_t)(thread_id * profile_stride + phase)] += (float)(sim_now_ms() - started_at);
}

static inline int32_t sim_active_cell_id(uintptr_t active_ids_offset, const int32_t *active_ids, int32_t cell_offset) {
  if (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) {
    return (int32_t)(active_ids_offset >> 1u) + cell_offset;
  }
  return active_ids_offset ? active_ids[cell_offset] : cell_offset;
}

static inline float sim_clamp(float value, float lower, float upper) {
  if (value < lower) {
    return lower;
  }
  if (value > upper) {
    return upper;
  }
  return value;
}

static inline float sim_smoothstep01(float value) {
  const float x = sim_clamp(value, 0.0f, 1.0f);
  return x * x * (3.0f - 2.0f * x);
}

static inline float sim_rose_root_aeration_factor(float surface_water, float top_saturation, float rose_soil) {
  const float drainage = sim_clamp((rose_soil - 0.45f) / 1.15f, 0.0f, 1.0f);
  const float effective_saturation = sim_clamp(top_saturation - 0.12f * drainage, 0.0f, 1.0f);
  const float air_filled_pore = sim_clamp(1.0f - effective_saturation, 0.0f, 1.0f);
  const float min_air_filled_pore = 0.025f + 0.035f * drainage;
  const float aeration_range = 0.1f + 0.08f * drainage;
  const float air_factor = sim_clamp((air_filled_pore - min_air_filled_pore) / aeration_range, 0.0f, 1.0f);
  const float gas_diffusion_factor = air_factor * air_factor * (3.0f - 2.0f * air_factor);
  const float ponded_water = surface_water > 0.0f ? surface_water : 0.0f;
  const float surface_film_factor = 1.0f / (1.0f + ponded_water / (0.0035f + 0.0035f * drainage));
  return sim_clamp(gas_diffusion_factor * surface_film_factor, 0.0f, 1.0f);
}

static inline float sim_rose_water_stress_with_waterlogging(float root_water_r, float rose_soil, float surface_water, float top_saturation) {
  const float pond_support = sim_clamp(surface_water * 10.0f, 0.0f, 1.0f);
  const float base_stress = sim_clamp(root_water_r * (0.84f + rose_soil * 0.1f) + 0.1f * pond_support - 0.015f, 0.0f, 1.0f);
  const float drainage = sim_clamp((rose_soil - 0.45f) / 1.15f, 0.0f, 1.0f);
  const float aeration = sim_rose_root_aeration_factor(surface_water, top_saturation, rose_soil);
  const float oxygen_floor = 0.18f + 0.22f * drainage;
  const float oxygen_factor = oxygen_floor + (1.0f - oxygen_floor) * aeration;
  return sim_clamp(base_stress * oxygen_factor, 0.0f, 1.0f);
}

static inline float sim_sqrt(float value) {
  return __builtin_sqrtf(value);
}

static inline float sim_abs(float value) {
  return value < 0.0f ? -value : value;
}

static inline int32_t sim_is_finite(float value) {
  return value == value && value <= 3.402823466e38f && value >= -3.402823466e38f;
}

static inline float sim_floor(float value) {
  const int32_t truncated = (int32_t)value;
  return value < (float)truncated ? (float)(truncated - 1) : (float)truncated;
}

static inline float sim_modulo_float(float value, float size) {
  return value - sim_floor(value / size) * size;
}

static inline int32_t sim_modulo_int(int32_t value, int32_t size) {
  const int32_t result = value % size;
  return result < 0 ? result + size : result;
}

static inline int32_t sim_spread_bits_for_nside(int32_t value, int32_t nside) {
  int32_t spread = 0;
  int32_t bit = 0;
  while ((1 << bit) < nside) {
    spread |= ((value >> bit) & 1) << (2 * bit);
    bit += 1;
  }
  return spread;
}

static inline int32_t sim_compact_bits_for_nside(int32_t value, int32_t nside) {
  int32_t compact = 0;
  int32_t bit = 0;
  while ((1 << bit) < nside) {
    compact |= ((value >> (2 * bit)) & 1) << bit;
    bit += 1;
  }
  return compact;
}

static inline int32_t sim_nested_id(int32_t face, int32_t ix, int32_t iy, int32_t nside) {
  return face * nside * nside + sim_spread_bits_for_nside(iy, nside) + 2 * sim_spread_bits_for_nside(ix, nside);
}

static inline void sim_decode_nested_id(int32_t cell_id, int32_t nside, int32_t *face, int32_t *ix, int32_t *iy) {
  const int32_t face_size = nside * nside;
  *face = cell_id / face_size;
  const int32_t local = cell_id - *face * face_size;
  *ix = sim_compact_bits_for_nside(local >> 1, nside);
  *iy = sim_compact_bits_for_nside(local, nside);
}

static inline int32_t sim_resolve_corner(int32_t face, int32_t direction, int32_t nside) {
  const int32_t hi = nside - 1;
  if (direction == 1) {
    return face >= 4 && face < 8
      ? sim_nested_id(4 + sim_modulo_int(face - 4 + 3, 4), 0, hi, nside)
      : -1;
  }
  if (direction == 3) {
    if (face < 4) {
      return sim_nested_id(sim_modulo_int(face + 2, 4), hi, hi, nside);
    }
    if (face >= 8) {
      return sim_nested_id(face - 8, 0, 0, nside);
    }
    return -1;
  }
  if (direction == 5) {
    return face >= 4 && face < 8
      ? sim_nested_id(4 + sim_modulo_int(face - 4 + 1, 4), hi, 0, nside)
      : -1;
  }
  if (direction == 7) {
    if (face < 4) {
      return sim_nested_id(8 + face, hi, hi, nside);
    }
    if (face >= 8) {
      return sim_nested_id(8 + sim_modulo_int(face - 8 + 2, 4), 0, 0, nside);
    }
    return -1;
  }
  return -1;
}

static inline int32_t sim_resolve_edge(int32_t face, int32_t edge, int32_t coordinate, int32_t nside) {
  static const int32_t edge_target_face[4][12] = {
    {4, 5, 6, 7, 11, 8, 9, 10, 11, 8, 9, 10},
    {5, 6, 7, 4, 8, 9, 10, 11, 9, 10, 11, 8},
    {1, 2, 3, 0, 0, 1, 2, 3, 5, 6, 7, 4},
    {3, 0, 1, 2, 3, 0, 1, 2, 4, 5, 6, 7}
  };
  if (coordinate < 0 || coordinate >= nside) {
    return -1;
  }
  const int32_t target_face = edge_target_face[edge][face];
  const int32_t hi = nside - 1;
  if (edge == 0) {
    return face < 8
      ? sim_nested_id(target_face, coordinate, hi, nside)
      : sim_nested_id(target_face, 0, coordinate, nside);
  }
  if (edge == 1) {
    return face < 8
      ? sim_nested_id(target_face, hi, coordinate, nside)
      : sim_nested_id(target_face, coordinate, 0, nside);
  }
  if (edge == 2) {
    return face < 4
      ? sim_nested_id(target_face, hi, coordinate, nside)
      : sim_nested_id(target_face, coordinate, 0, nside);
  }
  return face < 4
    ? sim_nested_id(target_face, coordinate, hi, nside)
    : sim_nested_id(target_face, 0, coordinate, nside);
}

static inline int32_t sim_step_nested_neighbor(int32_t cell_id, int32_t direction, int32_t nside) {
  static const int32_t dx[8] = {0, 1, 1, 1, 0, -1, -1, -1};
  static const int32_t dy[8] = {-1, -1, 0, 1, 1, 1, 0, -1};
  int32_t face = 0;
  int32_t ix = 0;
  int32_t iy = 0;
  sim_decode_nested_id(cell_id, nside, &face, &ix, &iy);
  const int32_t next_ix = ix + dx[direction];
  const int32_t next_iy = iy + dy[direction];
  const int32_t outside_x = next_ix < 0 || next_ix >= nside;
  const int32_t outside_y = next_iy < 0 || next_iy >= nside;
  if (!outside_x && !outside_y) {
    return sim_nested_id(face, next_ix, next_iy, nside);
  }
  if (outside_x && outside_y) {
    return sim_resolve_corner(face, direction, nside);
  }
  int32_t edge = 0;
  int32_t coordinate = 0;
  if (next_iy < 0) {
    edge = 0;
    coordinate = next_ix;
  } else if (next_ix < 0) {
    edge = 1;
    coordinate = next_iy;
  } else if (next_iy >= nside) {
    edge = 2;
    coordinate = next_ix;
  } else {
    edge = 3;
    coordinate = next_iy;
  }
  return sim_resolve_edge(face, edge, coordinate, nside);
}

static inline float sim_periodic_delta(float a, float b, float period) {
  const float delta = a - b;
  if (delta > period * 0.5f) {
    return delta - period;
  }
  if (delta < -period * 0.5f) {
    return delta + period;
  }
  return delta;
}

static inline float sim_sin(float value) {
  const float two_pi = 6.283185307179586f;
  const float pi = 3.141592653589793f;
  value = value - sim_floor((value + pi) / two_pi) * two_pi;
  if (value > pi) {
    value -= two_pi;
  }
  if (value < -pi) {
    value += two_pi;
  }
  const float value2 = value * value;
  const float value3 = value2 * value;
  const float value5 = value3 * value2;
  const float value7 = value5 * value2;
  const float value9 = value7 * value2;
  return value - value3 * 0.1666666667f + value5 * 0.0083333333f - value7 * 0.0001984127f + value9 * 0.0000027557f;
}

static inline float sim_cos(float value) {
  return sim_sin(value + 1.5707963267948966f);
}

static inline float sim_asin(float value) {
  const float x = sim_clamp(value, -1.0f, 1.0f);
  const float ax = sim_abs(x);
  const float root_arg = 1.0f - ax;
  const float root = sim_sqrt(root_arg > 0.0f ? root_arg : 0.0f);
  const float poly =
    1.5707288f +
    ax * (-0.2121144f + ax * (0.0742610f - 0.0187293f * ax));
  const float angle = 1.5707963267948966f - root * poly;
  return x < 0.0f ? -angle : angle;
}

static inline float sim_exp(float value);
static inline float sim_log1p(float value);

static inline float sim_pow_positive(float base, float exponent) {
  if (base <= 0.0f) {
    return 0.0f;
  }
  return sim_exp(exponent * sim_log1p(base - 1.0f));
}

static inline float sim_surface_water_velocity_scale(
  float surface_water_m,
  float downhill_x,
  float downhill_y,
  float surface_film_threshold_m,
  float surface_slope_max_velocity_m_day
) {
  const float slope2 = downhill_x * downhill_x + downhill_y * downhill_y;
  const float mobile_depth = surface_water_m - surface_film_threshold_m;
  if (slope2 <= 1.0e-18f || mobile_depth <= 1.0e-8f) {
    return 0.0f;
  }
  const float slope = sim_sqrt(slope2);
  const float hydraulic_depth = mobile_depth > 0.0005f ? mobile_depth : 0.0005f;
  const float seconds_per_day = 86400.0f;
  const float manning_roughness = 0.055f;
  float velocity =
    (seconds_per_day / manning_roughness) *
    sim_pow_positive(hydraulic_depth, 0.6666666667f) *
    sim_sqrt(slope);
  if (velocity > surface_slope_max_velocity_m_day) {
    velocity = surface_slope_max_velocity_m_day;
  }
  return velocity / slope;
}

static inline float sim_surface_mfd_drop_sum(
  int32_t source,
  const int32_t *SIM_RESTRICT stencil,
  const float *SIM_RESTRICT elevation,
  const float *SIM_RESTRICT h
) {
  const int32_t offset = source * SIM_RBF_STENCIL_SIZE;
  const float source_head = elevation[source] + h[source];
  float drop_sum = 0.0f;
  SIM_UNROLL_LOOP
  for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
    const int32_t target = stencil[offset + k];
    if (target == source) {
      continue;
    }
    const float drop = source_head - (elevation[target] + h[target]);
    if (drop > 0.0f) {
      drop_sum += drop;
    }
  }
  return drop_sum;
}

static inline float sim_surface_mfd_drop_to_target(
  int32_t source,
  int32_t target,
  const int32_t *SIM_RESTRICT stencil,
  const float *SIM_RESTRICT elevation,
  const float *SIM_RESTRICT h
) {
  const int32_t offset = source * SIM_RBF_STENCIL_SIZE;
  const float source_head = elevation[source] + h[source];
  SIM_UNROLL_LOOP
  for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
    const int32_t candidate = stencil[offset + k];
    if (candidate != target) {
      continue;
    }
    return source_head - (elevation[target] + h[target]);
  }
  return 0.0f;
}

static inline float sim_surface_mfd_outflow_rate(
  float surface_water_m,
  float surface_ux,
  float surface_uy,
  float cell_size_m,
  float surface_film_threshold_m
) {
  const float mobile_surface_water = surface_water_m > surface_film_threshold_m ? surface_water_m - surface_film_threshold_m : 0.0f;
  if (mobile_surface_water <= 0.0f || cell_size_m <= 0.0f) {
    return 0.0f;
  }
  const float speed = sim_sqrt(surface_ux * surface_ux + surface_uy * surface_uy);
  return speed * mobile_surface_water / cell_size_m;
}

static inline float sim_scalbn_positive_normal(float value, int32_t exponent_delta) {
  union {
    float f;
    uint32_t u;
  } bits;
  bits.f = value;
  int32_t exponent = (int32_t)((bits.u >> 23) & 0xffu) + exponent_delta;
  if (exponent <= 0) {
    return 0.0f;
  }
  if (exponent >= 255) {
    return 3.402823466e38f;
  }
  bits.u = (bits.u & 0x807fffffu) | ((uint32_t)exponent << 23);
  return bits.f;
}

static inline float sim_deterministic_unit(int32_t index, int32_t salt) {
  const float value = sim_sin(((float)index + 1.0f) * 12.9898f + ((float)salt + 1.0f) * 78.233f) * 43758.5453f;
  return value - sim_floor(value);
}

static inline float sim_asteroid_rain_veil(float x, float y, float render_size, int32_t day_key, float day) {
  const float inv_size = render_size > 0.0f ? 1.0f / render_size : 0.0f;
  const float nx = x * inv_size;
  const float ny = y * inv_size - 0.5f;
  const float tau = 6.283185307179586f;
  const float phase_a = (float)day_key * 0.91f + tau * (2.0f * nx + 0.75f * ny);
  const float phase_b = day * 0.37f + tau * (3.0f * nx - 1.1f * ny);
  const float phase_c = day * 0.19f + tau * (nx + 1.7f * ny);
  return 0.82f + 0.085f * sim_sin(phase_a) + 0.045f * sim_sin(phase_b) * sim_cos(phase_c);
}

static inline float sim_exp(float value) {
  if (value <= -80.0f) {
    return 0.0f;
  }
  if (value >= 80.0f) {
    value = 80.0f;
  }

  const float inv_ln2 = 1.4426950408889634f;
  const float ln2 = 0.6931471805599453f;
  const int32_t n = (int32_t)(value * inv_ln2 + (value >= 0.0f ? 0.5f : -0.5f));
  const float r = value - (float)n * ln2;
  const float r2 = r * r;
  const float r3 = r2 * r;
  const float r4 = r2 * r2;
  const float r5 = r4 * r;
  const float r6 = r3 * r3;
  float result = 1.0f + r + 0.5f * r2 + 0.1666666667f * r3 + 0.0416666667f * r4 + 0.0083333333f * r5 + 0.0013888889f * r6;
  return sim_scalbn_positive_normal(result, n);
}

static inline float sim_log1p(float value) {
  if (value <= -0.999999f) {
    return -80.0f;
  }
  if (value == 0.0f) {
    return 0.0f;
  }
  float scale = 0.0f;
  float y = value;
  while (y > 1.0f) {
    y = (y - 1.0f) * 0.5f;
    scale += 0.6931471805599453f;
  }
  while (y < -0.5f) {
    y = 2.0f * y + 1.0f;
    scale -= 0.6931471805599453f;
  }
  const float z = y / (2.0f + y);
  const float z2 = z * z;
  float term = z;
  float sum = term;
  term *= z2;
  sum += term / 3.0f;
  term *= z2;
  sum += term / 5.0f;
  term *= z2;
  sum += term / 7.0f;
  term *= z2;
  sum += term / 9.0f;
  term *= z2;
  sum += term / 11.0f;
  return scale + 2.0f * sum;
}

static inline float saturation_vapor_pressure_kpa(float temp_c) {
  return 0.6108f * sim_exp((17.27f * temp_c) / (temp_c + 237.3f));
}

static inline float sim_temperature_response_raw(float temp_c, float optimum_c, float min_c, float max_c) {
  if (temp_c <= min_c || temp_c >= max_c) {
    return 0.0f;
  }
  const float left_denom = optimum_c - min_c > 1.0e-6f ? optimum_c - min_c : 1.0e-6f;
  const float right_denom = max_c - optimum_c > 1.0e-6f ? max_c - optimum_c : 1.0e-6f;
  const float left = sim_clamp((temp_c - min_c) / left_denom, 0.0f, 1.0f);
  const float right = sim_clamp((max_c - temp_c) / right_denom, 0.0f, 1.0f);
  return sim_sqrt(left * right);
}

static void sim_init_fast_tables(void) {
  if (__atomic_load_n(&sim_fast_tables_ready, __ATOMIC_ACQUIRE)) {
    return;
  }
  for (int32_t table_index = 0; table_index <= SIM_FAST_TRIG_TABLE_SIZE; table_index += 1) {
    sim_fast_sin_table[table_index] =
      sim_sin(6.283185307179586f * (float)table_index * (1.0f / (float)SIM_FAST_TRIG_TABLE_SIZE));
  }
  for (int32_t table_index = 0; table_index <= 1024; table_index += 1) {
    sim_fast_exp_neg_table[table_index] = sim_exp(-10.0f * (float)table_index * (1.0f / 1024.0f));
    sim_fast_cloud_exp16_table[table_index] = sim_exp(-16.0f * (float)table_index * (1.0f / 1024.0f));
  }
  for (int32_t table_index = 0; table_index <= 256; table_index += 1) {
    sim_fast_daylight_power058_table[table_index] =
      sim_pow_positive((float)table_index * (1.0f / 256.0f), 0.58f);
  }
  for (int32_t table_index = 0; table_index <= 512; table_index += 1) {
    const float table_temp_c = -20.0f + 70.0f * (float)table_index * (1.0f / 512.0f);
    sim_fast_vapor_pressure_table[table_index] = saturation_vapor_pressure_kpa(table_temp_c);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_ROSE_REPRO][table_index] =
      sim_temperature_response_raw(table_temp_c, 24.0f, 1.0f, 39.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_BAOBAB_READINESS][table_index] =
      sim_temperature_response_raw(table_temp_c, 31.0f, 7.0f, 46.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_ROSE_READINESS][table_index] =
      sim_temperature_response_raw(table_temp_c, 23.0f, 4.0f, 35.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_DECOMPOSITION][table_index] =
      sim_temperature_response_raw(table_temp_c, 27.0f, -4.0f, 46.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_ACTIVE_SOC][table_index] =
      sim_temperature_response_raw(table_temp_c, 25.0f, -5.0f, 45.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_STABLE_SOC][table_index] =
      sim_temperature_response_raw(table_temp_c, 22.0f, -6.0f, 42.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_WEATHERING][table_index] =
      sim_temperature_response_raw(table_temp_c, 18.0f, -8.0f, 42.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_ORGANIC_N][table_index] =
      sim_temperature_response_raw(table_temp_c, 20.0f, -6.0f, 42.0f);
    sim_fast_temperature_response_table[SIM_TEMP_RESPONSE_BAOBAB_CARBON][table_index] =
      sim_temperature_response_raw(table_temp_c, 28.0f, -4.0f, 50.0f);
  }
  __atomic_store_n(&sim_fast_tables_ready, 1, __ATOMIC_RELEASE);
}

static inline float sim_min(float a, float b) {
  return a < b ? a : b;
}

static inline float sim_max(float a, float b) {
  return a > b ? a : b;
}

static inline float sim_ring_mean_daily_insolation_from_height(float height) {
  const float ring_height = sim_clamp(height, -1.0f, 1.0f);
  const float cos_latitude = sim_sqrt(sim_max(0.0f, 1.0f - ring_height * ring_height));
  return sim_clamp(cos_latitude / 3.1415926535897932f, 0.035f, 0.36f);
}

static inline float sim_ring_latitude_temperature_unit_from_height(float height) {
  const float ring_height = sim_clamp(height, -1.0f, 1.0f);
  return 1.0f - 2.0f * sim_abs(ring_height);
}

static inline float sim_snow_precip_fraction_from_mean_diurnal(float mean_temp_c, float diurnal_range_c) {
  const float amplitude = 0.5f * sim_max(0.0f, diurnal_range_c);
  if (amplitude <= 1.0e-6f) {
    return mean_temp_c < 0.0f ? 1.0f : 0.0f;
  }
  if (mean_temp_c >= amplitude) {
    return 0.0f;
  }
  if (mean_temp_c <= -amplitude) {
    return 1.0f;
  }
  return sim_clamp(0.5f - sim_asin(mean_temp_c / amplitude) / 3.1415926535897932f, 0.0f, 1.0f);
}

static inline float sim_harmonic_mean(float a, float b) {
  return a > 0.0f && b > 0.0f ? (2.0f * a * b) / (a + b) : 0.0f;
}

static inline uint8_t sim_substrate_index(uint8_t raw_index) {
  return raw_index < 5u ? raw_index : 0u;
}

static inline float substrate_inf_bare(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.38f, 1.42f, 1.62f, 0.34f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_inf_veg(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.62f, 1.25f, 1.22f, 0.7f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_percolation(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.42f, 1.18f, 1.72f, 0.5f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_leak(uint8_t raw_index) {
  static const float values[5] = {1.0f, 1.45f, 0.74f, 1.56f, 0.66f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_ksat0(uint8_t raw_index) {
  static const float values[5] = {0.42f, 0.045f, 0.34f, 1.15f, 0.035f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_ksat1(uint8_t raw_index) {
  static const float values[5] = {0.09f, 0.012f, 0.08f, 0.26f, 0.01f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_gwk(uint8_t raw_index) {
  static const float values[5] = {0.018f, 0.004f, 0.014f, 0.032f, 0.0035f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_evap(uint8_t raw_index) {
  static const float values[5] = {1.0f, 1.18f, 0.86f, 1.08f, 1.26f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_nutrient_r(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.55f, 1.2f, 0.7f, 0.86f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_root_b(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.48f, 1.12f, 0.98f, 0.78f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_root_r(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.38f, 1.1f, 0.86f, 0.64f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_nutrient_b(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.62f, 1.14f, 0.76f, 0.92f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_litter_decomposition_factor(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.62f, 1.08f, 0.86f, 0.72f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_active_soc_decay_factor(uint8_t raw_index) {
  static const float values[5] = {1.0f, 1.0f, 1.08f, 0.82f, 1.0f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_cap0(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.48f, 1.34f, 0.7f, 1.12f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_cap1(uint8_t raw_index) {
  static const float values[5] = {1.0f, 0.38f, 1.28f, 0.72f, 0.96f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_theta_s(uint8_t raw_index) {
  static const float values[5] = {0.46f, 0.32f, 0.55f, 0.38f, 0.44f};
  return values[sim_substrate_index(raw_index)];
}

static inline float substrate_theta_r(uint8_t raw_index) {
  static const float values[5] = {0.08f, 0.06f, 0.1f, 0.035f, 0.12f};
  return values[sim_substrate_index(raw_index)];
}

static inline float sim_residual_saturation_fraction(uint8_t substrate) {
  const float theta_s = substrate_theta_s(substrate);
  const float theta_r = substrate_theta_r(substrate);
  return sim_clamp(theta_r / sim_max(theta_s, theta_r + 1.0e-6f), 0.0f, 0.72f);
}

static inline float sim_soil_layer_capacity(float depth, uint8_t substrate, int32_t layer) {
  if (layer == 0) {
    return 0.045f * depth * substrate_cap0(substrate);
  }
  return 0.16f * depth * substrate_cap1(substrate) * (layer == 1 ? 0.44f : 0.56f);
}

static inline float sim_soil_layer_thickness(float capacity, uint8_t substrate) {
  return capacity / sim_max(0.12f, substrate_theta_s(substrate));
}

static inline float sim_residual_storage(float capacity, uint8_t substrate) {
  return capacity * sim_residual_saturation_fraction(substrate);
}

static inline float sim_groundwater_capacity(float depth, uint8_t substrate) {
  return 0.14f * depth * substrate_cap1(substrate);
}

static inline float sim_groundwater_thickness(float capacity, uint8_t substrate) {
  return capacity / sim_max(0.12f, substrate_theta_s(substrate));
}

static inline float sim_temperature_response(float temp_c, float optimum_c, float min_c, float max_c) {
  return sim_temperature_response_raw(temp_c, optimum_c, min_c, max_c);
}

static inline float sim_lookup_linear_table(const float *SIM_RESTRICT table, int32_t max_index, float x) {
  if (x <= 0.0f) {
    return table[0];
  }
  const float max_value = (float)max_index;
  if (x >= max_value) {
    return table[max_index];
  }
  const int32_t index = (int32_t)x;
  const float fraction = x - (float)index;
  return table[index] + (table[index + 1] - table[index]) * fraction;
}

static inline float sim_fast_sin_periodic(float value) {
  const float inv_two_pi = 0.15915494309189535f;
  float wrapped = value * inv_two_pi;
  wrapped = wrapped - sim_floor(wrapped);
  const float x = wrapped * (float)SIM_FAST_TRIG_TABLE_SIZE;
  const int32_t index = (int32_t)x;
  const float fraction = x - (float)index;
  return sim_fast_sin_table[index] + (sim_fast_sin_table[index + 1] - sim_fast_sin_table[index]) * fraction;
}

static inline float sim_fast_cos_periodic(float value) {
  return sim_fast_sin_periodic(value + 1.5707963267948966f);
}

static inline float sim_fast_temperature_response(int32_t curve, float temp_c) {
  return sim_lookup_linear_table(
    sim_fast_temperature_response_table[curve],
    512,
    (temp_c + 20.0f) * (512.0f / 70.0f)
  );
}

static inline float sim_lookup_hydraulic_psi(
  const float *hydraulic_psi,
  int32_t lookup_steps,
  uint8_t raw_substrate,
  float saturation
) {
  const int32_t stride = lookup_steps + 1;
  const int32_t table_base = (int32_t)sim_substrate_index(raw_substrate) * stride;
  float x = sim_clamp(saturation, 0.0f, 1.0f) * (float)lookup_steps;
  int32_t index = (int32_t)x;
  if (index >= lookup_steps) {
    index = lookup_steps - 1;
  }
  if (index < 0) {
    index = 0;
  }
  const float fraction = x - (float)index;
  const int32_t lookup_index = table_base + index;
  return hydraulic_psi[lookup_index] + (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
}

static inline float sim_root_water_stress_from_psi(float psi_m, float wet_stress_m, float optimal_dry_m, float wilting_m) {
  const float suction = sim_max(0.0f, -psi_m);
  const float wet_stress = suction < wet_stress_m
    ? sim_clamp(0.24f + 0.76f * suction / sim_max(1.0e-6f, wet_stress_m), 0.0f, 1.0f)
    : 1.0f;
  const float dry_stress = suction <= optimal_dry_m
    ? 1.0f
    : sim_clamp((wilting_m - suction) / sim_max(1.0e-6f, wilting_m - optimal_dry_m), 0.0f, 1.0f);
  return sim_clamp(wet_stress * dry_stress, 0.0f, 1.0f);
}

static inline float sim_weighted_root_stress4(
  float f0,
  float f1,
  float f2,
  float f3,
  float s0,
  float s1,
  float s2,
  float s3,
  float substrate_factor
) {
  const float raw0 = sim_max(0.0f, f0);
  const float raw1 = sim_max(0.0f, f1);
  const float raw2 = sim_max(0.0f, f2);
  const float raw3 = sim_max(0.0f, f3);
  const float total = raw0 + raw1 + raw2 + raw3;
  if (total <= 1.0e-12f) {
    return 0.0f;
  }
  return sim_clamp(((raw0 * s0 + raw1 * s1 + raw2 * s2 + raw3 * s3) / total) * substrate_factor, 0.0f, 1.0f);
}

static inline float sim_nutrient_stress(float mineral_n, float substrate_factor) {
  const float half_saturation = 0.16f;
  const float available = sim_max(0.0f, mineral_n);
  const float substrate = sim_clamp(substrate_factor, 0.25f, 1.45f);
  return sim_clamp(0.12f + 0.88f * substrate * available / (available + half_saturation), 0.0f, 1.0f);
}

static inline void sim_partition_apar(
  float par,
  float lai_b,
  float lai_r,
  float baobab_extinction,
  float rose_extinction,
  float cover,
  float *total_apar,
  float *baobab_apar,
  float *rose_apar
) {
  const float optical_depth_b = baobab_extinction * sim_max(0.0f, lai_b);
  const float optical_depth_r = rose_extinction * sim_max(0.0f, lai_r);
  const float optical_depth_total = optical_depth_b + optical_depth_r;
  if (par <= 0.0f || optical_depth_total <= 1.0e-9f) {
    *total_apar = 0.0f;
    *baobab_apar = 0.0f;
    *rose_apar = 0.0f;
    return;
  }
  const float total = par * cover;
  *total_apar = total;
  *baobab_apar = total * optical_depth_b / optical_depth_total;
  *rose_apar = total * optical_depth_r / optical_depth_total;
}

typedef struct {
  int32_t index;
  float fraction;
} SimPhotoTempLookup;

static inline SimPhotoTempLookup sim_photosynthesis_temperature_lookup(
  int32_t lookup_steps,
  float temp_min_c,
  float temp_lookup_scale,
  float temp_c
) {
  SimPhotoTempLookup lookup;
  if (lookup_steps <= 1) {
    lookup.index = 0;
    lookup.fraction = 0.0f;
    return lookup;
  }
  float scaled = (temp_c - temp_min_c) * temp_lookup_scale;
  if (scaled <= 0.0f) {
    lookup.index = 0;
    lookup.fraction = 0.0f;
    return lookup;
  }
  const int32_t last = lookup_steps - 1;
  if (scaled >= (float)last) {
    lookup.index = last;
    lookup.fraction = 0.0f;
    return lookup;
  }
  const int32_t index = (int32_t)scaled;
  lookup.index = index;
  lookup.fraction = scaled - (float)index;
  return lookup;
}

static inline float sim_lookup_photosynthesis_temperature_cached(
  const float *values,
  SimPhotoTempLookup lookup
) {
  const int32_t index = lookup.index;
  const float fraction = lookup.fraction;
  return fraction == 0.0f ? values[index] : values[index] + (values[index + 1] - values[index]) * fraction;
}

static inline float sim_lookup_photosynthesis_temperature(
  const float *values,
  int32_t lookup_steps,
  float temp_min_c,
  float temp_lookup_scale,
  float temp_c
) {
  return sim_lookup_photosynthesis_temperature_cached(
    values,
    sim_photosynthesis_temperature_lookup(lookup_steps, temp_min_c, temp_lookup_scale, temp_c)
  );
}

static inline float sim_net_radiation_mj_m2_day(float par_mol_m2_day, float cover, float rain_rate_m_day) {
  const float shortwave = (sim_max(0.0f, par_mol_m2_day) * 0.218f) / 0.45f;
  const float albedo = sim_clamp(0.22f - 0.06f * cover + 0.04f * sim_clamp(rain_rate_m_day * 700.0f, 0.0f, 1.0f), 0.12f, 0.31f);
  const float cloud_longwave_reduction = 0.04f + 0.12f * sim_clamp(rain_rate_m_day * 650.0f, 0.0f, 1.0f);
  return sim_max(0.0f, (1.0f - albedo) * shortwave * (0.72f - cloud_longwave_reduction));
}

static inline float sim_aerodynamic_conductance_mps(float lai) {
  const float ref = 1.65f / 208.0f;
  return sim_clamp(ref * (0.72f + 0.18f * 1.65f + 0.12f * sim_sqrt(sim_max(0.0f, lai))), 0.0035f, 0.018f);
}

static inline float sim_penman_monteith_m_with_delta(
  float temp_c,
  float vpd_kpa,
  float net_radiation_mj_m2_day,
  float surface_conductance_mps,
  float aerodynamic_conductance_mps,
  float delta
);

static inline float sim_canopy_transpiration_demand_with_delta(
  float temp_c,
  float vpd_kpa,
  float net_radiation,
  float lai,
  float stomatal_conductance_mps,
  float species_factor,
  float delta
);

static inline float sim_penman_monteith_m_with_delta(
  float temp_c,
  float vpd_kpa,
  float net_radiation_mj_m2_day,
  float surface_conductance_mps,
  float aerodynamic_conductance_mps,
  float delta
) {
  if (net_radiation_mj_m2_day <= 0.0f && vpd_kpa <= 0.0f) {
    return 0.0f;
  }
  const float reference_aero = 1.65f / 208.0f;
  const float aerodynamic_ratio = sim_clamp(aerodynamic_conductance_mps / reference_aero, 0.15f, 3.2f);
  const float wind = 1.65f * aerodynamic_ratio;
  const float resistance_ratio = surface_conductance_mps > 1.0e-7f
    ? sim_clamp(aerodynamic_conductance_mps / surface_conductance_mps, 0.02f, 180.0f)
    : 180.0f;
  const float numerator =
    0.408f * delta * net_radiation_mj_m2_day +
    0.066f * (900.0f / (temp_c + 273.15f)) * wind * sim_max(0.0f, vpd_kpa);
  const float denominator = delta + 0.066f * (1.0f + resistance_ratio);
  return sim_max(0.0f, numerator / sim_max(1.0e-6f, denominator)) / 1000.0f;
}

static inline float sim_canopy_transpiration_demand_with_delta(
  float temp_c,
  float vpd_kpa,
  float net_radiation,
  float lai,
  float stomatal_conductance_mps,
  float species_factor,
  float delta
) {
  if (lai <= 0.0f || stomatal_conductance_mps <= 0.0f) {
    return 0.0f;
  }
  const float active_canopy = 1.0f - sim_exp(-0.55f * lai);
  return species_factor * sim_penman_monteith_m_with_delta(
    temp_c,
    vpd_kpa,
    net_radiation * active_canopy,
    stomatal_conductance_mps,
    sim_aerodynamic_conductance_mps(lai),
    delta
  );
}

static inline float sim_plant_water_potential_m(float wet_stress_m, float optimal_dry_m, float wilting_m, float demand_m_day, float vpd_kpa) {
  const float demand_mm_day = sim_max(0.0f, demand_m_day) * 1000.0f;
  const float base_pull = optimal_dry_m * 0.12f;
  const float demand_pull = optimal_dry_m * 0.16f * sim_log1p(demand_mm_day * 36.0f);
  const float atmosphere_pull = optimal_dry_m * 0.075f * sim_max(0.0f, vpd_kpa);
  return -sim_clamp(base_pull + demand_pull + atmosphere_pull, wet_stress_m, wilting_m * 0.92f);
}

static inline void sim_root_hydraulic_uptake4(
  float *out0,
  float *out1,
  float *out2,
  float *out3,
  float demand,
  float rf0,
  float rf1,
  float rf2,
  float rf3,
  float ls0,
  float ls1,
  float ls2,
  float ls3,
  float k0,
  float k1,
  float k2,
  float k3,
  float sat0,
  float sat1,
  float sat2,
  float sat3,
  float psi0,
  float psi1,
  float psi2,
  float psi3,
  float plant_psi,
  float potential_scale_m,
  float substrate_factor,
  float multiplier
) {
  const float inv_scale = 1.0f / sim_max(1.0e-6f, potential_scale_m);
  const float p0 = sim_clamp((psi0 - plant_psi) * inv_scale, 0.0f, 2.4f);
  const float p1 = sim_clamp((psi1 - plant_psi) * inv_scale, 0.0f, 2.4f);
  const float p2 = sim_clamp((psi2 - plant_psi) * inv_scale, 0.0f, 2.4f);
  const float p3 = sim_clamp((psi3 - plant_psi) * inv_scale, 0.0f, 2.4f);
  const float s0 = 0.18f + 0.82f * sim_clamp(sat0, 0.0f, 1.0f);
  const float s1 = 0.18f + 0.82f * sim_clamp(sat1, 0.0f, 1.0f);
  const float s2 = 0.18f + 0.82f * sim_clamp(sat2, 0.0f, 1.0f);
  const float s3 = 0.18f + 0.82f * sim_clamp(sat3, 0.0f, 1.0f);
  const float w0 = sim_max(0.0f, rf0 * ls0 * s0 * p0);
  const float w1 = sim_max(0.0f, rf1 * ls1 * s1 * p1);
  const float w2 = sim_max(0.0f, rf2 * ls2 * s2 * p2);
  const float w3 = sim_max(0.0f, rf3 * ls3 * s3 * p3);
  const float total = w0 + w1 + w2 + w3;
  if (total <= 1.0e-12f) {
    *out0 = 0.0f;
    *out1 = 0.0f;
    *out2 = 0.0f;
    *out3 = 0.0f;
    return;
  }
  const float demand_scale = demand / total;
  const float supply_scale = multiplier * substrate_factor;
  const float supply0 = supply_scale * rf0 * ls0 * p0 * (0.0038f + 0.32f * sim_max(0.0f, k0)) * s0;
  const float supply1 = supply_scale * rf1 * ls1 * p1 * (0.0038f + 0.32f * sim_max(0.0f, k1)) * s1;
  const float supply2 = supply_scale * rf2 * ls2 * p2 * (0.0038f + 0.32f * sim_max(0.0f, k2)) * s2;
  const float supply3 = supply_scale * rf3 * ls3 * p3 * (0.0038f + 0.32f * sim_max(0.0f, k3)) * s3;
  *out0 = sim_min(w0 * demand_scale, sim_max(0.0f, supply0));
  *out1 = sim_min(w1 * demand_scale, sim_max(0.0f, supply1));
  *out2 = sim_min(w2 * demand_scale, sim_max(0.0f, supply2));
  *out3 = sim_min(w3 * demand_scale, sim_max(0.0f, supply3));
}

static inline float sim_hydraulic_stress_from_uptake(float uptake_m_day, float demand_m_day, float baseline_stress) {
  if (demand_m_day <= 1.0e-9f) {
    return baseline_stress;
  }
  return sim_clamp(sim_min(baseline_stress, 0.08f + 0.92f * sim_clamp(uptake_m_day / demand_m_day, 0.0f, 1.0f)), 0.0f, 1.0f);
}

static inline void sim_canopy_photosynthesis_cached(
  float par,
  float lai,
  SimPhotoTempLookup temp_lookup,
  float water_stress,
  float vpd_kpa,
  float nutrient,
  float multiplier,
  float apar_mol_m2_day,
  float atmospheric_co2,
  const float *vcmax_table,
  const float *jmax_table,
  const float *rd_table,
  const float *gamma_star_table,
  const float *kc_table,
  const float *ko_table,
  float quantum_yield,
  float curvature,
  float ci_min,
  float ci_max,
  float extinction,
  float g0_mol,
  float g1,
  float max_conductance_mps,
  float *out_gpp,
  float *out_conductance_mps,
  float *out_ci
) {
  const float ca = sim_clamp(atmospheric_co2, 180.0f, 1200.0f);
  const float ci_lower = ci_min * ca;
  const float ci_upper = ci_max * ca;
  const float available_par = apar_mol_m2_day >= 0.0f ? apar_mol_m2_day : par;
  if (available_par <= 0.0f || lai <= 0.0f || water_stress <= 0.0f || nutrient <= 0.0f) {
    *out_gpp = 0.0f;
    *out_conductance_mps = 0.0f;
    const float previous_ci = *out_ci;
    *out_ci = previous_ci == previous_ci && previous_ci >= ci_lower && previous_ci <= ci_upper
      ? previous_ci
      : ci_lower;
    return;
  }

  const float vcmax = sim_lookup_photosynthesis_temperature_cached(vcmax_table, temp_lookup);
  const float jmax = sim_lookup_photosynthesis_temperature_cached(jmax_table, temp_lookup);
  (void)rd_table;
  const float gamma_star = sim_lookup_photosynthesis_temperature_cached(gamma_star_table, temp_lookup);
  const float kc = sim_lookup_photosynthesis_temperature_cached(kc_table, temp_lookup);
  const float ko = sim_lookup_photosynthesis_temperature_cached(ko_table, temp_lookup);

  const float hydraulic_stress = sim_clamp(water_stress, 0.0f, 1.0f);
  const float nutrient_stress = sim_clamp(nutrient, 0.0f, 1.0f);
  const float biochemical_stress = hydraulic_stress * nutrient_stress * sim_max(0.0f, multiplier);
  const float sqrt_d = sim_sqrt(sim_max(0.05f, vpd_kpa));
  const float inv_ca = 1.0f / ca;
  const float inv_mps_to_mol_co2 = 1.0f / (0.02445f * 1.6f);
  const float gpp_scale = 43200.0f * 1.0e-6f * 0.012f;
  const float heuristic_ci =
    ca * (ci_min + (ci_max - ci_min) * hydraulic_stress / (1.0f + 0.18f * sim_max(0.0f, vpd_kpa)));
  const float previous_ci = *out_ci;
  float ci = previous_ci == previous_ci && previous_ci >= ci_lower && previous_ci <= ci_upper
    ? previous_ci
    : heuristic_ci;
  float assimilation = 0.0f;
  float conductance_mps = 0.0f;
  const float absorbed_par_mol_m2_day =
    apar_mol_m2_day >= 0.0f ? sim_max(0.0f, apar_mol_m2_day) : sim_max(0.0f, par) * (1.0f - sim_exp(-extinction * sim_max(0.0f, lai)));
  const float par_umol_m2_s = absorbed_par_mol_m2_day * (1000000.0f / 43200.0f);
  const float absorbed_par = par_umol_m2_s * quantum_yield;
  const float electron_term = absorbed_par + jmax;
  const float discriminant = sim_max(0.0f, electron_term * electron_term - 4.0f * curvature * absorbed_par * jmax);
  const float electron_transport = (electron_term - sim_sqrt(discriminant)) * (0.5f / curvature);
  const float rubisco_denom_constant = kc * (1.0f + 210000.0f / ko);

  SIM_UNROLL_LOOP
  for (int32_t iteration = 0; iteration < SIM_PHOTOSYNTHESIS_PICARD_ITERATIONS; iteration += 1) {
    const float positive_ci_delta = sim_max(0.0f, ci - gamma_star);
    const float rubisco_limited = vcmax * positive_ci_delta / (ci + rubisco_denom_constant);
    const float electron_limited = electron_transport * positive_ci_delta / (4.0f * (ci + 2.0f * gamma_star));
    assimilation = sim_max(0.0f, sim_min(rubisco_limited, electron_limited));
    const float effective_assimilation = sim_max(0.0f, assimilation * biochemical_stress);
    const float stomatal_mol =
      (g0_mol + (1.0f + g1 / sqrt_d) * effective_assimilation * inv_ca) *
      hydraulic_stress *
      (0.22f + 0.78f * nutrient_stress);
    conductance_mps = sim_clamp(stomatal_mol * 0.02445f, 0.0f, max_conductance_mps);
    const float conductance_co2_mol = sim_max(1.0e-5f, conductance_mps * inv_mps_to_mol_co2);
    ci = sim_clamp(ca - effective_assimilation / conductance_co2_mol, ci_lower, ci_upper);
  }

  const float positive_ci_delta = sim_max(0.0f, ci - gamma_star);
  const float rubisco_limited = vcmax * positive_ci_delta / (ci + rubisco_denom_constant);
  const float electron_limited = electron_transport * positive_ci_delta / (4.0f * (ci + 2.0f * gamma_star));
  const float final_assimilation = sim_max(0.0f, sim_min(rubisco_limited, electron_limited));
  *out_gpp = final_assimilation * gpp_scale * biochemical_stress;
  *out_conductance_mps = conductance_mps;
  *out_ci = ci;
}

static inline void sim_canopy_photosynthesis(
  float par,
  float lai,
  float temp_c,
  float water_stress,
  float vpd_kpa,
  float nutrient,
  float multiplier,
  float apar_mol_m2_day,
  float atmospheric_co2,
  int32_t lookup_steps,
  float temp_min_c,
  float temp_lookup_scale,
  const float *vcmax_table,
  const float *jmax_table,
  const float *rd_table,
  const float *gamma_star_table,
  const float *kc_table,
  const float *ko_table,
  float quantum_yield,
  float curvature,
  float ci_min,
  float ci_max,
  float extinction,
  float g0_mol,
  float g1,
  float max_conductance_mps,
  float *out_gpp,
  float *out_conductance_mps,
  float *out_ci
) {
  const SimPhotoTempLookup temp_lookup =
    sim_photosynthesis_temperature_lookup(lookup_steps, temp_min_c, temp_lookup_scale, temp_c);
  sim_canopy_photosynthesis_cached(
    par,
    lai,
    temp_lookup,
    water_stress,
    vpd_kpa,
    nutrient,
    multiplier,
    apar_mol_m2_day,
    atmospheric_co2,
    vcmax_table,
    jmax_table,
    rd_table,
    gamma_star_table,
    kc_table,
    ko_table,
    quantum_yield,
    curvature,
    ci_min,
    ci_max,
    extinction,
    g0_mol,
    g1,
    max_conductance_mps,
    out_gpp,
    out_conductance_mps,
    out_ci
  );
}

SIM_EXPORT void sim_prepare_photosynthesis_inputs(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t hydraulic_lookup_steps,
  float root_depth,
  float storage,
  uintptr_t hydraulic_psi_offset,
  uintptr_t substrate_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t baobab_stem_offset,
  uintptr_t baobab_root_offset,
  uintptr_t baobab_store_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t h_offset,
  uintptr_t rose_fertility_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t par_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t apar_total_offset,
  uintptr_t apar_baobab_offset,
  uintptr_t apar_rose_offset,
  uintptr_t photo_water_stress_baobab_offset,
  uintptr_t photo_water_stress_rose_offset,
  uintptr_t photo_nutrient_baobab_offset,
  uintptr_t photo_nutrient_rose_offset
) {
  const int32_t *active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *hydraulic_psi = (const float *)(uintptr_t)hydraulic_psi_offset;
  const uint8_t *substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *baobab_stem = (const float *)(uintptr_t)baobab_stem_offset;
  const float *baobab_root = (const float *)(uintptr_t)baobab_root_offset;
  const float *baobab_store = (const float *)(uintptr_t)baobab_store_offset;
  const float *rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  const float *rose_root = (const float *)(uintptr_t)rose_root_offset;
  const float *h = (const float *)(uintptr_t)h_offset;
  const float *rose_fertility = (const float *)(uintptr_t)rose_fertility_offset;
  const float *soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  const float *par = (const float *)(uintptr_t)par_offset;
  const float *lai_baobab = (const float *)(uintptr_t)lai_baobab_offset;
  const float *lai_rose = (const float *)(uintptr_t)lai_rose_offset;
  const float *vegetation_cover = (const float *)(uintptr_t)vegetation_cover_offset;
  float *apar_total = (float *)(uintptr_t)apar_total_offset;
  float *apar_baobab = (float *)(uintptr_t)apar_baobab_offset;
  float *apar_rose = (float *)(uintptr_t)apar_rose_offset;
  float *photo_water_stress_baobab = (float *)(uintptr_t)photo_water_stress_baobab_offset;
  float *photo_water_stress_rose = (float *)(uintptr_t)photo_water_stress_rose_offset;
  float *photo_nutrient_baobab = (float *)(uintptr_t)photo_nutrient_baobab_offset;
  float *photo_nutrient_rose = (float *)(uintptr_t)photo_nutrient_rose_offset;

  const int32_t size2 = size * 2;
  const float deep_bias = sim_clamp((root_depth - 1.0f) / 7.0f, 0.0f, 1.0f);
  (void)vegetation_cover;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const uint8_t sub = substrate[i];
    const float sat0 = sim_clamp(soil_water[i] / soil_cap[i], 0.0f, 1.0f);
    const float sat1 = sim_clamp(soil_water[layer1_index] / soil_cap[layer1_index], 0.0f, 1.0f);
    const float sat2 = sim_clamp(soil_water[layer2_index] / soil_cap[layer2_index], 0.0f, 1.0f);
    const float gw_sat = sim_clamp(groundwater_storage[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float baobab_mass = baobab_leaf[i] + baobab_stem[i] + baobab_root[i];
    const float rose_mass = rose_leaf[i] + rose_flower[i] + rose_root[i];
    const float baobab_root_frac = baobab_mass > 0.0f ? baobab_root[i] / baobab_mass : 0.42f;
    const float rose_root_frac = rose_mass > 0.0f ? rose_root[i] / rose_mass : 0.24f;

    const float psi0 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat0);
    const float psi1 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat1);
    const float psi2 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat2);
    const float layer_stress_b0 = sim_root_water_stress_from_psi(psi0, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b1 = sim_root_water_stress_from_psi(psi1, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b2 = sim_root_water_stress_from_psi(psi2, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b3 = sim_clamp(0.18f + 0.82f * gw_sat, 0.0f, 1.0f);
    const float layer_stress_r0 = sim_root_water_stress_from_psi(psi0, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r1 = sim_root_water_stress_from_psi(psi1, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r2 = sim_root_water_stress_from_psi(psi2, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r3 = sim_root_water_stress_from_psi(0.0f, 0.05f, 18.0f, 82.0f);

    const float structural_bias = sim_clamp((baobab_root_frac - 0.32f) / 0.36f, 0.0f, 1.0f);
    const float root_water_b = sim_weighted_root_stress4(
      0.34f - 0.22f * deep_bias,
      0.24f + 0.01f * structural_bias,
      0.25f + 0.13f * deep_bias + 0.05f * structural_bias,
      0.17f + 0.16f * deep_bias + 0.05f * structural_bias,
      layer_stress_b0,
      layer_stress_b1,
      layer_stress_b2,
      layer_stress_b3,
      substrate_root_b(sub)
    );
    const float rose_deeper = sim_clamp((rose_root_frac - 0.2f) / 0.26f, 0.0f, 1.0f);
    const float root_water_r = sim_weighted_root_stress4(
      0.82f - 0.1f * rose_deeper,
      0.16f + 0.08f * rose_deeper,
      0.02f + 0.02f * rose_deeper,
      0.0f,
      layer_stress_r0,
      layer_stress_r1,
      layer_stress_r2,
      layer_stress_r3,
      substrate_root_r(sub)
    );

    const float store_cap = storage * (1.14f * sim_max(0.0f, baobab_stem[i]) + 0.54f * sim_max(0.0f, baobab_root[i]) + 0.035f);
    const float store_norm = store_cap > 0.0f ? sim_clamp(baobab_store[i] / store_cap, 0.0f, 1.0f) : 0.0f;
    const float rose_soil = rose_fertility[i];
    const float nutrient_b = sim_nutrient_stress(soil_mineral_n[i], substrate_nutrient_b(sub));
    const float rose_site_nutrient = substrate_nutrient_r(sub) * sim_clamp(0.45f + 0.55f * rose_soil, 0.32f, 1.45f);
    const float nutrient_r = sim_nutrient_stress(soil_mineral_n[i], rose_site_nutrient);
    photo_water_stress_baobab[i] = sim_clamp(0.06f + 0.78f * root_water_b + 0.22f * store_norm, 0.0f, 1.0f);
    photo_water_stress_rose[i] = sim_rose_water_stress_with_waterlogging(root_water_r, rose_soil, h[i], sat0);
    photo_nutrient_baobab[i] = nutrient_b;
    photo_nutrient_rose[i] = nutrient_r;

    const float lai_b = lai_baobab[i];
    const float lai_r = lai_rose[i];
    const float cover = 1.0f - sim_exp(-(0.58f * sim_max(0.0f, lai_b) + 0.68f * sim_max(0.0f, lai_r)));
    float total_apar = 0.0f;
    float baobab_apar = 0.0f;
    float rose_apar = 0.0f;
    sim_partition_apar(
      par[i],
      lai_b,
      lai_r,
      0.58f,
      0.68f,
      cover,
      &total_apar,
      &baobab_apar,
      &rose_apar
    );
    apar_total[i] = total_apar;
    apar_baobab[i] = baobab_apar;
    apar_rose[i] = rose_apar;
  }
}

SIM_EXPORT void sim_update_photosynthesis(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t lookup_steps,
  float temp_min_c,
  float temp_lookup_scale,
  float atmospheric_co2,
  float baobab_quantum_yield,
  float baobab_curvature,
  float baobab_ci_min,
  float baobab_ci_max,
  float baobab_extinction,
  float baobab_g0_mol,
  float baobab_g1,
  float baobab_max_conductance_mps,
  float baobab_multiplier,
  float rose_quantum_yield,
  float rose_curvature,
  float rose_ci_min,
  float rose_ci_max,
  float rose_extinction,
  float rose_g0_mol,
  float rose_g1,
  float rose_max_conductance_mps,
  float rose_multiplier,
  uintptr_t baobab_vcmax_offset,
  uintptr_t baobab_jmax_offset,
  uintptr_t baobab_rd_offset,
  uintptr_t baobab_gamma_star_offset,
  uintptr_t baobab_kc_offset,
  uintptr_t baobab_ko_offset,
  uintptr_t rose_vcmax_offset,
  uintptr_t rose_jmax_offset,
  uintptr_t rose_rd_offset,
  uintptr_t rose_gamma_star_offset,
  uintptr_t rose_kc_offset,
  uintptr_t rose_ko_offset,
  uintptr_t par_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t water_stress_baobab_offset,
  uintptr_t water_stress_rose_offset,
  uintptr_t vpd_kpa_offset,
  uintptr_t nutrient_baobab_offset,
  uintptr_t nutrient_rose_offset,
  uintptr_t apar_baobab_offset,
  uintptr_t apar_rose_offset,
  uintptr_t gpp_baobab_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t conductance_baobab_offset,
  uintptr_t conductance_rose_offset,
  uintptr_t ci_baobab_offset,
  uintptr_t ci_rose_offset
) {
  (void)size;
  const int32_t *active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *baobab_vcmax = (const float *)(uintptr_t)baobab_vcmax_offset;
  const float *baobab_jmax = (const float *)(uintptr_t)baobab_jmax_offset;
  const float *baobab_rd = (const float *)(uintptr_t)baobab_rd_offset;
  const float *baobab_gamma_star = (const float *)(uintptr_t)baobab_gamma_star_offset;
  const float *baobab_kc = (const float *)(uintptr_t)baobab_kc_offset;
  const float *baobab_ko = (const float *)(uintptr_t)baobab_ko_offset;
  const float *rose_vcmax = (const float *)(uintptr_t)rose_vcmax_offset;
  const float *rose_jmax = (const float *)(uintptr_t)rose_jmax_offset;
  const float *rose_rd = (const float *)(uintptr_t)rose_rd_offset;
  const float *rose_gamma_star = (const float *)(uintptr_t)rose_gamma_star_offset;
  const float *rose_kc = (const float *)(uintptr_t)rose_kc_offset;
  const float *rose_ko = (const float *)(uintptr_t)rose_ko_offset;
  const float *par = (const float *)(uintptr_t)par_offset;
  const float *lai_baobab = (const float *)(uintptr_t)lai_baobab_offset;
  const float *lai_rose = (const float *)(uintptr_t)lai_rose_offset;
  const float *surface_temp_c = (const float *)(uintptr_t)surface_temp_c_offset;
  const float *water_stress_baobab = (const float *)(uintptr_t)water_stress_baobab_offset;
  const float *water_stress_rose = (const float *)(uintptr_t)water_stress_rose_offset;
  const float *vpd_kpa = (const float *)(uintptr_t)vpd_kpa_offset;
  const float *nutrient_baobab = (const float *)(uintptr_t)nutrient_baobab_offset;
  const float *nutrient_rose = (const float *)(uintptr_t)nutrient_rose_offset;
  const float *apar_baobab = (const float *)(uintptr_t)apar_baobab_offset;
  const float *apar_rose = (const float *)(uintptr_t)apar_rose_offset;
  float *gpp_baobab = (float *)(uintptr_t)gpp_baobab_offset;
  float *gpp_rose = (float *)(uintptr_t)gpp_rose_offset;
  float *conductance_baobab = (float *)(uintptr_t)conductance_baobab_offset;
  float *conductance_rose = (float *)(uintptr_t)conductance_rose_offset;
  float *ci_baobab = (float *)(uintptr_t)ci_baobab_offset;
  float *ci_rose = (float *)(uintptr_t)ci_rose_offset;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    sim_canopy_photosynthesis(
      par[i],
      lai_baobab[i],
      surface_temp_c[i],
      water_stress_baobab[i],
      vpd_kpa[i],
      nutrient_baobab[i],
      baobab_multiplier,
      apar_baobab[i],
      atmospheric_co2,
      lookup_steps,
      temp_min_c,
      temp_lookup_scale,
      baobab_vcmax,
      baobab_jmax,
      baobab_rd,
      baobab_gamma_star,
      baobab_kc,
      baobab_ko,
      baobab_quantum_yield,
      baobab_curvature,
      baobab_ci_min,
      baobab_ci_max,
      baobab_extinction,
      baobab_g0_mol,
      baobab_g1,
      baobab_max_conductance_mps,
      &gpp_baobab[i],
      &conductance_baobab[i],
      &ci_baobab[i]
    );
    sim_canopy_photosynthesis(
      par[i],
      lai_rose[i],
      surface_temp_c[i],
      water_stress_rose[i],
      vpd_kpa[i],
      nutrient_rose[i],
      rose_multiplier,
      apar_rose[i],
      atmospheric_co2,
      lookup_steps,
      temp_min_c,
      temp_lookup_scale,
      rose_vcmax,
      rose_jmax,
      rose_rd,
      rose_gamma_star,
      rose_kc,
      rose_ko,
      rose_quantum_yield,
      rose_curvature,
      rose_ci_min,
      rose_ci_max,
      rose_extinction,
      rose_g0_mol,
      rose_g1,
      rose_max_conductance_mps,
      &gpp_rose[i],
      &conductance_rose[i],
      &ci_rose[i]
    );
  }
}

SIM_EXPORT void sim_prepare_and_update_photosynthesis(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t hydraulic_lookup_steps,
  int32_t photo_lookup_steps,
  float photo_temp_min_c,
  float photo_temp_lookup_scale,
  float root_depth,
  float storage,
  float atmospheric_co2,
  float baobab_quantum_yield,
  float baobab_curvature,
  float baobab_ci_min,
  float baobab_ci_max,
  float baobab_extinction,
  float baobab_g0_mol,
  float baobab_g1,
  float baobab_max_conductance_mps,
  float baobab_multiplier,
  float rose_quantum_yield,
  float rose_curvature,
  float rose_ci_min,
  float rose_ci_max,
  float rose_extinction,
  float rose_g0_mol,
  float rose_g1,
  float rose_max_conductance_mps,
  float rose_multiplier,
  uintptr_t hydraulic_psi_offset,
  uintptr_t baobab_vcmax_offset,
  uintptr_t baobab_jmax_offset,
  uintptr_t baobab_rd_offset,
  uintptr_t baobab_gamma_star_offset,
  uintptr_t baobab_kc_offset,
  uintptr_t baobab_ko_offset,
  uintptr_t rose_vcmax_offset,
  uintptr_t rose_jmax_offset,
  uintptr_t rose_rd_offset,
  uintptr_t rose_gamma_star_offset,
  uintptr_t rose_kc_offset,
  uintptr_t rose_ko_offset,
  uintptr_t substrate_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t baobab_stem_offset,
  uintptr_t baobab_root_offset,
  uintptr_t baobab_store_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t h_offset,
  uintptr_t rose_fertility_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t par_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t vpd_kpa_offset,
  uintptr_t apar_total_offset,
  uintptr_t apar_baobab_offset,
  uintptr_t apar_rose_offset,
  uintptr_t photo_water_stress_baobab_offset,
  uintptr_t photo_water_stress_rose_offset,
  uintptr_t photo_nutrient_baobab_offset,
  uintptr_t photo_nutrient_rose_offset,
  uintptr_t gpp_baobab_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t conductance_baobab_offset,
  uintptr_t conductance_rose_offset,
  uintptr_t ci_baobab_offset,
  uintptr_t ci_rose_offset
) {
  const int32_t *active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *hydraulic_psi = (const float *)(uintptr_t)hydraulic_psi_offset;
  const float *baobab_vcmax = (const float *)(uintptr_t)baobab_vcmax_offset;
  const float *baobab_jmax = (const float *)(uintptr_t)baobab_jmax_offset;
  const float *baobab_rd = (const float *)(uintptr_t)baobab_rd_offset;
  const float *baobab_gamma_star = (const float *)(uintptr_t)baobab_gamma_star_offset;
  const float *baobab_kc = (const float *)(uintptr_t)baobab_kc_offset;
  const float *baobab_ko = (const float *)(uintptr_t)baobab_ko_offset;
  const float *rose_vcmax = (const float *)(uintptr_t)rose_vcmax_offset;
  const float *rose_jmax = (const float *)(uintptr_t)rose_jmax_offset;
  const float *rose_rd = (const float *)(uintptr_t)rose_rd_offset;
  const float *rose_gamma_star = (const float *)(uintptr_t)rose_gamma_star_offset;
  const float *rose_kc = (const float *)(uintptr_t)rose_kc_offset;
  const float *rose_ko = (const float *)(uintptr_t)rose_ko_offset;
  const uint8_t *substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *baobab_stem = (const float *)(uintptr_t)baobab_stem_offset;
  const float *baobab_root = (const float *)(uintptr_t)baobab_root_offset;
  const float *baobab_store = (const float *)(uintptr_t)baobab_store_offset;
  const float *rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  const float *rose_root = (const float *)(uintptr_t)rose_root_offset;
  const float *h = (const float *)(uintptr_t)h_offset;
  const float *rose_fertility = (const float *)(uintptr_t)rose_fertility_offset;
  const float *soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  const float *par = (const float *)(uintptr_t)par_offset;
  const float *lai_baobab = (const float *)(uintptr_t)lai_baobab_offset;
  const float *lai_rose = (const float *)(uintptr_t)lai_rose_offset;
  const float *vegetation_cover = (const float *)(uintptr_t)vegetation_cover_offset;
  const float *surface_temp_c = (const float *)(uintptr_t)surface_temp_c_offset;
  const float *vpd_kpa = (const float *)(uintptr_t)vpd_kpa_offset;
  float *apar_total = (float *)(uintptr_t)apar_total_offset;
  float *apar_baobab = (float *)(uintptr_t)apar_baobab_offset;
  float *apar_rose = (float *)(uintptr_t)apar_rose_offset;
  float *photo_water_stress_baobab = (float *)(uintptr_t)photo_water_stress_baobab_offset;
  float *photo_water_stress_rose = (float *)(uintptr_t)photo_water_stress_rose_offset;
  float *photo_nutrient_baobab = (float *)(uintptr_t)photo_nutrient_baobab_offset;
  float *photo_nutrient_rose = (float *)(uintptr_t)photo_nutrient_rose_offset;
  float *gpp_baobab = (float *)(uintptr_t)gpp_baobab_offset;
  float *gpp_rose = (float *)(uintptr_t)gpp_rose_offset;
  float *conductance_baobab = (float *)(uintptr_t)conductance_baobab_offset;
  float *conductance_rose = (float *)(uintptr_t)conductance_rose_offset;
  float *ci_baobab = (float *)(uintptr_t)ci_baobab_offset;
  float *ci_rose = (float *)(uintptr_t)ci_rose_offset;

  const int32_t size2 = size * 2;
  const float deep_bias = sim_clamp((root_depth - 1.0f) / 7.0f, 0.0f, 1.0f);

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const uint8_t sub = substrate[i];
    const float sat0 = sim_clamp(soil_water[i] / soil_cap[i], 0.0f, 1.0f);
    const float sat1 = sim_clamp(soil_water[layer1_index] / soil_cap[layer1_index], 0.0f, 1.0f);
    const float sat2 = sim_clamp(soil_water[layer2_index] / soil_cap[layer2_index], 0.0f, 1.0f);
    const float gw_sat = sim_clamp(groundwater_storage[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float baobab_mass = baobab_leaf[i] + baobab_stem[i] + baobab_root[i];
    const float rose_mass = rose_leaf[i] + rose_flower[i] + rose_root[i];
    const float baobab_root_frac = baobab_mass > 0.0f ? baobab_root[i] / baobab_mass : 0.42f;
    const float rose_root_frac = rose_mass > 0.0f ? rose_root[i] / rose_mass : 0.24f;

    const float psi0 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat0);
    const float psi1 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat1);
    const float psi2 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat2);
    const float layer_stress_b0 = sim_root_water_stress_from_psi(psi0, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b1 = sim_root_water_stress_from_psi(psi1, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b2 = sim_root_water_stress_from_psi(psi2, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b3 = sim_clamp(0.18f + 0.82f * gw_sat, 0.0f, 1.0f);
    const float layer_stress_r0 = sim_root_water_stress_from_psi(psi0, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r1 = sim_root_water_stress_from_psi(psi1, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r2 = sim_root_water_stress_from_psi(psi2, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r3 = sim_root_water_stress_from_psi(0.0f, 0.05f, 18.0f, 82.0f);

    const float structural_bias = sim_clamp((baobab_root_frac - 0.32f) / 0.36f, 0.0f, 1.0f);
    const float root_water_b = sim_weighted_root_stress4(
      0.34f - 0.22f * deep_bias,
      0.24f + 0.01f * structural_bias,
      0.25f + 0.13f * deep_bias + 0.05f * structural_bias,
      0.17f + 0.16f * deep_bias + 0.05f * structural_bias,
      layer_stress_b0,
      layer_stress_b1,
      layer_stress_b2,
      layer_stress_b3,
      substrate_root_b(sub)
    );
    const float rose_deeper = sim_clamp((rose_root_frac - 0.2f) / 0.26f, 0.0f, 1.0f);
    const float root_water_r = sim_weighted_root_stress4(
      0.82f - 0.1f * rose_deeper,
      0.16f + 0.08f * rose_deeper,
      0.02f + 0.02f * rose_deeper,
      0.0f,
      layer_stress_r0,
      layer_stress_r1,
      layer_stress_r2,
      layer_stress_r3,
      substrate_root_r(sub)
    );

    const float store_cap = storage * (1.14f * sim_max(0.0f, baobab_stem[i]) + 0.54f * sim_max(0.0f, baobab_root[i]) + 0.035f);
    const float store_norm = store_cap > 0.0f ? sim_clamp(baobab_store[i] / store_cap, 0.0f, 1.0f) : 0.0f;
    const float rose_soil = rose_fertility[i];
    const float nutrient_b = sim_nutrient_stress(soil_mineral_n[i], substrate_nutrient_b(sub));
    const float rose_site_nutrient = substrate_nutrient_r(sub) * sim_clamp(0.45f + 0.55f * rose_soil, 0.32f, 1.45f);
    const float nutrient_r = sim_nutrient_stress(soil_mineral_n[i], rose_site_nutrient);
    const float stress_b = sim_clamp(0.06f + 0.78f * root_water_b + 0.22f * store_norm, 0.0f, 1.0f);
    const float stress_r = sim_rose_water_stress_with_waterlogging(root_water_r, rose_soil, h[i], sat0);
    photo_water_stress_baobab[i] = stress_b;
    photo_water_stress_rose[i] = stress_r;
    photo_nutrient_baobab[i] = nutrient_b;
    photo_nutrient_rose[i] = nutrient_r;

    const float lai_b = lai_baobab[i];
    const float lai_r = lai_rose[i];
    float total_apar = 0.0f;
    float baobab_apar = 0.0f;
    float rose_apar = 0.0f;
    sim_partition_apar(
      par[i],
      lai_b,
      lai_r,
      baobab_extinction,
      rose_extinction,
      vegetation_cover[i],
      &total_apar,
      &baobab_apar,
      &rose_apar
    );
    apar_total[i] = total_apar;
    apar_baobab[i] = baobab_apar;
    apar_rose[i] = rose_apar;

    sim_canopy_photosynthesis(
      par[i],
      lai_b,
      surface_temp_c[i],
      stress_b,
      vpd_kpa[i],
      nutrient_b,
      baobab_multiplier,
      baobab_apar,
      atmospheric_co2,
      photo_lookup_steps,
      photo_temp_min_c,
      photo_temp_lookup_scale,
      baobab_vcmax,
      baobab_jmax,
      baobab_rd,
      baobab_gamma_star,
      baobab_kc,
      baobab_ko,
      baobab_quantum_yield,
      baobab_curvature,
      baobab_ci_min,
      baobab_ci_max,
      baobab_extinction,
      baobab_g0_mol,
      baobab_g1,
      baobab_max_conductance_mps,
      &gpp_baobab[i],
      &conductance_baobab[i],
      &ci_baobab[i]
    );
    sim_canopy_photosynthesis(
      par[i],
      lai_r,
      surface_temp_c[i],
      stress_r,
      vpd_kpa[i],
      nutrient_r,
      rose_multiplier,
      rose_apar,
      atmospheric_co2,
      photo_lookup_steps,
      photo_temp_min_c,
      photo_temp_lookup_scale,
      rose_vcmax,
      rose_jmax,
      rose_rd,
      rose_gamma_star,
      rose_kc,
      rose_ko,
      rose_quantum_yield,
      rose_curvature,
      rose_ci_min,
      rose_ci_max,
      rose_extinction,
      rose_g0_mol,
      rose_g1,
      rose_max_conductance_mps,
      &gpp_rose[i],
      &conductance_rose[i],
      &ci_rose[i]
    );
  }
}

SIM_EXPORT void sim_update_plant_water_fluxes(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t hydraulic_lookup_steps,
  int32_t photo_lookup_steps,
  float photo_temp_min_c,
  float photo_temp_lookup_scale,
  float root_depth,
  float evaporation_factor,
  float atmospheric_co2,
  float baobab_multiplier,
  float rose_multiplier,
  float baobab_quantum_yield,
  float baobab_curvature,
  float baobab_ci_min,
  float baobab_ci_max,
  float baobab_extinction,
  float baobab_g0_mol,
  float baobab_g1,
  float baobab_max_conductance_mps,
  float rose_quantum_yield,
  float rose_curvature,
  float rose_ci_min,
  float rose_ci_max,
  float rose_extinction,
  float rose_g0_mol,
  float rose_g1,
  float rose_max_conductance_mps,
  uintptr_t hydraulic_psi_offset,
  uintptr_t baobab_vcmax_offset,
  uintptr_t baobab_jmax_offset,
  uintptr_t baobab_rd_offset,
  uintptr_t baobab_gamma_star_offset,
  uintptr_t baobab_kc_offset,
  uintptr_t baobab_ko_offset,
  uintptr_t rose_vcmax_offset,
  uintptr_t rose_jmax_offset,
  uintptr_t rose_rd_offset,
  uintptr_t rose_gamma_star_offset,
  uintptr_t rose_kc_offset,
  uintptr_t rose_ko_offset,
  uintptr_t substrate_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t soil_hydraulic_k_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t groundwater_t_offset,
  uintptr_t groundwater_thickness_offset,
  uintptr_t h_offset,
  uintptr_t r_offset,
  uintptr_t canopy_water_offset,
  uintptr_t canopy_water_next_offset,
  uintptr_t canopy_evap_m_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t baobab_stem_offset,
  uintptr_t baobab_root_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t par_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t vpd_kpa_offset,
  uintptr_t vapor_slope_kpa_c_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t light_baobab_offset,
  uintptr_t light_rose_offset,
  uintptr_t apar_baobab_offset,
  uintptr_t apar_rose_offset,
  uintptr_t photo_water_stress_baobab_offset,
  uintptr_t photo_water_stress_rose_offset,
  uintptr_t photo_nutrient_baobab_offset,
  uintptr_t photo_nutrient_rose_offset,
  uintptr_t gpp_baobab_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t conductance_baobab_offset,
  uintptr_t conductance_rose_offset,
  uintptr_t ci_baobab_offset,
  uintptr_t ci_rose_offset,
  uintptr_t root_stress_baobab_offset,
  uintptr_t root_stress_rose_offset,
  uintptr_t hydrology_throughfall_offset,
  uintptr_t hydrology_veg_feedback_offset,
  uintptr_t hydrology_sink0_offset,
  uintptr_t hydrology_sink1_offset,
  uintptr_t hydrology_sink2_offset,
  uintptr_t hydrology_groundwater_sink_offset,
  uintptr_t hydrology_surface_evap_demand_m_offset
) {
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *SIM_RESTRICT hydraulic_psi = (const float *)(uintptr_t)hydraulic_psi_offset;
  const float *SIM_RESTRICT baobab_vcmax = (const float *)(uintptr_t)baobab_vcmax_offset;
  const float *SIM_RESTRICT baobab_jmax = (const float *)(uintptr_t)baobab_jmax_offset;
  const float *SIM_RESTRICT baobab_rd = (const float *)(uintptr_t)baobab_rd_offset;
  const float *SIM_RESTRICT baobab_gamma_star = (const float *)(uintptr_t)baobab_gamma_star_offset;
  const float *SIM_RESTRICT baobab_kc = (const float *)(uintptr_t)baobab_kc_offset;
  const float *SIM_RESTRICT baobab_ko = (const float *)(uintptr_t)baobab_ko_offset;
  const float *SIM_RESTRICT rose_vcmax = (const float *)(uintptr_t)rose_vcmax_offset;
  const float *SIM_RESTRICT rose_jmax = (const float *)(uintptr_t)rose_jmax_offset;
  const float *SIM_RESTRICT rose_rd = (const float *)(uintptr_t)rose_rd_offset;
  const float *SIM_RESTRICT rose_gamma_star = (const float *)(uintptr_t)rose_gamma_star_offset;
  const float *SIM_RESTRICT rose_kc = (const float *)(uintptr_t)rose_kc_offset;
  const float *SIM_RESTRICT rose_ko = (const float *)(uintptr_t)rose_ko_offset;
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT soil_hydraulic_k = (const float *)(uintptr_t)soil_hydraulic_k_offset;
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT groundwater_t = (const float *)(uintptr_t)groundwater_t_offset;
  const float *SIM_RESTRICT groundwater_thickness = (const float *)(uintptr_t)groundwater_thickness_offset;
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)h_offset;
  const float *SIM_RESTRICT r = (const float *)(uintptr_t)r_offset;
  const float *SIM_RESTRICT canopy_water = (const float *)(uintptr_t)canopy_water_offset;
  float *SIM_RESTRICT canopy_water_next = (float *)(uintptr_t)canopy_water_next_offset;
  float *SIM_RESTRICT canopy_evap_m = (float *)(uintptr_t)canopy_evap_m_offset;
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *SIM_RESTRICT baobab_stem = (const float *)(uintptr_t)baobab_stem_offset;
  const float *SIM_RESTRICT baobab_root = (const float *)(uintptr_t)baobab_root_offset;
  const float *SIM_RESTRICT rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *SIM_RESTRICT rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  const float *SIM_RESTRICT rose_root = (const float *)(uintptr_t)rose_root_offset;
  const float *SIM_RESTRICT par = (const float *)(uintptr_t)par_offset;
  const float *SIM_RESTRICT surface_temp_c = (const float *)(uintptr_t)surface_temp_c_offset;
  const float *SIM_RESTRICT vpd_kpa = (const float *)(uintptr_t)vpd_kpa_offset;
  const float *SIM_RESTRICT vapor_slope_kpa_c = (const float *)(uintptr_t)vapor_slope_kpa_c_offset;
  const float *SIM_RESTRICT lai_baobab = (const float *)(uintptr_t)lai_baobab_offset;
  const float *SIM_RESTRICT lai_rose = (const float *)(uintptr_t)lai_rose_offset;
  const float *SIM_RESTRICT vegetation_cover = (const float *)(uintptr_t)vegetation_cover_offset;
  const float *SIM_RESTRICT light_baobab = (const float *)(uintptr_t)light_baobab_offset;
  const float *SIM_RESTRICT light_rose = (const float *)(uintptr_t)light_rose_offset;
  const float *SIM_RESTRICT apar_baobab = (const float *)(uintptr_t)apar_baobab_offset;
  const float *SIM_RESTRICT apar_rose = (const float *)(uintptr_t)apar_rose_offset;
  const float *SIM_RESTRICT photo_water_stress_baobab = (const float *)(uintptr_t)photo_water_stress_baobab_offset;
  const float *SIM_RESTRICT photo_water_stress_rose = (const float *)(uintptr_t)photo_water_stress_rose_offset;
  const float *SIM_RESTRICT photo_nutrient_baobab = (const float *)(uintptr_t)photo_nutrient_baobab_offset;
  const float *SIM_RESTRICT photo_nutrient_rose = (const float *)(uintptr_t)photo_nutrient_rose_offset;
  float *SIM_RESTRICT gpp_baobab = (float *)(uintptr_t)gpp_baobab_offset;
  float *SIM_RESTRICT gpp_rose = (float *)(uintptr_t)gpp_rose_offset;
  float *SIM_RESTRICT conductance_baobab = (float *)(uintptr_t)conductance_baobab_offset;
  float *SIM_RESTRICT conductance_rose = (float *)(uintptr_t)conductance_rose_offset;
  float *SIM_RESTRICT ci_baobab = (float *)(uintptr_t)ci_baobab_offset;
  float *SIM_RESTRICT ci_rose = (float *)(uintptr_t)ci_rose_offset;
  float *SIM_RESTRICT root_stress_baobab = (float *)(uintptr_t)root_stress_baobab_offset;
  float *SIM_RESTRICT root_stress_rose = (float *)(uintptr_t)root_stress_rose_offset;
  float *SIM_RESTRICT hydrology_throughfall = (float *)(uintptr_t)hydrology_throughfall_offset;
  float *SIM_RESTRICT hydrology_veg_feedback = (float *)(uintptr_t)hydrology_veg_feedback_offset;
  float *SIM_RESTRICT hydrology_sink0 = (float *)(uintptr_t)hydrology_sink0_offset;
  float *SIM_RESTRICT hydrology_sink1 = (float *)(uintptr_t)hydrology_sink1_offset;
  float *SIM_RESTRICT hydrology_sink2 = (float *)(uintptr_t)hydrology_sink2_offset;
  float *SIM_RESTRICT hydrology_groundwater_sink = (float *)(uintptr_t)hydrology_groundwater_sink_offset;
  float *SIM_RESTRICT hydrology_surface_evap_demand_m = (float *)(uintptr_t)hydrology_surface_evap_demand_m_offset;

  const float dt = 0.45f;
  const float reference_aero = 1.65f / 208.0f;
  const float reference_surface = reference_aero / sim_max(0.05f, 0.34f * 1.65f);
  const float bare_soil_aero = sim_min(0.014f, sim_max(0.0035f, reference_aero * (0.72f + 0.18f * 1.65f)));
  const int32_t size2 = size * 2;
  const float deep_bias = sim_clamp((root_depth - 1.0f) / 7.0f, 0.0f, 1.0f);
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t layer1 = size + i;
    const int32_t layer2 = size2 + i;
    const uint8_t sub = substrate[i];
    const float sub_root_b = substrate_root_b(sub);
    const float sub_root_r = substrate_root_r(sub);
    const float sat0 = sim_clamp(soil_water[i] / soil_cap[i], 0.0f, 1.0f);
    const float sat1 = sim_clamp(soil_water[layer1] / soil_cap[layer1], 0.0f, 1.0f);
    const float sat2 = sim_clamp(soil_water[layer2] / soil_cap[layer2], 0.0f, 1.0f);
    const float gw_sat = sim_clamp(groundwater_storage[i] / groundwater_cap[i], 0.0f, 1.0f);

    const float b_leaf = baobab_leaf[i];
    const float b_stem = baobab_stem[i];
    const float b_root = baobab_root[i];
    const float r_leaf = rose_leaf[i];
    const float r_flower = rose_flower[i];
    const float r_root = rose_root[i];
    const float light_b = light_baobab[i];
    const float light_r = light_rose[i];
    const float surface_water = h[i];
    const float soil_water0 = soil_water[i];
    const float soil_water1 = soil_water[layer1];
    const float soil_water2 = soil_water[layer2];
    const float groundwater_storage_value = groundwater_storage[i];
    const float baobab_mass = b_leaf + b_stem + b_root;
    const float rose_mass = r_leaf + r_flower + r_root;
    const float baobab_root_frac = baobab_mass > 0.0f ? b_root / baobab_mass : 0.42f;
    const float rose_root_frac = rose_mass > 0.0f ? r_root / rose_mass : 0.24f;
    const float structural_bias = sim_clamp((baobab_root_frac - 0.32f) / 0.36f, 0.0f, 1.0f);
    float brf0 = 0.34f - 0.22f * deep_bias;
    float brf1 = 0.24f + 0.01f * structural_bias;
    float brf2 = 0.25f + 0.13f * deep_bias + 0.05f * structural_bias;
    float brf3 = 0.17f + 0.16f * deep_bias + 0.05f * structural_bias;
    const float brf_total = sim_max(1.0e-12f, sim_max(0.0f, brf0) + sim_max(0.0f, brf1) + sim_max(0.0f, brf2) + sim_max(0.0f, brf3));
    brf0 = sim_max(0.0f, brf0) / brf_total;
    brf1 = sim_max(0.0f, brf1) / brf_total;
    brf2 = sim_max(0.0f, brf2) / brf_total;
    brf3 = sim_max(0.0f, brf3) / brf_total;
    const float rose_deeper = sim_clamp((rose_root_frac - 0.2f) / 0.26f, 0.0f, 1.0f);
    const float rrf0 = 0.82f - 0.1f * rose_deeper;
    const float rrf1 = 0.16f + 0.08f * rose_deeper;
    const float rrf2 = 0.02f + 0.02f * rose_deeper;
    const float rrf3 = 0.0f;

    const float lai_b = lai_baobab[i];
    const float lai_r = lai_rose[i];
    const float lai_total = lai_b + lai_r;
    const float cover = vegetation_cover[i];
    const float temp_c = surface_temp_c[i];
    const float vpd = vpd_kpa[i];
    const float vapor_slope = vapor_slope_kpa_c[i];
    const float rain = r[i];
    const float net_radiation = sim_net_radiation_mj_m2_day(par[i], cover, rain);
    const float et0 = sim_penman_monteith_m_with_delta(temp_c, vpd, net_radiation, reference_surface, reference_aero, vapor_slope);

    float throughfall = rain;
    float canopy_evap = 0.0f;
    if (lai_total <= 0.0f) {
      canopy_water_next[i] = 0.0f;
      canopy_evap_m[i] = 0.0f;
    } else {
      const float positive_lai_total = sim_max(0.0f, lai_total);
      const float canopy_capacity =
        0.00018f +
        0.00082f *
          (1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.52f * positive_lai_total) * 102.4f)) *
          positive_lai_total;
      const float interception_fraction =
        1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.42f * lai_total) * 102.4f);
      const float max_capture = sim_max(0.0f, canopy_capacity - canopy_water[i]) / dt;
      const float capture = sim_min(sim_max(0.0f, rain * interception_fraction), max_capture);
      const float available_canopy_water = canopy_water[i] / dt + capture;
      canopy_evap = sim_min(available_canopy_water, et0 * (0.32f + 0.68f * interception_fraction));
      canopy_water_next[i] = sim_clamp(canopy_water[i] + dt * (capture - canopy_evap), 0.0f, canopy_capacity);
      canopy_evap_m[i] = canopy_evap;
      throughfall = sim_max(0.0f, rain - capture);
    }
    const float remaining_et0 = sim_max(0.0f, et0 - canopy_evap);
    const float remaining_net_radiation = et0 > 0.0f ? net_radiation * sim_clamp(remaining_et0 / et0, 0.0f, 1.0f) : net_radiation;
    float soil_evap = 0.0f;
    if (evaporation_factor > 0.0f) {
      const float bare_fraction = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (2.35f * cover) * 102.4f);
      const float surface_wetness = sim_clamp(sat0 * 1.35f + surface_water * 18.0f, 0.0f, 1.0f);
      const float surface_conductance = 0.00012f + 0.0062f * surface_wetness * bare_fraction * substrate_evap(sub) * evaporation_factor;
      soil_evap = sim_penman_monteith_m_with_delta(
        temp_c,
        vpd,
        remaining_net_radiation * bare_fraction,
        surface_conductance,
        bare_soil_aero,
        vapor_slope
      );
    }
    const float surface_evap = sim_min(soil_evap, sim_max(0.0f, surface_water) / dt);
    soil_evap -= surface_evap;

    float stress_b = photo_water_stress_baobab[i];
    float stress_r = photo_water_stress_rose[i];
    float conduct_b = conductance_baobab[i];
    float conduct_r = conductance_rose[i];
    float ci_b = ci_baobab[i];
    float ci_r = ci_rose[i];
    float gpp_b = gpp_baobab[i];
    float gpp_r = gpp_rose[i];
    const int32_t has_baobab_water_demand =
      b_leaf > 0.0f || b_stem > 0.0f || b_root > 0.0f || lai_b > 0.0f || conduct_b > 0.0f;
    const int32_t has_rose_water_demand =
      r_leaf > 0.0f || r_flower > 0.0f || r_root > 0.0f || lai_r > 0.0f || conduct_r > 0.0f;
    if (!has_baobab_water_demand && !has_rose_water_demand) {
      root_stress_baobab[i] = stress_b;
      root_stress_rose[i] = stress_r;
      gpp_baobab[i] = gpp_b;
      gpp_rose[i] = gpp_r;
      conductance_baobab[i] = conduct_b;
      conductance_rose[i] = conduct_r;
      ci_baobab[i] = ci_b;
      ci_rose[i] = ci_r;
      hydrology_throughfall[i] = throughfall;
      hydrology_veg_feedback[i] = cover;
      hydrology_sink0[i] = soil_evap;
      hydrology_sink1[i] = 0.0f;
      hydrology_sink2[i] = 0.0f;
      hydrology_groundwater_sink[i] = 0.0f;
      hydrology_surface_evap_demand_m[i] = surface_evap * dt;
      continue;
    }

    const SimPhotoTempLookup photo_temp_lookup =
      sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
    const float psi0 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat0);
    const float psi1 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat1);
    const float psi2 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat2);
    const float layer_stress_b0 = sim_root_water_stress_from_psi(psi0, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b1 = sim_root_water_stress_from_psi(psi1, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b2 = sim_root_water_stress_from_psi(psi2, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b3 = sim_clamp(0.18f + 0.82f * gw_sat, 0.0f, 1.0f);
    const float layer_stress_r0 = sim_root_water_stress_from_psi(psi0, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r1 = sim_root_water_stress_from_psi(psi1, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r2 = sim_root_water_stress_from_psi(psi2, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r3 = sim_root_water_stress_from_psi(0.0f, 0.05f, 18.0f, 82.0f);

    float b_demand =
      sim_canopy_transpiration_demand_with_delta(temp_c, vpd, remaining_net_radiation, lai_b, conduct_b, 0.45f, vapor_slope) +
      (0.0016f * b_leaf + 0.00028f * b_stem + 0.0005f * b_root) * (0.22f + 0.78f * light_b) * 0.28f;
    float r_demand =
      sim_canopy_transpiration_demand_with_delta(temp_c, vpd, remaining_net_radiation, lai_r, conduct_r, 0.92f, vapor_slope) +
      (0.0045f * r_leaf + 0.0032f * r_flower + 0.0012f * r_root) * (0.32f + 0.68f * light_r) * 0.22f;
    float b_plant_psi = sim_plant_water_potential_m(0.06f, 105.0f, 520.0f, b_demand, vpd);
    float r_plant_psi = sim_plant_water_potential_m(0.05f, 18.0f, 82.0f, r_demand, vpd);
    const float gw_k = groundwater_t[i] / sim_max(1.0e-6f, groundwater_thickness[i]);
    float ub0 = 0.0f;
    float ub1 = 0.0f;
    float ub2 = 0.0f;
    float ub3 = 0.0f;
    float ur0 = 0.0f;
    float ur1 = 0.0f;
    float ur2 = 0.0f;
    float ur3 = 0.0f;
    sim_root_hydraulic_uptake4(
      &ub0, &ub1, &ub2, &ub3,
      b_demand * sub_root_b,
      brf0, brf1, brf2, brf3,
      layer_stress_b0, layer_stress_b1, layer_stress_b2, layer_stress_b3,
      soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
      sat0, sat1, sat2, gw_sat,
      psi0, psi1, psi2, 0.0f,
      b_plant_psi,
      105.0f,
      sub_root_b,
      2.1f
    );
    sim_root_hydraulic_uptake4(
      &ur0, &ur1, &ur2, &ur3,
      r_demand * sub_root_r,
      rrf0, rrf1, rrf2, rrf3,
      layer_stress_r0, layer_stress_r1, layer_stress_r2, layer_stress_r3,
      soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
      sat0, sat1, sat2, gw_sat,
      psi0, psi1, psi2, 0.0f,
      r_plant_psi,
      18.0f,
      sub_root_r,
      0.92f
    );

    float hydraulic_b = sim_hydraulic_stress_from_uptake(ub0 + ub1 + ub2 + ub3, b_demand * sub_root_b, stress_b);
    if (hydraulic_b < stress_b - 0.005f) {
      stress_b = hydraulic_b;
      sim_canopy_photosynthesis_cached(
        par[i], lai_b, photo_temp_lookup, stress_b, vpd, photo_nutrient_baobab[i], baobab_multiplier, apar_baobab[i], atmospheric_co2,
        baobab_vcmax, baobab_jmax, baobab_rd, baobab_gamma_star, baobab_kc, baobab_ko,
        baobab_quantum_yield, baobab_curvature, baobab_ci_min, baobab_ci_max, baobab_extinction,
        baobab_g0_mol, baobab_g1, baobab_max_conductance_mps,
        &gpp_b, &conduct_b, &ci_b
      );
      b_demand =
        sim_canopy_transpiration_demand_with_delta(temp_c, vpd, remaining_net_radiation, lai_b, conduct_b, 0.45f, vapor_slope) +
        (0.0016f * b_leaf + 0.00028f * b_stem + 0.0005f * b_root) * (0.22f + 0.78f * light_b) * 0.28f;
      b_plant_psi = sim_plant_water_potential_m(0.06f, 105.0f, 520.0f, b_demand, vpd);
      sim_root_hydraulic_uptake4(
        &ub0, &ub1, &ub2, &ub3,
        b_demand * sub_root_b,
        brf0, brf1, brf2, brf3,
        layer_stress_b0, layer_stress_b1, layer_stress_b2, layer_stress_b3,
        soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
        sat0, sat1, sat2, gw_sat,
        psi0, psi1, psi2, 0.0f,
        b_plant_psi,
        105.0f,
        sub_root_b,
        2.1f
      );
    }
    float hydraulic_r = sim_hydraulic_stress_from_uptake(ur0 + ur1 + ur2 + ur3, r_demand * sub_root_r, stress_r);
    if (hydraulic_r < stress_r - 0.005f) {
      stress_r = hydraulic_r;
      sim_canopy_photosynthesis_cached(
        par[i], lai_r, photo_temp_lookup, stress_r, vpd, photo_nutrient_rose[i], rose_multiplier, apar_rose[i], atmospheric_co2,
        rose_vcmax, rose_jmax, rose_rd, rose_gamma_star, rose_kc, rose_ko,
        rose_quantum_yield, rose_curvature, rose_ci_min, rose_ci_max, rose_extinction,
        rose_g0_mol, rose_g1, rose_max_conductance_mps,
        &gpp_r, &conduct_r, &ci_r
      );
      r_demand =
        sim_canopy_transpiration_demand_with_delta(temp_c, vpd, remaining_net_radiation, lai_r, conduct_r, 0.92f, vapor_slope) +
        (0.0045f * r_leaf + 0.0032f * r_flower + 0.0012f * r_root) * (0.32f + 0.68f * light_r) * 0.22f;
      r_plant_psi = sim_plant_water_potential_m(0.05f, 18.0f, 82.0f, r_demand, vpd);
      sim_root_hydraulic_uptake4(
        &ur0, &ur1, &ur2, &ur3,
        r_demand * sub_root_r,
        rrf0, rrf1, rrf2, rrf3,
        layer_stress_r0, layer_stress_r1, layer_stress_r2, layer_stress_r3,
        soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
        sat0, sat1, sat2, gw_sat,
        psi0, psi1, psi2, 0.0f,
        r_plant_psi,
        18.0f,
        sub_root_r,
        0.92f
      );
    }

    soil_evap = sim_min(soil_evap, sim_max(0.0f, soil_water0 * 0.38f) / dt);
    const float total0 = ub0 + ur0 + soil_evap;
    if (total0 * dt > soil_water0 * 0.72f && total0 > 0.0f) {
      const float scale = (soil_water0 * 0.72f) / (total0 * dt);
      ub0 *= scale;
      ur0 *= scale;
      soil_evap *= scale;
    }
    const float total1 = ub1 + ur1;
    if (total1 * dt > soil_water1 * 0.66f && total1 > 0.0f) {
      const float scale = (soil_water1 * 0.66f) / (total1 * dt);
      ub1 *= scale;
      ur1 *= scale;
    }
    const float total2 = ub2 + ur2;
    if (total2 * dt > soil_water2 * 0.66f && total2 > 0.0f) {
      const float scale = (soil_water2 * 0.66f) / (total2 * dt);
      ub2 *= scale;
      ur2 *= scale;
    }
    if (ub3 * dt > groundwater_storage_value * 0.68f && ub3 > 0.0f) {
      ub3 *= (groundwater_storage_value * 0.68f) / (ub3 * dt);
    }

    const float transp_b = ub0 + ub1 + ub2 + ub3;
    const float transp_r = ur0 + ur1 + ur2;
    const float final_stress_b = sim_hydraulic_stress_from_uptake(transp_b, b_demand * sub_root_b, stress_b);
    if (final_stress_b < stress_b - 0.005f) {
      stress_b = final_stress_b;
      sim_canopy_photosynthesis_cached(
        par[i], lai_b, photo_temp_lookup, stress_b, vpd, photo_nutrient_baobab[i], baobab_multiplier, apar_baobab[i], atmospheric_co2,
        baobab_vcmax, baobab_jmax, baobab_rd, baobab_gamma_star, baobab_kc, baobab_ko,
        baobab_quantum_yield, baobab_curvature, baobab_ci_min, baobab_ci_max, baobab_extinction,
        baobab_g0_mol, baobab_g1, baobab_max_conductance_mps,
        &gpp_b, &conduct_b, &ci_b
      );
    }
    const float final_stress_r = sim_hydraulic_stress_from_uptake(transp_r, r_demand * sub_root_r, stress_r);
    if (final_stress_r < stress_r - 0.005f) {
      stress_r = final_stress_r;
      sim_canopy_photosynthesis_cached(
        par[i], lai_r, photo_temp_lookup, stress_r, vpd, photo_nutrient_rose[i], rose_multiplier, apar_rose[i], atmospheric_co2,
        rose_vcmax, rose_jmax, rose_rd, rose_gamma_star, rose_kc, rose_ko,
        rose_quantum_yield, rose_curvature, rose_ci_min, rose_ci_max, rose_extinction,
        rose_g0_mol, rose_g1, rose_max_conductance_mps,
        &gpp_r, &conduct_r, &ci_r
      );
    }

    root_stress_baobab[i] = stress_b;
    root_stress_rose[i] = stress_r;
    gpp_baobab[i] = gpp_b;
    gpp_rose[i] = gpp_r;
    conductance_baobab[i] = conduct_b;
    conductance_rose[i] = conduct_r;
    ci_baobab[i] = ci_b;
    ci_rose[i] = ci_r;
    hydrology_throughfall[i] = throughfall;
    hydrology_veg_feedback[i] = cover;
    hydrology_sink0[i] = soil_evap + ub0 + ur0;
    hydrology_sink1[i] = ub1 + ur1;
    hydrology_sink2[i] = ub2 + ur2;
    hydrology_groundwater_sink[i] = ub3;
    hydrology_surface_evap_demand_m[i] = surface_evap * dt;
  }
}

static inline void sim_update_hydraulic_state_cell(
  int32_t size,
  int32_t i,
  int32_t lookup_steps,
  int32_t table_stride,
  float groundwater_flow_multiplier,
  const float *SIM_RESTRICT hydraulic_psi,
  const float *SIM_RESTRICT hydraulic_relative_k,
  const float *SIM_RESTRICT groundwater_pow17,
  const uint8_t *SIM_RESTRICT substrate,
  const float *SIM_RESTRICT elevation,
  const float *SIM_RESTRICT soil_water,
  const float *SIM_RESTRICT soil_cap,
  const float *SIM_RESTRICT soil_center_depth,
  const float *SIM_RESTRICT soil_thickness,
  const float *SIM_RESTRICT groundwater_storage,
  const float *SIM_RESTRICT groundwater_cap,
  const float *SIM_RESTRICT groundwater_thickness,
  const float *SIM_RESTRICT groundwater_top_depth,
  float *SIM_RESTRICT w0,
  float *SIM_RESTRICT w1,
  float *SIM_RESTRICT soil_head,
  float *SIM_RESTRICT soil_hydraulic_k,
  float *SIM_RESTRICT soil_transmissivity,
  float *SIM_RESTRICT groundwater_head,
  float *SIM_RESTRICT groundwater_t
) {
  const int32_t layer1_index = size + i;
  const int32_t layer2_index = size * 2 + i;
  const uint8_t sub = sim_substrate_index(substrate[i]);
  const int32_t table_base = (int32_t)sub * table_stride;
  const float local_elevation = elevation[i];
  const float sub_ksat0 = substrate_ksat0(sub);
  const float sub_ksat1 = substrate_ksat1(sub);

  w0[i] = soil_water[i];
  w1[i] = groundwater_storage[i];

  float sat = sim_clamp(soil_water[i] / soil_cap[i], 0.0f, 1.0f);
  float x = sat * (float)lookup_steps;
  int32_t table_index = (int32_t)x;
  if (table_index >= lookup_steps) {
    table_index = lookup_steps - 1;
  }
  if (table_index < 0) {
    table_index = 0;
  }
  float fraction = x - (float)table_index;
  int32_t lookup_index = table_base + table_index;
  float psi =
    hydraulic_psi[lookup_index] +
    (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
  float rel_k =
    hydraulic_relative_k[lookup_index] +
    (hydraulic_relative_k[lookup_index + 1] - hydraulic_relative_k[lookup_index]) * fraction;
  float hydraulic_k = sub_ksat0 * rel_k;
  soil_head[i] = local_elevation - soil_center_depth[i] + psi;
  soil_hydraulic_k[i] = hydraulic_k;
  soil_transmissivity[i] = hydraulic_k * soil_thickness[i];

  sat = sim_clamp(soil_water[layer1_index] / soil_cap[layer1_index], 0.0f, 1.0f);
  x = sat * (float)lookup_steps;
  table_index = (int32_t)x;
  if (table_index >= lookup_steps) {
    table_index = lookup_steps - 1;
  }
  if (table_index < 0) {
    table_index = 0;
  }
  fraction = x - (float)table_index;
  lookup_index = table_base + table_index;
  psi =
    hydraulic_psi[lookup_index] +
    (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
  rel_k =
    hydraulic_relative_k[lookup_index] +
    (hydraulic_relative_k[lookup_index + 1] - hydraulic_relative_k[lookup_index]) * fraction;
  hydraulic_k = sub_ksat1 * rel_k;
  soil_head[layer1_index] = local_elevation - soil_center_depth[layer1_index] + psi;
  soil_hydraulic_k[layer1_index] = hydraulic_k;
  soil_transmissivity[layer1_index] = hydraulic_k * soil_thickness[layer1_index];

  sat = sim_clamp(soil_water[layer2_index] / soil_cap[layer2_index], 0.0f, 1.0f);
  x = sat * (float)lookup_steps;
  table_index = (int32_t)x;
  if (table_index >= lookup_steps) {
    table_index = lookup_steps - 1;
  }
  if (table_index < 0) {
    table_index = 0;
  }
  fraction = x - (float)table_index;
  lookup_index = table_base + table_index;
  psi =
    hydraulic_psi[lookup_index] +
    (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
  rel_k =
    hydraulic_relative_k[lookup_index] +
    (hydraulic_relative_k[lookup_index + 1] - hydraulic_relative_k[lookup_index]) * fraction;
  hydraulic_k = sub_ksat1 * rel_k;
  soil_head[layer2_index] = local_elevation - soil_center_depth[layer2_index] + psi;
  soil_hydraulic_k[layer2_index] = hydraulic_k;
  soil_transmissivity[layer2_index] = hydraulic_k * soil_thickness[layer2_index];

  const float gw_cap = groundwater_cap[i];
  const float gw_thickness = groundwater_thickness[i];
  const float gw_sat = sim_clamp(groundwater_storage[i] / gw_cap, 0.0f, 1.0f);
  float gw_x = gw_sat * (float)lookup_steps;
  int32_t gw_table_index = (int32_t)gw_x;
  if (gw_table_index >= lookup_steps) {
    gw_table_index = lookup_steps - 1;
  }
  if (gw_table_index < 0) {
    gw_table_index = 0;
  }
  const float gw_fraction = gw_x - (float)gw_table_index;
  const float gw_pow17 =
    groundwater_pow17[gw_table_index] +
    (groundwater_pow17[gw_table_index + 1] - groundwater_pow17[gw_table_index]) * gw_fraction;
  groundwater_head[i] = local_elevation - groundwater_top_depth[i] - gw_thickness + gw_thickness * gw_sat;
  groundwater_t[i] =
    substrate_gwk(sub) *
    gw_thickness *
    (0.08f + 0.92f * gw_pow17) *
    groundwater_flow_multiplier;
}

SIM_EXPORT void sim_update_hydraulic_state(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t lookup_steps,
  float groundwater_flow_multiplier,
  uintptr_t hydraulic_psi_offset,
  uintptr_t hydraulic_relative_k_offset,
  uintptr_t groundwater_pow17_offset,
  uintptr_t substrate_offset,
  uintptr_t elevation_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t soil_center_depth_offset,
  uintptr_t soil_thickness_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t groundwater_thickness_offset,
  uintptr_t groundwater_top_depth_offset,
  uintptr_t w0_offset,
  uintptr_t w1_offset,
  uintptr_t soil_head_offset,
  uintptr_t soil_hydraulic_k_offset,
  uintptr_t soil_transmissivity_offset,
  uintptr_t groundwater_head_offset,
  uintptr_t groundwater_t_offset
) {
  (void)size;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *SIM_RESTRICT hydraulic_psi = (const float *)(uintptr_t)hydraulic_psi_offset;
  const float *SIM_RESTRICT hydraulic_relative_k = (const float *)(uintptr_t)hydraulic_relative_k_offset;
  const float *SIM_RESTRICT groundwater_pow17 = (const float *)(uintptr_t)groundwater_pow17_offset;
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)elevation_offset;
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT soil_center_depth = (const float *)(uintptr_t)soil_center_depth_offset;
  const float *SIM_RESTRICT soil_thickness = (const float *)(uintptr_t)soil_thickness_offset;
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT groundwater_thickness = (const float *)(uintptr_t)groundwater_thickness_offset;
  const float *SIM_RESTRICT groundwater_top_depth = (const float *)(uintptr_t)groundwater_top_depth_offset;
  float *SIM_RESTRICT w0 = (float *)(uintptr_t)w0_offset;
  float *SIM_RESTRICT w1 = (float *)(uintptr_t)w1_offset;
  float *SIM_RESTRICT soil_head = (float *)(uintptr_t)soil_head_offset;
  float *SIM_RESTRICT soil_hydraulic_k = (float *)(uintptr_t)soil_hydraulic_k_offset;
  float *SIM_RESTRICT soil_transmissivity = (float *)(uintptr_t)soil_transmissivity_offset;
  float *SIM_RESTRICT groundwater_head = (float *)(uintptr_t)groundwater_head_offset;
  float *SIM_RESTRICT groundwater_t = (float *)(uintptr_t)groundwater_t_offset;

  const int32_t table_stride = lookup_steps + 1;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    sim_update_hydraulic_state_cell(
      size,
      i,
      lookup_steps,
      table_stride,
      groundwater_flow_multiplier,
      hydraulic_psi,
      hydraulic_relative_k,
      groundwater_pow17,
      substrate,
      elevation,
      soil_water,
      soil_cap,
      soil_center_depth,
      soil_thickness,
      groundwater_storage,
      groundwater_cap,
      groundwater_thickness,
      groundwater_top_depth,
      w0,
      w1,
      soil_head,
      soil_hydraulic_k,
      soil_transmissivity,
      groundwater_head,
      groundwater_t
    );
  }
}

static float nutrient_mobile_fraction(float top_sat, float gw_sat, float active_soil_carbon, float stable_soil_carbon) {
  top_sat = sim_clamp(top_sat, 0.0f, 1.0f);
  gw_sat = sim_clamp(gw_sat, 0.0f, 1.0f);
  const float water_mobility = top_sat * top_sat * 0.22f + gw_sat * 0.035f;
  const float sorption = sim_clamp(active_soil_carbon * 0.9f + stable_soil_carbon * 0.32f, 0.0f, 1.2f);
  const float retardation = 1.0f / (1.0f + 1.8f * sorption);
  return sim_clamp((0.012f + water_mobility) * retardation, 0.012f, 0.24f);
}

static inline float sim_mobile_nutrient_value(
  int32_t i,
  const float *SIM_RESTRICT soil_water,
  const float *SIM_RESTRICT soil_cap,
  const float *SIM_RESTRICT groundwater_storage,
  const float *SIM_RESTRICT groundwater_cap,
  const float *SIM_RESTRICT soil_mineral_n,
  const float *SIM_RESTRICT soil_carbon_active,
  const float *SIM_RESTRICT soil_carbon_stable
) {
  const float top_cap = soil_cap[i] > 1.0e-12f ? soil_cap[i] : 1.0e-12f;
  const float gw_cap = groundwater_cap[i] > 1.0e-12f ? groundwater_cap[i] : 1.0e-12f;
  return soil_mineral_n[i] *
    nutrient_mobile_fraction(
      soil_water[i] / top_cap,
      groundwater_storage[i] / gw_cap,
      soil_carbon_active[i],
      soil_carbon_stable[i]);
}

SIM_EXPORT void sim_update_canopy_optics(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float shade,
  uintptr_t baobab_blocked_offset,
  uintptr_t sunlight_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t cover_baobab_offset,
  uintptr_t cover_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t canopy_light_baobab_offset,
  uintptr_t canopy_light_rose_offset,
  uintptr_t light_baobab_offset,
  uintptr_t light_rose_offset
) {
  (void)size;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const uint8_t *SIM_RESTRICT baobab_blocked = (const uint8_t *)(uintptr_t)baobab_blocked_offset;
  const float *SIM_RESTRICT sunlight = (const float *)(uintptr_t)sunlight_offset;
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *SIM_RESTRICT rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *SIM_RESTRICT rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  float *SIM_RESTRICT lai_baobab = (float *)(uintptr_t)lai_baobab_offset;
  float *SIM_RESTRICT lai_rose = (float *)(uintptr_t)lai_rose_offset;
  float *SIM_RESTRICT cover_baobab = (float *)(uintptr_t)cover_baobab_offset;
  float *SIM_RESTRICT cover_rose = (float *)(uintptr_t)cover_rose_offset;
  float *SIM_RESTRICT vegetation_cover = (float *)(uintptr_t)vegetation_cover_offset;
  float *SIM_RESTRICT canopy_light_baobab = (float *)(uintptr_t)canopy_light_baobab_offset;
  float *SIM_RESTRICT canopy_light_rose = (float *)(uintptr_t)canopy_light_rose_offset;
  float *SIM_RESTRICT light_baobab = (float *)(uintptr_t)light_baobab_offset;
  float *SIM_RESTRICT light_rose = (float *)(uintptr_t)light_rose_offset;
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const float active_baobab_leaf = baobab_blocked[i] ? 0.0f : baobab_leaf[i];
    const float lai_b =
      sim_clamp(6.2f * sim_max(0.0f, active_baobab_leaf), 0.0f, 8.5f);
    const float lai_r =
      sim_clamp(6.4f * sim_max(0.0f, rose_leaf[i]) + 0.7f * sim_max(0.0f, rose_flower[i]), 0.0f, 6.5f);
    const float optical_depth_b = 0.58f * lai_b;
    const float optical_depth_r = 0.68f * lai_r;
    const float cover_b = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, optical_depth_b * 102.4f), 0.0f, 1.0f);
    const float cover_r = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, optical_depth_r * 102.4f), 0.0f, 1.0f);
    const float cover = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (optical_depth_b + optical_depth_r) * 102.4f), 0.0f, 1.0f);
    const float canopy_b = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.11f * lai_b) * 102.4f);
    const float canopy_r = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.57f * shade * lai_b + 0.18f * lai_r) * 102.4f);
    const float solar_light = sim_clamp(sunlight[i], 0.0f, 1.0f);
    lai_baobab[i] = lai_b;
    lai_rose[i] = lai_r;
    cover_baobab[i] = cover_b;
    cover_rose[i] = cover_r;
    vegetation_cover[i] = cover;
    canopy_light_baobab[i] = canopy_b;
    canopy_light_rose[i] = canopy_r;
    light_baobab[i] = solar_light * canopy_b;
    light_rose[i] = solar_light * canopy_r;
  }
}

SIM_EXPORT void sim_update_canopy_environment(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t is_earth,
  float asteroid_mean_temp_c,
  float asteroid_diurnal_range_c,
  float asteroid_latitude_temp_range_c,
  uintptr_t cell_height_offset,
  uintptr_t climate_mean_temp_c_offset,
  uintptr_t climate_diurnal_range_c_offset,
  uintptr_t elevation_offset,
  uintptr_t h_offset,
  uintptr_t r_offset,
  uintptr_t w0_offset,
  uintptr_t w1_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t sunlight_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t vpd_kpa_offset,
  uintptr_t vapor_slope_kpa_c_offset,
  uintptr_t par_offset
) {
  (void)size;
  const int32_t *active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *cell_height = (const float *)(uintptr_t)cell_height_offset;
  const float *climate_mean_temp_c = (const float *)(uintptr_t)climate_mean_temp_c_offset;
  const float *climate_diurnal_range_c = (const float *)(uintptr_t)climate_diurnal_range_c_offset;
  const float *elevation = (const float *)(uintptr_t)elevation_offset;
  const float *h = (const float *)(uintptr_t)h_offset;
  const float *r = (const float *)(uintptr_t)r_offset;
  const float *w0 = (const float *)(uintptr_t)w0_offset;
  const float *w1 = (const float *)(uintptr_t)w1_offset;
  const float *soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *sunlight = (const float *)(uintptr_t)sunlight_offset;
  const float *lai_baobab = (const float *)(uintptr_t)lai_baobab_offset;
  const float *lai_rose = (const float *)(uintptr_t)lai_rose_offset;
  const float *vegetation_cover = (const float *)(uintptr_t)vegetation_cover_offset;
  float *surface_temp_c = (float *)(uintptr_t)surface_temp_c_offset;
  float *vpd_kpa = (float *)(uintptr_t)vpd_kpa_offset;
  float *vapor_slope_kpa_c = (float *)(uintptr_t)vapor_slope_kpa_c_offset;
  float *par = (float *)(uintptr_t)par_offset;
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const float top_sat = sim_clamp(w0[i] / soil_cap[i], 0.0f, 1.0f);
    const float groundwater_sat = sim_clamp(w1[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float wetness = sim_clamp(0.62f * top_sat + 0.38f * groundwater_sat, 0.0f, 1.0f);
    const float cover = sim_clamp(vegetation_cover[i], 0.0f, 1.0f);
    const float lai_total = lai_baobab[i] + lai_rose[i];
    const float local_sunlight = sim_clamp(sunlight[i], 0.0f, 1.0f);
    const float cloud_cooling = sim_clamp(r[i] * 900.0f, 0.0f, 1.0f);
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float mean_insolation = sim_ring_mean_daily_insolation_from_height(height);
    float mean_climate = 0.0f;
    float diurnal_range = 0.0f;
    if (is_earth) {
      const float wet_anomaly = (0.5f - wetness) * 0.8f;
      mean_climate = sim_clamp(climate_mean_temp_c[i] + wet_anomaly - cloud_cooling * 0.55f, -34.0f, 34.0f);
      const float damping = cloud_cooling * 2.5f + cover * 1.2f + wetness * 0.8f;
      diurnal_range = sim_clamp(climate_diurnal_range_c[i] - damping, 2.4f, 27.0f);
    } else {
      const float latitude_range = sim_clamp(asteroid_latitude_temp_range_c, 0.0f, 12.0f);
      const float latitude_anomaly = sim_ring_latitude_temperature_unit_from_height(height) * latitude_range;
      const float terrain_cooling = sim_clamp(sim_max(0.0f, elevation[i]) / 5200.0f, 0.0f, 1.6f) * 5.4f;
      mean_climate = sim_clamp(asteroid_mean_temp_c + latitude_anomaly - terrain_cooling - cloud_cooling * 1.3f, -18.0f, 32.0f);
      const float terrain_boost = sim_clamp(sim_max(0.0f, elevation[i]) / 4200.0f, 0.0f, 1.4f) * 2.8f;
      const float damping = wetness * 7.5f + cloud_cooling * 5.5f + cover * 4.0f;
      diurnal_range = sim_clamp(asteroid_diurnal_range_c + terrain_boost - damping, 3.0f, 28.0f);
    }
    const float diurnal_anomaly = diurnal_range * (local_sunlight - mean_insolation);
    const float surface_water_cooling = sim_clamp(h[i] * 12.0f, 0.0f, 1.0f) * (is_earth ? 1.6f : 1.1f);
    const float temp_c = sim_clamp(mean_climate + diurnal_anomaly - surface_water_cooling, -18.0f, 48.0f);
    const float saturated_vapor_pressure =
      sim_lookup_linear_table(sim_fast_vapor_pressure_table, 512, (temp_c + 20.0f) * (512.0f / 70.0f));
    const float vapor_slope_denom = temp_c + 237.3f;
    const float relative_humidity =
      sim_clamp(0.22f + 0.62f * wetness + 0.08f * sim_clamp(h[i] * 12.0f, 0.0f, 1.0f) + 0.04f * sim_min(1.0f, lai_total / 4.5f), 0.0f, 1.0f);
    surface_temp_c[i] = temp_c;
    vpd_kpa[i] = sim_max(0.0f, saturated_vapor_pressure * (1.0f - relative_humidity));
    vapor_slope_kpa_c[i] = (4098.0f * saturated_vapor_pressure) / (vapor_slope_denom * vapor_slope_denom);
    par[i] =
      42.0f *
      local_sunlight *
      3.1415926535897932f *
      (0.74f + 0.26f * sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.18f * lai_total) * 102.4f));
  }
}

SIM_EXPORT void sim_update_canopy_environment_photosynthesis(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t is_earth,
  float asteroid_mean_temp_c,
  float asteroid_diurnal_range_c,
  float asteroid_latitude_temp_range_c,
  float shade,
  int32_t hydraulic_lookup_steps,
  int32_t photo_lookup_steps,
  float photo_temp_min_c,
  float photo_temp_lookup_scale,
  float root_depth,
  float storage,
  float atmospheric_co2,
  float baobab_quantum_yield,
  float baobab_curvature,
  float baobab_ci_min,
  float baobab_ci_max,
  float baobab_extinction,
  float baobab_g0_mol,
  float baobab_g1,
  float baobab_max_conductance_mps,
  float baobab_multiplier,
  float rose_quantum_yield,
  float rose_curvature,
  float rose_ci_min,
  float rose_ci_max,
  float rose_extinction,
  float rose_g0_mol,
  float rose_g1,
  float rose_max_conductance_mps,
  float rose_multiplier,
  uintptr_t hydraulic_psi_offset,
  uintptr_t baobab_vcmax_offset,
  uintptr_t baobab_jmax_offset,
  uintptr_t baobab_rd_offset,
  uintptr_t baobab_gamma_star_offset,
  uintptr_t baobab_kc_offset,
  uintptr_t baobab_ko_offset,
  uintptr_t rose_vcmax_offset,
  uintptr_t rose_jmax_offset,
  uintptr_t rose_rd_offset,
  uintptr_t rose_gamma_star_offset,
  uintptr_t rose_kc_offset,
  uintptr_t rose_ko_offset,
  uintptr_t cell_height_offset,
  uintptr_t climate_mean_temp_c_offset,
  uintptr_t climate_diurnal_range_c_offset,
  uintptr_t elevation_offset,
  uintptr_t baobab_blocked_offset,
  uintptr_t substrate_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t h_offset,
  uintptr_t r_offset,
  uintptr_t w0_offset,
  uintptr_t w1_offset,
  uintptr_t sunlight_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t baobab_stem_offset,
  uintptr_t baobab_root_offset,
  uintptr_t baobab_store_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t rose_store_offset,
  uintptr_t baobab_seed_offset,
  uintptr_t rose_seed_offset,
  uintptr_t baobab_seed_transport_offset,
  uintptr_t rose_seed_transport_offset,
  uintptr_t rose_seed_arrival_offset,
  uintptr_t rose_fertility_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t lai_baobab_offset,
  uintptr_t lai_rose_offset,
  uintptr_t cover_baobab_offset,
  uintptr_t cover_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t canopy_light_baobab_offset,
  uintptr_t canopy_light_rose_offset,
  uintptr_t light_baobab_offset,
  uintptr_t light_rose_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t vpd_kpa_offset,
  uintptr_t vapor_slope_kpa_c_offset,
  uintptr_t par_offset,
  uintptr_t apar_total_offset,
  uintptr_t apar_baobab_offset,
  uintptr_t apar_rose_offset,
  uintptr_t photo_water_stress_baobab_offset,
  uintptr_t photo_water_stress_rose_offset,
  uintptr_t photo_nutrient_baobab_offset,
  uintptr_t photo_nutrient_rose_offset,
  uintptr_t gpp_baobab_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t conductance_baobab_offset,
  uintptr_t conductance_rose_offset,
  uintptr_t ci_baobab_offset,
  uintptr_t ci_rose_offset
) {
  const int32_t *active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *hydraulic_psi = (const float *)(uintptr_t)hydraulic_psi_offset;
  const float *baobab_vcmax = (const float *)(uintptr_t)baobab_vcmax_offset;
  const float *baobab_jmax = (const float *)(uintptr_t)baobab_jmax_offset;
  const float *baobab_rd = (const float *)(uintptr_t)baobab_rd_offset;
  const float *baobab_gamma_star = (const float *)(uintptr_t)baobab_gamma_star_offset;
  const float *baobab_kc = (const float *)(uintptr_t)baobab_kc_offset;
  const float *baobab_ko = (const float *)(uintptr_t)baobab_ko_offset;
  const float *rose_vcmax = (const float *)(uintptr_t)rose_vcmax_offset;
  const float *rose_jmax = (const float *)(uintptr_t)rose_jmax_offset;
  const float *rose_rd = (const float *)(uintptr_t)rose_rd_offset;
  const float *rose_gamma_star = (const float *)(uintptr_t)rose_gamma_star_offset;
  const float *rose_kc = (const float *)(uintptr_t)rose_kc_offset;
  const float *rose_ko = (const float *)(uintptr_t)rose_ko_offset;
  const float *cell_height = (const float *)(uintptr_t)cell_height_offset;
  const float *climate_mean_temp_c = (const float *)(uintptr_t)climate_mean_temp_c_offset;
  const float *climate_diurnal_range_c = (const float *)(uintptr_t)climate_diurnal_range_c_offset;
  const float *elevation = (const float *)(uintptr_t)elevation_offset;
  const uint8_t *baobab_blocked = (const uint8_t *)(uintptr_t)baobab_blocked_offset;
  const uint8_t *substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *h = (const float *)(uintptr_t)h_offset;
  const float *r = (const float *)(uintptr_t)r_offset;
  const float *w0 = (const float *)(uintptr_t)w0_offset;
  const float *w1 = (const float *)(uintptr_t)w1_offset;
  const float *sunlight = (const float *)(uintptr_t)sunlight_offset;
  const float *baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *baobab_stem = (const float *)(uintptr_t)baobab_stem_offset;
  const float *baobab_root = (const float *)(uintptr_t)baobab_root_offset;
  const float *baobab_store = (const float *)(uintptr_t)baobab_store_offset;
  const float *rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  const float *rose_root = (const float *)(uintptr_t)rose_root_offset;
  const float *rose_store = (const float *)(uintptr_t)rose_store_offset;
  const float *baobab_seed = (const float *)(uintptr_t)baobab_seed_offset;
  const float *rose_seed = (const float *)(uintptr_t)rose_seed_offset;
  const float *baobab_seed_transport = (const float *)(uintptr_t)baobab_seed_transport_offset;
  const float *rose_seed_transport = (const float *)(uintptr_t)rose_seed_transport_offset;
  const float *rose_seed_arrival = (const float *)(uintptr_t)rose_seed_arrival_offset;
  const float *rose_fertility = (const float *)(uintptr_t)rose_fertility_offset;
  const float *soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  float *lai_baobab = (float *)(uintptr_t)lai_baobab_offset;
  float *lai_rose = (float *)(uintptr_t)lai_rose_offset;
  float *cover_baobab = (float *)(uintptr_t)cover_baobab_offset;
  float *cover_rose = (float *)(uintptr_t)cover_rose_offset;
  float *vegetation_cover = (float *)(uintptr_t)vegetation_cover_offset;
  float *canopy_light_baobab = (float *)(uintptr_t)canopy_light_baobab_offset;
  float *canopy_light_rose = (float *)(uintptr_t)canopy_light_rose_offset;
  float *light_baobab = (float *)(uintptr_t)light_baobab_offset;
  float *light_rose = (float *)(uintptr_t)light_rose_offset;
  float *surface_temp_c = (float *)(uintptr_t)surface_temp_c_offset;
  float *vpd_kpa = (float *)(uintptr_t)vpd_kpa_offset;
  float *vapor_slope_kpa_c = (float *)(uintptr_t)vapor_slope_kpa_c_offset;
  float *par = (float *)(uintptr_t)par_offset;
  float *apar_total = (float *)(uintptr_t)apar_total_offset;
  float *apar_baobab = (float *)(uintptr_t)apar_baobab_offset;
  float *apar_rose = (float *)(uintptr_t)apar_rose_offset;
  float *photo_water_stress_baobab = (float *)(uintptr_t)photo_water_stress_baobab_offset;
  float *photo_water_stress_rose = (float *)(uintptr_t)photo_water_stress_rose_offset;
  float *photo_nutrient_baobab = (float *)(uintptr_t)photo_nutrient_baobab_offset;
  float *photo_nutrient_rose = (float *)(uintptr_t)photo_nutrient_rose_offset;
  float *gpp_baobab = (float *)(uintptr_t)gpp_baobab_offset;
  float *gpp_rose = (float *)(uintptr_t)gpp_rose_offset;
  float *conductance_baobab = (float *)(uintptr_t)conductance_baobab_offset;
  float *conductance_rose = (float *)(uintptr_t)conductance_rose_offset;
  float *ci_baobab = (float *)(uintptr_t)ci_baobab_offset;
  float *ci_rose = (float *)(uintptr_t)ci_rose_offset;

  const int32_t size2 = size * 2;
  const float deep_bias = sim_clamp((root_depth - 1.0f) / 7.0f, 0.0f, 1.0f);
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const uint8_t sub = substrate[i];
    const float active_baobab_leaf = baobab_blocked[i] ? 0.0f : baobab_leaf[i];
    const float lai_b = sim_clamp(6.2f * sim_max(0.0f, active_baobab_leaf), 0.0f, 8.5f);
    const float lai_r =
      sim_clamp(6.4f * sim_max(0.0f, rose_leaf[i]) + 0.7f * sim_max(0.0f, rose_flower[i]), 0.0f, 6.5f);
    const float optical_depth_b = 0.58f * lai_b;
    const float optical_depth_r = 0.68f * lai_r;
    const float cover_b = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, optical_depth_b * 102.4f), 0.0f, 1.0f);
    const float cover_r = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, optical_depth_r * 102.4f), 0.0f, 1.0f);
    const float cover = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (optical_depth_b + optical_depth_r) * 102.4f), 0.0f, 1.0f);
    const float canopy_b = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.11f * lai_b) * 102.4f);
    const float canopy_r = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.57f * shade * lai_b + 0.18f * lai_r) * 102.4f);
    const float local_sunlight = sim_clamp(sunlight[i], 0.0f, 1.0f);
    lai_baobab[i] = lai_b;
    lai_rose[i] = lai_r;
    cover_baobab[i] = cover_b;
    cover_rose[i] = cover_r;
    vegetation_cover[i] = cover;
    canopy_light_baobab[i] = canopy_b;
    canopy_light_rose[i] = canopy_r;
    light_baobab[i] = local_sunlight * canopy_b;
    light_rose[i] = local_sunlight * canopy_r;

    const float top_sat = sim_clamp(w0[i] / soil_cap[i], 0.0f, 1.0f);
    const float groundwater_sat = sim_clamp(w1[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float wetness = sim_clamp(0.62f * top_sat + 0.38f * groundwater_sat, 0.0f, 1.0f);
    const float lai_total = lai_b + lai_r;
    const float cloud_cooling = sim_clamp(r[i] * 900.0f, 0.0f, 1.0f);
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float mean_insolation = sim_ring_mean_daily_insolation_from_height(height);
    float mean_climate = 0.0f;
    float diurnal_range = 0.0f;
    if (is_earth) {
      const float wet_anomaly = (0.5f - wetness) * 0.8f;
      mean_climate = sim_clamp(climate_mean_temp_c[i] + wet_anomaly - cloud_cooling * 0.55f, -34.0f, 34.0f);
      const float damping = cloud_cooling * 2.5f + cover * 1.2f + wetness * 0.8f;
      diurnal_range = sim_clamp(climate_diurnal_range_c[i] - damping, 2.4f, 27.0f);
    } else {
      const float latitude_range = sim_clamp(asteroid_latitude_temp_range_c, 0.0f, 12.0f);
      const float latitude_anomaly = sim_ring_latitude_temperature_unit_from_height(height) * latitude_range;
      const float terrain_cooling = sim_clamp(sim_max(0.0f, elevation[i]) / 5200.0f, 0.0f, 1.6f) * 5.4f;
      mean_climate = sim_clamp(asteroid_mean_temp_c + latitude_anomaly - terrain_cooling - cloud_cooling * 1.3f, -18.0f, 32.0f);
      const float terrain_boost = sim_clamp(sim_max(0.0f, elevation[i]) / 4200.0f, 0.0f, 1.4f) * 2.8f;
      const float damping = wetness * 7.5f + cloud_cooling * 5.5f + cover * 4.0f;
      diurnal_range = sim_clamp(asteroid_diurnal_range_c + terrain_boost - damping, 3.0f, 28.0f);
    }
    const float diurnal_anomaly = diurnal_range * (local_sunlight - mean_insolation);
    const float surface_water_cooling = sim_clamp(h[i] * 12.0f, 0.0f, 1.0f) * (is_earth ? 1.6f : 1.1f);
    const float temp_c = sim_clamp(mean_climate + diurnal_anomaly - surface_water_cooling, -18.0f, 48.0f);
    const float saturated_vapor_pressure =
      sim_lookup_linear_table(sim_fast_vapor_pressure_table, 512, (temp_c + 20.0f) * (512.0f / 70.0f));
    const float vapor_slope_denom = temp_c + 237.3f;
    const float relative_humidity =
      sim_clamp(0.22f + 0.62f * wetness + 0.08f * sim_clamp(h[i] * 12.0f, 0.0f, 1.0f) + 0.04f * sim_min(1.0f, lai_total / 4.5f), 0.0f, 1.0f);
    const float local_par =
      42.0f *
      local_sunlight *
      3.1415926535897932f *
      (0.74f + 0.26f * sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.18f * lai_total) * 102.4f));
    const float local_vpd = sim_max(0.0f, saturated_vapor_pressure * (1.0f - relative_humidity));
    surface_temp_c[i] = temp_c;
    vpd_kpa[i] = local_vpd;
    vapor_slope_kpa_c[i] = (4098.0f * saturated_vapor_pressure) / (vapor_slope_denom * vapor_slope_denom);
    par[i] = local_par;

    const int32_t has_canopy_carbon_or_seed =
      active_baobab_leaf > 0.0f ||
      baobab_stem[i] > 0.0f ||
      baobab_root[i] > 0.0f ||
      baobab_store[i] > 0.0f ||
      baobab_seed[i] > 0.0f ||
      baobab_seed_transport[i] != 0.0f ||
      rose_leaf[i] > 0.0f ||
      rose_flower[i] > 0.0f ||
      rose_root[i] > 0.0f ||
      rose_store[i] > 0.0f ||
      rose_seed[i] > 0.0f ||
      rose_seed_transport[i] != 0.0f ||
      rose_seed_arrival[i] != 0.0f;
    if (!has_canopy_carbon_or_seed) {
      apar_total[i] = 0.0f;
      apar_baobab[i] = 0.0f;
      apar_rose[i] = 0.0f;
      photo_water_stress_baobab[i] = 0.0f;
      photo_water_stress_rose[i] = 0.0f;
      photo_nutrient_baobab[i] = 0.0f;
      photo_nutrient_rose[i] = 0.0f;
      gpp_baobab[i] = 0.0f;
      gpp_rose[i] = 0.0f;
      conductance_baobab[i] = 0.0f;
      conductance_rose[i] = 0.0f;
      ci_baobab[i] = atmospheric_co2 * baobab_ci_min;
      ci_rose[i] = atmospheric_co2 * rose_ci_min;
      continue;
    }
    const int32_t has_adult_canopy_or_root =
      active_baobab_leaf > 0.0f ||
      baobab_stem[i] > 0.0f ||
      baobab_root[i] > 0.0f ||
      baobab_store[i] > 0.0f ||
      rose_leaf[i] > 0.0f ||
      rose_flower[i] > 0.0f ||
      rose_root[i] > 0.0f ||
      rose_store[i] > 0.0f;
    if (!has_adult_canopy_or_root) {
      apar_total[i] = 0.0f;
      apar_baobab[i] = 0.0f;
      apar_rose[i] = 0.0f;
      photo_water_stress_baobab[i] = 0.0f;
      photo_water_stress_rose[i] = 0.0f;
      photo_nutrient_baobab[i] = 0.0f;
      photo_nutrient_rose[i] = 0.0f;
      gpp_baobab[i] = 0.0f;
      gpp_rose[i] = 0.0f;
      conductance_baobab[i] = 0.0f;
      conductance_rose[i] = 0.0f;
      ci_baobab[i] = atmospheric_co2 * baobab_ci_min;
      ci_rose[i] = atmospheric_co2 * rose_ci_min;
      continue;
    }

    const float sat0 = sim_clamp(soil_water[i] / soil_cap[i], 0.0f, 1.0f);
    const float sat1 = sim_clamp(soil_water[layer1_index] / soil_cap[layer1_index], 0.0f, 1.0f);
    const float sat2 = sim_clamp(soil_water[layer2_index] / soil_cap[layer2_index], 0.0f, 1.0f);
    const float gw_sat = sim_clamp(groundwater_storage[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float baobab_mass = baobab_leaf[i] + baobab_stem[i] + baobab_root[i];
    const float rose_mass = rose_leaf[i] + rose_flower[i] + rose_root[i];
    const float baobab_root_frac = baobab_mass > 0.0f ? baobab_root[i] / baobab_mass : 0.42f;
    const float rose_root_frac = rose_mass > 0.0f ? rose_root[i] / rose_mass : 0.24f;
    const float psi0 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat0);
    const float psi1 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat1);
    const float psi2 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat2);
    const float layer_stress_b0 = sim_root_water_stress_from_psi(psi0, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b1 = sim_root_water_stress_from_psi(psi1, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b2 = sim_root_water_stress_from_psi(psi2, 0.06f, 105.0f, 520.0f);
    const float layer_stress_b3 = sim_clamp(0.18f + 0.82f * gw_sat, 0.0f, 1.0f);
    const float layer_stress_r0 = sim_root_water_stress_from_psi(psi0, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r1 = sim_root_water_stress_from_psi(psi1, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r2 = sim_root_water_stress_from_psi(psi2, 0.05f, 18.0f, 82.0f);
    const float layer_stress_r3 = sim_root_water_stress_from_psi(0.0f, 0.05f, 18.0f, 82.0f);

    const float structural_bias = sim_clamp((baobab_root_frac - 0.32f) / 0.36f, 0.0f, 1.0f);
    const float root_water_b = sim_weighted_root_stress4(
      0.34f - 0.22f * deep_bias,
      0.24f + 0.01f * structural_bias,
      0.25f + 0.13f * deep_bias + 0.05f * structural_bias,
      0.17f + 0.16f * deep_bias + 0.05f * structural_bias,
      layer_stress_b0,
      layer_stress_b1,
      layer_stress_b2,
      layer_stress_b3,
      substrate_root_b(sub)
    );
    const float rose_deeper = sim_clamp((rose_root_frac - 0.2f) / 0.26f, 0.0f, 1.0f);
    const float root_water_r = sim_weighted_root_stress4(
      0.82f - 0.1f * rose_deeper,
      0.16f + 0.08f * rose_deeper,
      0.02f + 0.02f * rose_deeper,
      0.0f,
      layer_stress_r0,
      layer_stress_r1,
      layer_stress_r2,
      layer_stress_r3,
      substrate_root_r(sub)
    );

    const float store_cap = storage * (1.14f * sim_max(0.0f, baobab_stem[i]) + 0.54f * sim_max(0.0f, baobab_root[i]) + 0.035f);
    const float store_norm = store_cap > 0.0f ? sim_clamp(baobab_store[i] / store_cap, 0.0f, 1.0f) : 0.0f;
    const float rose_soil = rose_fertility[i];
    const float nutrient_b = sim_nutrient_stress(soil_mineral_n[i], substrate_nutrient_b(sub));
    const float rose_site_nutrient = substrate_nutrient_r(sub) * sim_clamp(0.45f + 0.55f * rose_soil, 0.32f, 1.45f);
    const float nutrient_r = sim_nutrient_stress(soil_mineral_n[i], rose_site_nutrient);
    const float stress_b = sim_clamp(0.06f + 0.78f * root_water_b + 0.22f * store_norm, 0.0f, 1.0f);
    const float stress_r = sim_rose_water_stress_with_waterlogging(root_water_r, rose_soil, h[i], sat0);
    photo_water_stress_baobab[i] = stress_b;
    photo_water_stress_rose[i] = stress_r;
    photo_nutrient_baobab[i] = nutrient_b;
    photo_nutrient_rose[i] = nutrient_r;

    float total_apar = 0.0f;
    float baobab_apar = 0.0f;
    float rose_apar = 0.0f;
    sim_partition_apar(
      local_par,
      lai_b,
      lai_r,
      baobab_extinction,
      rose_extinction,
      cover,
      &total_apar,
      &baobab_apar,
      &rose_apar
    );
    apar_total[i] = total_apar;
    apar_baobab[i] = baobab_apar;
    apar_rose[i] = rose_apar;
    const int32_t needs_baobab_photo =
      baobab_apar > 0.0f && lai_b > 0.0f && stress_b > 0.0f && nutrient_b > 0.0f;
    const int32_t needs_rose_photo =
      rose_apar > 0.0f && lai_r > 0.0f && stress_r > 0.0f && nutrient_r > 0.0f;
    if (needs_baobab_photo || needs_rose_photo) {
      const SimPhotoTempLookup photo_temp_lookup =
        sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
      if (needs_baobab_photo) {
        sim_canopy_photosynthesis_cached(
          local_par,
          lai_b,
          photo_temp_lookup,
          stress_b,
          local_vpd,
          nutrient_b,
          baobab_multiplier,
          baobab_apar,
          atmospheric_co2,
          baobab_vcmax,
          baobab_jmax,
          baobab_rd,
          baobab_gamma_star,
          baobab_kc,
          baobab_ko,
          baobab_quantum_yield,
          baobab_curvature,
          baobab_ci_min,
          baobab_ci_max,
          baobab_extinction,
          baobab_g0_mol,
          baobab_g1,
          baobab_max_conductance_mps,
          &gpp_baobab[i],
          &conductance_baobab[i],
          &ci_baobab[i]
        );
      } else {
        gpp_baobab[i] = 0.0f;
        conductance_baobab[i] = 0.0f;
        ci_baobab[i] = atmospheric_co2 * baobab_ci_min;
      }
      if (needs_rose_photo) {
        sim_canopy_photosynthesis_cached(
          local_par,
          lai_r,
          photo_temp_lookup,
          stress_r,
          local_vpd,
          nutrient_r,
          rose_multiplier,
          rose_apar,
          atmospheric_co2,
          rose_vcmax,
          rose_jmax,
          rose_rd,
          rose_gamma_star,
          rose_kc,
          rose_ko,
          rose_quantum_yield,
          rose_curvature,
          rose_ci_min,
          rose_ci_max,
          rose_extinction,
          rose_g0_mol,
          rose_g1,
          rose_max_conductance_mps,
          &gpp_rose[i],
          &conductance_rose[i],
          &ci_rose[i]
        );
      } else {
        gpp_rose[i] = 0.0f;
        conductance_rose[i] = 0.0f;
        ci_rose[i] = atmospheric_co2 * rose_ci_min;
      }
    } else {
      gpp_baobab[i] = 0.0f;
      conductance_baobab[i] = 0.0f;
      ci_baobab[i] = atmospheric_co2 * baobab_ci_min;
      gpp_rose[i] = 0.0f;
      conductance_rose[i] = 0.0f;
      ci_rose[i] = atmospheric_co2 * rose_ci_min;
    }
  }
}

SIM_EXPORT void sim_reset_heap(void) {
  sim_heap_offset = ((uintptr_t)&__heap_base + (uintptr_t)15u) & ~(uintptr_t)15u;
}

SIM_EXPORT uintptr_t sim_alloc(uintptr_t byte_count) {
  if (sim_heap_offset == 0) {
    sim_reset_heap();
  }
  const uintptr_t aligned = (byte_count + (uintptr_t)15u) & ~(uintptr_t)15u;
  const uintptr_t offset = sim_heap_offset;
  sim_heap_offset += aligned;
  return offset;
}

SIM_EXPORT void sim_transport_darcy_water_columns(
  int32_t size,
  int32_t stencil_size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float dt_days,
  float cell_size_m,
  float surface_water_diff_m2_day,
  float surface_slope_velocity_m_day,
  float surface_slope_max_velocity_m_day,
  float nutrient_diff_m2_day,
  float baobab_seed_diffusion_m2_day,
  float rose_seed_diffusion_m2_day,
  uintptr_t stencil_offset,
  uintptr_t lap_w_offset,
  uintptr_t gx_w_offset,
  uintptr_t gy_w_offset,
  uintptr_t h_offset,
  uintptr_t elevation_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_head_offset,
  uintptr_t soil_transmissivity_offset,
  uintptr_t soil_residual_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t groundwater_head_offset,
  uintptr_t groundwater_t_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t soil_carbon_active_offset,
  uintptr_t soil_carbon_stable_offset,
  uintptr_t mobile_nutrient_offset,
  uintptr_t baobab_seed_offset,
  uintptr_t rose_seed_offset,
  uintptr_t slope_x_offset,
  uintptr_t slope_y_offset,
  uintptr_t soil_transport_offset,
  uintptr_t groundwater_transport_offset,
  uintptr_t h_transport_offset,
  uintptr_t soil_mineral_transport_offset,
  uintptr_t baobab_seed_transport_offset,
  uintptr_t rose_seed_transport_offset,
  uintptr_t surface_ux_offset,
  uintptr_t surface_uy_offset,
  uintptr_t top_soil_ux_offset,
  uintptr_t top_soil_uy_offset,
  uintptr_t groundwater_ux_offset,
  uintptr_t groundwater_uy_offset,
  int32_t combine_surface_nutrient,
  float surface_film_threshold_m,
  uintptr_t flux_x_offset,
  uintptr_t flux_y_offset
) {
  (void)size;
  (void)stencil_size;
  (void)surface_slope_velocity_m_day;
  (void)baobab_seed_diffusion_m2_day;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT stencil = (const int32_t *)(uintptr_t)stencil_offset;
  const float *SIM_RESTRICT lap_w = (const float *)(uintptr_t)lap_w_offset;
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)gx_w_offset;
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)gy_w_offset;
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)h_offset;
  const float *SIM_RESTRICT elevation = elevation_offset ? (const float *)(uintptr_t)elevation_offset : 0;
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *SIM_RESTRICT soil_head = (const float *)(uintptr_t)soil_head_offset;
  const float *SIM_RESTRICT soil_transmissivity = (const float *)(uintptr_t)soil_transmissivity_offset;
  const float *SIM_RESTRICT soil_residual = (const float *)(uintptr_t)soil_residual_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT groundwater_head = (const float *)(uintptr_t)groundwater_head_offset;
  const float *SIM_RESTRICT groundwater_t = (const float *)(uintptr_t)groundwater_t_offset;
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  const float *SIM_RESTRICT soil_carbon_active = (const float *)(uintptr_t)soil_carbon_active_offset;
  const float *SIM_RESTRICT soil_carbon_stable = (const float *)(uintptr_t)soil_carbon_stable_offset;
  float *SIM_RESTRICT mobile_nutrient = (float *)(uintptr_t)mobile_nutrient_offset;
  const float *SIM_RESTRICT baobab_seed = (const float *)(uintptr_t)baobab_seed_offset;
  const float *SIM_RESTRICT rose_seed = (const float *)(uintptr_t)rose_seed_offset;
  const float *SIM_RESTRICT slope_x = (const float *)(uintptr_t)slope_x_offset;
  const float *SIM_RESTRICT slope_y = (const float *)(uintptr_t)slope_y_offset;
  float *SIM_RESTRICT soil_transport = (float *)(uintptr_t)soil_transport_offset;
  float *SIM_RESTRICT groundwater_transport = (float *)(uintptr_t)groundwater_transport_offset;
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)h_transport_offset;
  float *SIM_RESTRICT soil_mineral_transport = (float *)(uintptr_t)soil_mineral_transport_offset;
  float *SIM_RESTRICT baobab_seed_transport = (float *)(uintptr_t)baobab_seed_transport_offset;
  float *SIM_RESTRICT rose_seed_transport = (float *)(uintptr_t)rose_seed_transport_offset;
  float *SIM_RESTRICT surface_ux = (float *)(uintptr_t)surface_ux_offset;
  float *SIM_RESTRICT surface_uy = (float *)(uintptr_t)surface_uy_offset;
  float *SIM_RESTRICT top_soil_ux = (float *)(uintptr_t)top_soil_ux_offset;
  float *SIM_RESTRICT top_soil_uy = (float *)(uintptr_t)top_soil_uy_offset;
  float *SIM_RESTRICT groundwater_ux = (float *)(uintptr_t)groundwater_ux_offset;
  float *SIM_RESTRICT groundwater_uy = (float *)(uintptr_t)groundwater_uy_offset;
  float *SIM_RESTRICT flux_x = (float *)(uintptr_t)flux_x_offset;
  float *SIM_RESTRICT flux_y = (float *)(uintptr_t)flux_y_offset;

  const int32_t size2 = size * 2;
  const int32_t transport_rose_seed = rose_seed_diffusion_m2_day != 0.0f;

  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    const float top_cap = soil_cap[i] > 1.0e-12f ? soil_cap[i] : 1.0e-12f;
    const float gw_cap = groundwater_cap[i] > 1.0e-12f ? groundwater_cap[i] : 1.0e-12f;
    mobile_nutrient[i] =
      soil_mineral_n[i] *
      nutrient_mobile_fraction(
        soil_water[i] / top_cap,
        groundwater_storage[i] / gw_cap,
        soil_carbon_active[i],
        soil_carbon_stable[i]);
  }

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t stencil_cell_offset = i * SIM_RBF_STENCIL_SIZE;

    float lap_head0 = 0.0f;
    float gx_head0 = 0.0f;
    float gy_head0 = 0.0f;
    float gx_t0 = 0.0f;
    float gy_t0 = 0.0f;
    float lap_head1 = 0.0f;
    float gx_head1 = 0.0f;
    float gy_head1 = 0.0f;
    float gx_t1 = 0.0f;
    float gy_t1 = 0.0f;
    float lap_head2 = 0.0f;
    float gx_head2 = 0.0f;
    float gy_head2 = 0.0f;
    float gx_t2 = 0.0f;
    float gy_t2 = 0.0f;
    float lap_gw_head = 0.0f;
    float gx_gw_head = 0.0f;
    float gy_gw_head = 0.0f;
    float gx_gw_t = 0.0f;
    float gy_gw_t = 0.0f;
    float film_gx = 0.0f;
    float film_gy = 0.0f;
    float surface_mfd_x = 0.0f;
    float surface_mfd_y = 0.0f;
    float lap_surface_water = 0.0f;
    float lap_nutrient = 0.0f;
    float lap_baobab_seed = 0.0f;
    float lap_rose_seed = 0.0f;

    SIM_UNROLL_LOOP
    for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
      const int32_t weight_index = stencil_cell_offset + k;
      const int32_t cell_id = stencil[weight_index];
      const float lap_weight = lap_w[weight_index];
      const float gx_weight = gx_w[weight_index];
      const float gy_weight = gy_w[weight_index];
      const int32_t layer1_stencil_index = size + cell_id;
      const int32_t layer2_stencil_index = size2 + cell_id;

      const float head0 = soil_head[cell_id];
      const float transmissivity0 = soil_transmissivity[cell_id];
      lap_head0 += lap_weight * head0;
      gx_head0 += gx_weight * head0;
      gy_head0 += gy_weight * head0;
      gx_t0 += gx_weight * transmissivity0;
      gy_t0 += gy_weight * transmissivity0;

      const float head1 = soil_head[layer1_stencil_index];
      const float transmissivity1 = soil_transmissivity[layer1_stencil_index];
      lap_head1 += lap_weight * head1;
      gx_head1 += gx_weight * head1;
      gy_head1 += gy_weight * head1;
      gx_t1 += gx_weight * transmissivity1;
      gy_t1 += gy_weight * transmissivity1;

      const float head2 = soil_head[layer2_stencil_index];
      const float transmissivity2 = soil_transmissivity[layer2_stencil_index];
      lap_head2 += lap_weight * head2;
      gx_head2 += gx_weight * head2;
      gy_head2 += gy_weight * head2;
      gx_t2 += gx_weight * transmissivity2;
      gy_t2 += gy_weight * transmissivity2;

      const float groundwater_head_value = groundwater_head[cell_id];
      const float groundwater_t_value = groundwater_t[cell_id];
      lap_gw_head += lap_weight * groundwater_head_value;
      gx_gw_head += gx_weight * groundwater_head_value;
      gy_gw_head += gy_weight * groundwater_head_value;
      gx_gw_t += gx_weight * groundwater_t_value;
      gy_gw_t += gy_weight * groundwater_t_value;

      const float surface_water = h[cell_id];
      film_gx += gx_weight * surface_water;
      film_gy += gy_weight * surface_water;
      if (elevation) {
        const float surface_drop = elevation[i] + h[i] - (elevation[cell_id] + surface_water);
        if (surface_drop > 0.0f) {
          surface_mfd_x += gx_weight * surface_drop;
          surface_mfd_y += gy_weight * surface_drop;
        }
      }
      lap_surface_water += lap_weight * surface_water;

      lap_nutrient += lap_weight * mobile_nutrient[cell_id];
      lap_baobab_seed += lap_weight * baobab_seed[cell_id];
    }

    if (transport_rose_seed) {
      SIM_UNROLL_LOOP
      for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
        const int32_t weight_index = stencil_cell_offset + k;
        lap_rose_seed += lap_w[weight_index] * rose_seed[stencil[weight_index]];
      }
    }

    const int32_t layer0_index = i;
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const float local_t0 = soil_transmissivity[layer0_index];
    const float local_t1 = soil_transmissivity[layer1_index];
    const float local_t2 = soil_transmissivity[layer2_index];
    const float local_groundwater_t = groundwater_t[i];
    const float storage0 = soil_water[layer0_index];
    const float storage1 = soil_water[layer1_index];
    const float storage2 = soil_water[layer2_index];
    const float groundwater_storage_value = groundwater_storage[i];

    const float raw_transport0 = local_t0 * lap_head0 + gx_t0 * gx_head0 + gy_t0 * gy_head0;
    const float raw_transport1 = local_t1 * lap_head1 + gx_t1 * gx_head1 + gy_t1 * gy_head1;
    const float raw_transport2 = local_t2 * lap_head2 + gx_t2 * gx_head2 + gy_t2 * gy_head2;
    const float max_loss0 = (storage0 > soil_residual[layer0_index] ? storage0 - soil_residual[layer0_index] : 0.0f) * 0.42f / dt_days;
    const float max_gain0 = (soil_cap[layer0_index] > storage0 ? soil_cap[layer0_index] - storage0 : 0.0f) * 0.42f / dt_days;
    const float max_loss1 = (storage1 > soil_residual[layer1_index] ? storage1 - soil_residual[layer1_index] : 0.0f) * 0.42f / dt_days;
    const float max_gain1 = (soil_cap[layer1_index] > storage1 ? soil_cap[layer1_index] - storage1 : 0.0f) * 0.42f / dt_days;
    const float max_loss2 = (storage2 > soil_residual[layer2_index] ? storage2 - soil_residual[layer2_index] : 0.0f) * 0.42f / dt_days;
    const float max_gain2 = (soil_cap[layer2_index] > storage2 ? soil_cap[layer2_index] - storage2 : 0.0f) * 0.42f / dt_days;
    soil_transport[layer0_index] = sim_clamp(raw_transport0, -max_loss0, max_gain0);
    soil_transport[layer1_index] = sim_clamp(raw_transport1, -max_loss1, max_gain1);
    soil_transport[layer2_index] = sim_clamp(raw_transport2, -max_loss2, max_gain2);

    const float raw_groundwater_transport =
      local_groundwater_t * lap_gw_head + gx_gw_t * gx_gw_head + gy_gw_t * gy_gw_head;
    const float max_groundwater_loss = (groundwater_storage_value > 0.0f ? groundwater_storage_value : 0.0f) * 0.36f / dt_days;
    const float max_groundwater_gain =
      (groundwater_cap[i] > groundwater_storage_value ? groundwater_cap[i] - groundwater_storage_value : 0.0f) * 0.36f / dt_days;
    groundwater_transport[i] = sim_clamp(raw_groundwater_transport, -max_groundwater_loss, max_groundwater_gain);

    const float downhill_x = elevation ? surface_mfd_x : -(slope_x[i] + film_gx);
    const float downhill_y = elevation ? surface_mfd_y : -(slope_y[i] + film_gy);
    const float surface_scale = sim_surface_water_velocity_scale(
      h[i],
      downhill_x,
      downhill_y,
      surface_film_threshold_m,
      surface_slope_max_velocity_m_day);
    const float surface_vx = downhill_x * surface_scale;
    const float surface_vy = downhill_y * surface_scale;
    surface_ux[i] = surface_vx;
    surface_uy[i] = surface_vy;

    float top_qx = -local_t0 * gx_head0;
    float top_qy = -local_t0 * gy_head0;
    const float top_max_flux = (storage0 * cell_size_m * 0.16f / dt_days) > 1.0e-7f ? (storage0 * cell_size_m * 0.16f / dt_days) : 1.0e-7f;
    const float top_magnitude2 = top_qx * top_qx + top_qy * top_qy;
    const float top_max_flux2 = top_max_flux * top_max_flux;
    if (top_magnitude2 > top_max_flux2 && top_magnitude2 > 0.0f) {
      const float scale = top_max_flux / sim_sqrt(top_magnitude2);
      top_qx *= scale;
      top_qy *= scale;
    }
    const float top_speed_scale = storage0 > 1.0e-9f ? 1.0f / storage0 : 0.0f;
    top_soil_ux[i] = top_qx * top_speed_scale;
    top_soil_uy[i] = top_qy * top_speed_scale;

    float groundwater_qx = -local_groundwater_t * gx_gw_head;
    float groundwater_qy = -local_groundwater_t * gy_gw_head;
    const float groundwater_max_flux =
      (groundwater_storage_value * cell_size_m * 0.12f / dt_days) > 1.0e-7f
        ? (groundwater_storage_value * cell_size_m * 0.12f / dt_days)
        : 1.0e-7f;
    const float groundwater_magnitude2 = groundwater_qx * groundwater_qx + groundwater_qy * groundwater_qy;
    const float groundwater_max_flux2 = groundwater_max_flux * groundwater_max_flux;
    if (groundwater_magnitude2 > groundwater_max_flux2 && groundwater_magnitude2 > 0.0f) {
      const float scale = groundwater_max_flux / sim_sqrt(groundwater_magnitude2);
      groundwater_qx *= scale;
      groundwater_qy *= scale;
    }
    const float groundwater_speed_scale = groundwater_storage_value > 1.0e-9f ? 1.0f / groundwater_storage_value : 0.0f;
    groundwater_ux[i] = groundwater_qx * groundwater_speed_scale;
    groundwater_uy[i] = groundwater_qy * groundwater_speed_scale;

    h_transport[i] = surface_water_diff_m2_day * lap_surface_water;
    soil_mineral_transport[i] = nutrient_diff_m2_day * lap_nutrient;
    (void)lap_baobab_seed;
    baobab_seed_transport[i] = 0.0f;
    rose_seed_transport[i] = transport_rose_seed ? rose_seed_diffusion_m2_day * lap_rose_seed : 0.0f;
  }

  if (!combine_surface_nutrient || !flux_x || !flux_y) {
    return;
  }

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const float top_cap = soil_cap[i] > 1.0e-12f ? soil_cap[i] : 1.0e-12f;
    const float gw_cap = groundwater_cap[i] > 1.0e-12f ? groundwater_cap[i] : 1.0e-12f;
    const float top_sat = sim_clamp(soil_water[i] / top_cap, 0.0f, 1.0f);
    const float gw_sat = sim_clamp(groundwater_storage[i] / gw_cap, 0.0f, 1.0f);
    const float mobile_n = mobile_nutrient[i];
    const float top_weight = sim_clamp(0.68f + 0.18f * top_sat - 0.12f * gw_sat, 0.45f, 0.86f);
    const float ground_weight = 1.0f - top_weight;
    flux_x[i] = mobile_n * (top_weight * top_soil_ux[i] + ground_weight * groundwater_ux[i]);
    flux_y[i] = mobile_n * (top_weight * top_soil_uy[i] + ground_weight * groundwater_uy[i]);
  }

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t offset = i * SIM_RBF_STENCIL_SIZE;
    float surface_flux_divergence_x = 0.0f;
    float surface_flux_divergence_y = 0.0f;
    float nutrient_flux_divergence_x = 0.0f;
    float nutrient_flux_divergence_y = 0.0f;

    SIM_UNROLL_LOOP
    for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
      const int32_t weight_index = offset + k;
      const int32_t cell_id = stencil[weight_index];
      const float gx_weight = gx_w[weight_index];
      const float gy_weight = gy_w[weight_index];
      const float mobile_surface_water = sim_max(0.0f, h[cell_id] - surface_film_threshold_m);
      surface_flux_divergence_x += gx_weight * surface_ux[cell_id] * mobile_surface_water;
      surface_flux_divergence_y += gy_weight * surface_uy[cell_id] * mobile_surface_water;
      nutrient_flux_divergence_x += gx_weight * flux_x[cell_id];
      nutrient_flux_divergence_y += gy_weight * flux_y[cell_id];
    }

    h_transport[i] -= surface_flux_divergence_x + surface_flux_divergence_y;
    const float max_surface_loss = sim_max(0.0f, h[i] - surface_film_threshold_m) / dt_days;
    if (h_transport[i] < -max_surface_loss) {
      h_transport[i] = -max_surface_loss;
    }
    soil_mineral_transport[i] -= nutrient_flux_divergence_x + nutrient_flux_divergence_y;
    const float max_loss = sim_max(0.0f, soil_mineral_n[i] - 0.002f) * 0.32f / dt_days;
    const float max_gain = sim_max(0.0f, 1.4f - soil_mineral_n[i]) * 0.32f / dt_days;
    soil_mineral_transport[i] = sim_clamp(soil_mineral_transport[i], -max_loss, max_gain);
  }
}

SIM_EXPORT void sim_transport_surface_nutrient(
  int32_t size,
  int32_t stencil_size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float surface_film_threshold_m,
  float model_dt_days,
  uintptr_t stencil_offset,
  uintptr_t gx_w_offset,
  uintptr_t gy_w_offset,
  uintptr_t h_offset,
  uintptr_t w0_offset,
  uintptr_t w1_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t soil_carbon_active_offset,
  uintptr_t soil_carbon_stable_offset,
  uintptr_t top_soil_ux_offset,
  uintptr_t top_soil_uy_offset,
  uintptr_t groundwater_ux_offset,
  uintptr_t groundwater_uy_offset,
  uintptr_t surface_ux_offset,
  uintptr_t surface_uy_offset,
  uintptr_t flux_x_offset,
  uintptr_t flux_y_offset,
  uintptr_t h_transport_offset,
  uintptr_t soil_mineral_transport_offset
) {
  (void)size;
  (void)stencil_size;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT stencil = (const int32_t *)(uintptr_t)stencil_offset;
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)gx_w_offset;
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)gy_w_offset;
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)h_offset;
  const float *SIM_RESTRICT w0 = (const float *)(uintptr_t)w0_offset;
  const float *SIM_RESTRICT w1 = (const float *)(uintptr_t)w1_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  const float *SIM_RESTRICT soil_carbon_active = (const float *)(uintptr_t)soil_carbon_active_offset;
  const float *SIM_RESTRICT soil_carbon_stable = (const float *)(uintptr_t)soil_carbon_stable_offset;
  const float *SIM_RESTRICT top_soil_ux = (const float *)(uintptr_t)top_soil_ux_offset;
  const float *SIM_RESTRICT top_soil_uy = (const float *)(uintptr_t)top_soil_uy_offset;
  const float *SIM_RESTRICT groundwater_ux = (const float *)(uintptr_t)groundwater_ux_offset;
  const float *SIM_RESTRICT groundwater_uy = (const float *)(uintptr_t)groundwater_uy_offset;
  const float *SIM_RESTRICT surface_ux = (const float *)(uintptr_t)surface_ux_offset;
  const float *SIM_RESTRICT surface_uy = (const float *)(uintptr_t)surface_uy_offset;
  float *SIM_RESTRICT flux_x = (float *)(uintptr_t)flux_x_offset;
  float *SIM_RESTRICT flux_y = (float *)(uintptr_t)flux_y_offset;
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)h_transport_offset;
  float *SIM_RESTRICT soil_mineral_transport = (float *)(uintptr_t)soil_mineral_transport_offset;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const float top_sat = sim_clamp(w0[i] / soil_cap[i], 0.0f, 1.0f);
    const float gw_sat = sim_clamp(w1[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float mobile_fraction = nutrient_mobile_fraction(top_sat, gw_sat, soil_carbon_active[i], soil_carbon_stable[i]);
    const float mobile_n = soil_mineral_n[i] * mobile_fraction;
    const float top_weight = sim_clamp(0.68f + 0.18f * top_sat - 0.12f * gw_sat, 0.45f, 0.86f);
    const float ground_weight = 1.0f - top_weight;
    flux_x[i] = mobile_n * (top_weight * top_soil_ux[i] + ground_weight * groundwater_ux[i]);
    flux_y[i] = mobile_n * (top_weight * top_soil_uy[i] + ground_weight * groundwater_uy[i]);
  }

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t offset = i * SIM_RBF_STENCIL_SIZE;
    float surface_flux_divergence_x = 0.0f;
    float surface_flux_divergence_y = 0.0f;
    float nutrient_flux_divergence_x = 0.0f;
    float nutrient_flux_divergence_y = 0.0f;

    SIM_UNROLL_LOOP
    for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
      const int32_t weight_index = offset + k;
      const int32_t cell_id = stencil[weight_index];
      const float gx_weight = gx_w[weight_index];
      const float gy_weight = gy_w[weight_index];
      const float mobile_surface_water = sim_max(0.0f, h[cell_id] - surface_film_threshold_m);
      surface_flux_divergence_x += gx_weight * surface_ux[cell_id] * mobile_surface_water;
      surface_flux_divergence_y += gy_weight * surface_uy[cell_id] * mobile_surface_water;
      nutrient_flux_divergence_x += gx_weight * flux_x[cell_id];
      nutrient_flux_divergence_y += gy_weight * flux_y[cell_id];
    }

    h_transport[i] -= surface_flux_divergence_x + surface_flux_divergence_y;
    const float max_surface_loss = sim_max(0.0f, h[i] - surface_film_threshold_m) / model_dt_days;
    if (h_transport[i] < -max_surface_loss) {
      h_transport[i] = -max_surface_loss;
    }
    soil_mineral_transport[i] -= nutrient_flux_divergence_x + nutrient_flux_divergence_y;
    const float max_loss = sim_max(0.0f, soil_mineral_n[i] - 0.002f) * 0.32f / model_dt_days;
    const float max_gain = sim_max(0.0f, 1.4f - soil_mineral_n[i]) * 0.32f / model_dt_days;
    soil_mineral_transport[i] = sim_clamp(soil_mineral_transport[i], -max_loss, max_gain);
  }
}

SIM_EXPORT int32_t sim_compute_stable_surface_water_transport(
  int32_t size,
  int32_t stencil_size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t substeps,
  float dt_days,
  float surface_water_diff_m2_day,
  float surface_slope_velocity_m_day,
  float surface_slope_max_velocity_m_day,
  float surface_film_threshold_m,
  float surface_water_numeric_floor_m,
  uintptr_t stencil_offset,
  uintptr_t lap_w_offset,
  uintptr_t gx_w_offset,
  uintptr_t gy_w_offset,
  uintptr_t h_offset,
  uintptr_t elevation_offset,
  uintptr_t slope_x_offset,
  uintptr_t slope_y_offset,
  uintptr_t hn_offset,
  uintptr_t h_transport_offset,
  uintptr_t surface_ux_offset,
  uintptr_t surface_uy_offset
) {
  (void)size;
  (void)stencil_size;
  (void)surface_slope_velocity_m_day;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT stencil = (const int32_t *)(uintptr_t)stencil_offset;
  const float *SIM_RESTRICT lap_w = (const float *)(uintptr_t)lap_w_offset;
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)gx_w_offset;
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)gy_w_offset;
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)h_offset;
  const float *SIM_RESTRICT elevation = elevation_offset ? (const float *)(uintptr_t)elevation_offset : 0;
  const float *SIM_RESTRICT slope_x = (const float *)(uintptr_t)slope_x_offset;
  const float *SIM_RESTRICT slope_y = (const float *)(uintptr_t)slope_y_offset;
  float *SIM_RESTRICT hn = (float *)(uintptr_t)hn_offset;
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)h_transport_offset;
  float *SIM_RESTRICT surface_ux = (float *)(uintptr_t)surface_ux_offset;
  float *SIM_RESTRICT surface_uy = (float *)(uintptr_t)surface_uy_offset;

  if (substeps < 1) {
    substeps = 1;
  }
  const float sub_dt_days = dt_days / (float)substeps;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    hn[i] = h[i];
  }

  for (int32_t substep = 0; substep < substeps; substep += 1) {
    for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
      const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
      const int32_t offset = i * SIM_RBF_STENCIL_SIZE;
      float film_gx = 0.0f;
      float film_gy = 0.0f;
      float surface_mfd_x = 0.0f;
      float surface_mfd_y = 0.0f;
      float lap_surface_water = 0.0f;
      const float center_surface_head = elevation ? elevation[i] + hn[i] : 0.0f;

      SIM_UNROLL_LOOP
      for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
        const int32_t weight_index = offset + k;
        const int32_t cell_id = stencil[weight_index];
        const float value = hn[cell_id];
        film_gx += gx_w[weight_index] * value;
        film_gy += gy_w[weight_index] * value;
        if (elevation) {
          const float surface_drop = center_surface_head - (elevation[cell_id] + value);
          if (surface_drop > 0.0f) {
            surface_mfd_x += gx_w[weight_index] * surface_drop;
            surface_mfd_y += gy_w[weight_index] * surface_drop;
          }
        }
        lap_surface_water += lap_w[weight_index] * value;
      }

      const float downhill_x = elevation ? surface_mfd_x : -(slope_x[i] + film_gx);
      const float downhill_y = elevation ? surface_mfd_y : -(slope_y[i] + film_gy);
      const float surface_scale = sim_surface_water_velocity_scale(
        hn[i],
        downhill_x,
        downhill_y,
        surface_film_threshold_m,
        surface_slope_max_velocity_m_day);
      const float surface_vx = downhill_x * surface_scale;
      const float surface_vy = downhill_y * surface_scale;
      surface_ux[i] = surface_vx;
      surface_uy[i] = surface_vy;
      h_transport[i] = surface_water_diff_m2_day * lap_surface_water;
    }

    for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
      const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
      const int32_t offset = i * SIM_RBF_STENCIL_SIZE;
      float surface_flux_divergence_x = 0.0f;
      float surface_flux_divergence_y = 0.0f;

      SIM_UNROLL_LOOP
      for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
        const int32_t weight_index = offset + k;
        const int32_t cell_id = stencil[weight_index];
        const float mobile_surface_water = sim_max(0.0f, hn[cell_id] - surface_film_threshold_m);
        surface_flux_divergence_x += gx_w[weight_index] * surface_ux[cell_id] * mobile_surface_water;
        surface_flux_divergence_y += gy_w[weight_index] * surface_uy[cell_id] * mobile_surface_water;
      }
      h_transport[i] -= surface_flux_divergence_x + surface_flux_divergence_y;
    }

    for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
      const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
      const float max_surface_loss = sim_max(0.0f, hn[i] - surface_film_threshold_m) / sub_dt_days;
      if (h_transport[i] < -max_surface_loss) {
        h_transport[i] = -max_surface_loss;
      }
      float next = hn[i] + sub_dt_days * h_transport[i];
      if (!sim_is_finite(next)) {
        return 0;
      }
      if (next < 0.0f && next > -surface_water_numeric_floor_m) {
        next = 0.0f;
      }
      hn[i] = next;
    }
  }

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    h_transport[i] = (hn[i] - h[i]) / dt_days;
  }
  return 1;
}

SIM_EXPORT void sim_update_asteroid_dayside_rain(
  int32_t size,
  float mean_rain,
  float day,
  float render_size,
  float rain_scale,
  float patchiness,
  int32_t cloud_count,
  uintptr_t rain_x_offset,
  uintptr_t rain_y_offset,
  uintptr_t sunlight_offset,
  uintptr_t rain_offset
) {
  const float *SIM_RESTRICT rain_x = (const float *)(uintptr_t)rain_x_offset;
  const float *SIM_RESTRICT rain_y = (const float *)(uintptr_t)rain_y_offset;
  const float *SIM_RESTRICT sunlight = (const float *)(uintptr_t)sunlight_offset;
  float *SIM_RESTRICT rain = (float *)(uintptr_t)rain_offset;

  if (mean_rain <= 0.0f || size <= 0) {
    SIM_VECTORIZE_LOOP
    for (int32_t i = 0; i < size; i += 1) {
      rain[i] = 0.0f;
    }
    return;
  }

  if (cloud_count < 2) {
    cloud_count = 2;
  }
  if (cloud_count > 8) {
    cloud_count = 8;
  }
  sim_init_fast_tables();

  const int32_t day_key = (int32_t)sim_floor(day * 2.2f);
  float center_x[8];
  float center_y[8];
  float inv_radius2[8];
  float amp[8];

  for (int32_t index = 0; index < cloud_count; index += 1) {
    const int32_t key = day_key * 53 + index * 17;
    const float phase = sim_deterministic_unit(index, 731) * render_size;
    const float drift = day * (0.42f + sim_deterministic_unit(index, 733) * 0.36f);
    center_x[index] = sim_modulo_float(
      phase + drift + (sim_deterministic_unit(key, 735) - 0.5f) * rain_scale * 0.55f,
      render_size);
    center_y[index] =
      render_size * (0.5f + (sim_deterministic_unit(index, 737) - 0.5f) * 0.8f) +
      sim_sin(day * (0.22f + sim_deterministic_unit(index, 739) * 0.12f) + sim_deterministic_unit(index, 741) * 6.283185307179586f) *
        rain_scale * 0.42f;
    const float radius = rain_scale * (0.24f + sim_deterministic_unit(index, 743) * 0.3f);
    inv_radius2[index] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
    amp[index] = 0.78f + sim_deterministic_unit(index, 745) * 0.72f;
  }

  float raw_sum = 0.0f;
  for (int32_t i = 0; i < size; i += 1) {
    const float daylight = sim_clamp((sunlight[i] - 0.03f) / 0.68f, 0.0f, 1.0f);
    const float broad_day_rain = sim_pow_positive(daylight, 0.58f);
    float cloudiness = 0.0f;

    if (cloud_count == 8) {
      #define SIM_ACCUM_ASTEROID_CLOUD(INDEX) do { \
        const float dx = sim_periodic_delta(rain_x[i], center_x[(INDEX)], render_size); \
        const float dy = rain_y[i] - center_y[(INDEX)]; \
        const float scaled_distance2 = (dx * dx + dy * dy) * inv_radius2[(INDEX)]; \
        if (scaled_distance2 < 16.0f) { \
          cloudiness += sim_exp(-scaled_distance2) * amp[(INDEX)]; \
        } \
      } while (0)
      SIM_ACCUM_ASTEROID_CLOUD(0);
      SIM_ACCUM_ASTEROID_CLOUD(1);
      SIM_ACCUM_ASTEROID_CLOUD(2);
      SIM_ACCUM_ASTEROID_CLOUD(3);
      SIM_ACCUM_ASTEROID_CLOUD(4);
      SIM_ACCUM_ASTEROID_CLOUD(5);
      SIM_ACCUM_ASTEROID_CLOUD(6);
      SIM_ACCUM_ASTEROID_CLOUD(7);
      #undef SIM_ACCUM_ASTEROID_CLOUD
    } else {
      for (int32_t cloud_index = 0; cloud_index < cloud_count; cloud_index += 1) {
        const float dx = sim_periodic_delta(rain_x[i], center_x[cloud_index], render_size);
        const float dy = rain_y[i] - center_y[cloud_index];
        const float scaled_distance2 = (dx * dx + dy * dy) * inv_radius2[cloud_index];
        if (scaled_distance2 < 16.0f) {
          cloudiness += sim_exp(-scaled_distance2) * amp[cloud_index];
        }
      }
    }

    cloudiness = sim_clamp((cloudiness - 0.12f) / 0.78f, 0.0f, 1.0f);
    const float moving_veil = sim_asteroid_rain_veil(rain_x[i], rain_y[i], render_size, day_key, day);
    const float cloud_mask = (1.0f - patchiness) * 0.58f + patchiness * (0.035f + 0.965f * cloudiness);
    const float local = broad_day_rain * sim_clamp(moving_veil * cloud_mask, 0.025f, 1.18f);
    rain[i] = local;
    raw_sum += local;
  }

  const float scale = raw_sum > 0.0f ? (mean_rain * (float)size) / raw_sum : 0.0f;
  for (int32_t i = 0; i < size; i += 1) {
    rain[i] *= scale;
  }
}

SIM_EXPORT void sim_update_earth_rain(
  int32_t size,
  float mean_rain,
  float render_size,
  float patchiness,
  float tropical_scale,
  float mid_latitude_scale,
  int32_t tropical_count,
  int32_t mid_latitude_count,
  uintptr_t rain_x_offset,
  uintptr_t rain_y_offset,
  uintptr_t rain_tropics_offset,
  uintptr_t rain_mid_latitude_offset,
  uintptr_t rain_weak_background_offset,
  uintptr_t rain_climatology_offset,
  uintptr_t tropical_x_offset,
  uintptr_t tropical_y_offset,
  uintptr_t tropical_radius_offset,
  uintptr_t tropical_core_radius_offset,
  uintptr_t tropical_core_amp_offset,
  uintptr_t tropical_amp_offset,
  uintptr_t mid_x_offset,
  uintptr_t mid_y_offset,
  uintptr_t mid_radius_offset,
  uintptr_t mid_cos_phase_offset,
  uintptr_t mid_sin_phase_offset,
  uintptr_t mid_amp_offset,
  uintptr_t rain_offset
) {
  const float *SIM_RESTRICT rain_x = (const float *)(uintptr_t)rain_x_offset;
  const float *SIM_RESTRICT rain_y = (const float *)(uintptr_t)rain_y_offset;
  const float *SIM_RESTRICT rain_tropics = (const float *)(uintptr_t)rain_tropics_offset;
  const float *SIM_RESTRICT rain_mid_latitude = (const float *)(uintptr_t)rain_mid_latitude_offset;
  const float *SIM_RESTRICT rain_weak_background = (const float *)(uintptr_t)rain_weak_background_offset;
  const float *SIM_RESTRICT rain_climatology = (const float *)(uintptr_t)rain_climatology_offset;
  const float *SIM_RESTRICT tropical_x = (const float *)(uintptr_t)tropical_x_offset;
  const float *SIM_RESTRICT tropical_y = (const float *)(uintptr_t)tropical_y_offset;
  const float *SIM_RESTRICT tropical_radius = (const float *)(uintptr_t)tropical_radius_offset;
  const float *SIM_RESTRICT tropical_core_radius = (const float *)(uintptr_t)tropical_core_radius_offset;
  const float *SIM_RESTRICT tropical_core_amp = (const float *)(uintptr_t)tropical_core_amp_offset;
  const float *SIM_RESTRICT tropical_amp = (const float *)(uintptr_t)tropical_amp_offset;
  const float *SIM_RESTRICT mid_x = (const float *)(uintptr_t)mid_x_offset;
  const float *SIM_RESTRICT mid_y = (const float *)(uintptr_t)mid_y_offset;
  const float *SIM_RESTRICT mid_radius = (const float *)(uintptr_t)mid_radius_offset;
  const float *SIM_RESTRICT mid_cos_phase = (const float *)(uintptr_t)mid_cos_phase_offset;
  const float *SIM_RESTRICT mid_sin_phase = (const float *)(uintptr_t)mid_sin_phase_offset;
  const float *SIM_RESTRICT mid_amp = (const float *)(uintptr_t)mid_amp_offset;
  float *SIM_RESTRICT rain = (float *)(uintptr_t)rain_offset;

  if (mean_rain <= 0.0f || size <= 0) {
    SIM_VECTORIZE_LOOP
    for (int32_t i = 0; i < size; i += 1) {
      rain[i] = 0.0f;
    }
    return;
  }

  if (tropical_count < 0) {
    tropical_count = 0;
  }
  if (tropical_count > 12) {
    tropical_count = 12;
  }
  if (mid_latitude_count < 0) {
    mid_latitude_count = 0;
  }
  if (mid_latitude_count > 11) {
    mid_latitude_count = 11;
  }

  float tropical_inv_radius2[12];
  float tropical_inv_core_radius2[12];
  for (int32_t storm = 0; storm < tropical_count; storm += 1) {
    const float radius = tropical_scale * tropical_radius[storm];
    tropical_inv_radius2[storm] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
    float core_radius = radius * tropical_core_radius[storm];
    if (core_radius < 0.35f) {
      core_radius = 0.35f;
    }
    tropical_inv_core_radius2[storm] = core_radius > 0.0f ? 1.0f / (core_radius * core_radius) : 0.0f;
  }

  float mid_inv_radius2[11];
  for (int32_t storm = 0; storm < mid_latitude_count; storm += 1) {
    const float radius = mid_latitude_scale * mid_radius[storm];
    mid_inv_radius2[storm] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
  }

  const float broad_climate_rain = 0.16f + 0.44f * (1.0f - patchiness);
  float raw_sum = 0.0f;
  float climatology_sum = 0.0f;
  for (int32_t i = 0; i < size; i += 1) {
    const float x = rain_x[i];
    const float y = rain_y[i];
    const float tropics = rain_tropics[i];
    const float mid_latitude = rain_mid_latitude[i];
    float tropical_rain = 0.0f;
    float mid_latitude_rain = 0.0f;

    for (int32_t storm = 0; storm < tropical_count; storm += 1) {
      const float dx = sim_periodic_delta(x, tropical_x[storm], render_size);
      const float dy = y - tropical_y[storm];
      const float distance2 = dx * dx + dy * dy;
      const float envelope = sim_exp(-0.5f * distance2 * tropical_inv_radius2[storm]);
      const float core = sim_exp(-0.5f * distance2 * tropical_inv_core_radius2[storm]);
      tropical_rain += tropical_amp[storm] * (0.34f * envelope + tropical_core_amp[storm] * core);
    }

    for (int32_t storm = 0; storm < mid_latitude_count; storm += 1) {
      const float dx = sim_periodic_delta(x, mid_x[storm], render_size);
      const float dy = y - mid_y[storm];
      const float distance2 = dx * dx + dy * dy;
      const float core = sim_exp(-0.5f * distance2 * mid_inv_radius2[storm]);
      float cos_angle = 1.0f;
      float sin_angle = 0.0f;
      if (distance2 > 1.0e-12f) {
        const float inv_distance = 1.0f / sim_sqrt(distance2);
        cos_angle = dx * inv_distance;
        sin_angle = dy * inv_distance;
      }
      const float lopsided = 0.78f + 0.22f * (cos_angle * mid_cos_phase[storm] + sin_angle * mid_sin_phase[storm]);
      mid_latitude_rain += mid_amp[storm] * core * lopsided;
    }

    const float weak_background = rain_weak_background[i];
    const float climate = sim_max(0.0f, rain_climatology[i]);
    const float local =
      climate *
      (broad_climate_rain +
        weak_background +
        patchiness * (0.58f * tropics * tropical_rain + 0.72f * mid_latitude * mid_latitude_rain));
    rain[i] = local;
    raw_sum += local;
    climatology_sum += climate;
  }

  const float storm_scale = raw_sum > 0.0f ? (climatology_sum * mean_rain) / raw_sum : 0.0f;
  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    rain[i] *= storm_scale;
  }
}

static void sim_update_earth_rain_generated(
  int32_t size,
  float mean_rain,
  float day,
  float render_size,
  float patchiness,
  float rain_scale,
  uintptr_t rain_x_offset,
  uintptr_t rain_y_offset,
  uintptr_t rain_tropics_offset,
  uintptr_t rain_mid_latitude_offset,
  uintptr_t rain_weak_background_offset,
  uintptr_t rain_climatology_offset,
  uintptr_t rain_offset
) {
  if (render_size <= 0.0f) {
    float *SIM_RESTRICT rain = (float *)(uintptr_t)rain_offset;
    SIM_VECTORIZE_LOOP
    for (int32_t i = 0; i < size; i += 1) {
      rain[i] = 0.0f;
    }
    return;
  }

  const float tropical_scale = rain_scale * 0.48f;
  const float mid_latitude_scale = rain_scale * 0.92f;
  const int32_t convective_key = (int32_t)sim_floor(day * 1.45f);
  const int32_t burst_key = (int32_t)sim_floor(day * 3.1f);
  int32_t tropical_count = (int32_t)(render_size / sim_max(8.0f, rain_scale * 0.72f) + 0.5f);
  int32_t mid_count = (int32_t)(render_size / sim_max(10.0f, rain_scale * 0.82f) + 0.5f);
  if (tropical_count < 4) {
    tropical_count = 4;
  }
  if (tropical_count > 12) {
    tropical_count = 12;
  }
  if (mid_count < 4) {
    mid_count = 4;
  }
  if (mid_count > 11) {
    mid_count = 11;
  }

  float tropical_x[12];
  float tropical_y[12];
  float tropical_radius[12];
  float tropical_core_radius[12];
  float tropical_core_amp[12];
  float tropical_amp[12];
  float mid_x[11];
  float mid_y[11];
  float mid_radius[11];
  float mid_cos_phase[11];
  float mid_sin_phase[11];
  float mid_amp[11];

  const int32_t strong_index = (int32_t)sim_floor(sim_deterministic_unit(convective_key, 161) * (float)tropical_count);
  for (int32_t index = 0; index < tropical_count; index += 1) {
    const int32_t key = convective_key * 37 + index * 11;
    const int32_t burst = burst_key * 41 + index * 13;
    const float phase = sim_deterministic_unit(key, 101) * render_size;
    const float drift = sim_modulo_float(day * (0.2f + sim_deterministic_unit(index, 102) * 0.22f), render_size);
    const float jitter = (sim_deterministic_unit(key, 103) - 0.5f) * render_size * 0.22f;
    const float latitude_jitter = (sim_deterministic_unit(key, 104) - 0.5f) * 0.28f;
    const int32_t is_strong_core = index == strong_index;
    float active_pulse = 0.0f;
    if (is_strong_core) {
      active_pulse = 1.2f + sim_deterministic_unit(burst, 116) * 0.55f;
    } else if (sim_deterministic_unit(burst, 105) > 0.36f) {
      active_pulse = 0.74f + sim_deterministic_unit(burst, 106) * 0.68f;
    } else {
      active_pulse = 0.1f + sim_deterministic_unit(burst, 107) * 0.18f;
    }
    tropical_x[index] = sim_modulo_float(phase + drift + jitter, render_size);
    tropical_y[index] = render_size * (0.5f + latitude_jitter);
    tropical_radius[index] =
      is_strong_core ? 0.22f + sim_deterministic_unit(key, 108) * 0.12f : 0.32f + sim_deterministic_unit(key, 109) * 0.28f;
    tropical_core_radius[index] =
      is_strong_core ? 0.16f + sim_deterministic_unit(key, 110) * 0.08f : 0.24f + sim_deterministic_unit(key, 111) * 0.14f;
    tropical_core_amp[index] =
      is_strong_core ? 3.2f + sim_deterministic_unit(key, 112) * 1.6f : 0.7f + sim_deterministic_unit(key, 113) * 0.9f;
    tropical_amp[index] =
      (is_strong_core ? 1.85f + sim_deterministic_unit(key, 114) * 1.45f : 0.46f + sim_deterministic_unit(key, 115) * 0.95f) *
      active_pulse;
  }

  for (int32_t index = 0; index < mid_count; index += 1) {
    const float hemisphere = sim_deterministic_unit(index, 206) < 0.54f ? -1.0f : 1.0f;
    const float phase = sim_deterministic_unit(index, 201) * render_size;
    const float eastward_drift = day * (1.55f + sim_deterministic_unit(index, 202) * 0.55f);
    const float latitude =
      0.19f +
      sim_deterministic_unit(index, 203) * 0.17f +
      0.045f *
        sim_sin(day * (0.12f + sim_deterministic_unit(index, 207) * 0.08f) +
          sim_deterministic_unit(index, 208) * 6.283185307179586f);
    const float meander =
      0.035f *
      sim_sin(day * (0.18f + sim_deterministic_unit(index, 209) * 0.11f) +
        sim_deterministic_unit(index, 210) * 6.283185307179586f);
    const float phase_angle =
      sim_deterministic_unit(index, 211) * 6.283185307179586f + day * (0.09f + sim_deterministic_unit(index, 212) * 0.08f);
    mid_x[index] = sim_modulo_float(phase + eastward_drift, render_size);
    mid_y[index] = render_size * (0.5f + hemisphere * latitude + meander);
    mid_radius[index] = 0.72f + sim_deterministic_unit(index, 204) * 0.46f;
    mid_cos_phase[index] = sim_cos(phase_angle);
    mid_sin_phase[index] = sim_sin(phase_angle);
    mid_amp[index] = 0.68f + sim_deterministic_unit(index, 205) * 0.95f;
  }

  sim_update_earth_rain(
    size,
    mean_rain,
    render_size,
    patchiness,
    tropical_scale,
    mid_latitude_scale,
    tropical_count,
    mid_count,
    rain_x_offset,
    rain_y_offset,
    rain_tropics_offset,
    rain_mid_latitude_offset,
    rain_weak_background_offset,
    rain_climatology_offset,
    (uintptr_t)tropical_x,
    (uintptr_t)tropical_y,
    (uintptr_t)tropical_radius,
    (uintptr_t)tropical_core_radius,
    (uintptr_t)tropical_core_amp,
    (uintptr_t)tropical_amp,
    (uintptr_t)mid_x,
    (uintptr_t)mid_y,
    (uintptr_t)mid_radius,
    (uintptr_t)mid_cos_phase,
    (uintptr_t)mid_sin_phase,
    (uintptr_t)mid_amp,
    rain_offset
  );
}

SIM_EXPORT void sim_update_rain_memory(
  int32_t size,
  float rain_average_weight,
  uintptr_t rain_offset,
  uintptr_t rain_memory_offset
) {
  const float *SIM_RESTRICT rain = (const float *)(uintptr_t)rain_offset;
  float *SIM_RESTRICT rain_memory = (float *)(uintptr_t)rain_memory_offset;

  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    rain_memory[i] += (rain[i] - rain_memory[i]) * rain_average_weight;
  }
}

static inline int32_t sim_add_rose_kernel_target(
  int32_t target,
  int32_t size,
  const uint8_t *land_active,
  uint32_t *marks,
  uint32_t token,
  int32_t target_count
) {
  if (target < 0 || target >= size || land_active[target] != 1u || marks[target] == token) {
    return target_count;
  }
  if (target_count >= SIM_ROSE_KERNEL_SCRATCH_SIZE) {
    return target_count;
  }
  marks[target] = token;
  sim_rose_kernel_targets[target_count] = target;
  return target_count + 1;
}

enum {
  SIM_TERRAIN_SAND = 0,
  SIM_TERRAIN_ROCK = 1,
  SIM_TERRAIN_VOLCANO = 2,
  SIM_TERRAIN_CRACK = 3,
  SIM_TERRAIN_PATH = 4,
  SIM_TERRAIN_WATER = 5,
  SIM_TERRAIN_MOSS = 6,
  SIM_TERRAIN_ROSE = 7,
  SIM_TERRAIN_MEADOW = 8
};

enum {
  SIM_EARTH_PROFILE_CELL_HEIGHT = 0,
  SIM_EARTH_PROFILE_CELL_PHI = 1,
  SIM_EARTH_PROFILE_LAND_FRACTION_U8 = 2,
  SIM_EARTH_PROFILE_ELEVATION_I16 = 3,
  SIM_EARTH_PROFILE_CLIMATE_I16 = 4,
  SIM_EARTH_PROFILE_TERRAIN_CODE = 5,
  SIM_EARTH_PROFILE_KOPPEN_CODE = 6,
  SIM_EARTH_PROFILE_MOISTURE = 7,
  SIM_EARTH_PROFILE_SOIL = 8,
  SIM_EARTH_PROFILE_BAOBAB_RISK = 9,
  SIM_EARTH_PROFILE_FLOWER = 10,
  SIM_EARTH_PROFILE_ELEVATION = 11,
  SIM_EARTH_PROFILE_CLIMATE_MEAN_TEMP_C = 12,
  SIM_EARTH_PROFILE_CLIMATE_DIURNAL_RANGE_C = 13,
  SIM_EARTH_PROFILE_RAIN_CLIMATOLOGY = 14,
  SIM_EARTH_PROFILE_FIELD_COUNT = 15
};

enum {
  SIM_ASTEROID_PROFILE_CELL_HEIGHT = 0,
  SIM_ASTEROID_PROFILE_CELL_PHI = 1,
  SIM_ASTEROID_PROFILE_CELL_RING = 2,
  SIM_ASTEROID_PROFILE_VOLCANO_HEIGHT = 3,
  SIM_ASTEROID_PROFILE_VOLCANO_PHI = 4,
  SIM_ASTEROID_PROFILE_VOLCANO_RING = 5,
  SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_HEIGHT = 6,
  SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_PHI = 7,
  SIM_ASTEROID_PROFILE_ACTIVE_CENTER_HEIGHT = 8,
  SIM_ASTEROID_PROFILE_ACTIVE_CENTER_PHI = 9,
  SIM_ASTEROID_PROFILE_WATER_HEIGHT = 10,
  SIM_ASTEROID_PROFILE_WATER_PHI = 11,
  SIM_ASTEROID_PROFILE_BAOBAB_WATCH_HEIGHT = 12,
  SIM_ASTEROID_PROFILE_BAOBAB_WATCH_PHI = 13,
  SIM_ASTEROID_PROFILE_VOLCANO_MASK = 14,
  SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_MASK = 15,
  SIM_ASTEROID_PROFILE_TERRAIN_CODE = 16,
  SIM_ASTEROID_PROFILE_MOISTURE = 17,
  SIM_ASTEROID_PROFILE_SOIL = 18,
  SIM_ASTEROID_PROFILE_BAOBAB_RISK = 19,
  SIM_ASTEROID_PROFILE_BAOBAB_BLOCKED = 20,
  SIM_ASTEROID_PROFILE_ASH = 21,
  SIM_ASTEROID_PROFILE_ELEVATION = 22,
  SIM_ASTEROID_PROFILE_VOLCANIC_ASH_FALL_RATE = 23,
  SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_CRATER_MASK = 24,
  SIM_ASTEROID_PROFILE_CARE = 25,
  SIM_ASTEROID_PROFILE_FIELD_COUNT = 26
};

enum {
  SIM_INIT_TERRAIN_CODE = 0,
  SIM_INIT_MOISTURE = 1,
  SIM_INIT_SOIL = 2,
  SIM_INIT_FLOWER = 3,
  SIM_INIT_ASH_INPUT = 4,
  SIM_INIT_BAOBAB_INPUT = 5,
  SIM_INIT_ROSE_GARDEN_MASK = 6,
  SIM_INIT_BAOBAB_RISK_INPUT = 7,
  SIM_INIT_BAOBAB_BLOCKED_INPUT = 8,
  SIM_INIT_ELEVATION_INPUT = 9,
  SIM_INIT_CELL_HEIGHT_INPUT = 10,
  SIM_INIT_CELL_PHI = 11,
  SIM_INIT_CLIMATE_MEAN_INPUT = 12,
  SIM_INIT_CLIMATE_DIURNAL_INPUT = 13,
  SIM_INIT_RAIN_CLIMATOLOGY_INPUT = 14,
  SIM_INIT_LAND_ACTIVE = 15,
  SIM_INIT_SUBSTRATE = 16,
  SIM_INIT_DEPTH = 17,
  SIM_INIT_ROSE_FERTILITY = 18,
  SIM_INIT_BAOBAB_RISK = 19,
  SIM_INIT_BAOBAB_BLOCKED = 20,
  SIM_INIT_SUNLIGHT = 21,
  SIM_INIT_CELL_HEIGHT = 22,
  SIM_INIT_CLIMATE_MEAN_TEMP_C = 23,
  SIM_INIT_CLIMATE_DIURNAL_RANGE_C = 24,
  SIM_INIT_ELEVATION = 25,
  SIM_INIT_RAIN_CLIMATOLOGY = 26,
  SIM_INIT_H = 27,
  SIM_INIT_R = 28,
  SIM_INIT_RAIN_MEMORY = 29,
  SIM_INIT_ASH_STRESS = 30,
  SIM_INIT_SOIL_CAP = 31,
  SIM_INIT_SOIL_RESIDUAL = 32,
  SIM_INIT_SOIL_THICKNESS = 33,
  SIM_INIT_SOIL_CENTER_DEPTH = 34,
  SIM_INIT_SOIL_WATER = 35,
  SIM_INIT_W0 = 36,
  SIM_INIT_W1 = 37,
  SIM_INIT_GROUNDWATER_STORAGE = 38,
  SIM_INIT_GROUNDWATER_CAP = 39,
  SIM_INIT_GROUNDWATER_THICKNESS = 40,
  SIM_INIT_GROUNDWATER_TOP_DEPTH = 41,
  SIM_INIT_SOIL_MINERAL_N = 42,
  SIM_INIT_LITTER_CARBON = 43,
  SIM_INIT_LITTER_FAST_CARBON = 44,
  SIM_INIT_LITTER_SLOW_CARBON = 45,
  SIM_INIT_SOIL_CARBON_ACTIVE = 46,
  SIM_INIT_SOIL_CARBON_STABLE = 47,
  SIM_INIT_NUTRIENT_STRESS_BAOBAB = 48,
  SIM_INIT_NUTRIENT_STRESS_ROSE = 49,
  SIM_INIT_BAOBAB_LEAF = 50,
  SIM_INIT_BAOBAB_STEM = 51,
  SIM_INIT_BAOBAB_ROOT = 52,
  SIM_INIT_BAOBAB_STORE = 53,
  SIM_INIT_MB = 54,
  SIM_INIT_SB = 55,
  SIM_INIT_ROSE_LEAF = 56,
  SIM_INIT_ROSE_FLOWER = 57,
  SIM_INIT_ROSE_ROOT = 58,
  SIM_INIT_ROSE_STORE = 59,
  SIM_INIT_MR = 60,
  SIM_INIT_BAOBAB_SEED = 61,
  SIM_INIT_ROSE_SEED = 62,
  SIM_INIT_BAOBAB_READINESS = 63,
  SIM_INIT_ROSE_READINESS = 64,
  SIM_INIT_FIELD_COUNT = 65
};

static inline float sim_seeded_noise_nside(int32_t id, int32_t salt, int32_t nside) {
  const float value =
    sim_sin(((float)id + 1.0f) * 12.9898f + ((float)salt + 1.0f) * 78.233f + (float)nside * 37.719f) *
    43758.5453f;
  return value - sim_floor(value);
}

static inline float sim_smoothstep(float value, float edge0, float edge1) {
  const float t = sim_clamp((value - edge0) / (edge1 - edge0 == 0.0f ? 1.0f : edge1 - edge0), 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

static inline float sim_signed_lon_delta_deg(float lon, float center_lon) {
  float delta = lon - center_lon;
  while (delta <= -180.0f) {
    delta += 360.0f;
  }
  while (delta > 180.0f) {
    delta -= 360.0f;
  }
  return delta;
}

static inline float sim_geo_blob(float lon, float lat, float center_lon, float center_lat, float lon_scale, float lat_scale, float amplitude) {
  const float dx = sim_signed_lon_delta_deg(lon, center_lon);
  const float dy = lat - center_lat;
  return amplitude * sim_exp(-0.5f * ((dx / lon_scale) * (dx / lon_scale) + (dy / lat_scale) * (dy / lat_scale)));
}

#define SIM_ERA5_CLOUD_WIDTH 361
#define SIM_ERA5_CLOUD_HEIGHT 181
#define SIM_ERA5_CLOUD_MONTHS 12
#define SIM_ERA5_CLOUD_MONTH_SIZE (SIM_ERA5_CLOUD_WIDTH * SIM_ERA5_CLOUD_HEIGHT)

static inline float sim_sample_era5_cloud_month(const uint8_t *SIM_RESTRICT cloud_data, int32_t month, float lon, float lat) {
  float x = lon + 180.0f;
  float y = lat + 90.0f;
  if (x < 0.0f) {
    x = 0.0f;
  } else if (x > 360.0f) {
    x = 360.0f;
  }
  if (y < 0.0f) {
    y = 0.0f;
  } else if (y > 180.0f) {
    y = 180.0f;
  }

  const int32_t x0 = (int32_t)sim_floor(x);
  const int32_t y0 = (int32_t)sim_floor(y);
  const int32_t x1 = x0 + 1 < SIM_ERA5_CLOUD_WIDTH ? x0 + 1 : SIM_ERA5_CLOUD_WIDTH - 1;
  const int32_t y1 = y0 + 1 < SIM_ERA5_CLOUD_HEIGHT ? y0 + 1 : SIM_ERA5_CLOUD_HEIGHT - 1;
  const float fx = x - (float)x0;
  const float fy = y - (float)y0;
  const int32_t offset = month * SIM_ERA5_CLOUD_MONTH_SIZE;
  const float inv_u8 = 1.0f / 255.0f;
  const float v00 = (float)cloud_data[offset + y0 * SIM_ERA5_CLOUD_WIDTH + x0] * inv_u8;
  const float v10 = (float)cloud_data[offset + y0 * SIM_ERA5_CLOUD_WIDTH + x1] * inv_u8;
  const float v01 = (float)cloud_data[offset + y1 * SIM_ERA5_CLOUD_WIDTH + x0] * inv_u8;
  const float v11 = (float)cloud_data[offset + y1 * SIM_ERA5_CLOUD_WIDTH + x1] * inv_u8;
  const float south = v00 * (1.0f - fx) + v10 * fx;
  const float north = v01 * (1.0f - fx) + v11 * fx;
  return south * (1.0f - fy) + north * fy;
}

static inline float sim_earth_cloud_noise(float phi, float height, float model_day, int32_t salt, float mid_latitude, float tropical) {
  const float phase = (float)salt * 0.031f;
  const float drift = model_day * (0.11f + mid_latitude * 0.18f + tropical * 0.05f);
  const float wave_a = sim_fast_sin_periodic(phi * 2.1f + height * 4.8f - drift + phase);
  const float wave_b = sim_fast_cos_periodic(phi * 4.4f - height * 7.1f - drift * 1.45f - phase * 1.7f);
  const float wave_c = sim_fast_sin_periodic(sim_fast_cos_periodic(phi - drift * 0.62f + phase) * 3.2f + height * 5.5f);
  const float wave_d = sim_fast_cos_periodic(phi * 7.0f + height * 10.5f - drift * 2.1f + phase * 0.7f);
  return sim_clamp(0.5f + wave_a * 0.23f + wave_b * 0.17f + wave_c * 0.12f + wave_d * 0.07f, 0.0f, 1.0f);
}

SIM_EXPORT void sim_prepare_earth_cloud_geometry(
  int32_t size,
  uintptr_t cell_height_offset,
  uintptr_t cell_phi_offset,
  uintptr_t cell_lon_deg_offset,
  uintptr_t cell_lat_deg_offset,
  uintptr_t cloud_mid_latitude_offset,
  uintptr_t cloud_tropical_offset,
  uintptr_t cloud_tropical_pulse_offset,
  uintptr_t cloud_polar_offset
) {
  sim_init_fast_tables();

  const float *SIM_RESTRICT cell_height = (const float *)(uintptr_t)cell_height_offset;
  const float *SIM_RESTRICT cell_phi = (const float *)(uintptr_t)cell_phi_offset;
  float *SIM_RESTRICT cell_lon_deg = (float *)(uintptr_t)cell_lon_deg_offset;
  float *SIM_RESTRICT cell_lat_deg = (float *)(uintptr_t)cell_lat_deg_offset;
  float *SIM_RESTRICT cloud_mid_latitude = (float *)(uintptr_t)cloud_mid_latitude_offset;
  float *SIM_RESTRICT cloud_tropical = (float *)(uintptr_t)cloud_tropical_offset;
  float *SIM_RESTRICT cloud_tropical_pulse = (float *)(uintptr_t)cloud_tropical_pulse_offset;
  float *SIM_RESTRICT cloud_polar = (float *)(uintptr_t)cloud_polar_offset;

  const float pi = 3.141592653589793f;
  const float rad_to_deg = 180.0f / pi;
  for (int32_t i = 0; i < size; i += 1) {
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    float lon = cell_phi[i] * rad_to_deg;
    if (lon > 180.0f) {
      lon -= 360.0f;
    }
    const float abs_height = sim_abs(height);
    const float mid_arg = (abs_height - 0.62f) / 0.22f;
    const float tropical_arg = height / 0.28f;
    const float tropical_pulse_arg = height / 0.24f;
    cell_lon_deg[i] = lon;
    cell_lat_deg[i] = sim_asin(height) * rad_to_deg;
    cloud_mid_latitude[i] = sim_exp(-0.5f * mid_arg * mid_arg);
    cloud_tropical[i] = sim_exp(-0.5f * tropical_arg * tropical_arg);
    cloud_tropical_pulse[i] = sim_exp(-0.5f * tropical_pulse_arg * tropical_pulse_arg);
    cloud_polar[i] = sim_smoothstep(abs_height, 0.74f, 0.96f);
  }
}

SIM_EXPORT void sim_update_earth_cloud_cover(
  int32_t size,
  float model_day,
  uintptr_t cell_height_offset,
  uintptr_t cell_phi_offset,
  uintptr_t era5_cloud_offset,
  uintptr_t cloud_cover_offset,
  uintptr_t cloud_weather_offset,
  uintptr_t cell_lon_deg_offset,
  uintptr_t cell_lat_deg_offset,
  uintptr_t cloud_mid_latitude_offset,
  uintptr_t cloud_tropical_offset,
  uintptr_t cloud_tropical_pulse_offset,
  uintptr_t cloud_polar_offset
) {
  sim_init_fast_tables();

  const float *SIM_RESTRICT cell_height = (const float *)(uintptr_t)cell_height_offset;
  const float *SIM_RESTRICT cell_phi = (const float *)(uintptr_t)cell_phi_offset;
  const uint8_t *SIM_RESTRICT cloud_data = (const uint8_t *)(uintptr_t)era5_cloud_offset;
  float *SIM_RESTRICT cloud_cover = (float *)(uintptr_t)cloud_cover_offset;
  float *SIM_RESTRICT cloud_weather = (float *)(uintptr_t)cloud_weather_offset;
  const float *SIM_RESTRICT cell_lon_deg = (const float *)(uintptr_t)cell_lon_deg_offset;
  const float *SIM_RESTRICT cell_lat_deg = (const float *)(uintptr_t)cell_lat_deg_offset;
  const float *SIM_RESTRICT cloud_mid_latitude = (const float *)(uintptr_t)cloud_mid_latitude_offset;
  const float *SIM_RESTRICT cloud_tropical = (const float *)(uintptr_t)cloud_tropical_offset;
  const float *SIM_RESTRICT cloud_tropical_pulse = (const float *)(uintptr_t)cloud_tropical_pulse_offset;
  const float *SIM_RESTRICT cloud_polar = (const float *)(uintptr_t)cloud_polar_offset;

  const float day = sim_modulo_float(model_day - 1.0f, 365.0f);
  const float month_float = (day / 365.0f) * (float)SIM_ERA5_CLOUD_MONTHS;
  const int32_t month_floor = (int32_t)sim_floor(month_float);
  const int32_t month0 = sim_modulo_int(month_floor, SIM_ERA5_CLOUD_MONTHS);
  const int32_t month1 = sim_modulo_int(month0 + 1, SIM_ERA5_CLOUD_MONTHS);
  const float month_weight = month_float - (float)month_floor;

  for (int32_t i = 0; i < size; i += 1) {
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float phi = cell_phi[i];
    const float lon = cell_lon_deg[i];
    const float lat = cell_lat_deg[i];
    const float c0 = sim_sample_era5_cloud_month(cloud_data, month0, lon, lat);
    const float c1 = sim_sample_era5_cloud_month(cloud_data, month1, lon, lat);
    const float mean = sim_clamp(c0 * (1.0f - month_weight) + c1 * month_weight, 0.0f, 1.0f);

    const float mid_latitude = cloud_mid_latitude[i];
    const float tropical = cloud_tropical[i];
    const float tropical_pulse = cloud_tropical_pulse[i];
    const float polar = cloud_polar[i];

    const float synoptic = sim_earth_cloud_noise(phi, height, model_day, 17, mid_latitude, tropical);
    const float mesoscale = sim_earth_cloud_noise(phi, height, model_day * 1.7f + 13.5f, 61, mid_latitude, tropical);
    const float variability = sim_clamp(
      0.72f * synoptic + 0.28f * mesoscale + (mesoscale - 0.5f) * tropical_pulse * 0.18f,
      0.0f,
      1.0f
    );
    const float polar_breaks = sim_earth_cloud_noise(phi, height, model_day * 0.42f + 31.0f, 113, mid_latitude, tropical);
    const float threshold = sim_clamp(1.0f - mean + polar * 0.11f * (1.0f - polar_breaks), 0.0f, 1.0f);
    const float occurrence = sim_smoothstep(variability, threshold - 0.055f, threshold + 0.055f);
    const float optical_depth = sim_clamp(0.34f + mean * 0.52f + (mesoscale - 0.5f) * 0.16f, 0.0f, 1.0f);
    cloud_cover[i] = mean;
    cloud_weather[i] = sim_clamp(occurrence * optical_depth, 0.0f, 1.0f);
  }
}

static inline float sim_earth_antarctic_ice_land_fraction(float lon, float lat) {
  if (lat > -58.0f) {
    return 0.0f;
  }
  const float lon_rad = lon * 0.017453292519943295f;
  const float coast_lat =
    -71.5f +
    3.6f * sim_cos(lon_rad + 0.2f) +
    2.0f * sim_cos(2.0f * lon_rad - 1.1f) -
    1.4f * sim_cos(3.0f * lon_rad + 0.7f);
  const float main_ice = 1.0f - sim_smoothstep(lat, coast_lat, coast_lat + 3.2f);
  const float peninsula =
    sim_geo_blob(lon, lat, -62.0f, -66.0f, 12.0f, 5.0f, 1.0f) +
    sim_geo_blob(lon, lat, -66.0f, -69.0f, 8.0f, 4.0f, 0.72f);
  const float ice_shelves =
    sim_geo_blob(lon, lat, -45.0f, -75.0f, 22.0f, 6.0f, 0.38f) +
    sim_geo_blob(lon, lat, 170.0f, -76.0f, 30.0f, 6.0f, 0.28f);
  return sim_clamp(sim_max(main_ice, sim_max(peninsula, ice_shelves)), 0.0f, 1.0f);
}

static inline float sim_earth_greenland_ice_land_fraction(float lon, float lat) {
  if (lat < 58.0f) {
    return 0.0f;
  }
  return sim_clamp(
    sim_geo_blob(lon, lat, -42.0f, 73.0f, 18.0f, 10.0f, 1.0f) +
      sim_geo_blob(lon, lat, -47.0f, 66.0f, 8.0f, 5.0f, 0.62f),
    0.0f,
    1.0f
  );
}

static inline float sim_earth_mountain_score(float lon, float lat) {
  const float polar_highland = sim_smoothstep(sim_abs(lat), 68.0f, 82.0f) * 0.22f;
  return sim_clamp(
    sim_geo_blob(lon, lat, -72.0f, -18.0f, 7.0f, 34.0f, 1.05f) +
      sim_geo_blob(lon, lat, -112.0f, 46.0f, 12.0f, 20.0f, 0.66f) +
      sim_geo_blob(lon, lat, 86.0f, 31.0f, 22.0f, 7.0f, 1.05f) +
      sim_geo_blob(lon, lat, 44.0f, 39.0f, 18.0f, 8.0f, 0.42f) +
      sim_geo_blob(lon, lat, 36.0f, 4.0f, 9.0f, 16.0f, 0.46f) +
      sim_geo_blob(lon, lat, 145.0f, -40.0f, 10.0f, 5.0f, 0.38f) +
      polar_highland,
    0.0f,
    1.0f
  );
}

static inline float sim_earth_desert_score(float lon, float lat) {
  const float subtropical_dry = sim_exp(-0.5f * ((sim_abs(lat) - 25.0f) / 9.0f) * ((sim_abs(lat) - 25.0f) / 9.0f)) * 0.28f;
  return sim_clamp(
    subtropical_dry +
      sim_geo_blob(lon, lat, 14.0f, 23.0f, 30.0f, 11.0f, 0.95f) +
      sim_geo_blob(lon, lat, 47.0f, 23.0f, 16.0f, 8.0f, 0.74f) +
      sim_geo_blob(lon, lat, 90.0f, 42.0f, 24.0f, 8.0f, 0.58f) +
      sim_geo_blob(lon, lat, 133.0f, -25.0f, 24.0f, 10.0f, 0.92f) +
      sim_geo_blob(lon, lat, -72.0f, -22.0f, 5.0f, 16.0f, 0.72f) +
      sim_geo_blob(lon, lat, 20.0f, -25.0f, 14.0f, 10.0f, 0.66f) +
      sim_geo_blob(lon, lat, -113.0f, 31.0f, 18.0f, 9.0f, 0.5f) +
      sim_geo_blob(lon, lat, -68.0f, -44.0f, 12.0f, 8.0f, 0.36f),
    0.0f,
    1.0f
  );
}

static inline float sim_earth_rainforest_score(float lon, float lat) {
  const float equatorial = sim_exp(-0.5f * (lat / 12.0f) * (lat / 12.0f));
  return sim_clamp(
    equatorial *
      (sim_geo_blob(lon, lat, -62.0f, -5.0f, 24.0f, 12.0f, 1.0f) +
        sim_geo_blob(lon, lat, 22.0f, 0.0f, 19.0f, 11.0f, 0.82f) +
        sim_geo_blob(lon, lat, 112.0f, 2.0f, 20.0f, 10.0f, 0.82f) +
        sim_geo_blob(lon, lat, 145.0f, -5.0f, 12.0f, 8.0f, 0.58f) +
        sim_geo_blob(lon, lat, -84.0f, 9.0f, 12.0f, 7.0f, 0.48f)),
    0.0f,
    1.0f
  );
}

static inline float sim_sample_earth_elevation_m(const int16_t *SIM_RESTRICT elevation_grid, float lon, float lat) {
  const int32_t width = 361;
  const int32_t height = 181;
  const float x = sim_modulo_float(lon + 180.0f, 360.0f);
  const float y = sim_clamp(lat + 90.0f, 0.0f, 180.0f);
  const int32_t x0 = (int32_t)sim_floor(x);
  const int32_t x1 = x0 + 1 > 360 ? 0 : x0 + 1;
  const int32_t y0 = (int32_t)sim_floor(y);
  const int32_t y1 = sim_min(height - 1, y0 + 1);
  const float fx = x - (float)x0;
  const float fy = y - (float)y0;
  const float v00 = (float)elevation_grid[y0 * width + x0];
  const float v10 = (float)elevation_grid[y0 * width + x1];
  const float v01 = (float)elevation_grid[y1 * width + x0];
  const float v11 = (float)elevation_grid[y1 * width + x1];
  const float south = v00 * (1.0f - fx) + v10 * fx;
  const float north = v01 * (1.0f - fx) + v11 * fx;
  return south * (1.0f - fy) + north * fy;
}

static inline int32_t sim_sample_worldclim_band(
  const int16_t *SIM_RESTRICT climate_grid,
  int32_t band,
  float x,
  float y,
  float scale,
  float *out_value
) {
  const int32_t width = 361;
  const int32_t height = 181;
  const int32_t nodata = -32768;
  const int32_t x0 = (int32_t)sim_floor(x);
  const int32_t x1 = sim_min(width - 1, x0 + 1);
  const int32_t y0 = (int32_t)sim_floor(y);
  const int32_t y1 = sim_min(height - 1, y0 + 1);
  const float fx = x - (float)x0;
  const float fy = y - (float)y0;
  const int32_t offset = band * width * height;
  const int32_t p00 = offset + y0 * width + x0;
  const int32_t p10 = offset + y0 * width + x1;
  const int32_t p01 = offset + y1 * width + x0;
  const int32_t p11 = offset + y1 * width + x1;
  const float weights[4] = {
    (1.0f - fx) * (1.0f - fy),
    fx * (1.0f - fy),
    (1.0f - fx) * fy,
    fx * fy
  };
  const int32_t positions[4] = {p00, p10, p01, p11};
  float weighted = 0.0f;
  float weight_total = 0.0f;
  for (int32_t k = 0; k < 4; k += 1) {
    const int16_t sample = climate_grid[positions[k]];
    if (sample == nodata || weights[k] <= 0.0f) {
      continue;
    }
    weighted += (float)sample * weights[k];
    weight_total += weights[k];
  }
  if (weight_total <= 0.0f) {
    *out_value = 0.0f;
    return 0;
  }
  *out_value = weighted / weight_total / scale;
  return 1;
}

static inline void sim_fallback_earth_climate(float lon, float lat, float desert_score, float rainforest_score, float *mean_temp_c, float *diurnal_range_c) {
  (void)lon;
  const float abs_lat = sim_abs(lat);
  const float latitude01 = abs_lat / 90.0f;
  *mean_temp_c = sim_clamp(27.0f - 44.0f * sim_pow_positive(latitude01, 1.35f), -34.0f, 32.0f);
  *diurnal_range_c = sim_clamp(8.0f + desert_score * 8.0f + latitude01 * 3.0f - rainforest_score * 4.0f, 3.0f, 18.0f);
}

static inline float sim_fallback_earth_annual_precip_mm(float lon, float lat, int32_t is_land, float desert_score, float rainforest_score) {
  const float abs_lat = sim_abs(lat);
  const float itcz = sim_exp(-0.5f * ((lat - 4.0f) / 10.0f) * ((lat - 4.0f) / 10.0f));
  const float south_pacific_convergence = sim_geo_blob(lon, lat, -170.0f, -16.0f, 42.0f, 9.0f, 0.42f);
  const float storm_tracks =
    sim_geo_blob(lon, lat, -35.0f, 50.0f, 42.0f, 10.0f, 0.7f) +
    sim_geo_blob(lon, lat, -165.0f, 47.0f, 48.0f, 10.0f, 0.58f) +
    sim_geo_blob(lon, lat, 25.0f, 54.0f, 34.0f, 9.0f, 0.38f) +
    sim_exp(-0.5f * ((lat + 50.0f) / 10.0f) * ((lat + 50.0f) / 10.0f)) * 0.52f;
  const float monsoon =
    sim_geo_blob(lon, lat, 78.0f, 21.0f, 18.0f, 10.0f, 0.72f) +
    sim_geo_blob(lon, lat, 106.0f, 17.0f, 22.0f, 11.0f, 0.7f) +
    sim_geo_blob(lon, lat, 138.0f, -5.0f, 18.0f, 8.0f, 0.48f) +
    sim_geo_blob(lon, lat, -80.0f, 7.0f, 13.0f, 8.0f, 0.34f);
  const float wet_continents = rainforest_score * 0.88f;
  const float west_coast_wet =
    sim_geo_blob(lon, lat, -124.0f, 48.0f, 7.0f, 12.0f, 0.38f) +
    sim_geo_blob(lon, lat, -74.0f, -43.0f, 5.0f, 10.0f, 0.58f) +
    sim_geo_blob(lon, lat, 171.0f, -43.0f, 7.0f, 7.0f, 0.42f);
  const float polar_dry = sim_smoothstep(abs_lat, 62.0f, 83.0f) * 0.34f;
  const float ocean_boost = is_land ? 0.0f : 0.28f + 0.2f * storm_tracks;
  const float continental_dry = is_land ? sim_max(0.0f, desert_score - 0.18f) * 0.7f : 0.0f;
  return sim_clamp(
    210.0f +
      680.0f * itcz +
      540.0f * storm_tracks +
      620.0f * monsoon +
      860.0f * wet_continents +
      520.0f * west_coast_wet +
      420.0f * south_pacific_convergence +
      360.0f * ocean_boost -
      520.0f * continental_dry -
      310.0f * polar_dry,
    is_land ? 35.0f : 70.0f,
    is_land ? 3600.0f : 4600.0f
  );
}

static inline float sim_earth_rose_suitability(
  float lon,
  float lat,
  float land,
  float mean_temp_c,
  float rain_mm,
  float desert_score,
  float mountain_score,
  float rainforest_score
) {
  if (land < 0.35f) {
    return 0.0f;
  }
  const float abs_lat = sim_abs(lat);
  const float temperate = sim_exp(-0.5f * ((abs_lat - 42.0f) / 13.0f) * ((abs_lat - 42.0f) / 13.0f));
  const float mild = sim_exp(-0.5f * ((abs_lat - 30.0f) / 10.0f) * ((abs_lat - 30.0f) / 10.0f));
  const float northern_temperate_range =
    sim_smoothstep(lat, 18.0f, 32.0f) * (1.0f - sim_smoothstep(lat, 58.0f, 70.0f));
  const float southern_temperate_garden_range =
    sim_smoothstep(-lat, 27.0f, 35.0f) * (1.0f - sim_smoothstep(-lat, 45.0f, 58.0f));
  const float native_range_anchors =
    sim_geo_blob(lon, lat, 15.0f, 47.0f, 34.0f, 12.0f, 0.72f) +
    sim_geo_blob(lon, lat, 48.0f, 38.0f, 20.0f, 9.0f, 0.56f) +
    sim_geo_blob(lon, lat, 78.0f, 41.0f, 20.0f, 9.0f, 0.48f) +
    sim_geo_blob(lon, lat, 113.0f, 36.0f, 24.0f, 11.0f, 0.7f) +
    sim_geo_blob(lon, lat, 138.0f, 37.0f, 12.0f, 7.0f, 0.48f) +
    sim_geo_blob(lon, lat, -96.0f, 42.0f, 34.0f, 13.0f, 0.68f) +
    sim_geo_blob(lon, lat, -123.0f, 44.0f, 11.0f, 13.0f, 0.38f);
  const float settled_gardens =
    sim_geo_blob(lon, lat, 8.0f, 48.0f, 18.0f, 8.0f, 0.58f) +
    sim_geo_blob(lon, lat, 118.0f, 34.0f, 18.0f, 9.0f, 0.54f) +
    sim_geo_blob(lon, lat, 137.0f, 36.0f, 10.0f, 6.0f, 0.44f) +
    sim_geo_blob(lon, lat, -82.0f, 38.0f, 18.0f, 9.0f, 0.5f) +
    sim_geo_blob(lon, lat, -63.0f, -35.0f, 16.0f, 8.0f, 0.36f) +
    sim_geo_blob(lon, lat, 145.0f, -37.0f, 12.0f, 6.0f, 0.34f);
  const float temp_fit = sim_smoothstep(mean_temp_c, -3.0f, 12.0f) * (1.0f - sim_smoothstep(mean_temp_c, 24.0f, 31.0f));
  const float moisture_fit =
    sim_smoothstep(rain_mm, 560.0f, 900.0f) *
    (1.0f - sim_smoothstep(rain_mm, 1500.0f, 2100.0f));
  const float arid_exclusion = 0.04f + 0.96f * sim_smoothstep(rain_mm, 450.0f, 720.0f);
  const float hot_lowland_exclusion =
    1.0f -
    0.88f * (1.0f - sim_smoothstep(abs_lat, 18.0f, 30.0f)) *
      sim_smoothstep(mean_temp_c, 22.0f, 28.0f) *
      (1.0f - 0.55f * sim_smoothstep(mountain_score, 0.34f, 0.72f));
  const float range_fit = sim_clamp(
    0.52f * northern_temperate_range +
      0.22f * southern_temperate_garden_range +
      0.34f * native_range_anchors +
      0.24f * settled_gardens,
    0.0f,
    1.0f
  );
  const float landscape_fit = sim_clamp(0.62f * temperate + 0.12f * mild + 0.46f * range_fit, 0.0f, 1.0f);
  const float penalty = desert_score * 1.06f + mountain_score * 0.42f + rainforest_score * 0.34f;
  return sim_clamp(
    land * landscape_fit * temp_fit * (0.14f + 0.86f * moisture_fit) * arid_exclusion * hot_lowland_exclusion * (1.0f - sim_clamp(penalty, 0.0f, 1.0f)),
    0.0f,
    1.0f
  );
}

static inline float sim_earth_baobab_suitability(
  float lon,
  float lat,
  float land,
  float mean_temp_c,
  float rain_mm,
  float desert_score,
  float mountain_score,
  float rainforest_score
) {
  if (land < 0.35f) {
    return 0.0f;
  }
  const float tropical_dry = sim_exp(-0.5f * ((sim_abs(lat) - 13.0f) / 12.0f) * ((sim_abs(lat) - 13.0f) / 12.0f));
  const float native_range =
    sim_geo_blob(lon, lat, 20.0f, 8.0f, 22.0f, 15.0f, 1.0f) +
    sim_geo_blob(lon, lat, 29.0f, -15.0f, 15.0f, 12.0f, 0.82f) +
    sim_geo_blob(lon, lat, 47.0f, -20.0f, 7.0f, 9.0f, 0.72f) +
    sim_geo_blob(lon, lat, 132.0f, -17.0f, 22.0f, 10.0f, 0.38f);
  const float warm_fit = sim_smoothstep(mean_temp_c, 16.0f, 24.0f) * (1.0f - sim_smoothstep(mean_temp_c, 34.0f, 41.0f));
  const float savanna_rain =
    sim_smoothstep(rain_mm, 200.0f, 430.0f) *
    (1.0f - sim_smoothstep(rain_mm, 790.0f, 1150.0f));
  const float dry_season_fit = sim_clamp(0.42f + desert_score * 0.42f + tropical_dry * 0.26f, 0.0f, 1.0f);
  const float range_fit = sim_clamp(0.62f * native_range + 0.28f * tropical_dry + 0.12f * dry_season_fit, 0.0f, 1.0f);
  const float penalty =
    rainforest_score * 1.02f +
    mountain_score * 0.7f +
    sim_max(0.0f, desert_score - 0.84f) * 0.62f +
    sim_smoothstep(rain_mm, 880.0f, 1330.0f) * 0.48f;
  return sim_clamp(land * range_fit * warm_fit * savanna_rain * dry_season_fit * (1.0f - sim_clamp(penalty, 0.0f, 1.0f)), 0.0f, 1.0f);
}

static inline uint8_t sim_earth_koppen_code(
  float land,
  float lat,
  float mean_temp_c,
  float rain_mm,
  float desert_score,
  float rainforest_score,
  float elevation_m
) {
  if (land < 0.35f) {
    return 0u;
  }
  const float abs_lat = sim_abs(lat);
  const float cold_penalty = sim_max(0.0f, elevation_m - 1800.0f) / 1800.0f;
  const float effective_temp_c = mean_temp_c - cold_penalty * 4.5f;
  if (abs_lat > 72.0f || effective_temp_c < -4.0f) {
    return (effective_temp_c < -10.0f || abs_lat > 78.0f) ? 1u : 2u;
  }

  const float dry_threshold_mm = sim_clamp(20.0f * sim_max(0.0f, effective_temp_c) + 140.0f + desert_score * 120.0f, 160.0f, 780.0f);
  if (rain_mm < dry_threshold_mm) {
    const int32_t arid = rain_mm < dry_threshold_mm * 0.5f;
    const int32_t hot = effective_temp_c >= 18.0f;
    if (arid) {
      return hot ? 3u : 4u;
    }
    return hot ? 5u : 6u;
  }

  if (effective_temp_c >= 18.0f) {
    if (rainforest_score > 0.42f && rain_mm >= 1800.0f) {
      return 7u;
    }
    if (rain_mm >= 1150.0f) {
      return 8u;
    }
    return 9u;
  }

  if (effective_temp_c >= -3.0f) {
    const int32_t mediterranean =
      abs_lat >= 28.0f &&
      abs_lat <= 46.0f &&
      rain_mm < 900.0f &&
      desert_score > 0.12f;
    if (mediterranean) {
      return effective_temp_c >= 14.0f ? 10u : 11u;
    }
    if (effective_temp_c >= 14.0f && rain_mm >= 760.0f) {
      return 12u;
    }
    return 13u;
  }

  if (effective_temp_c >= 6.0f) {
    return 14u;
  }
  if (effective_temp_c >= -1.0f) {
    return 15u;
  }
  return 16u;
}

SIM_EXPORT void sim_initialize_earth_profile(
  int32_t size,
  int32_t nside,
  int32_t rose_cell,
  uintptr_t offsets_offset
) {
  const uint32_t *SIM_RESTRICT offsets = (const uint32_t *)(uintptr_t)offsets_offset;
  const float *SIM_RESTRICT cell_height = (const float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_CELL_HEIGHT];
  const float *SIM_RESTRICT cell_phi = (const float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_CELL_PHI];
  const uint8_t *SIM_RESTRICT land_fraction_u8 = (const uint8_t *)(uintptr_t)offsets[SIM_EARTH_PROFILE_LAND_FRACTION_U8];
  const int16_t *SIM_RESTRICT elevation_grid = (const int16_t *)(uintptr_t)offsets[SIM_EARTH_PROFILE_ELEVATION_I16];
  const int16_t *SIM_RESTRICT climate_grid = (const int16_t *)(uintptr_t)offsets[SIM_EARTH_PROFILE_CLIMATE_I16];
  uint8_t *SIM_RESTRICT terrain_code = (uint8_t *)(uintptr_t)offsets[SIM_EARTH_PROFILE_TERRAIN_CODE];
  uint8_t *SIM_RESTRICT koppen_code = (uint8_t *)(uintptr_t)offsets[SIM_EARTH_PROFILE_KOPPEN_CODE];
  float *SIM_RESTRICT moisture = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_MOISTURE];
  float *SIM_RESTRICT soil = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_SOIL];
  float *SIM_RESTRICT baobab_risk = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_BAOBAB_RISK];
  float *SIM_RESTRICT flower = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_FLOWER];
  float *SIM_RESTRICT elevation = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_ELEVATION];
  float *SIM_RESTRICT mean_temp_c = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_CLIMATE_MEAN_TEMP_C];
  float *SIM_RESTRICT diurnal_range_c = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_CLIMATE_DIURNAL_RANGE_C];
  float *SIM_RESTRICT rain_climatology = (float *)(uintptr_t)offsets[SIM_EARTH_PROFILE_RAIN_CLIMATOLOGY];

  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float phi = cell_phi[i];
    float lon = phi * 57.29577951308232f;
    if (lon > 180.0f) {
      lon -= 360.0f;
    }
    const float lat = sim_asin(height) * 57.29577951308232f;
    const float land_data = ((float)land_fraction_u8[i]) * (1.0f / 255.0f);
    const float polar_land = sim_max(sim_earth_antarctic_ice_land_fraction(lon, lat), sim_earth_greenland_ice_land_fraction(lon, lat));
    const float land_score = sim_max(land_data, polar_land);
    const float sampled_elevation = sim_sample_earth_elevation_m(elevation_grid, lon, lat);
    const float x = sim_clamp(lon + 180.0f, 0.0f, 360.0f);
    const float y = sim_clamp(lat + 90.0f, 0.0f, 180.0f);
    const float mountain_score = sim_earth_mountain_score(lon, lat);
    const float desert_score = sim_earth_desert_score(lon, lat);
    const float rainforest_score = sim_earth_rainforest_score(lon, lat);
    float mean_temp = 0.0f;
    float diurnal = 0.0f;
    float annual_precip_data = 0.0f;
    const int32_t mean_ok = sim_sample_worldclim_band(climate_grid, 0, x, y, 10.0f, &mean_temp);
    const int32_t diurnal_ok = sim_sample_worldclim_band(climate_grid, 1, x, y, 10.0f, &diurnal);
    const int32_t precip_ok = sim_sample_worldclim_band(climate_grid, 2, x, y, 1.0f, &annual_precip_data);
    const int32_t climate_ok = mean_ok && diurnal_ok;
    if (!climate_ok) {
      sim_fallback_earth_climate(lon, lat, desert_score, rainforest_score, &mean_temp, &diurnal);
    }

    const int32_t is_ocean = land_score < 0.35f && i != rose_cell;
    const float annual_rain_mm =
      (!is_ocean && climate_ok && precip_ok)
        ? sim_max(0.0f, annual_precip_data)
        : sim_fallback_earth_annual_precip_mm(lon, lat, !is_ocean, desert_score, rainforest_score);
    const float noise = sim_seeded_noise_nside(i, 901, nside);

    elevation[i] = sampled_elevation;
    mean_temp_c[i] = mean_temp;
    diurnal_range_c[i] = diurnal;
    rain_climatology[i] = annual_rain_mm / 1000.0f / 365.0f;

    if (is_ocean) {
      terrain_code[i] = SIM_TERRAIN_WATER;
      koppen_code[i] = 0u;
      moisture[i] = 0.9f + sim_seeded_noise_nside(i, 907, nside) * 0.08f;
      soil[i] = 0.48f;
      baobab_risk[i] = 0.0f;
      flower[i] = 0.0f;
      continue;
    }

    const float abs_height = sim_abs(height);
    const float temperate = sim_exp(-0.5f * ((abs_height - 0.43f) / 0.22f) * ((abs_height - 0.43f) / 0.22f));
    const float boreal_score = sim_exp(-0.5f * ((abs_height - 0.67f) / 0.12f) * ((abs_height - 0.67f) / 0.12f)) * sim_smoothstep(land_score, 0.54f, 0.82f);
    const float rose_score = sim_earth_rose_suitability(lon, lat, land_score, mean_temp, annual_rain_mm, desert_score, mountain_score, rainforest_score);
    const float baobab_score = sim_earth_baobab_suitability(lon, lat, land_score, mean_temp, annual_rain_mm, desert_score, mountain_score, rainforest_score);
    const int32_t is_mountain =
      sampled_elevation > 1800.0f ||
      mountain_score > 0.64f ||
      (sampled_elevation > 900.0f && mountain_score > 0.38f) ||
      (abs_height > 0.76f && noise > 0.62f);
    const int32_t is_desert = !is_mountain && (desert_score > 0.7f || (annual_rain_mm < 250.0f && desert_score > 0.42f));
    const int32_t is_wetland = !is_mountain && !is_desert && (rainforest_score > 0.5f || annual_rain_mm > 1280.0f);
    const int32_t is_forest =
      !is_mountain &&
      !is_desert &&
      !is_wetland &&
      (annual_rain_mm > 680.0f &&
        (temperate * 0.58f + boreal_score * 0.42f + rainforest_score * 0.4f + sim_seeded_noise_nside(i, 913, nside) * 0.2f > 0.58f));

    terrain_code[i] =
      is_mountain ? SIM_TERRAIN_ROCK :
        is_desert ? SIM_TERRAIN_SAND :
          is_wetland ? SIM_TERRAIN_MOSS :
            is_forest ? SIM_TERRAIN_MEADOW :
              SIM_TERRAIN_MOSS;

    float local_moisture =
      is_wetland ? 0.76f + sim_clamp(annual_rain_mm / 2400.0f, 0.0f, 1.0f) * 0.14f + sim_seeded_noise_nside(i, 917, nside) * 0.08f :
        is_forest ? 0.48f + sim_clamp(annual_rain_mm / 1450.0f, 0.0f, 1.0f) * 0.28f + sim_seeded_noise_nside(i, 919, nside) * 0.12f :
          is_desert ? 0.12f + sim_clamp(annual_rain_mm / 900.0f, 0.0f, 1.0f) * 0.16f + sim_seeded_noise_nside(i, 921, nside) * 0.08f :
            is_mountain ? 0.24f + sim_clamp(annual_rain_mm / 1350.0f, 0.0f, 1.0f) * 0.16f + sim_seeded_noise_nside(i, 923, nside) * 0.08f :
              0.34f + sim_clamp(annual_rain_mm / 1350.0f, 0.0f, 1.0f) * 0.2f + baobab_score * 0.08f + sim_seeded_noise_nside(i, 925, nside) * 0.1f;
    float local_soil =
      is_mountain ? 0.36f + sim_seeded_noise_nside(i, 927, nside) * 0.12f :
        is_desert ? 0.42f + sim_seeded_noise_nside(i, 929, nside) * 0.1f :
          is_wetland ? 0.78f + sim_seeded_noise_nside(i, 931, nside) * 0.1f :
            is_forest ? 0.72f + sim_seeded_noise_nside(i, 933, nside) * 0.16f :
              0.58f + baobab_score * 0.12f + sim_seeded_noise_nside(i, 935, nside) * 0.16f;
    const float rose_habitat = is_mountain || is_desert ? 0.0f : sim_clamp(rose_score * 1.65f, 0.0f, 1.0f);
    if (rose_habitat > 0.0f) {
      local_moisture = sim_clamp(local_moisture + rose_habitat * 0.2f, 0.0f, 1.0f);
      local_soil = sim_clamp(local_soil + rose_habitat * 0.2f, 0.0f, 1.0f);
    }
    const float rose_patch_noise = (sim_seeded_noise_nside(i, 937, nside) - 0.5f) * 0.05f;
    const float local_flower =
      is_mountain || is_desert
        ? 0.0f
        : sim_clamp(sim_max(0.0f, rose_score - 0.065f) * 0.92f + (rose_score > 0.22f ? 0.07f : 0.0f) + rose_patch_noise, 0.0f, 1.0f);
    const float humid_penalty = sim_smoothstep(annual_rain_mm, 880.0f, 1330.0f);
    const float local_baobab_risk =
      is_mountain || is_wetland
        ? 0.0f
        : sim_clamp(baobab_score * (0.78f + noise * 0.24f) * (1.0f - humid_penalty * 0.72f), 0.0f, 1.0f);

    koppen_code[i] = sim_earth_koppen_code(land_score, lat, mean_temp, annual_rain_mm, desert_score, rainforest_score, sampled_elevation);
    moisture[i] = local_moisture;
    soil[i] = local_soil;
    flower[i] = local_flower;
    baobab_risk[i] = local_baobab_risk;
  }
}

static inline float sim_asteroid_soil_field(int32_t id, float height, float phi, int32_t nside, int32_t salt) {
  const float wave_a = sim_sin(phi * (1.8f + (float)(salt % 5) * 0.27f) + height * (3.2f + (float)(salt % 7) * 0.31f));
  const float wave_b = sim_cos(phi * (3.1f + (float)(salt % 4) * 0.22f) - height * (5.1f + (float)(salt % 6) * 0.24f));
  const float local = (sim_seeded_noise_nside(id, salt + 41, nside) - 0.5f) * 0.08f;
  return sim_clamp(0.5f + wave_a * 0.23f + wave_b * 0.18f + local, 0.0f, 1.0f);
}

static inline float sim_initial_noise(int32_t is_earth, int32_t id, float height, float phi, int32_t nside, int32_t salt) {
  return is_earth ? sim_seeded_noise_nside(id, salt, nside) : sim_asteroid_soil_field(id, height, phi, nside, salt);
}

static inline float sim_normal_dot_height_phi(float height_a, float phi_a, float height_b, float phi_b) {
  const float ca = sim_sqrt(sim_max(0.0f, 1.0f - height_a * height_a));
  const float cb = sim_sqrt(sim_max(0.0f, 1.0f - height_b * height_b));
  return sim_clamp(height_a * height_b + ca * cb * sim_cos(phi_a - phi_b), -1.0f, 1.0f);
}

static inline float sim_acos_approx(float value) {
  const float x = sim_clamp(value, -1.0f, 1.0f);
  const float ax = sim_abs(x);
  const float root = sim_sqrt(sim_max(0.0f, 1.0f - ax));
  const float poly =
    1.5707288f +
    ax * (-0.2121144f + ax * (0.0742610f - 0.0187293f * ax));
  const float angle = root * poly;
  return x < 0.0f ? 3.141592653589793f - angle : angle;
}

static inline float sim_signed_phi_delta(float phi, float center_phi) {
  float delta = phi - center_phi;
  while (delta <= -3.141592653589793f) {
    delta += 6.283185307179586f;
  }
  while (delta > 3.141592653589793f) {
    delta -= 6.283185307179586f;
  }
  return delta;
}

static inline int32_t sim_face_ring_anchor(int32_t face) {
  return face < 4 ? 2 : face < 8 ? 3 : 4;
}

static inline int32_t sim_face_phi_anchor(int32_t face) {
  static const int32_t anchors[12] = { 1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7 };
  return anchors[face >= 0 && face < 12 ? face : 0];
}

static inline float sim_ring_height_for_nside(int32_t ring, int32_t nside) {
  const float fnside = (float)nside;
  if (ring < nside) {
    const float fr = (float)ring;
    return 1.0f - (fr * fr) / (3.0f * fnside * fnside);
  }
  if (ring <= 3 * nside) {
    return ((float)(2 * nside - ring) * 2.0f) / (3.0f * fnside);
  }
  const float mirror = (float)(4 * nside - ring);
  return -1.0f + (mirror * mirror) / (3.0f * fnside * fnside);
}

static inline int32_t sim_nearest_polar_anchor_raw(int32_t raw_jp, int32_t nside) {
  const int32_t period = 8 * nside;
  int32_t best = nside + 1;
  int32_t best_distance = 0x7fffffff;
  for (int32_t anchor_index = 0; anchor_index < 4; anchor_index += 1) {
    const int32_t anchor = (2 * anchor_index + 1) * nside + 1;
    const int32_t wrapped_anchor = anchor + (int32_t)sim_floor(((float)(raw_jp - anchor) / (float)period) + 0.5f) * period;
    const int32_t distance = wrapped_anchor > raw_jp ? wrapped_anchor - raw_jp : raw_jp - wrapped_anchor;
    if (distance < best_distance) {
      best = wrapped_anchor;
      best_distance = distance;
    }
  }
  return best;
}

static inline float sim_center_phi_raw_from_grid(int32_t raw_jp, int32_t ring, int32_t nside) {
  if (ring < nside) {
    const int32_t anchor = sim_nearest_polar_anchor_raw(raw_jp, nside);
    return (float)anchor + (float)(raw_jp - anchor) * ((float)nside / (float)ring);
  }
  if (ring > 3 * nside) {
    const int32_t anchor = sim_nearest_polar_anchor_raw(raw_jp, nside);
    return (float)anchor + (float)(raw_jp - anchor) * ((float)nside / (float)(4 * nside - ring));
  }
  return (float)raw_jp;
}

static inline void sim_nested_cell_center_height_phi(
  int32_t face,
  int32_t ix,
  int32_t iy,
  int32_t nside,
  float *height,
  float *phi
) {
  const int32_t ring = sim_face_ring_anchor(face) * nside - ix - iy - 1;
  const int32_t raw_jp = sim_face_phi_anchor(face) * nside - ix + iy + 1;
  const float phi_raw = sim_center_phi_raw_from_grid(raw_jp, ring, nside);
  *height = sim_ring_height_for_nside(ring, nside);
  *phi = sim_modulo_float(((phi_raw - 1.0f) * 3.141592653589793f) / (4.0f * (float)nside), 6.283185307179586f);
}

static inline float sim_asteroid_fine_field(int32_t id, float height, float phi, int32_t nside, int32_t salt) {
  (void)id;
  (void)nside;
  const float wave_a = sim_sin(phi * (2.1f + (float)(salt % 4) * 0.34f) + height * (4.3f + (float)(salt % 5) * 0.47f));
  const float wave_b = sim_cos(phi * (4.2f + (float)(salt % 3) * 0.55f) - height * (6.4f + (float)(salt % 7) * 0.28f));
  return sim_clamp(0.5f + wave_a * 0.24f + wave_b * 0.18f, 0.0f, 1.0f);
}

static inline float sim_asteroid_coherent_field(int32_t id, float height, float phi, int32_t nside, int32_t salt) {
  const float phase = (float)(salt % 997) * 0.017f;
  const float wave_a = sim_sin(phi * (1.35f + (float)(salt % 5) * 0.17f) + height * (2.9f + (float)(salt % 7) * 0.23f) + phase);
  const float wave_b = sim_cos(phi * (2.55f + (float)(salt % 4) * 0.19f) - height * (4.8f + (float)(salt % 6) * 0.21f) - phase * 1.7f);
  const float wave_c = sim_sin(sim_cos(phi + phase) * (2.2f + (float)(salt % 3) * 0.3f) + height * (3.6f + (float)(salt % 11) * 0.11f));
  const float local = (sim_seeded_noise_nside(id, salt + 41, nside) - 0.5f) * 0.035f;
  return sim_clamp(0.5f + wave_a * 0.2f + wave_b * 0.14f + wave_c * 0.1f + local, 0.0f, 1.0f);
}

static inline float sim_asteroid_closest_angle(
  float height,
  float phi,
  const float *SIM_RESTRICT source_height,
  const float *SIM_RESTRICT source_phi,
  int32_t source_count
) {
  float closest = 1.0e20f;
  for (int32_t source = 0; source < source_count; source += 1) {
    const float dot = sim_normal_dot_height_phi(height, phi, source_height[source], source_phi[source]);
    const float angle = sim_acos_approx(dot);
    closest = sim_min(closest, angle);
  }
  return closest;
}

static inline float sim_asteroid_patch_influence(
  int32_t id,
  float height,
  float phi,
  int32_t nside,
  const float *SIM_RESTRICT source_height,
  const float *SIM_RESTRICT source_phi,
  int32_t source_count,
  int32_t salt,
  float radius_scale
) {
  if (source_count <= 0) {
    return 0.0f;
  }
  const float closest = sim_asteroid_closest_angle(height, phi, source_height, source_phi, source_count);
  const float base_radius = 0.44f * radius_scale;
  const float falloff = 0.18f * radius_scale;
  const float edge_noise =
    (sim_asteroid_coherent_field(id, height, phi, nside, salt) - 0.5f) * 0.46f +
    (sim_seeded_noise_nside(id, salt + 17, nside) - 0.5f) * 0.08f;
  return sim_clamp(0.5f + (base_radius - closest) / falloff + edge_noise, 0.0f, 1.0f);
}

static inline float sim_asteroid_local_patch_influence(
  int32_t id,
  float height,
  float phi,
  int32_t nside,
  const float *SIM_RESTRICT source_height,
  const float *SIM_RESTRICT source_phi,
  int32_t source_count,
  int32_t salt,
  float radius_scale
) {
  if (source_count <= 0) {
    return 0.0f;
  }
  const float closest = sim_asteroid_closest_angle(height, phi, source_height, source_phi, source_count);
  const float base_radius = 0.26f * radius_scale;
  const float falloff = 0.13f * radius_scale;
  const float fine_noise =
    (sim_asteroid_fine_field(id, height, phi, nside, salt) - 0.5f) * 0.42f +
    (sim_seeded_noise_nside(id, salt + 17, nside) - 0.5f) * 0.08f;
  return sim_clamp(0.5f + (base_radius - closest) / falloff + fine_noise, 0.0f, 1.0f);
}

static inline float sim_asteroid_drainage_basin_influence(
  float height,
  float phi,
  const float *SIM_RESTRICT source_height,
  const float *SIM_RESTRICT source_phi,
  int32_t source_count,
  float radius_scale
) {
  if (source_count <= 0) {
    return 0.0f;
  }
  const float closest = sim_asteroid_closest_angle(height, phi, source_height, source_phi, source_count);
  const float sigma = 0.78f * radius_scale;
  const float basin = sim_exp(-0.5f * (closest / sigma) * (closest / sigma));
  return sim_clamp(0.04f + basin * 0.96f, 0.0f, 1.0f);
}

static inline void sim_unit_vector_from_height_phi(float height, float phi, float *x, float *y, float *z) {
  const float r = sim_sqrt(sim_max(0.0f, 1.0f - height * height));
  *x = sim_cos(phi) * r;
  *y = height;
  *z = sim_sin(phi) * r;
}

static inline float sim_asteroid_drainage_corridor_influence(
  int32_t id,
  float height,
  float phi,
  int32_t nside,
  const float *SIM_RESTRICT high_height,
  const float *SIM_RESTRICT high_phi,
  int32_t high_count,
  const float *SIM_RESTRICT outlet_height,
  const float *SIM_RESTRICT outlet_phi,
  int32_t outlet_count
) {
  if (high_count <= 0 || outlet_count <= 0) {
    return 0.0f;
  }

  float px = 0.0f;
  float py = 0.0f;
  float pz = 0.0f;
  sim_unit_vector_from_height_phi(height, phi, &px, &py, &pz);

  float best = 0.0f;
  for (int32_t high = 0; high < high_count; high += 1) {
    float ax = 0.0f;
    float ay = 0.0f;
    float az = 0.0f;
    sim_unit_vector_from_height_phi(high_height[high], high_phi[high], &ax, &ay, &az);

    for (int32_t outlet = 0; outlet < outlet_count; outlet += 1) {
      float bx = 0.0f;
      float by = 0.0f;
      float bz = 0.0f;
      sim_unit_vector_from_height_phi(outlet_height[outlet], outlet_phi[outlet], &bx, &by, &bz);

      const float dot_ab = sim_clamp(ax * bx + ay * by + az * bz, -1.0f, 1.0f);
      const float length_ab = sim_acos_approx(dot_ab);
      if (length_ab < 0.12f) {
        continue;
      }

      const float dot_ap = sim_clamp(ax * px + ay * py + az * pz, -1.0f, 1.0f);
      const float dot_bp = sim_clamp(bx * px + by * py + bz * pz, -1.0f, 1.0f);
      const float length_ap = sim_acos_approx(dot_ap);
      const float length_bp = sim_acos_approx(dot_bp);
      const float source_gate = sim_smoothstep(length_ap, 0.006f, 0.055f);
      const float on_segment =
        source_gate *
        sim_smoothstep(length_bp, 0.06f, 0.18f) *
        (1.0f - sim_smoothstep(length_ap + length_bp - length_ab, 0.10f, 0.34f));
      if (on_segment <= 0.0f) {
        continue;
      }

      const float nx = ay * bz - az * by;
      const float ny = az * bx - ax * bz;
      const float nz = ax * by - ay * bx;
      const float n_norm = sim_sqrt(nx * nx + ny * ny + nz * nz);
      if (n_norm <= 1.0e-5f) {
        continue;
      }
      const float signed_cross_track_sine = (px * nx + py * ny + pz * nz) / n_norm;
      const float along = sim_clamp(length_ap / length_ab, 0.0f, 1.0f);
      const float bend_phase = (float)(high + 1) * 0.73f + (float)(outlet + 1) * 1.31f;
      const float sweep_wave =
        sim_sin(along * 4.8f + bend_phase * 0.63f) * 0.090f;
      const float long_wave =
        sim_sin(along * 10.6f + bend_phase) * 0.140f;
      const float mid_wave =
        sim_sin(along * 20.4f + bend_phase * 1.37f) * 0.055f;
      const float short_wave =
        sim_sin(along * 38.0f + bend_phase * 1.7f) * 0.014f;
      const float bank_noise =
        (sim_asteroid_coherent_field(id, height, phi, nside, 1187) - 0.5f) * 0.004f;
      const float meander_center = (sweep_wave + long_wave + mid_wave + short_wave) * source_gate + bank_noise;
      const float width =
        0.024f +
        0.010f * sim_asteroid_coherent_field(id, height, phi, nside, 1181);
      const float lateral = sim_abs(signed_cross_track_sine - meander_center);
      const float corridor = sim_exp(-0.5f * (lateral / width) * (lateral / width)) * on_segment;
      best = sim_max(best, corridor);
    }
  }

  return sim_clamp(best, 0.0f, 1.0f);
}

static inline float sim_asteroid_elevation_m(
  int32_t id,
  float height,
  float phi,
  int32_t nside,
  float volcano_influence,
  float active_volcano_influence,
  float water_influence,
  float water_drainage_influence,
  float drainage_corridor_influence
) {
  const float broad = (sim_asteroid_coherent_field(id, height, phi, nside, 887) - 0.5f) * 2.0f;
  const float fine = (sim_asteroid_fine_field(id, height, phi, nside, 891) - 0.5f) * 2.0f;
  const float ridge = sim_sin(phi * 5.7f + height * 8.1f) * sim_cos(phi * 2.6f - height * 5.4f);
  const float ridge_b = sim_sin(phi * 3.2f - height * 6.7f + 0.8f) * sim_sin(phi * 1.7f + height * 4.4f - 0.25f);
  const float hummock = sim_sin(phi * 9.1f + sim_sin(height * 5.2f) * 2.3f) * sim_cos(height * 11.6f - phi * 1.8f);
  const float broad_relief = (broad < 0.0f ? -1.0f : 1.0f) * sim_pow_positive(sim_abs(broad), 1.18f) * 540.0f;
  const float fine_relief = (fine < 0.0f ? -1.0f : 1.0f) * sim_pow_positive(sim_abs(fine), 1.05f) * 220.0f;
  const float ridge_relief = ridge * 170.0f + ridge_b * 125.0f + hummock * 72.0f;
  const float micro_relief = (sim_seeded_noise_nside(id, 941, nside) - 0.5f) * 52.0f;
  const float polar_rise = sim_abs(height) * 92.0f;
  const float volcano_foothill = sim_pow_positive(volcano_influence, 0.98f) * 1180.0f;
  const float volcano_peak = sim_pow_positive(volcano_influence, 2.05f) * 4200.0f + sim_pow_positive(active_volcano_influence, 2.35f) * 1200.0f;
  const float basin_sink = sim_pow_positive(water_drainage_influence, 1.05f) * 1280.0f + sim_pow_positive(water_influence, 1.55f) * 720.0f;
  const float valley_cut = sim_pow_positive(drainage_corridor_influence, 0.74f) * 1320.0f;
  const float mountain_channel_cut =
    sim_pow_positive(drainage_corridor_influence, 0.9f) *
    sim_pow_positive(volcano_influence, 0.72f) *
    1650.0f;
  const float valley_bank = sim_pow_positive(drainage_corridor_influence, 1.85f) * 110.0f;
  return broad_relief + fine_relief + ridge_relief + micro_relief + polar_rise + volcano_foothill + volcano_peak - basin_sink - valley_cut - mountain_channel_cut + valley_bank;
}

static inline int32_t sim_asteroid_sunset_path_half_width(int32_t nside) {
  if (nside <= 2) {
    return 0;
  }
  const int32_t rounded = (int32_t)sim_floor((float)nside / 8.0f + 0.5f);
  return rounded > 1 ? rounded : 1;
}

static inline float sim_asteroid_sunset_path_center_ring(
  int32_t nside,
  float height,
  float phi,
  const int32_t *SIM_RESTRICT volcano_ring,
  const float *SIM_RESTRICT volcano_phi,
  int32_t volcano_count,
  int32_t rose_ring,
  float rose_phi
) {
  const float base_ring = (float)(2 * nside);
  const float meander =
    sim_sin(phi * 2.7f + height * 3.4f) *
    sim_min(0.75f, sim_max(0.28f, (float)nside * 0.035f));
  float detour = 0.0f;
  for (int32_t source = 0; source < volcano_count; source += 1) {
    const float delta = sim_abs(sim_signed_phi_delta(phi, volcano_phi[source]));
    const float width = 0.52f + sim_min(0.22f, (float)nside * 0.0035f);
    const float strength = sim_exp(-0.5f * (delta / width) * (delta / width));
    const float direction =
      (float)volcano_ring[source] < base_ring ? 1.0f :
        (float)volcano_ring[source] > base_ring ? -1.0f :
          (source & 1) == 0 ? 1.0f : -1.0f;
    detour += direction * strength * sim_max(2.2f, (float)nside * 0.34f);
  }
  const float center_before_rose = base_ring + meander + detour;
  const float rose_delta = sim_abs(sim_signed_phi_delta(phi, rose_phi));
  const float rose_anchor_width = 0.42f + sim_min(0.14f, (float)nside * 0.002f);
  const float rose_anchor = sim_exp(-0.5f * (rose_delta / rose_anchor_width) * (rose_delta / rose_anchor_width));
  const float center = center_before_rose * (1.0f - rose_anchor) + (float)rose_ring * rose_anchor;
  return sim_clamp(center, 1.0f, (float)(4 * nside));
}

typedef struct SimAsteroidTerrainSample {
  float moisture;
  float soil;
  float baobab_risk;
  float ash;
  float elevation;
  float volcanic_ash_fall_rate;
  float care;
  float volcano_influence;
  float active_volcano_influence;
  float water_influence;
  float drainage_corridor_influence;
  uint8_t terrain_code;
  uint8_t baobab_blocked;
  uint8_t active_volcano_crater;
} SimAsteroidTerrainSample;

static inline SimAsteroidTerrainSample sim_asteroid_profile_sample(
  int32_t id,
  float height,
  float phi,
  int32_t ring,
  int32_t nside,
  int32_t exact_volcano_cell,
  int32_t exact_active_volcano_cell,
  const float *SIM_RESTRICT volcano_height,
  const float *SIM_RESTRICT volcano_phi,
  const int32_t *SIM_RESTRICT volcano_ring,
  int32_t volcano_count,
  const float *SIM_RESTRICT active_volcano_height,
  const float *SIM_RESTRICT active_volcano_phi,
  int32_t active_volcano_count,
  const float *SIM_RESTRICT active_center_height,
  const float *SIM_RESTRICT active_center_phi,
  int32_t active_center_count,
  const float *SIM_RESTRICT water_height,
  const float *SIM_RESTRICT water_phi,
  int32_t water_count,
  const float *SIM_RESTRICT baobab_watch_height,
  const float *SIM_RESTRICT baobab_watch_phi,
  int32_t baobab_watch_count,
  int32_t rose_ring,
  float rose_phi
) {
  SimAsteroidTerrainSample sample;
  sample.moisture = 0.0f;
  sample.soil = 0.0f;
  sample.baobab_risk = 0.0f;
  sample.ash = 0.0f;
  sample.elevation = 0.0f;
  sample.volcanic_ash_fall_rate = 0.0f;
  sample.care = 0.0f;
  sample.volcano_influence = sim_asteroid_local_patch_influence(id, height, phi, nside, volcano_height, volcano_phi, volcano_count, 301, 1.0f);
  sample.active_volcano_influence = sim_asteroid_local_patch_influence(id, height, phi, nside, active_volcano_height, active_volcano_phi, active_volcano_count, 307, 0.9f);
  sample.water_influence = sim_asteroid_patch_influence(id, height, phi, nside, water_height, water_phi, water_count, 313, 0.82f);
  const float water_drainage_influence = sim_asteroid_drainage_basin_influence(height, phi, water_height, water_phi, water_count, 1.38f);
  sample.drainage_corridor_influence = sim_asteroid_drainage_corridor_influence(
    id,
    height,
    phi,
    nside,
    volcano_height,
    volcano_phi,
    volcano_count,
    water_height,
    water_phi,
    water_count
  );
  sample.terrain_code = SIM_TERRAIN_SAND;
  sample.baobab_blocked = 0u;
  sample.active_volcano_crater = 0u;

  const int32_t is_volcano_area = sample.volcano_influence > 0.54f;
  const int32_t is_active_volcano_area = sample.active_volcano_influence > 0.55f;
  const float crater_radius = sim_min(0.055f, 1.35f * sim_sqrt(3.141592653589793f / 3.0f) / (float)nside);
  const float crater_dot_threshold = sim_cos(crater_radius);
  float crater_dot = -1.0f;
  for (int32_t source = 0; source < active_center_count; source += 1) {
    crater_dot = sim_max(crater_dot, sim_normal_dot_height_phi(height, phi, active_center_height[source], active_center_phi[source]));
  }
  if (crater_dot >= crater_dot_threshold) {
    sample.active_volcano_crater = 1u;
  }

  const int32_t path_half_width = sim_asteroid_sunset_path_half_width(nside);
  const float path_center = sim_asteroid_sunset_path_center_ring(nside, height, phi, volcano_ring, volcano_phi, volcano_count, rose_ring, rose_phi);
  const int32_t blocked_path = exact_volcano_cell || sample.volcano_influence > 0.18f;
  const int32_t is_sunset_path_ground = !blocked_path && sim_abs((float)ring - path_center) <= (float)path_half_width;
  const int32_t is_water_area = sample.water_influence > 0.54f && !is_volcano_area && !is_sunset_path_ground;
  const int32_t is_baobab_watch_ground =
    sim_asteroid_patch_influence(id, height, phi, nside, baobab_watch_height, baobab_watch_phi, baobab_watch_count, 317, 0.86f) > 0.5f &&
    !is_volcano_area &&
    !is_water_area;

  sample.volcanic_ash_fall_rate =
    exact_active_volcano_cell ? 0.006f / 8.0f :
      sample.active_volcano_influence > 0.5f ? (0.0024f * sample.active_volcano_influence) / 8.0f :
        sample.active_volcano_influence > 0.16f ? (0.0008f * sample.active_volcano_influence) / 8.0f :
          0.0f;
  sample.elevation = sim_asteroid_elevation_m(
    id,
    height,
    phi,
    nside,
    sample.volcano_influence,
    sample.active_volcano_influence,
    sample.water_influence,
    water_drainage_influence,
    sample.drainage_corridor_influence
  );

  const float bare_field = sim_asteroid_coherent_field(id, height, phi, nside, 467);
  const float moss_field = sim_asteroid_coherent_field(id, height, phi, nside, 503);
  const float equatorial_warmth = sim_exp(-0.5f * (height / 0.58f) * (height / 0.58f));
  const float rockiness = sim_clamp(0.5f + sim_asteroid_fine_field(id, height, phi, nside, 521) * 0.46f - equatorial_warmth * 0.28f + sim_seeded_noise_nside(id, 27, nside) * 0.06f, 0.0f, 1.0f);
  const float base_moisture = 0.25f + equatorial_warmth * 0.12f + sim_asteroid_coherent_field(id, height, phi, nside, 509) * 0.08f;
  sample.terrain_code = rockiness > 0.62f ? SIM_TERRAIN_ROCK : SIM_TERRAIN_SAND;
  sample.moisture = sim_clamp(
    base_moisture +
      bare_field * 0.13f +
      sample.drainage_corridor_influence * 0.095f +
      sim_seeded_noise_nside(id, 3, nside) * 0.045f,
    0.0f,
    1.0f
  );
  sample.soil = sim_clamp(
    0.44f +
      bare_field * 0.23f +
      equatorial_warmth * 0.08f +
      sample.drainage_corridor_influence * 0.07f +
      sim_seeded_noise_nside(id, 31, nside) * 0.045f -
      rockiness * 0.08f,
    0.0f,
    1.0f
  );

  if (is_baobab_watch_ground) {
    sample.terrain_code = SIM_TERRAIN_CRACK;
    sample.baobab_risk = 0.75f + sim_seeded_noise_nside(id, 17, nside) * 0.2f;
    sample.moisture = sim_clamp(sample.moisture - 0.1f, 0.0f, 1.0f);
    sample.soil = sim_clamp(sample.soil - 0.12f, 0.0f, 1.0f);
  } else if (equatorial_warmth > 0.34f && (moss_field > 0.79f || (sample.drainage_corridor_influence > 0.5f && sample.moisture > 0.39f))) {
    sample.terrain_code = SIM_TERRAIN_MOSS;
  }

  if (is_sunset_path_ground) {
    sample.terrain_code = SIM_TERRAIN_PATH;
    sample.care = 0.04f;
    sample.baobab_risk *= 0.45f;
  }

  if (sample.volcano_influence > 0.18f) {
    sample.soil = sim_clamp(sample.soil - sample.volcano_influence * 0.22f, 0.0f, 1.0f);
    sample.moisture = sim_clamp(sample.moisture - sample.volcano_influence * 0.04f, 0.0f, 1.0f);
    if (sample.active_volcano_influence > 0.16f) {
      sample.ash = sim_max(sample.ash, 0.012f + sample.active_volcano_influence * 0.07f + sim_seeded_noise_nside(id, 37, nside) * 0.018f);
    }
  }

  if (is_volcano_area) {
    sample.terrain_code = SIM_TERRAIN_VOLCANO;
    sample.ash =
      (is_active_volcano_area ? 0.12f : 0.08f) +
      sample.volcano_influence * (is_active_volcano_area ? 0.08f : 0.035f) +
      sim_seeded_noise_nside(id, 29, nside) * (is_active_volcano_area ? 0.04f : 0.025f);
    sample.moisture = sim_clamp(sample.moisture - 0.14f, 0.0f, 1.0f);
    sample.soil = 0.06f + (1.0f - sample.volcano_influence) * 0.08f + sim_seeded_noise_nside(id, 43, nside) * 0.05f;
    if (is_active_volcano_area) {
      sample.baobab_risk = 0.0f;
      sample.baobab_blocked = 1u;
    }
  }

  if (is_water_area) {
    sample.terrain_code = SIM_TERRAIN_WATER;
    sample.moisture = 0.76f + sample.water_influence * 0.18f + sim_seeded_noise_nside(id, 73, nside) * 0.08f;
    sample.soil = sim_max(sample.soil, 0.58f);
    sample.baobab_risk *= 0.18f;
    sample.ash = sim_max(0.0f, sample.ash - 0.04f);
  }

  return sample;
}

SIM_EXPORT void sim_initialize_asteroid_profile(
  int32_t size,
  int32_t nside,
  int32_t rose_cell,
  int32_t volcano_count,
  int32_t active_volcano_count,
  int32_t active_center_count,
  int32_t water_count,
  int32_t baobab_watch_count,
  uintptr_t offsets_offset
) {
  const uint32_t *SIM_RESTRICT offsets = (const uint32_t *)(uintptr_t)offsets_offset;
  const float *SIM_RESTRICT cell_phi = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_CELL_PHI];
  const int32_t *SIM_RESTRICT cell_ring = (const int32_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_CELL_RING];
  const float *SIM_RESTRICT volcano_height = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_VOLCANO_HEIGHT];
  const float *SIM_RESTRICT volcano_phi = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_VOLCANO_PHI];
  const int32_t *SIM_RESTRICT volcano_ring = (const int32_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_VOLCANO_RING];
  const float *SIM_RESTRICT active_volcano_height = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_HEIGHT];
  const float *SIM_RESTRICT active_volcano_phi = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_PHI];
  const float *SIM_RESTRICT active_center_height = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ACTIVE_CENTER_HEIGHT];
  const float *SIM_RESTRICT active_center_phi = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ACTIVE_CENTER_PHI];
  const float *SIM_RESTRICT water_height = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_WATER_HEIGHT];
  const float *SIM_RESTRICT water_phi = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_WATER_PHI];
  const float *SIM_RESTRICT baobab_watch_height = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_BAOBAB_WATCH_HEIGHT];
  const float *SIM_RESTRICT baobab_watch_phi = (const float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_BAOBAB_WATCH_PHI];
  const uint8_t *SIM_RESTRICT volcano_mask = (const uint8_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_VOLCANO_MASK];
  const uint8_t *SIM_RESTRICT active_volcano_mask = (const uint8_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_MASK];
  uint8_t *SIM_RESTRICT terrain_code = (uint8_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_TERRAIN_CODE];
  float *SIM_RESTRICT moisture = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_MOISTURE];
  float *SIM_RESTRICT soil = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_SOIL];
  float *SIM_RESTRICT baobab_risk = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_BAOBAB_RISK];
  uint8_t *SIM_RESTRICT baobab_blocked = (uint8_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_BAOBAB_BLOCKED];
  float *SIM_RESTRICT ash = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ASH];
  float *SIM_RESTRICT elevation = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ELEVATION];
  float *SIM_RESTRICT volcanic_ash_fall_rate = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_VOLCANIC_ASH_FALL_RATE];
  uint8_t *SIM_RESTRICT active_volcano_crater_mask = (uint8_t *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_ACTIVE_VOLCANO_CRATER_MASK];
  float *SIM_RESTRICT care = (float *)(uintptr_t)offsets[SIM_ASTEROID_PROFILE_CARE];

  const int32_t canonical_nside = nside < 64 ? 64 : nside;
  const int32_t child_scale = canonical_nside / nside > 0 ? canonical_nside / nside : 1;
  const int32_t rose_ring = (rose_cell >= 0 && rose_cell < size) ? (int32_t)sim_floor(((float)cell_ring[rose_cell] * (float)canonical_nside / (float)nside) + 0.5f) : 2 * canonical_nside;
  const float rose_phi = (rose_cell >= 0 && rose_cell < size) ? cell_phi[rose_cell] : 0.0f;

  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    int32_t face = 0;
    int32_t ix = 0;
    int32_t iy = 0;
    sim_decode_nested_id(i, nside, &face, &ix, &iy);

    float moisture_sum = 0.0f;
    float soil_sum = 0.0f;
    float baobab_risk_sum = 0.0f;
    float ash_sum = 0.0f;
    float elevation_sum = 0.0f;
    float ash_fall_sum = 0.0f;
    float care_sum = 0.0f;
    float volcano_influence_sum = 0.0f;
    float active_volcano_influence_sum = 0.0f;
    float water_influence_sum = 0.0f;
    float corridor_sum = 0.0f;
    int32_t terrain_counts[9] = { 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    int32_t blocked_count = 0;
    int32_t crater_count = 0;
    const int32_t sample_count = child_scale * child_scale;

    for (int32_t dx = 0; dx < child_scale; dx += 1) {
      for (int32_t dy = 0; dy < child_scale; dy += 1) {
        const int32_t sample_ix = ix * child_scale + dx;
        const int32_t sample_iy = iy * child_scale + dy;
        const int32_t sample_id = sim_nested_id(face, sample_ix, sample_iy, canonical_nside);
        const int32_t sample_ring = sim_face_ring_anchor(face) * canonical_nside - sample_ix - sample_iy - 1;
        float sample_height = 0.0f;
        float sample_phi = 0.0f;
        sim_nested_cell_center_height_phi(face, sample_ix, sample_iy, canonical_nside, &sample_height, &sample_phi);
        const SimAsteroidTerrainSample sample = sim_asteroid_profile_sample(
          sample_id,
          sample_height,
          sample_phi,
          sample_ring,
          canonical_nside,
          child_scale == 1 && volcano_mask[i] == 1u,
          child_scale == 1 && active_volcano_mask[i] == 1u,
          volcano_height,
          volcano_phi,
          volcano_ring,
          volcano_count,
          active_volcano_height,
          active_volcano_phi,
          active_volcano_count,
          active_center_height,
          active_center_phi,
          active_center_count,
          water_height,
          water_phi,
          water_count,
          baobab_watch_height,
          baobab_watch_phi,
          baobab_watch_count,
          rose_ring,
          rose_phi
        );
        moisture_sum += sample.moisture;
        soil_sum += sample.soil;
        baobab_risk_sum += sample.baobab_risk;
        ash_sum += sample.ash;
        elevation_sum += sample.elevation;
        ash_fall_sum += sample.volcanic_ash_fall_rate;
        care_sum += sample.care;
        volcano_influence_sum += sample.volcano_influence;
        active_volcano_influence_sum += sample.active_volcano_influence;
        water_influence_sum += sample.water_influence;
        corridor_sum += sample.drainage_corridor_influence;
        if (sample.terrain_code <= SIM_TERRAIN_MEADOW) {
          terrain_counts[sample.terrain_code] += 1;
        }
        blocked_count += sample.baobab_blocked ? 1 : 0;
        crater_count += sample.active_volcano_crater ? 1 : 0;
      }
    }

    const float inv_sample_count = 1.0f / (float)sample_count;
    const float volcano_fraction = (float)terrain_counts[SIM_TERRAIN_VOLCANO] * inv_sample_count;
    const float water_fraction = (float)terrain_counts[SIM_TERRAIN_WATER] * inv_sample_count;
    const float path_fraction = (float)terrain_counts[SIM_TERRAIN_PATH] * inv_sample_count;
    const float crack_fraction = (float)terrain_counts[SIM_TERRAIN_CRACK] * inv_sample_count;
    const float moss_fraction = (float)terrain_counts[SIM_TERRAIN_MOSS] * inv_sample_count;
    const float rock_fraction = (float)terrain_counts[SIM_TERRAIN_ROCK] * inv_sample_count;
    const float sand_fraction = (float)terrain_counts[SIM_TERRAIN_SAND] * inv_sample_count;
    const float mean_volcano_influence = volcano_influence_sum * inv_sample_count;
    const float mean_active_volcano_influence = active_volcano_influence_sum * inv_sample_count;
    const float mean_water_influence = water_influence_sum * inv_sample_count;
    const float mean_corridor = corridor_sum * inv_sample_count;

    moisture[i] = sim_clamp(moisture_sum * inv_sample_count, 0.0f, 1.0f);
    soil[i] = sim_clamp(soil_sum * inv_sample_count, 0.0f, 1.0f);
    baobab_risk[i] = sim_clamp(baobab_risk_sum * inv_sample_count, 0.0f, 1.0f);
    ash[i] = sim_clamp(ash_sum * inv_sample_count, 0.0f, 1.0f);
    elevation[i] = elevation_sum * inv_sample_count;
    volcanic_ash_fall_rate[i] = ash_fall_sum * inv_sample_count;
    care[i] = care_sum * inv_sample_count;
    baobab_blocked[i] = blocked_count > 0 ? 1u : 0u;
    active_volcano_crater_mask[i] = crater_count > 0 ? 1u : 0u;

    terrain_code[i] =
      volcano_mask[i] == 1u || volcano_fraction > 0.16f || mean_volcano_influence > 0.54f ? SIM_TERRAIN_VOLCANO :
        water_fraction > 0.16f || (mean_water_influence > 0.58f && volcano_fraction < 0.08f) ? SIM_TERRAIN_WATER :
          path_fraction > 0.18f ? SIM_TERRAIN_PATH :
            crack_fraction > 0.24f ? SIM_TERRAIN_CRACK :
              moss_fraction > 0.2f || (mean_corridor > 0.5f && moisture[i] > 0.41f) ? SIM_TERRAIN_MOSS :
                rock_fraction > sim_max(0.28f, sand_fraction) ? SIM_TERRAIN_ROCK :
                  SIM_TERRAIN_SAND;

    if (terrain_code[i] == SIM_TERRAIN_VOLCANO) {
      soil[i] = sim_min(soil[i], 0.15f + (1.0f - mean_volcano_influence) * 0.08f);
      moisture[i] = sim_min(moisture[i], 0.24f);
      if (mean_active_volcano_influence > 0.48f || active_volcano_mask[i] == 1u) {
        baobab_risk[i] = 0.0f;
        baobab_blocked[i] = 1u;
      }
    } else if (terrain_code[i] == SIM_TERRAIN_WATER) {
      moisture[i] = sim_max(moisture[i], 0.78f);
      soil[i] = sim_max(soil[i], 0.58f);
      baobab_risk[i] *= 0.18f;
    } else if (terrain_code[i] == SIM_TERRAIN_PATH) {
      care[i] = sim_max(care[i], 0.04f);
      baobab_risk[i] *= 0.45f;
    }
  }
}

static inline uint8_t sim_initial_substrate(
  uint8_t terrain,
  float ash,
  int32_t is_rose_garden,
  float noise
) {
  uint8_t substrate = 0;
  if (terrain == SIM_TERRAIN_VOLCANO) {
    substrate = 1;
  } else if (ash > 0.07f) {
    substrate = 2;
  } else if (terrain == SIM_TERRAIN_CRACK) {
    substrate = noise > 0.5f ? 3 : 4;
  } else if (terrain == SIM_TERRAIN_PATH) {
    substrate = 4;
  } else if (terrain == SIM_TERRAIN_ROCK) {
    substrate = 1;
  } else if (terrain == SIM_TERRAIN_WATER) {
    substrate = 0;
  } else {
    substrate = noise > 0.72f ? 3 : 0;
  }
  return is_rose_garden ? 0 : substrate;
}

static inline float sim_initial_terrain_factor(uint8_t terrain) {
  if (terrain == SIM_TERRAIN_VOLCANO) {
    return 0.18f;
  }
  if (terrain == SIM_TERRAIN_ROCK) {
    return 0.38f;
  }
  if (terrain == SIM_TERRAIN_CRACK) {
    return 0.52f;
  }
  if (terrain == SIM_TERRAIN_WATER) {
    return 0.72f;
  }
  if (terrain == SIM_TERRAIN_PATH) {
    return 0.46f;
  }
  return 0.74f;
}

static inline float sim_initial_rose_fertility(
  int32_t is_earth,
  int32_t is_rose_cell,
  int32_t is_rose_garden,
  uint8_t terrain,
  float moisture,
  float soil,
  float flower,
  float ash,
  float baobab_risk
) {
  if (is_earth) {
    const int32_t unsuitable = terrain == SIM_TERRAIN_WATER || terrain == SIM_TERRAIN_ROCK || terrain == SIM_TERRAIN_VOLCANO;
    const float rose_suitability = sim_clamp(flower / 0.55f, 0.0f, 1.0f);
    const float raw = unsuitable
      ? 0.08f
      : sim_clamp(
          0.14f +
            flower * 2.16f +
            (terrain == SIM_TERRAIN_MOSS || terrain == SIM_TERRAIN_MEADOW ? 0.26f * rose_suitability : 0.0f) +
            sim_max(0.0f, moisture - 0.34f) * 0.32f * rose_suitability -
            (terrain == SIM_TERRAIN_SAND ? 0.2f : 0.0f) +
            (is_rose_garden ? 0.5f : 0.0f),
          0.1f,
          is_rose_garden ? 1.78f : 1.66f
        );
    return is_rose_cell ? sim_max(raw, 1.55f) : raw;
  }

  const float water_fit = sim_clamp((moisture - 0.3f) / 0.45f, 0.0f, 1.0f);
  const float soil_fit = sim_clamp((soil - 0.38f) / 0.42f, 0.0f, 1.0f);
  const float terrain_fit =
    terrain == SIM_TERRAIN_ROSE ? 0.46f :
      terrain == SIM_TERRAIN_MOSS ? 0.28f :
        terrain == SIM_TERRAIN_PATH ? 0.16f :
          terrain == SIM_TERRAIN_SAND ? -0.06f :
            terrain == SIM_TERRAIN_ROCK ? -0.2f :
              terrain == SIM_TERRAIN_CRACK ? -0.28f :
                terrain == SIM_TERRAIN_WATER ? -0.18f :
                  0.0f;
  const float raw = sim_clamp(
    0.16f + soil_fit * 0.5f + water_fit * 0.32f + terrain_fit - ash * 0.62f - baobab_risk * 0.16f,
    0.12f,
    1.18f
  );
  return is_rose_cell ? 1.85f : (is_rose_garden ? sim_max(1.12f, raw) : raw);
}

SIM_EXPORT void sim_initialize_vegetation_state(
  int32_t size,
  int32_t nside,
  int32_t is_earth,
  int32_t rose_cell,
  uintptr_t offsets_offset
) {
  const uint32_t *SIM_RESTRICT offsets = (const uint32_t *)(uintptr_t)offsets_offset;
  const uint8_t *SIM_RESTRICT terrain_code = (const uint8_t *)(uintptr_t)offsets[SIM_INIT_TERRAIN_CODE];
  const float *SIM_RESTRICT moisture = (const float *)(uintptr_t)offsets[SIM_INIT_MOISTURE];
  const float *SIM_RESTRICT soil = (const float *)(uintptr_t)offsets[SIM_INIT_SOIL];
  const float *SIM_RESTRICT flower = (const float *)(uintptr_t)offsets[SIM_INIT_FLOWER];
  const float *SIM_RESTRICT ash_input = (const float *)(uintptr_t)offsets[SIM_INIT_ASH_INPUT];
  const float *SIM_RESTRICT baobab_input = (const float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_INPUT];
  const uint8_t *SIM_RESTRICT rose_garden_mask = (const uint8_t *)(uintptr_t)offsets[SIM_INIT_ROSE_GARDEN_MASK];
  const float *SIM_RESTRICT baobab_risk_input = (const float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_RISK_INPUT];
  const uint8_t *SIM_RESTRICT baobab_blocked_input = (const uint8_t *)(uintptr_t)offsets[SIM_INIT_BAOBAB_BLOCKED_INPUT];
  const float *SIM_RESTRICT elevation_input = (const float *)(uintptr_t)offsets[SIM_INIT_ELEVATION_INPUT];
  const float *SIM_RESTRICT cell_height_input = (const float *)(uintptr_t)offsets[SIM_INIT_CELL_HEIGHT_INPUT];
  const float *SIM_RESTRICT cell_phi = (const float *)(uintptr_t)offsets[SIM_INIT_CELL_PHI];
  const float *SIM_RESTRICT climate_mean_input = (const float *)(uintptr_t)offsets[SIM_INIT_CLIMATE_MEAN_INPUT];
  const float *SIM_RESTRICT climate_diurnal_input = (const float *)(uintptr_t)offsets[SIM_INIT_CLIMATE_DIURNAL_INPUT];
  const float *SIM_RESTRICT rain_climatology_input = (const float *)(uintptr_t)offsets[SIM_INIT_RAIN_CLIMATOLOGY_INPUT];

  uint8_t *SIM_RESTRICT land_active = (uint8_t *)(uintptr_t)offsets[SIM_INIT_LAND_ACTIVE];
  uint8_t *SIM_RESTRICT substrate = (uint8_t *)(uintptr_t)offsets[SIM_INIT_SUBSTRATE];
  float *SIM_RESTRICT depth = (float *)(uintptr_t)offsets[SIM_INIT_DEPTH];
  float *SIM_RESTRICT rose_fertility = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_FERTILITY];
  float *SIM_RESTRICT baobab_risk = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_RISK];
  uint8_t *SIM_RESTRICT baobab_blocked = (uint8_t *)(uintptr_t)offsets[SIM_INIT_BAOBAB_BLOCKED];
  float *SIM_RESTRICT sunlight = (float *)(uintptr_t)offsets[SIM_INIT_SUNLIGHT];
  float *SIM_RESTRICT cell_height = (float *)(uintptr_t)offsets[SIM_INIT_CELL_HEIGHT];
  float *SIM_RESTRICT climate_mean_temp_c = (float *)(uintptr_t)offsets[SIM_INIT_CLIMATE_MEAN_TEMP_C];
  float *SIM_RESTRICT climate_diurnal_range_c = (float *)(uintptr_t)offsets[SIM_INIT_CLIMATE_DIURNAL_RANGE_C];
  float *SIM_RESTRICT elevation = (float *)(uintptr_t)offsets[SIM_INIT_ELEVATION];
  float *SIM_RESTRICT rain_climatology = (float *)(uintptr_t)offsets[SIM_INIT_RAIN_CLIMATOLOGY];
  float *SIM_RESTRICT h = (float *)(uintptr_t)offsets[SIM_INIT_H];
  float *SIM_RESTRICT r = (float *)(uintptr_t)offsets[SIM_INIT_R];
  float *SIM_RESTRICT rain_memory = (float *)(uintptr_t)offsets[SIM_INIT_RAIN_MEMORY];
  float *SIM_RESTRICT ash_stress = (float *)(uintptr_t)offsets[SIM_INIT_ASH_STRESS];
  float *SIM_RESTRICT soil_cap = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_CAP];
  float *SIM_RESTRICT soil_residual = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_RESIDUAL];
  float *SIM_RESTRICT soil_thickness = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_THICKNESS];
  float *SIM_RESTRICT soil_center_depth = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_CENTER_DEPTH];
  float *SIM_RESTRICT soil_water = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_WATER];
  float *SIM_RESTRICT w0 = (float *)(uintptr_t)offsets[SIM_INIT_W0];
  float *SIM_RESTRICT w1 = (float *)(uintptr_t)offsets[SIM_INIT_W1];
  float *SIM_RESTRICT groundwater_storage = (float *)(uintptr_t)offsets[SIM_INIT_GROUNDWATER_STORAGE];
  float *SIM_RESTRICT groundwater_cap = (float *)(uintptr_t)offsets[SIM_INIT_GROUNDWATER_CAP];
  float *SIM_RESTRICT groundwater_thickness = (float *)(uintptr_t)offsets[SIM_INIT_GROUNDWATER_THICKNESS];
  float *SIM_RESTRICT groundwater_top_depth = (float *)(uintptr_t)offsets[SIM_INIT_GROUNDWATER_TOP_DEPTH];
  float *SIM_RESTRICT soil_mineral_n = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_MINERAL_N];
  float *SIM_RESTRICT litter_carbon = (float *)(uintptr_t)offsets[SIM_INIT_LITTER_CARBON];
  float *SIM_RESTRICT litter_fast_carbon = (float *)(uintptr_t)offsets[SIM_INIT_LITTER_FAST_CARBON];
  float *SIM_RESTRICT litter_slow_carbon = (float *)(uintptr_t)offsets[SIM_INIT_LITTER_SLOW_CARBON];
  float *SIM_RESTRICT soil_carbon_active = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_CARBON_ACTIVE];
  float *SIM_RESTRICT soil_carbon_stable = (float *)(uintptr_t)offsets[SIM_INIT_SOIL_CARBON_STABLE];
  float *SIM_RESTRICT nutrient_stress_baobab = (float *)(uintptr_t)offsets[SIM_INIT_NUTRIENT_STRESS_BAOBAB];
  float *SIM_RESTRICT nutrient_stress_rose = (float *)(uintptr_t)offsets[SIM_INIT_NUTRIENT_STRESS_ROSE];
  float *SIM_RESTRICT baobab_leaf = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_LEAF];
  float *SIM_RESTRICT baobab_stem = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_STEM];
  float *SIM_RESTRICT baobab_root = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_ROOT];
  float *SIM_RESTRICT baobab_store = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_STORE];
  float *SIM_RESTRICT mb = (float *)(uintptr_t)offsets[SIM_INIT_MB];
  float *SIM_RESTRICT sb = (float *)(uintptr_t)offsets[SIM_INIT_SB];
  float *SIM_RESTRICT rose_leaf = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_LEAF];
  float *SIM_RESTRICT rose_flower = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_FLOWER];
  float *SIM_RESTRICT rose_root = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_ROOT];
  float *SIM_RESTRICT rose_store = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_STORE];
  float *SIM_RESTRICT mr = (float *)(uintptr_t)offsets[SIM_INIT_MR];
  float *SIM_RESTRICT baobab_seed = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_SEED];
  float *SIM_RESTRICT rose_seed = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_SEED];
  float *SIM_RESTRICT baobab_readiness = (float *)(uintptr_t)offsets[SIM_INIT_BAOBAB_READINESS];
  float *SIM_RESTRICT rose_readiness = (float *)(uintptr_t)offsets[SIM_INIT_ROSE_READINESS];

  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    const uint8_t terrain = terrain_code[i];
    const int32_t is_land = terrain == SIM_TERRAIN_WATER ? 0 : 1;
    const int32_t is_rose_garden = i == rose_cell || rose_garden_mask[i] == 1;
    const float local_baobab_risk = baobab_risk_input[i];
    const uint8_t local_baobab_blocked = baobab_blocked_input[i];
    const float height = cell_height_input[i];
    const float phi = cell_phi[i];
    const float noise = sim_initial_noise(is_earth, i, height, phi, nside, 503);
    const uint8_t sub = sim_initial_substrate(terrain, ash_input[i], is_rose_garden, noise);
    const float dry_bias =
      terrain == SIM_TERRAIN_VOLCANO ? -0.24f :
        terrain == SIM_TERRAIN_WATER ? 0.42f :
          terrain == SIM_TERRAIN_CRACK ? -0.18f :
            0.0f;
    const float initial_rose_cover = flower[i];
    const float earth_rose_depth_boost = is_earth ? 0.22f * sim_clamp(initial_rose_cover / 0.45f, 0.0f, 1.0f) : 0.0f;
    const float basin_noise = sim_initial_noise(is_earth, i, height, phi, nside, 509);
    const float basin = 0.46f + basin_noise * 0.2f + dry_bias;
    const float baobab_rooting_depth_boost =
      !is_earth && !local_baobab_blocked && terrain != SIM_TERRAIN_VOLCANO
        ? 0.34f * sim_clamp(local_baobab_risk, 0.0f, 1.0f)
        : 0.0f;
    const float depth_value = sim_clamp(
      (i == rose_cell ? (is_earth ? 1.22f : 1.62f) : 0.72f + basin * 0.36f) *
        (terrain == SIM_TERRAIN_VOLCANO ? 0.56f : 1.0f) +
        earth_rose_depth_boost +
        baobab_rooting_depth_boost,
      0.32f,
      1.65f
    );
    const float rose_soil = sim_initial_rose_fertility(
      is_earth,
      i == rose_cell,
      is_rose_garden,
      terrain,
      moisture[i],
      soil[i],
      initial_rose_cover,
      ash_input[i],
      local_baobab_risk
    );
    const float initial_moisture = sim_clamp(moisture[i], 0.0f, 1.0f);
    const float initial_wetness =
      terrain == SIM_TERRAIN_WATER && initial_moisture <= 0.0f ? 0.78f :
        i == rose_cell && initial_moisture <= 0.0f ? 0.19f :
          terrain == SIM_TERRAIN_VOLCANO && initial_moisture <= 0.0f ? 0.08f :
            (initial_moisture > 0.0f ? initial_moisture : 0.14f + sim_seeded_noise_nside(i, 521, nside) * 0.12f);
    const float deep_noise = sim_seeded_noise_nside(i, 523, nside);
    float top_depth = 0.0f;

    land_active[i] = (uint8_t)is_land;
    substrate[i] = sub;
    depth[i] = depth_value;
    rose_fertility[i] = rose_soil;
    baobab_risk[i] = local_baobab_risk;
    baobab_blocked[i] = local_baobab_blocked;
    sunlight[i] = 1.0f;
    cell_height[i] = height;
    climate_mean_temp_c[i] = is_earth ? climate_mean_input[i] : 0.0f;
    climate_diurnal_range_c[i] = is_earth ? climate_diurnal_input[i] : 0.0f;
    elevation[i] = elevation_input[i];
    rain_climatology[i] = is_earth ? rain_climatology_input[i] : 1.0f;
    h[i] = 0.0f;
    r[i] = 0.0f;
    rain_memory[i] = 0.0f;
    ash_stress[i] = ash_input[i];

    for (int32_t layer = 0; layer < 3; layer += 1) {
      const int32_t index = layer * size + i;
      const float cap = sim_soil_layer_capacity(depth_value, sub, layer);
      const float thickness = sim_soil_layer_thickness(cap, sub);
      const float wetness =
        layer == 0
          ? initial_wetness
          : initial_wetness + 0.08f + (float)layer * 0.055f + deep_noise * 0.08f;
      soil_cap[index] = cap;
      soil_residual[index] = sim_residual_storage(cap, sub);
      soil_thickness[index] = thickness;
      soil_center_depth[index] = top_depth + 0.5f * thickness;
      soil_water[index] = sim_clamp(cap * wetness, 0.01f * cap, 0.9f * cap);
      top_depth += thickness;
    }

    const float groundwater_cap_value = sim_groundwater_capacity(depth_value, sub);
    const float basin_wetness =
      terrain == SIM_TERRAIN_WATER ? 0.72f :
        terrain == SIM_TERRAIN_VOLCANO ? 0.16f :
          initial_wetness + 0.2f + sim_seeded_noise_nside(i, 529, nside) * 0.16f;
    float groundwater_storage_value = sim_clamp(
      groundwater_cap_value * basin_wetness,
      0.02f * groundwater_cap_value,
      0.92f * groundwater_cap_value
    );
    if (!is_earth && !local_baobab_blocked && terrain != SIM_TERRAIN_VOLCANO && local_baobab_risk > 0.45f) {
      const float fracture_storage = groundwater_cap_value * (0.22f + 0.22f * sim_clamp(local_baobab_risk, 0.0f, 1.0f));
      groundwater_storage_value = sim_max(groundwater_storage_value, fracture_storage);
    }
    w0[i] = soil_water[i];
    w1[i] = groundwater_storage_value;
    groundwater_storage[i] = groundwater_storage_value;
    groundwater_cap[i] = groundwater_cap_value;
    groundwater_thickness[i] = sim_groundwater_thickness(groundwater_cap_value, sub);
    groundwater_top_depth[i] = top_depth;

    const float ash_pulse = sim_clamp(ash_stress[i] * 1.35f, 0.0f, 1.0f);
    const float fertility = sim_clamp(rose_soil / 1.8f, 0.0f, 1.0f);
    const float earth_organic_soil = is_earth
      ? 0.06f + fertility * 0.16f + (terrain == SIM_TERRAIN_MOSS || terrain == SIM_TERRAIN_MEADOW ? 0.08f : 0.0f)
      : 0.0f;
    const float nutrient_noise = sim_seeded_noise_nside(i, 533, nside);
    const float mineral_n = sim_clamp(
      0.08f +
        sim_initial_terrain_factor(terrain) * 0.18f +
        substrate_nutrient_r(sub) * 0.22f +
        fertility * 0.18f +
        earth_organic_soil * 0.34f +
        ash_pulse * 0.12f +
        (is_earth ? 0.08f : 0.0f) +
        (nutrient_noise - 0.5f) * 0.04f,
      0.03f,
      0.95f
    );
    const float litter = sim_clamp(
      (fertility * 0.08f + earth_organic_soil * 0.16f + ash_pulse * 0.025f + nutrient_noise * 0.035f) *
        (is_earth ? 1.35f : 0.72f),
      0.0f,
      0.28f
    );
    const float soil_carbon_base = sim_clamp(
      0.04f + mineral_n * 0.42f + fertility * 0.18f + earth_organic_soil + (terrain == SIM_TERRAIN_WATER ? 0.18f : 0.0f),
      0.02f,
      1.12f
    );
    soil_mineral_n[i] = mineral_n;
    litter_carbon[i] = litter;
    litter_fast_carbon[i] = litter * 0.65f;
    litter_slow_carbon[i] = litter * 0.35f;
    soil_carbon_active[i] = soil_carbon_base * 0.28f;
    soil_carbon_stable[i] = soil_carbon_base * 0.72f;
    nutrient_stress_baobab[i] = sim_nutrient_stress(mineral_n, substrate_nutrient_b(sub));
    nutrient_stress_rose[i] = sim_nutrient_stress(
      mineral_n,
      substrate_nutrient_r(sub) * sim_clamp(0.45f + 0.55f * rose_soil, 0.32f, 1.45f)
    );

    const float initial_baobab_mass = local_baobab_blocked ? 0.0f : sim_clamp(baobab_input[i] * 1.25f, 0.0f, 1.1f);
    baobab_leaf[i] = initial_baobab_mass * 0.24f;
    baobab_stem[i] = initial_baobab_mass * 0.34f;
    baobab_root[i] = initial_baobab_mass * 0.42f;
    baobab_store[i] = initial_baobab_mass * 0.28f;
    mb[i] = baobab_leaf[i] + baobab_stem[i] + baobab_root[i];
    sb[i] = baobab_store[i];

    const float initial_rose_mass =
      i == rose_cell ? 0.42f :
        initial_rose_cover > 0.04f
          ? sim_clamp(initial_rose_cover * (is_rose_garden ? 0.78f : 0.66f), 0.055f, is_rose_garden ? 0.5f : 0.36f)
          : is_earth && is_rose_garden ? sim_clamp(0.38f * 0.45f, 0.08f, 0.26f) : 0.0f;
    const float rose_flower_share = i == rose_cell ? 0.13f : 0.14f;
    rose_leaf[i] = initial_rose_mass * 0.38f;
    rose_flower[i] = initial_rose_mass * rose_flower_share;
    rose_root[i] = initial_rose_mass * sim_max(0.12f, 1.0f - 0.38f - rose_flower_share);
    rose_store[i] = initial_rose_mass * 0.12f;
    mr[i] = rose_leaf[i] + rose_flower[i] + rose_root[i];

    const float baobab_seed_background =
      is_earth
        ? local_baobab_risk * 0.026f
        : local_baobab_risk > 0.72f && sim_seeded_noise_nside(i, 547, nside) > 0.92f
          ? local_baobab_risk * 0.006f
          : 0.0f;
    baobab_seed[i] = local_baobab_blocked
      ? 0.0f
      : sim_clamp(
          (baobab_seed_background + initial_baobab_mass * 0.018f) *
            (0.65f + sim_seeded_noise_nside(i, 547, nside) * 0.7f),
          0.0f,
          0.16f
        );
    const float habitat_seed_bank = is_earth ? rose_soil * 0.01f : 0.0f;
    const float local_rose_seed_bank = initial_rose_mass * (is_earth ? 0.026f : 0.025f);
    rose_seed[i] = sim_clamp(
      (local_rose_seed_bank + habitat_seed_bank) * (0.72f + sim_seeded_noise_nside(i, 549, nside) * 0.55f),
      0.0f,
      is_earth ? 0.14f : 0.08f
    );
    baobab_readiness[i] = sim_clamp((initial_wetness - 0.14f) * 0.55f + sim_seeded_noise_nside(i, 551, nside) * 0.08f, 0.0f, 0.42f);
    rose_readiness[i] = sim_clamp(
      (initial_wetness - 0.2f) * 0.62f +
        (is_rose_garden ? 0.12f : 0.0f) +
        sim_clamp(rose_soil / 1.6f, 0.0f, 1.0f) * 0.08f +
        sim_seeded_noise_nside(i, 553, nside) * 0.06f,
      0.0f,
      0.52f
    );

    if (is_earth && !local_baobab_blocked && mb[i] <= 0.0f && local_baobab_risk > 0.72f && sim_seeded_noise_nside(i, 557, nside) > 0.78f) {
      const float mass = 0.045f + sim_seeded_noise_nside(i, 563, nside) * 0.05f;
      baobab_leaf[i] = mass * 0.24f;
      baobab_stem[i] = mass * 0.34f;
      baobab_root[i] = mass * 0.42f;
      baobab_store[i] = mass * 0.24f;
      mb[i] = baobab_leaf[i] + baobab_stem[i] + baobab_root[i];
      sb[i] = baobab_store[i];
      baobab_seed[i] = sim_max(baobab_seed[i], 0.03f + local_baobab_risk * 0.02f);
    }
  }
}

static int32_t sim_collect_rose_kernel_targets(
  int32_t source,
  int32_t nside,
  int32_t size,
  const uint8_t *land_active,
  int32_t max_graph_steps,
  uint32_t *marks,
  uint32_t token
) {
  (void)max_graph_steps;
  int32_t target_count = sim_add_rose_kernel_target(source, size, land_active, marks, token, 0);
  for (int32_t direction = 0; direction < 8; direction += 1) {
    const int32_t neighbor = sim_step_nested_neighbor(source, direction, nside);
    target_count = sim_add_rose_kernel_target(neighbor, size, land_active, marks, token, target_count);
  }
  return target_count;
}

SIM_EXPORT int32_t sim_count_rose_seed_kernel(
  int32_t nside,
  int32_t size,
  uintptr_t land_active_offset,
  int32_t max_graph_steps,
  uintptr_t mark_offset,
  uintptr_t offsets_offset
) {
  const uint8_t *land_active = (const uint8_t *)(uintptr_t)land_active_offset;
  uint32_t *marks = (uint32_t *)(uintptr_t)mark_offset;
  int32_t *offsets = (int32_t *)(uintptr_t)offsets_offset;
  int32_t total = 0;
  for (int32_t i = 0; i < size; i += 1) {
    offsets[i] = total;
    if (land_active[i] != 1u) {
      continue;
    }
    total += sim_collect_rose_kernel_targets(i, nside, size, land_active, max_graph_steps, marks, (uint32_t)(i + 1));
  }
  offsets[size] = total;
  return total;
}

SIM_EXPORT void sim_fill_rose_seed_kernel(
  int32_t nside,
  int32_t size,
  uintptr_t land_active_offset,
  uintptr_t normal_x_offset,
  uintptr_t normal_y_offset,
  uintptr_t normal_z_offset,
  float radius_m,
  float dispersal_length_m,
  int32_t max_graph_steps,
  uintptr_t mark_offset,
  uintptr_t offsets_offset,
  uintptr_t targets_offset,
  uintptr_t weights_offset,
  uintptr_t cumulative_weights_offset,
  uintptr_t weight_sums_offset
) {
  const uint8_t *land_active = (const uint8_t *)(uintptr_t)land_active_offset;
  const float *normal_x = (const float *)(uintptr_t)normal_x_offset;
  const float *normal_y = (const float *)(uintptr_t)normal_y_offset;
  const float *normal_z = (const float *)(uintptr_t)normal_z_offset;
  uint32_t *marks = (uint32_t *)(uintptr_t)mark_offset;
  const int32_t *offsets = (const int32_t *)(uintptr_t)offsets_offset;
  int32_t *targets = (int32_t *)(uintptr_t)targets_offset;
  float *weights = (float *)(uintptr_t)weights_offset;
  float *cumulative_weights = (float *)(uintptr_t)cumulative_weights_offset;
  float *weight_sums = (float *)(uintptr_t)weight_sums_offset;
  const float inv_dispersal_length = dispersal_length_m > 0.0f ? 1.0f / dispersal_length_m : 0.0f;

  for (int32_t i = 0; i < size; i += 1) {
    weight_sums[i] = 0.0f;
    if (land_active[i] != 1u) {
      continue;
    }
    const int32_t target_count = sim_collect_rose_kernel_targets(
      i,
      nside,
      size,
      land_active,
      max_graph_steps,
      marks,
      (uint32_t)(size + i + 1)
    );
    const int32_t output_offset = offsets[i];
    float weight_sum = 0.0f;
    for (int32_t index = 0; index < target_count; index += 1) {
      const int32_t target = sim_rose_kernel_targets[index];
      float cos_distance =
        normal_x[i] * normal_x[target] +
        normal_y[i] * normal_y[target] +
        normal_z[i] * normal_z[target];
      cos_distance = sim_clamp(cos_distance, -1.0f, 1.0f);
      const float angle = 1.5707963267948966f - sim_asin(cos_distance);
      const float distance_m = radius_m * angle;
      const float weight = sim_exp(-distance_m * inv_dispersal_length);
      const int32_t write_index = output_offset + index;
      targets[write_index] = target;
      if (weights != cumulative_weights) {
        weights[write_index] = weight;
      }
      weight_sum += weight;
      cumulative_weights[write_index] = weight_sum;
    }
    weight_sums[i] = weight_sum;
  }
}

static inline double sim_mulberry32_next_unit(uint32_t *rng_state) {
  *rng_state += 0x6d2b79f5u;
  uint32_t t = *rng_state;
  t = (uint32_t)((uint64_t)(t ^ (t >> 15)) * (uint64_t)(t | 1u));
  t ^= t + (uint32_t)((uint64_t)(t ^ (t >> 7)) * (uint64_t)(t | 61u));
  return (double)((t ^ (t >> 14)) & 0xffffffffu) * (1.0 / 4294967296.0);
}

static inline uint32_t sim_hash_u32(uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352du;
  value ^= value >> 15;
  value *= 0x846ca68bu;
  value ^= value >> 16;
  return value;
}

static float sim_seasonal_rain(
  int32_t is_earth,
  float annual_precip_mm,
  float dry_days,
  float day,
  float model_dt_days,
  uint32_t *rng_state
) {
  if (!is_earth) {
    const float annual_water_m = annual_precip_mm / 1000.0f;
    const float mean_daily = annual_water_m / 365.0f;
    const float gentle_cycle = 0.9f + 0.1f * sim_sin(day * 0.85f);
    return mean_daily * gentle_cycle;
  }

  const float wet_days = sim_max(25.0f, 365.0f - dry_days);
  const float wet_fraction = wet_days / 365.0f;
  const float phase = sim_modulo_float(day, 365.0f);
  const int32_t in_wet = phase < wet_days;
  const float background_mean = 0.45f;
  const float seasonal_mean = 0.55f;
  if (!in_wet) {
    const float dry_prob_per_day = 0.014f;
    const float dry_pulse =
      sim_mulberry32_next_unit(rng_state) < (double)(dry_prob_per_day * model_dt_days)
        ? (seasonal_mean * 0.08f) / dry_prob_per_day
        : 0.0f;
    return background_mean + dry_pulse;
  }

  const float wet_mean = seasonal_mean / wet_fraction;
  const float wet_phase = sim_sin((6.283185307179586f * phase) / wet_days);
  const float pulse_prob_per_day = 0.18f + 0.1f * wet_phase * wet_phase;
  if (sim_mulberry32_next_unit(rng_state) >= (double)(pulse_prob_per_day * model_dt_days)) {
    return background_mean;
  }

  return background_mean + (wet_mean / pulse_prob_per_day) * (0.65f + 0.7f * (float)sim_mulberry32_next_unit(rng_state));
}

static inline int32_t sim_select_rose_seed_target(
  int32_t fallback_target,
  int32_t target_start,
  int32_t target_end,
  float weight_sum,
  const int32_t *SIM_RESTRICT dispersal_targets,
  const float *SIM_RESTRICT dispersal_cumulative_weights,
  uint32_t *rng_state
) {
  const float draw = (float)(sim_mulberry32_next_unit(rng_state) * (double)weight_sum);
  int32_t selected_target = fallback_target;
  int32_t low = target_start;
  int32_t high = target_end;
  while (low < high) {
    const int32_t mid = low + ((high - low) >> 1);
    if (draw <= dispersal_cumulative_weights[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  if (low >= target_start && low < target_end) {
    selected_target = dispersal_targets[low];
  }
  return selected_target;
}

static inline void sim_deposit_rose_seed_cohort(
  int32_t size,
  int32_t fallback_target,
  int32_t target_start,
  int32_t target_end,
  float weight_sum,
  float cohort_flux,
  const int32_t *SIM_RESTRICT dispersal_targets,
  const float *SIM_RESTRICT dispersal_cumulative_weights,
  float *SIM_RESTRICT rose_seed_arrival,
  uint32_t *rng_state
) {
  const int32_t selected_target = sim_select_rose_seed_target(
    fallback_target,
    target_start,
    target_end,
    weight_sum,
    dispersal_targets,
    dispersal_cumulative_weights,
    rng_state
  );
  if (selected_target >= 0 && selected_target < size) {
    rose_seed_arrival[selected_target] += cohort_flux;
  }
}

static inline void sim_deposit_rose_seed_cohort_blocked(
  int32_t size,
  int32_t fallback_target,
  int32_t target_start,
  int32_t target_end,
  float weight_sum,
  float cohort_flux,
  const int32_t *SIM_RESTRICT dispersal_targets,
  const float *SIM_RESTRICT dispersal_cumulative_weights,
  int32_t block_start,
  int32_t block_end,
  float *SIM_RESTRICT block_arrival,
  float *SIM_RESTRICT rose_seed_arrival,
  uint32_t *rng_state
) {
  const int32_t selected_target = sim_select_rose_seed_target(
    fallback_target,
    target_start,
    target_end,
    weight_sum,
    dispersal_targets,
    dispersal_cumulative_weights,
    rng_state
  );
  if (selected_target < 0 || selected_target >= size) {
    return;
  }
  if (selected_target >= block_start && selected_target < block_end) {
    block_arrival[selected_target - block_start] += cohort_flux;
  } else {
    rose_seed_arrival[selected_target] += cohort_flux;
  }
}

SIM_EXPORT void sim_distribute_rose_seeds(
  int32_t size,
  int32_t production_count,
  uintptr_t production_ids_offset,
  int32_t cohorts,
  uintptr_t dispersal_offsets_offset,
  uintptr_t dispersal_targets_offset,
  uintptr_t dispersal_weights_offset,
  uintptr_t dispersal_weight_sums_offset,
  uintptr_t rose_seed_production_offset,
  uintptr_t rose_seed_arrival_offset,
  uint32_t rng_state,
  uintptr_t rng_state_out_offset
) {
  const int32_t *SIM_RESTRICT production_ids = (const int32_t *)(uintptr_t)production_ids_offset;
  const int32_t *SIM_RESTRICT dispersal_offsets = (const int32_t *)(uintptr_t)dispersal_offsets_offset;
  const int32_t *SIM_RESTRICT dispersal_targets = (const int32_t *)(uintptr_t)dispersal_targets_offset;
  const float *SIM_RESTRICT dispersal_weights = (const float *)(uintptr_t)dispersal_weights_offset;
  const float *SIM_RESTRICT dispersal_weight_sums = (const float *)(uintptr_t)dispersal_weight_sums_offset;
  const float *SIM_RESTRICT rose_seed_production = (const float *)(uintptr_t)rose_seed_production_offset;
  float *SIM_RESTRICT rose_seed_arrival = (float *)(uintptr_t)rose_seed_arrival_offset;
  uint32_t *rng_state_out = (uint32_t *)(uintptr_t)rng_state_out_offset;

  if (cohorts < 1) {
    cohorts = 1;
  }

  for (int32_t cell_offset = 0; cell_offset < production_count; cell_offset += 1) {
    const int32_t i = production_ids[cell_offset];
    if (i < 0 || i >= size) {
      continue;
    }
    const float production = rose_seed_production[i];
    if (production <= 1.0e-10f) {
      continue;
    }

    const int32_t target_start = dispersal_offsets[i];
    const int32_t target_end = dispersal_offsets[i + 1];
    const float weight_sum = dispersal_weight_sums[i];
    if (weight_sum <= 0.0f || target_end <= target_start) {
      rose_seed_arrival[i] += production;
      continue;
    }

    if (cohorts == 4) {
      const float cohort_flux = production * 0.25f;
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
    } else {
      const float cohort_flux = production / (float)cohorts;
      for (int32_t cohort = 0; cohort < cohorts; cohort += 1) {
        sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      }
    }
  }

  if (rng_state_out) {
    *rng_state_out = rng_state;
  }
}

SIM_EXPORT void sim_produce_and_distribute_rose_seeds(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  int32_t is_earth,
  float asteroid_mean_temp_c,
  float asteroid_diurnal_range_c,
  float asteroid_latitude_temp_range_c,
  float shade,
  float model_dt_days,
  int32_t cohorts,
  uintptr_t dispersal_offsets_offset,
  uintptr_t dispersal_targets_offset,
  uintptr_t dispersal_weights_offset,
  uintptr_t dispersal_weight_sums_offset,
  uintptr_t cell_height_offset,
  uintptr_t climate_mean_temp_c_offset,
  uintptr_t climate_diurnal_range_c_offset,
  uintptr_t elevation_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t h_offset,
  uintptr_t r_offset,
  uintptr_t sunlight_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t rose_store_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t rose_fertility_offset,
  uintptr_t rose_seed_production_offset,
  uintptr_t rose_seed_arrival_offset,
  uint32_t rng_state,
  uintptr_t rng_state_out_offset
) {
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT dispersal_offsets = (const int32_t *)(uintptr_t)dispersal_offsets_offset;
  const int32_t *SIM_RESTRICT dispersal_targets = (const int32_t *)(uintptr_t)dispersal_targets_offset;
  const float *SIM_RESTRICT dispersal_weights = (const float *)(uintptr_t)dispersal_weights_offset;
  const float *SIM_RESTRICT dispersal_weight_sums = (const float *)(uintptr_t)dispersal_weight_sums_offset;
  const float *SIM_RESTRICT cell_height = (const float *)(uintptr_t)cell_height_offset;
  const float *SIM_RESTRICT climate_mean_temp_c = (const float *)(uintptr_t)climate_mean_temp_c_offset;
  const float *SIM_RESTRICT climate_diurnal_range_c = (const float *)(uintptr_t)climate_diurnal_range_c_offset;
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)elevation_offset;
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)h_offset;
  const float *SIM_RESTRICT r = (const float *)(uintptr_t)r_offset;
  const float *SIM_RESTRICT sunlight = (const float *)(uintptr_t)sunlight_offset;
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *SIM_RESTRICT rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *SIM_RESTRICT rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  const float *SIM_RESTRICT rose_root = (const float *)(uintptr_t)rose_root_offset;
  const float *SIM_RESTRICT rose_store = (const float *)(uintptr_t)rose_store_offset;
  const float *SIM_RESTRICT gpp_rose = (const float *)(uintptr_t)gpp_rose_offset;
  const float *SIM_RESTRICT rose_fertility = (const float *)(uintptr_t)rose_fertility_offset;
  float *SIM_RESTRICT rose_seed_production = (float *)(uintptr_t)rose_seed_production_offset;
  float *SIM_RESTRICT rose_seed_arrival = (float *)(uintptr_t)rose_seed_arrival_offset;
  uint32_t *rng_state_out = (uint32_t *)(uintptr_t)rng_state_out_offset;

  if (cohorts < 1) {
    cohorts = 1;
  }

  const int32_t size2 = size * 2;
  const float latitude_temp_range = sim_clamp(asteroid_latitude_temp_range_c, 0.0f, 12.0f);
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    if (i < 0 || i >= size) {
      continue;
    }

    const float adult_carbon = rose_leaf[i] + rose_flower[i] + rose_root[i];
    if (adult_carbon <= 1.0e-8f) {
      continue;
    }

    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const float cap0 = soil_cap[i];
    const float cap1 = soil_cap[layer1_index];
    const float cap2 = soil_cap[layer2_index];
    const float gw_cap = groundwater_cap[i];
    const float s0 = cap0 > 0.0f ? sim_clamp(soil_water[i] / cap0, 0.0f, 1.0f) : 0.0f;
    const float s1 = cap1 > 0.0f ? sim_clamp(soil_water[layer1_index] / cap1, 0.0f, 1.0f) : 0.0f;
    const float s2 = cap2 > 0.0f ? sim_clamp(soil_water[layer2_index] / cap2, 0.0f, 1.0f) : 0.0f;
    const float gw_sat = gw_cap > 0.0f ? sim_clamp(groundwater_storage[i] / gw_cap, 0.0f, 1.0f) : 0.0f;
    const float wetness = sim_clamp(0.45f * s0 + 0.25f * s1 + 0.18f * s2 + 0.12f * gw_sat, 0.0f, 1.0f);
    const float lai_b = sim_clamp(6.2f * sim_max(0.0f, baobab_leaf[i]), 0.0f, 8.5f);
    const float lai_r = sim_clamp(6.4f * sim_max(0.0f, rose_leaf[i]) + 0.7f * sim_max(0.0f, rose_flower[i]), 0.0f, 6.5f);
    const float optical_depth = 0.58f * lai_b + 0.68f * lai_r;
    const float cover = sim_clamp(1.0f - sim_exp(-optical_depth), 0.0f, 1.0f);
    const float local_sunlight = sim_clamp(sunlight[i], 0.0f, 1.0f);
    const float cloud_cooling = sim_clamp(r[i] * 900.0f, 0.0f, 1.0f);
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float mean_insolation = sim_ring_mean_daily_insolation_from_height(height);

    float mean_climate = 0.0f;
    float diurnal_range = 0.0f;
    if (is_earth) {
      const float wet_anomaly = (0.5f - wetness) * 0.8f;
      mean_climate = sim_clamp(climate_mean_temp_c[i] + wet_anomaly - cloud_cooling * 0.55f, -34.0f, 34.0f);
      const float damping = cloud_cooling * 2.5f + cover * 1.2f + wetness * 0.8f;
      diurnal_range = sim_clamp(climate_diurnal_range_c[i] - damping, 2.4f, 27.0f);
    } else {
      const float latitude_anomaly = sim_ring_latitude_temperature_unit_from_height(height) * latitude_temp_range;
      const float terrain_cooling = sim_clamp(sim_max(0.0f, elevation[i]) / 5200.0f, 0.0f, 1.6f) * 5.4f;
      mean_climate = sim_clamp(asteroid_mean_temp_c + latitude_anomaly - terrain_cooling - cloud_cooling * 1.3f, -18.0f, 32.0f);
      const float terrain_boost = sim_clamp(sim_max(0.0f, elevation[i]) / 4200.0f, 0.0f, 1.4f) * 2.8f;
      const float damping = wetness * 7.5f + cloud_cooling * 5.5f + cover * 4.0f;
      diurnal_range = sim_clamp(asteroid_diurnal_range_c + terrain_boost - damping, 3.0f, 28.0f);
    }

    const float surface_water_cooling = sim_clamp(h[i] * 12.0f, 0.0f, 1.0f) * (is_earth ? 1.6f : 1.1f);
    const float temp_c = sim_clamp(mean_climate + diurnal_range * (local_sunlight - mean_insolation) - surface_water_cooling, -18.0f, 48.0f);
    const float temp_stress = sim_fast_temperature_response(SIM_TEMP_RESPONSE_ROSE_REPRO, temp_c);
    const float canopy_light = local_sunlight * sim_exp(-(0.57f * shade * lai_b + 0.18f * lai_r));
    const float moisture_stress = sim_clamp((wetness - 0.24f) / 0.48f, 0.0f, 1.0f);
    const float fertility_stress = sim_clamp(rose_fertility[i] / 1.6f, 0.0f, 1.0f);
    const float reproduction_stress = sim_clamp(moisture_stress * fertility_stress, 0.0f, 1.0f);
    const float adult = sim_max(0.0f, adult_carbon);
    const float maturity = adult / (adult + 0.12f);
    const float flowering = sim_clamp((rose_flower[i] + 0.12f * adult) / 0.34f, 0.0f, 1.0f);
    const float light_factor = sim_clamp(0.2f + 0.8f * sim_clamp(canopy_light / 0.32f, 0.0f, 1.0f), 0.0f, 1.0f);
    const float soil_factor = sim_clamp(rose_fertility[i] * 0.7f, 0.0f, 1.0f);
    const float potential_cap =
      SIM_ROSE_SEED_PRODUCTION_COEFF *
      adult *
      maturity *
      (0.25f + 0.75f * flowering) *
      (0.25f + 0.75f * reproduction_stress) *
      (0.25f + 0.75f * temp_stress) *
      light_factor *
      soil_factor;
    const float q10_r = sim_pow_positive(2.05f, (temp_c - 25.0f) * 0.1f);
    const float maintenance_r =
      q10_r * (0.00062f * rose_leaf[i] + 0.00082f * rose_flower[i] + 0.00028f * rose_root[i] + 0.00008f * rose_store[i]);
    const float carbon_surplus = sim_max(0.0f, gpp_rose[i] - maintenance_r) * (1.0f - 0.14f);
    const float reproductive_allocation =
      0.38f *
      maturity *
      (0.18f + 0.82f * flowering) *
      (0.25f + 0.75f * reproduction_stress) *
      (0.25f + 0.75f * temp_stress) *
      light_factor *
      soil_factor;
    const float seed_carbon_limit =
      carbon_surplus * sim_min(SIM_ROSE_SEED_NPP_ALLOCATION_FRACTION, reproductive_allocation) +
      sim_max(0.0f, rose_store[i] - 0.012f) * SIM_ROSE_SEED_STORE_FRACTION_PER_DAY / sim_max(1.0e-6f, model_dt_days);
    const float production = sim_min(potential_cap, seed_carbon_limit);
    if (production <= 1.0e-10f) {
      continue;
    }
    rose_seed_production[i] = production;

    const int32_t target_start = dispersal_offsets[i];
    const int32_t target_end = dispersal_offsets[i + 1];
    const float weight_sum = dispersal_weight_sums[i];
    if (weight_sum <= 0.0f || target_end <= target_start) {
      rose_seed_arrival[i] += production;
      continue;
    }

    if (cohorts == 4) {
      const float cohort_flux = production * 0.25f;
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
    } else {
      const float cohort_flux = production / (float)cohorts;
      for (int32_t cohort = 0; cohort < cohorts; cohort += 1) {
        sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      }
    }
  }

  if (rng_state_out) {
    *rng_state_out = rng_state;
  }
}

static inline float sim_seed_mortality_rate(float wetness, float temp_c, float base_rate, float drought_sensitivity) {
  const float drought = sim_clamp((0.22f - wetness) / 0.22f, 0.0f, 1.0f);
  const float heat = sim_clamp((temp_c - 38.0f) / 12.0f, 0.0f, 1.0f);
  return base_rate + drought_sensitivity * drought + 0.035f * heat;
}

static inline float sim_storage_allocation_fraction(
  float storage_fraction,
  float positive_npp,
  float stress,
  float store,
  float store_cap,
  float max_fraction
) {
  if (positive_npp <= 0.0f || store_cap <= 1.0e-9f) {
    return 0.0f;
  }
  const float storage_deficit = sim_clamp(1.0f - sim_max(0.0f, store) / store_cap, 0.0f, 1.0f);
  const float water_stress = 1.0f - sim_clamp(stress, 0.0f, 1.0f);
  const float baseline = storage_fraction * (0.35f + 0.65f * sim_clamp(stress, 0.0f, 1.0f));
  const float reserve_refill = storage_fraction * storage_deficit * (1.18f + 0.44f * sim_clamp(stress, 0.0f, 1.0f));
  const float drought_reserve = storage_fraction * storage_deficit * water_stress * 0.48f;
  return sim_clamp(baseline + reserve_refill + drought_reserve, 0.0f, max_fraction);
}

static inline float sim_update_baobab_seed_readiness(
  float previous,
  float wetness,
  float temp_c,
  float temp_response,
  float model_dt_days
) {
  const float water =
    sim_clamp((wetness - 0.16f) / 0.36f, 0.0f, 1.0f) *
    (1.0f - 0.90f * sim_clamp((wetness - 0.64f) / 0.28f, 0.0f, 1.0f));
  const float dry_setback = sim_clamp((0.16f - wetness) / 0.16f, 0.0f, 1.0f) * 0.12f;
  const float cold_setback = sim_clamp((7.0f - temp_c) / 18.0f, 0.0f, 1.0f) * 0.18f;
  return sim_clamp(previous + model_dt_days * (0.86f * water * temp_response - dry_setback - cold_setback) - 0.012f * previous, 0.0f, 1.0f);
}

static inline float sim_update_rose_seed_readiness(
  float previous,
  float wetness,
  float temp_c,
  float temp_response,
  float model_dt_days
) {
  const float water = sim_clamp((wetness - 0.26f) / 0.38f, 0.0f, 1.0f);
  const float dry_setback = sim_clamp((0.26f - wetness) / 0.26f, 0.0f, 1.0f) * 0.32f;
  const float cold_setback = sim_clamp((4.0f - temp_c) / 14.0f, 0.0f, 1.0f) * 0.24f;
  return sim_clamp(previous + model_dt_days * (0.86f * water * temp_response - dry_setback - cold_setback) - 0.012f * previous, 0.0f, 1.0f);
}

static inline float sim_update_seed_readiness(float previous, float wetness, float temp_c, int32_t is_baobab, float model_dt_days) {
  if (is_baobab) {
    return sim_update_baobab_seed_readiness(
      previous,
      wetness,
      temp_c,
      sim_temperature_response(temp_c, 31.0f, 7.0f, 46.0f),
      model_dt_days
    );
  }
  return sim_update_rose_seed_readiness(
    previous,
    wetness,
    temp_c,
    sim_temperature_response(temp_c, 23.0f, 4.0f, 35.0f),
    model_dt_days
  );
}

static inline float sim_baobab_seed_production(float stem_c, float leaf_c, float stress, float temp_stress) {
  const float maturity = sim_smoothstep01((stem_c - 0.045f) / 0.28f);
  return 0.0085f * maturity * (0.35f + 0.65f * stress) * (0.25f + 0.75f * temp_stress) * (0.45f + leaf_c);
}

static inline float sim_baobab_seed_production_carbon_limit(float positive_npp, float store_c, float dt_days) {
  const float safe_dt_days = sim_max(1.0e-6f, dt_days);
  return sim_max(0.0f, positive_npp) * SIM_BAOBAB_SEED_NPP_ALLOCATION_FRACTION +
    sim_max(0.0f, store_c) * SIM_BAOBAB_SEED_STORE_FRACTION_PER_DAY / safe_dt_days;
}

static inline float sim_baobab_germination_rate(
  float wetness,
  float temp_stress,
  float light,
  uint8_t substrate_index,
  float readiness,
  float baobab_risk,
  float ash_stress,
  int32_t blocked
) {
  if (blocked) {
    return 0.0f;
  }
  static const float substrate_factor[5] = {1.0f, 0.45f, 1.12f, 1.0f, 0.82f};
  const float wet_penalty = 1.0f - 0.92f * sim_clamp((wetness - 0.64f) / 0.28f, 0.0f, 1.0f);
  const float dry_pulse = sim_clamp((wetness - 0.18f) / 0.34f, 0.0f, 1.0f) * sim_max(0.04f, wet_penalty);
  const float habitat_recruitment = sim_smoothstep01((baobab_risk - 0.18f) / 0.56f);
  const float ash_penalty = 1.0f - sim_clamp(ash_stress * 1.4f, 0.0f, 1.0f) * 0.86f;
  const float readiness_factor = sim_clamp((readiness - 0.08f) / 0.58f, 0.0f, 1.0f);
  return 0.11f * readiness_factor * dry_pulse * temp_stress * sim_clamp(0.25f + 0.75f * light, 0.0f, 1.0f) *
    habitat_recruitment * sim_max(0.08f, ash_penalty) * substrate_factor[sim_substrate_index(substrate_index)];
}

static inline float sim_rose_recruitment_climate_factor(float wetness, float temp_stress, float light) {
  const float moisture_lower = sim_clamp((wetness - 0.26f) / 0.34f, 0.0f, 1.0f);
  const float waterlogging_penalty = 1.0f - 0.78f * sim_clamp((wetness - 0.82f) / 0.16f, 0.0f, 1.0f);
  const float moisture_window = sim_max(0.0f, moisture_lower * waterlogging_penalty);
  const float temperature_window = sim_smoothstep01((temp_stress - 0.28f) / 0.48f);
  const float light_window = sim_smoothstep01((light - 0.14f) / 0.42f);
  return sim_clamp(moisture_window * temperature_window * light_window, 0.0f, 1.0f);
}

static inline float sim_rose_seedling_establishment_factor(float wetness, float temp_stress, float light, float rose_soil) {
  const float climate = sim_rose_recruitment_climate_factor(wetness, temp_stress, light);
  const float soil = sim_smoothstep01((sim_clamp(rose_soil / 1.6f, 0.0f, 1.0f) - 0.18f) / 0.5f);
  return sim_clamp(climate * soil, 0.0f, 1.0f);
}

static inline float sim_rose_germination_rate(
  float wetness,
  float temp_stress,
  float light,
  float ash_load,
  float readiness,
  float open_fraction,
  float rose_fertility
) {
  const float climate = sim_rose_recruitment_climate_factor(wetness, temp_stress, light);
  const float fertility = sim_clamp(rose_fertility / 1.6f, 0.0f, 1.0f);
  const float fertility_barrier = sim_smoothstep(fertility, 0.18f, 0.68f);
  const float ash_penalty = 1.0f - sim_clamp(ash_load * 0.8f, 0.0f, 1.0f);
  const float readiness_factor = sim_clamp((readiness - 0.08f) / 0.52f, 0.0f, 1.0f);
  return 3.0f * readiness_factor * climate *
    fertility * fertility_barrier * ash_penalty * sim_clamp(open_fraction, 0.0f, 1.0f);
}

static inline void sim_baobab_allocation(
  float stress,
  float light,
  float leaf,
  float stem,
  float root,
  float *out_leaf,
  float *out_stem,
  float *out_root
) {
  const float total = sim_max(1.0e-9f, leaf + stem + root);
  const float root_target = sim_clamp(0.34f + 0.24f * (1.0f - stress), 0.28f, 0.62f);
  const float stem_target = sim_clamp(0.31f + 0.1f * stress + 0.06f * sim_clamp(stem / total, 0.0f, 1.0f), 0.24f, 0.48f);
  const float leaf_target = sim_max(0.08f, 1.0f - root_target - stem_target + 0.08f * (1.0f - light));
  const float target_total = sim_max(0.0f, leaf_target) + sim_max(0.0f, stem_target) + sim_max(0.0f, root_target);
  const float leaf_norm = target_total > 1.0e-12f ? sim_max(0.0f, leaf_target) / target_total : 0.0f;
  const float stem_norm = target_total > 1.0e-12f ? sim_max(0.0f, stem_target) / target_total : 0.0f;
  const float root_norm = target_total > 1.0e-12f ? sim_max(0.0f, root_target) / target_total : 0.0f;
  const float leaf_weight = leaf_norm + 0.72f * sim_max(0.0f, leaf_norm - leaf / total);
  const float stem_weight = stem_norm + 0.72f * sim_max(0.0f, stem_norm - stem / total);
  const float root_weight = root_norm + 0.72f * sim_max(0.0f, root_norm - root / total);
  const float weight_total = sim_max(0.0f, leaf_weight) + sim_max(0.0f, stem_weight) + sim_max(0.0f, root_weight);
  *out_leaf = weight_total > 1.0e-12f ? sim_max(0.0f, leaf_weight) / weight_total : 0.0f;
  *out_stem = weight_total > 1.0e-12f ? sim_max(0.0f, stem_weight) / weight_total : 0.0f;
  *out_root = weight_total > 1.0e-12f ? sim_max(0.0f, root_weight) / weight_total : 0.0f;
}

static inline void sim_rose_allocation(
  float stress,
  float light,
  float rose_soil,
  float ash_load,
  float leaf,
  float flower,
  float root,
  float *out_leaf,
  float *out_flower,
  float *out_root
) {
  const float total = sim_max(1.0e-9f, leaf + flower + root);
  const float root_target = sim_clamp(0.24f + 0.26f * (1.0f - stress), 0.18f, 0.56f);
  const float flower_target =
    sim_clamp(0.075f + 0.22f * stress * sim_clamp(rose_soil / 1.4f, 0.0f, 1.0f) * (1.0f - 0.65f * ash_load), 0.05f, 0.34f);
  const float leaf_target = sim_max(0.1f, 1.0f - root_target - flower_target + 0.07f * (1.0f - light));
  const float target_total = sim_max(0.0f, leaf_target) + sim_max(0.0f, flower_target) + sim_max(0.0f, root_target);
  const float leaf_norm = target_total > 1.0e-12f ? sim_max(0.0f, leaf_target) / target_total : 0.0f;
  const float flower_norm = target_total > 1.0e-12f ? sim_max(0.0f, flower_target) / target_total : 0.0f;
  const float root_norm = target_total > 1.0e-12f ? sim_max(0.0f, root_target) / target_total : 0.0f;
  const float leaf_weight = leaf_norm + 0.74f * sim_max(0.0f, leaf_norm - leaf / total);
  const float flower_weight = flower_norm + 0.82f * sim_max(0.0f, flower_norm - flower / total);
  const float root_weight = root_norm + 0.7f * sim_max(0.0f, root_norm - root / total);
  const float weight_total = sim_max(0.0f, leaf_weight) + sim_max(0.0f, flower_weight) + sim_max(0.0f, root_weight);
  *out_leaf = weight_total > 1.0e-12f ? sim_max(0.0f, leaf_weight) / weight_total : 0.0f;
  *out_flower = weight_total > 1.0e-12f ? sim_max(0.0f, flower_weight) / weight_total : 0.0f;
  *out_root = weight_total > 1.0e-12f ? sim_max(0.0f, root_weight) / weight_total : 0.0f;
}

static inline void sim_limit_competing_structural_sinks(
  float pool,
  float model_dt_days,
  float *loss,
  float *catabolic
) {
  float safe_loss = sim_max(0.0f, *loss);
  float safe_catabolic = sim_max(0.0f, *catabolic);
  const float total = safe_loss + safe_catabolic;
  if (total <= 0.0f) {
    *loss = 0.0f;
    *catabolic = 0.0f;
    return;
  }
  const float max_flux = sim_max(0.0f, pool) / sim_max(1.0e-9f, model_dt_days);
  if (total > max_flux) {
    const float scale = max_flux / total;
    safe_loss *= scale;
    safe_catabolic *= scale;
  }
  *loss = safe_loss;
  *catabolic = safe_catabolic;
}

static void sim_apply_nutrient_transport_range(
  int32_t start,
  int32_t end,
  float model_dt_days,
  float *SIM_RESTRICT soil_mineral_n,
  const float *SIM_RESTRICT soil_mineral_transport,
  const float *SIM_RESTRICT rose_fertility
) {
  for (int32_t i = start; i < end; i += 1) {
    const float cap = 1.35f + 0.25f * sim_clamp(rose_fertility[i] / 1.8f, 0.0f, 1.0f);
    soil_mineral_n[i] = sim_clamp(
      soil_mineral_n[i] + model_dt_days * soil_mineral_transport[i],
      0.005f,
      cap
    );
  }
}

static void sim_apply_nutrient_transport_active(
  int32_t active_count,
  uintptr_t active_ids_offset,
  float model_dt_days,
  float *SIM_RESTRICT soil_mineral_n,
  const float *SIM_RESTRICT soil_mineral_transport,
  const float *SIM_RESTRICT rose_fertility
) {
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const float cap = 1.35f + 0.25f * sim_clamp(rose_fertility[i] / 1.8f, 0.0f, 1.0f);
    soil_mineral_n[i] = sim_clamp(
      soil_mineral_n[i] + model_dt_days * soil_mineral_transport[i],
      0.005f,
      cap
    );
  }
}

static inline void sim_update_soil_biogeochemistry_cell(
  int32_t i,
  float model_dt_days,
  uint8_t sub,
  float wetness,
  float temp_c,
  float ash_load,
  float top_sat,
  float groundwater_sat,
  float litter_fast_input,
  float litter_slow_input,
  float plant_nutrient_uptake,
  const float *SIM_RESTRICT depth,
  const float *SIM_RESTRICT soil_mineral_n,
  const float *SIM_RESTRICT soil_mineral_transport,
  const float *SIM_RESTRICT litter_carbon,
  const float *SIM_RESTRICT litter_fast_carbon,
  const float *SIM_RESTRICT litter_slow_carbon,
  const float *SIM_RESTRICT soil_carbon_active,
  const float *SIM_RESTRICT soil_carbon_stable,
  const float *SIM_RESTRICT rose_fertility,
  float *SIM_RESTRICT litter_carbon_next,
  float *SIM_RESTRICT litter_fast_carbon_next,
  float *SIM_RESTRICT litter_slow_carbon_next,
  float *SIM_RESTRICT soil_carbon_active_next,
  float *SIM_RESTRICT soil_carbon_stable_next,
  float *SIM_RESTRICT soil_mineral_n_next
) {
  (void)soil_mineral_transport;
  const float wetness_clamped = sim_clamp(wetness, 0.0f, 1.0f);
  const float aggregate_litter = sim_max(0.0f, litter_carbon[i]);
  float litter_fast = litter_fast_carbon[i];
  float litter_slow = litter_slow_carbon[i];
  const float pooled_litter = litter_fast + litter_slow;
  if (sim_max(pooled_litter - aggregate_litter, aggregate_litter - pooled_litter) > 1.0e-6f) {
    litter_fast = aggregate_litter * 0.65f;
    litter_slow = aggregate_litter * 0.35f;
  }

  const float moisture = sim_clamp((wetness - 0.08f) / 0.62f, 0.0f, 1.0f);
  const float decomposition_temp = sim_fast_temperature_response(SIM_TEMP_RESPONSE_DECOMPOSITION, temp_c);
  const float decomposition =
    (0.012f + 0.048f * moisture * decomposition_temp * substrate_litter_decomposition_factor(sub)) *
    (1.0f + 0.24f * ash_load);
  const float fast_decay = decomposition * 1.42f * litter_fast;
  const float slow_decay = decomposition * 0.32f * litter_slow;
  const float litter_decay = fast_decay + slow_decay;
  const float humified = litter_decay * 0.34f;
  const float active_decay_rate =
    (0.0035f + 0.018f * wetness_clamped * sim_fast_temperature_response(SIM_TEMP_RESPONSE_ACTIVE_SOC, temp_c)) *
    substrate_active_soc_decay_factor(sub);
  const float stable_decay_rate =
    0.00018f + 0.0011f * wetness_clamped * sim_fast_temperature_response(SIM_TEMP_RESPONSE_STABLE_SOC, temp_c);
  const float active_decay = active_decay_rate * soil_carbon_active[i];
  const float stable_decay = stable_decay_rate * soil_carbon_stable[i];
  const float stabilized = active_decay * 0.18f;
  const float mineralization = 0.32f * litter_decay + 0.24f * active_decay + 0.08f * stable_decay;
  const float ash_weathering = 0.00018f * ash_load * (0.35f + 0.65f * wetness);
  const float mineral_weathering =
    0.00022f *
    substrate_nutrient_r(sub) *
    (0.42f + 0.58f * sim_clamp(depth[i] / 1.35f, 0.0f, 1.0f)) *
    (0.35f + 0.65f * wetness_clamped) *
    sim_fast_temperature_response(SIM_TEMP_RESPONSE_WEATHERING, temp_c);
  const float organic_nitrogen_release =
    0.00042f *
    (soil_carbon_active[i] + 0.28f * soil_carbon_stable[i]) *
    wetness_clamped *
    sim_fast_temperature_response(SIM_TEMP_RESPONSE_ORGANIC_N, temp_c);
  const float leachable_n =
    soil_mineral_n[i] *
    nutrient_mobile_fraction(
      top_sat,
      groundwater_sat,
      soil_carbon_active[i],
      soil_carbon_stable[i]
    );
  const float leaching = (0.00045f + 0.0032f * wetness * wetness) * leachable_n;
  const float nutrient_supply =
    0.38f * mineralization +
    organic_nitrogen_release +
    mineral_weathering +
    ash_weathering;
  const float available_nutrient_loss =
    sim_max(0.0f, soil_mineral_n[i] - 0.005f) / sim_max(1.0e-6f, model_dt_days) +
    sim_max(0.0f, nutrient_supply);
  float plant_nutrient_uptake_actual = sim_max(0.0f, plant_nutrient_uptake);
  float leaching_actual = sim_max(0.0f, leaching);
  const float nutrient_loss_demand = plant_nutrient_uptake_actual + leaching_actual;
  if (nutrient_loss_demand > available_nutrient_loss && nutrient_loss_demand > 0.0f) {
    const float scale = available_nutrient_loss / nutrient_loss_demand;
    plant_nutrient_uptake_actual *= scale;
    leaching_actual *= scale;
  }
  const float next_litter_fast =
    sim_clamp(litter_fast + model_dt_days * (litter_fast_input - fast_decay), 0.0f, 1.4f);
  const float next_litter_slow =
    sim_clamp(litter_slow + model_dt_days * (litter_slow_input - slow_decay), 0.0f, 1.8f);
  const float next_active =
    sim_clamp(soil_carbon_active[i] + model_dt_days * (humified - active_decay), 0.0f, 2.4f);
  const float next_stable =
    sim_clamp(soil_carbon_stable[i] + model_dt_days * (stabilized - stable_decay), 0.0f, 4.2f);
  const float rose_soil = rose_fertility[i];
  const float next_mineral_n =
    sim_clamp(
      soil_mineral_n[i] +
        model_dt_days *
          (
            nutrient_supply -
            plant_nutrient_uptake_actual -
            leaching_actual
          ),
      0.005f,
      1.35f + 0.25f * sim_clamp(rose_soil / 1.8f, 0.0f, 1.0f)
    );

  litter_fast_carbon_next[i] = next_litter_fast;
  litter_slow_carbon_next[i] = next_litter_slow;
  soil_carbon_active_next[i] = next_active;
  soil_carbon_stable_next[i] = next_stable;
  litter_carbon_next[i] = sim_clamp(next_litter_fast + next_litter_slow, 0.0f, 1.8f);
  soil_mineral_n_next[i] = next_mineral_n;
}

static void sim_update_plant_carbon_seeds_impl(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float model_dt_days,
  float storage_param,
  int32_t q10_lookup_steps,
  float q10_temp_min_c,
  float q10_temp_lookup_scale,
  uintptr_t baobab_respiration_q10_offset,
  uintptr_t rose_respiration_q10_offset,
  uintptr_t substrate_offset,
  uintptr_t baobab_blocked_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t gpp_baobab_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t root_stress_baobab_offset,
  uintptr_t root_stress_rose_offset,
  uintptr_t canopy_light_baobab_offset,
  uintptr_t canopy_light_rose_offset,
  uintptr_t light_baobab_offset,
  uintptr_t light_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t ash_stress_offset,
  uintptr_t baobab_risk_offset,
  uintptr_t rose_fertility_offset,
  float slow_env_inv_count,
  uintptr_t slow_env_gpp_baobab_offset,
  uintptr_t slow_env_gpp_rose_offset,
  uintptr_t slow_env_root_stress_baobab_offset,
  uintptr_t slow_env_root_stress_rose_offset,
  uintptr_t slow_env_canopy_light_baobab_offset,
  uintptr_t slow_env_canopy_light_rose_offset,
  uintptr_t slow_env_light_baobab_offset,
  uintptr_t slow_env_light_rose_offset,
  uintptr_t slow_env_vegetation_cover_offset,
  uintptr_t slow_env_surface_temp_c_offset,
  uintptr_t slow_env_ash_stress_offset,
  uintptr_t slow_env_wetness_offset,
  uintptr_t slow_env_top_sat_offset,
  uintptr_t slow_env_groundwater_sat_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t baobab_stem_offset,
  uintptr_t baobab_root_offset,
  uintptr_t baobab_store_offset,
  uintptr_t baobab_seed_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t rose_store_offset,
  uintptr_t rose_seed_offset,
  uintptr_t baobab_seed_transport_offset,
  uintptr_t rose_seed_transport_offset,
  uintptr_t rose_seed_production_offset,
  uintptr_t rose_seed_arrival_offset,
  uintptr_t baobab_readiness_offset,
  uintptr_t rose_readiness_offset,
  uintptr_t hydrology_sink0_offset,
  uintptr_t baobab_leaf_next_offset,
  uintptr_t baobab_stem_next_offset,
  uintptr_t baobab_root_next_offset,
  uintptr_t baobab_store_next_offset,
  uintptr_t baobab_seed_next_offset,
  uintptr_t baobab_readiness_next_offset,
  uintptr_t rose_leaf_next_offset,
  uintptr_t rose_flower_next_offset,
  uintptr_t rose_root_next_offset,
  uintptr_t rose_store_next_offset,
  uintptr_t rose_seed_next_offset,
  uintptr_t rose_readiness_next_offset,
  uintptr_t mb_next_offset,
  uintptr_t mr_next_offset,
  uintptr_t sb_next_offset,
  uintptr_t soil_bio_wetness_offset,
  uintptr_t soil_bio_temp_c_offset,
  uintptr_t soil_bio_ash_load_offset,
  uintptr_t soil_bio_top_sat_offset,
  uintptr_t soil_bio_groundwater_sat_offset,
  uintptr_t soil_bio_litter_fast_input_offset,
  uintptr_t soil_bio_litter_slow_input_offset,
  uintptr_t soil_bio_plant_nutrient_uptake_offset,
  int32_t fuse_soil_bio,
  uintptr_t depth_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t soil_mineral_transport_offset,
  uintptr_t litter_carbon_offset,
  uintptr_t litter_fast_carbon_offset,
  uintptr_t litter_slow_carbon_offset,
  uintptr_t soil_carbon_active_offset,
  uintptr_t soil_carbon_stable_offset,
  uintptr_t litter_carbon_next_offset,
  uintptr_t litter_fast_carbon_next_offset,
  uintptr_t litter_slow_carbon_next_offset,
  uintptr_t soil_carbon_active_next_offset,
  uintptr_t soil_carbon_stable_next_offset,
  uintptr_t soil_mineral_n_next_offset,
  int32_t write_diagnostics
) {
  (void)write_diagnostics;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const float *SIM_RESTRICT baobab_respiration_q10 = (const float *)(uintptr_t)baobab_respiration_q10_offset;
  const float *SIM_RESTRICT rose_respiration_q10 = (const float *)(uintptr_t)rose_respiration_q10_offset;
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const uint8_t *SIM_RESTRICT baobab_blocked = (const uint8_t *)(uintptr_t)baobab_blocked_offset;
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)soil_water_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT gpp_baobab = (const float *)(uintptr_t)gpp_baobab_offset;
  const float *SIM_RESTRICT gpp_rose = (const float *)(uintptr_t)gpp_rose_offset;
  const float *SIM_RESTRICT root_stress_baobab = (const float *)(uintptr_t)root_stress_baobab_offset;
  const float *SIM_RESTRICT root_stress_rose = (const float *)(uintptr_t)root_stress_rose_offset;
  const float *SIM_RESTRICT canopy_light_baobab = (const float *)(uintptr_t)canopy_light_baobab_offset;
  const float *SIM_RESTRICT canopy_light_rose = (const float *)(uintptr_t)canopy_light_rose_offset;
  const float *SIM_RESTRICT light_baobab = (const float *)(uintptr_t)light_baobab_offset;
  const float *SIM_RESTRICT light_rose = (const float *)(uintptr_t)light_rose_offset;
  const float *SIM_RESTRICT vegetation_cover = (const float *)(uintptr_t)vegetation_cover_offset;
  const float *SIM_RESTRICT surface_temp_c = (const float *)(uintptr_t)surface_temp_c_offset;
  const float *SIM_RESTRICT ash_stress = (const float *)(uintptr_t)ash_stress_offset;
  const float *SIM_RESTRICT baobab_risk = (const float *)(uintptr_t)baobab_risk_offset;
  const float *SIM_RESTRICT rose_fertility = (const float *)(uintptr_t)rose_fertility_offset;
  const int32_t use_slow_env = slow_env_inv_count > 0.0f && slow_env_gpp_baobab_offset != 0u;
  const float *SIM_RESTRICT slow_env_gpp_baobab = (const float *)(uintptr_t)slow_env_gpp_baobab_offset;
  const float *SIM_RESTRICT slow_env_gpp_rose = (const float *)(uintptr_t)slow_env_gpp_rose_offset;
  const float *SIM_RESTRICT slow_env_root_stress_baobab = (const float *)(uintptr_t)slow_env_root_stress_baobab_offset;
  const float *SIM_RESTRICT slow_env_root_stress_rose = (const float *)(uintptr_t)slow_env_root_stress_rose_offset;
  const float *SIM_RESTRICT slow_env_canopy_light_baobab = (const float *)(uintptr_t)slow_env_canopy_light_baobab_offset;
  const float *SIM_RESTRICT slow_env_canopy_light_rose = (const float *)(uintptr_t)slow_env_canopy_light_rose_offset;
  const float *SIM_RESTRICT slow_env_light_baobab = (const float *)(uintptr_t)slow_env_light_baobab_offset;
  const float *SIM_RESTRICT slow_env_light_rose = (const float *)(uintptr_t)slow_env_light_rose_offset;
  const float *SIM_RESTRICT slow_env_vegetation_cover = (const float *)(uintptr_t)slow_env_vegetation_cover_offset;
  const float *SIM_RESTRICT slow_env_surface_temp_c = (const float *)(uintptr_t)slow_env_surface_temp_c_offset;
  const float *SIM_RESTRICT slow_env_ash_stress = (const float *)(uintptr_t)slow_env_ash_stress_offset;
  const float *SIM_RESTRICT slow_env_wetness = (const float *)(uintptr_t)slow_env_wetness_offset;
  const float *SIM_RESTRICT slow_env_top_sat = (const float *)(uintptr_t)slow_env_top_sat_offset;
  const float *SIM_RESTRICT slow_env_groundwater_sat = (const float *)(uintptr_t)slow_env_groundwater_sat_offset;
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)baobab_leaf_offset;
  const float *SIM_RESTRICT baobab_stem = (const float *)(uintptr_t)baobab_stem_offset;
  const float *SIM_RESTRICT baobab_root = (const float *)(uintptr_t)baobab_root_offset;
  const float *SIM_RESTRICT baobab_store = (const float *)(uintptr_t)baobab_store_offset;
  const float *SIM_RESTRICT baobab_seed = (const float *)(uintptr_t)baobab_seed_offset;
  const float *SIM_RESTRICT rose_leaf = (const float *)(uintptr_t)rose_leaf_offset;
  const float *SIM_RESTRICT rose_flower = (const float *)(uintptr_t)rose_flower_offset;
  const float *SIM_RESTRICT rose_root = (const float *)(uintptr_t)rose_root_offset;
  const float *SIM_RESTRICT rose_store = (const float *)(uintptr_t)rose_store_offset;
  const float *SIM_RESTRICT rose_seed = (const float *)(uintptr_t)rose_seed_offset;
  const float *SIM_RESTRICT baobab_seed_transport = (const float *)(uintptr_t)baobab_seed_transport_offset;
  const float *SIM_RESTRICT rose_seed_transport = (const float *)(uintptr_t)rose_seed_transport_offset;
  const float *SIM_RESTRICT rose_seed_production = (const float *)(uintptr_t)rose_seed_production_offset;
  const float *SIM_RESTRICT rose_seed_arrival = (const float *)(uintptr_t)rose_seed_arrival_offset;
  const float *SIM_RESTRICT baobab_readiness = (const float *)(uintptr_t)baobab_readiness_offset;
  const float *SIM_RESTRICT rose_readiness = (const float *)(uintptr_t)rose_readiness_offset;
  float *SIM_RESTRICT hydrology_sink0 = (float *)(uintptr_t)hydrology_sink0_offset;
  float *SIM_RESTRICT baobab_leaf_next = (float *)(uintptr_t)baobab_leaf_next_offset;
  float *SIM_RESTRICT baobab_stem_next = (float *)(uintptr_t)baobab_stem_next_offset;
  float *SIM_RESTRICT baobab_root_next = (float *)(uintptr_t)baobab_root_next_offset;
  float *SIM_RESTRICT baobab_store_next = (float *)(uintptr_t)baobab_store_next_offset;
  float *SIM_RESTRICT baobab_seed_next = (float *)(uintptr_t)baobab_seed_next_offset;
  float *SIM_RESTRICT baobab_readiness_next = (float *)(uintptr_t)baobab_readiness_next_offset;
  float *SIM_RESTRICT rose_leaf_next = (float *)(uintptr_t)rose_leaf_next_offset;
  float *SIM_RESTRICT rose_flower_next = (float *)(uintptr_t)rose_flower_next_offset;
  float *SIM_RESTRICT rose_root_next = (float *)(uintptr_t)rose_root_next_offset;
  float *SIM_RESTRICT rose_store_next = (float *)(uintptr_t)rose_store_next_offset;
  float *SIM_RESTRICT rose_seed_next = (float *)(uintptr_t)rose_seed_next_offset;
  float *SIM_RESTRICT rose_readiness_next = (float *)(uintptr_t)rose_readiness_next_offset;
  float *SIM_RESTRICT mb_next = (float *)(uintptr_t)mb_next_offset;
  float *SIM_RESTRICT mr_next = (float *)(uintptr_t)mr_next_offset;
  float *SIM_RESTRICT sb_next = (float *)(uintptr_t)sb_next_offset;
  float *SIM_RESTRICT soil_bio_wetness = (float *)(uintptr_t)soil_bio_wetness_offset;
  float *SIM_RESTRICT soil_bio_temp_c = (float *)(uintptr_t)soil_bio_temp_c_offset;
  float *SIM_RESTRICT soil_bio_ash_load = (float *)(uintptr_t)soil_bio_ash_load_offset;
  float *SIM_RESTRICT soil_bio_top_sat = (float *)(uintptr_t)soil_bio_top_sat_offset;
  float *SIM_RESTRICT soil_bio_groundwater_sat = (float *)(uintptr_t)soil_bio_groundwater_sat_offset;
  float *SIM_RESTRICT soil_bio_litter_fast_input = (float *)(uintptr_t)soil_bio_litter_fast_input_offset;
  float *SIM_RESTRICT soil_bio_litter_slow_input = (float *)(uintptr_t)soil_bio_litter_slow_input_offset;
  float *SIM_RESTRICT soil_bio_plant_nutrient_uptake = (float *)(uintptr_t)soil_bio_plant_nutrient_uptake_offset;
  const float *SIM_RESTRICT depth = (const float *)(uintptr_t)depth_offset;
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  const float *SIM_RESTRICT soil_mineral_transport = (const float *)(uintptr_t)soil_mineral_transport_offset;
  const float *SIM_RESTRICT litter_carbon = (const float *)(uintptr_t)litter_carbon_offset;
  const float *SIM_RESTRICT litter_fast_carbon = (const float *)(uintptr_t)litter_fast_carbon_offset;
  const float *SIM_RESTRICT litter_slow_carbon = (const float *)(uintptr_t)litter_slow_carbon_offset;
  const float *SIM_RESTRICT soil_carbon_active = (const float *)(uintptr_t)soil_carbon_active_offset;
  const float *SIM_RESTRICT soil_carbon_stable = (const float *)(uintptr_t)soil_carbon_stable_offset;
  float *SIM_RESTRICT litter_carbon_next = (float *)(uintptr_t)litter_carbon_next_offset;
  float *SIM_RESTRICT litter_fast_carbon_next = (float *)(uintptr_t)litter_fast_carbon_next_offset;
  float *SIM_RESTRICT litter_slow_carbon_next = (float *)(uintptr_t)litter_slow_carbon_next_offset;
  float *SIM_RESTRICT soil_carbon_active_next = (float *)(uintptr_t)soil_carbon_active_next_offset;
  float *SIM_RESTRICT soil_carbon_stable_next = (float *)(uintptr_t)soil_carbon_stable_next_offset;
  float *SIM_RESTRICT soil_mineral_n_next = (float *)(uintptr_t)soil_mineral_n_next_offset;
  const int32_t size2 = size * 2;
  const int32_t plant_carbon_active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t plant_carbon_active_start = plant_carbon_active_range ? (int32_t)(active_ids_offset >> 1u) : 0;
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = plant_carbon_active_range
      ? plant_carbon_active_start + cell_offset
      : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const uint8_t sub = sim_substrate_index(substrate[i]);
    const int32_t blocked = baobab_blocked[i] != 0u;
    const float top_sat = use_slow_env
      ? sim_clamp(slow_env_top_sat[i] * slow_env_inv_count, 0.0f, 1.0f)
      : sim_clamp(soil_water[i] / soil_cap[i], 0.0f, 1.0f);
    const float groundwater_sat = use_slow_env
      ? sim_clamp(slow_env_groundwater_sat[i] * slow_env_inv_count, 0.0f, 1.0f)
      : sim_clamp(groundwater_storage[i] / groundwater_cap[i], 0.0f, 1.0f);
    const float wetness = use_slow_env
      ? sim_clamp(slow_env_wetness[i] * slow_env_inv_count, 0.0f, 1.0f)
      : sim_clamp(0.62f * top_sat + 0.38f * groundwater_sat, 0.0f, 1.0f);
    const float temp_c = use_slow_env ? slow_env_surface_temp_c[i] * slow_env_inv_count : surface_temp_c[i];
    const float ash_stress_value = use_slow_env
      ? sim_clamp(slow_env_ash_stress[i] * slow_env_inv_count, 0.0f, 1.0f)
      : ash_stress[i];
    const float canopy_light_baobab_value = use_slow_env
      ? sim_clamp(slow_env_canopy_light_baobab[i] * slow_env_inv_count, 0.0f, 1.0f)
      : canopy_light_baobab[i];
    const float canopy_light_rose_value = use_slow_env
      ? sim_clamp(slow_env_canopy_light_rose[i] * slow_env_inv_count, 0.0f, 1.0f)
      : canopy_light_rose[i];
    const float light_baobab_value = use_slow_env
      ? sim_clamp(slow_env_light_baobab[i] * slow_env_inv_count, 0.0f, 1.0f)
      : light_baobab[i];
    const float light_rose_value = use_slow_env
      ? sim_clamp(slow_env_light_rose[i] * slow_env_inv_count, 0.0f, 1.0f)
      : light_rose[i];
    const float vegetation_cover_value = use_slow_env
      ? sim_clamp(slow_env_vegetation_cover[i] * slow_env_inv_count, 0.0f, 1.0f)
      : vegetation_cover[i];
    const float gpp_baobab_value = use_slow_env
      ? sim_max(0.0f, slow_env_gpp_baobab[i] * slow_env_inv_count)
      : gpp_baobab[i];
    const float gpp_rose_value = use_slow_env
      ? sim_max(0.0f, slow_env_gpp_rose[i] * slow_env_inv_count)
      : gpp_rose[i];
    const float light_baobab_stress = sim_clamp(light_baobab_value / 0.32f, 0.0f, 1.0f);
    const float light_rose_stress = sim_clamp(light_rose_value / 0.32f, 0.0f, 1.0f);
    const float canopy_light_baobab_stress = sim_clamp(canopy_light_baobab_value / 0.32f, 0.0f, 1.0f);
    const float canopy_light_rose_stress = sim_clamp(canopy_light_rose_value / 0.32f, 0.0f, 1.0f);
    const float ash_load = sim_clamp(ash_stress_value * 1.8f, 0.0f, 1.0f);
    if (!fuse_soil_bio) {
      soil_bio_wetness[i] = wetness;
      soil_bio_temp_c[i] = temp_c;
      soil_bio_ash_load[i] = ash_load;
      soil_bio_top_sat[i] = top_sat;
      soil_bio_groundwater_sat[i] = groundwater_sat;
    }
    float litter_fast_input = 0.0f;
    float litter_slow_input = 0.0f;
    float plant_nutrient_uptake = 0.0f;
    const float stress_b = sim_clamp(
      use_slow_env ? slow_env_root_stress_baobab[i] * slow_env_inv_count : root_stress_baobab[i],
      0.0f,
      1.0f
    );
    const float temp_stress_b = sim_fast_temperature_response(SIM_TEMP_RESPONSE_BAOBAB_CARBON, temp_c);
    const float b_leaf = blocked ? 0.0f : baobab_leaf[i];
    const float b_stem = blocked ? 0.0f : baobab_stem[i];
    const float b_root = blocked ? 0.0f : baobab_root[i];
    const float b_store = blocked ? 0.0f : baobab_store[i];
    const int32_t has_baobab_adult =
      !blocked &&
      (b_leaf > 0.0f ||
        b_stem > 0.0f ||
        b_root > 0.0f ||
        b_store > 0.0f);
    const int32_t has_baobab_carbon =
      !blocked &&
      (has_baobab_adult ||
        baobab_seed[i] > 0.0f ||
        baobab_seed_transport[i] != 0.0f);
    float gpp_b = 0.0f;
    float b_seed_death = 0.0f;
    float seed_b = 0.0f;
    float b_failed_seed = 0.0f;
    float b_litter_fast = 0.0f;
    float b_litter_slow = 0.0f;
    float b_litter_total = 0.0f;
    const float next_b_readiness = blocked ? 0.0f :
      sim_update_baobab_seed_readiness(
        baobab_readiness[i],
        wetness,
        temp_c,
        sim_fast_temperature_response(SIM_TEMP_RESPONSE_BAOBAB_READINESS, temp_c),
        model_dt_days
      );
    baobab_readiness_next[i] = next_b_readiness;
    if (!has_baobab_carbon) {
      baobab_leaf_next[i] = 0.0f;
      baobab_stem_next[i] = 0.0f;
      baobab_root_next[i] = 0.0f;
      baobab_store_next[i] = 0.0f;
      baobab_seed_next[i] = 0.0f;
    } else if (!has_baobab_adult) {
      const float baobab_seed_input = baobab_seed_transport[i];
      const float effective_b_seed_pool = baobab_seed[i] + baobab_seed_input * model_dt_days;
      const float b_germ_flux = effective_b_seed_pool *
        sim_baobab_germination_rate(wetness, temp_stress_b, light_baobab_stress, sub, next_b_readiness, baobab_risk[i], ash_stress_value, blocked);
      b_seed_death = (sim_seed_mortality_rate(wetness, temp_c, 0.0022f, 0.014f) +
        0.035f * sim_clamp((wetness - 0.68f) / 0.24f, 0.0f, 1.0f)) * baobab_seed[i];
      seed_b = sim_min(baobab_seed[i] / model_dt_days + baobab_seed_input, b_germ_flux);
      const float b_available_seed_removal = sim_max(0.0f, baobab_seed[i] / model_dt_days + baobab_seed_input);
      const float b_seed_removal = seed_b + b_seed_death;
      if (b_seed_removal > b_available_seed_removal && b_seed_removal > 0.0f) {
        const float scale = b_available_seed_removal / b_seed_removal;
        seed_b *= scale;
        b_seed_death *= scale;
      }
      baobab_seed_next[i] = sim_clamp(
        baobab_seed[i] + model_dt_days * (baobab_seed_input - seed_b - b_seed_death),
        0.0f,
        0.7f
      );
      const float germinated_seed = sim_max(0.0f, seed_b);
      const float germination_respiration = germinated_seed * SIM_BAOBAB_GERMINATION_RESPIRATION_FRACTION;
      const float seed_establishment = germinated_seed * 0.26f;
      b_failed_seed = sim_max(0.0f, germinated_seed - seed_establishment - germination_respiration);
      baobab_leaf_next[i] = model_dt_days * seed_establishment * 0.18f;
      baobab_stem_next[i] = model_dt_days * seed_establishment * 0.22f;
      baobab_root_next[i] = model_dt_days * seed_establishment * 0.6f;
      baobab_store_next[i] = 0.0f;
    } else {
      const float baobab_ash_factor = sim_max(0.0f, 1.0f - 0.82f * ash_load);
      gpp_b = sim_max(0.0f, gpp_baobab_value) * baobab_ash_factor;
      const float q10_b = sim_lookup_photosynthesis_temperature(
        baobab_respiration_q10,
        q10_lookup_steps,
        q10_temp_min_c,
        q10_temp_lookup_scale,
        temp_c
      );
      const float maintenance_b = q10_b * (0.00082f * b_leaf + 0.00017f * b_stem + 0.00034f * b_root + 0.00008f * b_store);
      const float after_maintenance_b = gpp_b - maintenance_b;
      const float growth_resp_b = sim_max(0.0f, after_maintenance_b) * 0.16f;
      const float npp_b = sim_max(0.0f, after_maintenance_b - growth_resp_b);
      const float carbon_balance_b = after_maintenance_b > 0.0f ? npp_b : after_maintenance_b;
      const float mortality_b =
        0.00008f + 0.0011f * (1.0f - stress_b) * (1.0f - stress_b) +
        0.00028f * (1.0f - canopy_light_baobab_stress) + 0.00016f * (1.0f - substrate_root_b(sub)) + 0.0065f * ash_load +
        0.014f * sim_clamp((wetness - 0.68f) / 0.22f, 0.0f, 1.0f) * sim_clamp((wetness - 0.68f) / 0.22f, 0.0f, 1.0f);
      const float positive_npp = sim_max(0.0f, carbon_balance_b);
      const float baobab_seed_prod_potential = sim_baobab_seed_production(b_stem, b_leaf, stress_b, temp_stress_b);
      const float baobab_seed_prod = sim_min(
        baobab_seed_prod_potential,
        sim_baobab_seed_production_carbon_limit(positive_npp, b_store, model_dt_days)
      );
      const float baobab_seed_input = baobab_seed_transport[i];
      const float effective_b_seed_pool = baobab_seed[i] + baobab_seed_input * model_dt_days;
      const float b_germ_flux = effective_b_seed_pool *
        sim_baobab_germination_rate(wetness, temp_stress_b, light_baobab_stress, sub, next_b_readiness, baobab_risk[i], ash_stress_value, blocked);
      b_seed_death = (sim_seed_mortality_rate(wetness, temp_c, 0.0022f, 0.014f) +
        0.035f * sim_clamp((wetness - 0.68f) / 0.24f, 0.0f, 1.0f)) * baobab_seed[i];
      seed_b = sim_min(baobab_seed[i] / model_dt_days + baobab_seed_input, b_germ_flux);
      const float b_available_seed_removal = sim_max(0.0f, baobab_seed[i] / model_dt_days + baobab_seed_input);
      const float b_seed_removal = seed_b + b_seed_death;
      if (b_seed_removal > b_available_seed_removal && b_seed_removal > 0.0f) {
        const float scale = b_available_seed_removal / b_seed_removal;
        seed_b *= scale;
        b_seed_death *= scale;
      }
      baobab_seed_next[i] = sim_clamp(
        baobab_seed[i] + model_dt_days * (baobab_seed_input - seed_b - b_seed_death),
        0.0f,
        0.7f
      );
      const float b_mass = sim_max(1.0e-9f, b_leaf + b_stem + b_root);
      const float b_store_cap = storage_param * (1.14f * sim_max(0.0f, b_stem) + 0.54f * sim_max(0.0f, b_root) + 0.035f);
      const float deficit = sim_max(0.0f, -carbon_balance_b);
      const float mobilized = sim_min(b_store / model_dt_days, deficit * 0.9f);
      const float unmet_deficit = sim_max(0.0f, deficit - mobilized);
      const float catabolic_respiration = sim_min(unmet_deficit, b_mass / model_dt_days);
      const float residual_deficit = sim_max(0.0f, unmet_deficit - catabolic_respiration);
      float catabolic_leaf = catabolic_respiration * (b_leaf / b_mass);
      float catabolic_stem = catabolic_respiration * (b_stem / b_mass);
      float catabolic_root = catabolic_respiration * (b_root / b_mass);
      const float seed_output_b = sim_max(0.0f, baobab_seed_prod);
      const float seed_from_npp_b = sim_min(positive_npp * SIM_BAOBAB_SEED_NPP_ALLOCATION_FRACTION, seed_output_b);
      const float seed_from_store_b = sim_min(sim_max(0.0f, seed_output_b - seed_from_npp_b), sim_max(0.0f, b_store) / model_dt_days);
      const float vegetative_npp_b = positive_npp - seed_from_npp_b;
      const float store_fraction = sim_storage_allocation_fraction(0.16f, vegetative_npp_b, stress_b, b_store, b_store_cap, 0.38f);
      const float storage_sink = vegetative_npp_b * store_fraction;
      const float growth_carbon = vegetative_npp_b - storage_sink;
      float alloc_leaf = 0.0f;
      float alloc_stem = 0.0f;
      float alloc_root = 0.0f;
      sim_baobab_allocation(stress_b, light_baobab_stress, b_leaf, b_stem, b_root, &alloc_leaf, &alloc_stem, &alloc_root);
      const float germinated_seed = sim_max(0.0f, seed_b);
      const float germination_respiration = germinated_seed * SIM_BAOBAB_GERMINATION_RESPIRATION_FRACTION;
      const float seed_establishment = germinated_seed * 0.26f;
      b_failed_seed = sim_max(0.0f, germinated_seed - seed_establishment - germination_respiration);
      const float drought = 1.0f - sim_clamp(stress_b, 0.0f, 1.0f);
      const float shade = 1.0f - sim_clamp(light_baobab_stress, 0.0f, 1.0f);
      const float starvation = residual_deficit / b_mass;
      const float leaf_loss_rate = 0.0011f * (1.0f + 1.05f * drought + 0.34f * shade) + mortality_b * 0.42f + starvation * 0.18f;
      const float stem_loss_rate = 0.00004f * (1.0f + 0.04f * drought) + mortality_b * 0.06f + starvation * 0.01f;
      const float root_loss_rate = 0.00032f * (1.0f + 0.08f * drought) + mortality_b * 0.1f + starvation * 0.03f;
      float leaf_loss = leaf_loss_rate * b_leaf;
      float stem_loss = stem_loss_rate * b_stem;
      float root_loss = root_loss_rate * b_root;
      sim_limit_competing_structural_sinks(b_leaf, model_dt_days, &leaf_loss, &catabolic_leaf);
      sim_limit_competing_structural_sinks(b_stem, model_dt_days, &stem_loss, &catabolic_stem);
      sim_limit_competing_structural_sinks(b_root, model_dt_days, &root_loss, &catabolic_root);
      baobab_leaf_next[i] = sim_max(0.0f, b_leaf + model_dt_days * (growth_carbon * alloc_leaf + seed_establishment * 0.18f - leaf_loss - catabolic_leaf));
      baobab_stem_next[i] = sim_max(0.0f, b_stem + model_dt_days * (growth_carbon * alloc_stem + seed_establishment * 0.22f - stem_loss - catabolic_stem));
      baobab_root_next[i] = sim_max(0.0f, b_root + model_dt_days * (growth_carbon * alloc_root + seed_establishment * 0.6f - root_loss - catabolic_root));
      baobab_store_next[i] = sim_clamp(b_store + model_dt_days * (storage_sink - mobilized - seed_from_store_b), 0.0f, b_store_cap);
      b_litter_fast = leaf_loss * 0.72f + root_loss * 0.42f;
      b_litter_slow = stem_loss + leaf_loss * 0.28f + root_loss * 0.58f;
      b_litter_total = leaf_loss + stem_loss + root_loss;
    }

    const float failed_b_establishment = b_failed_seed;
    litter_fast_input += b_litter_fast + b_seed_death + failed_b_establishment;
    litter_slow_input += b_litter_slow;
    plant_nutrient_uptake += 0.052f * gpp_b;
    hydrology_sink0[i] -= 0.00018f * (b_litter_total + b_seed_death);
    mb_next[i] = baobab_leaf_next[i] + baobab_stem_next[i] + baobab_root_next[i];
    sb_next[i] = baobab_store_next[i];

    const float rose_soil = rose_fertility[i];
    const float stress_r = sim_clamp(
      use_slow_env ? slow_env_root_stress_rose[i] * slow_env_inv_count : root_stress_rose[i],
      0.0f,
      1.0f
    );
    const float temp_stress_r = sim_fast_temperature_response(SIM_TEMP_RESPONSE_ROSE_REPRO, temp_c);
    const float rose_ash_factor = sim_max(0.0f, 1.0f - 0.82f * ash_load);
    const float r_leaf = rose_leaf[i];
    const float r_flower = rose_flower[i];
    const float r_root = rose_root[i];
    const float r_store = rose_store[i];
    const float rose_seed_prod = rose_seed_production[i];
    const float rose_seed_input = rose_seed_arrival[i];
    const int32_t has_rose_adult =
      r_leaf > 0.0f ||
      r_flower > 0.0f ||
      r_root > 0.0f ||
      r_store > 0.0f;
    const float next_r_readiness =
      sim_update_rose_seed_readiness(
        rose_readiness[i],
        wetness,
        temp_c,
        sim_fast_temperature_response(SIM_TEMP_RESPONSE_ROSE_READINESS, temp_c),
        model_dt_days
      );
    rose_readiness_next[i] = next_r_readiness;
    const int32_t has_rose_carbon =
      has_rose_adult ||
      rose_seed[i] > 0.0f ||
      rose_seed_transport[i] != 0.0f ||
      rose_seed_prod != 0.0f ||
      rose_seed_input != 0.0f;
    float gpp_r = 0.0f;
    float r_seed_death = 0.0f;
    float seed_r = 0.0f;
    float r_failed_seed = 0.0f;
    float r_litter_fast = 0.0f;
    float r_litter_slow = 0.0f;
    float r_litter_total = 0.0f;
    if (!has_rose_carbon) {
      rose_leaf_next[i] = 0.0f;
      rose_flower_next[i] = 0.0f;
      rose_root_next[i] = 0.0f;
      rose_store_next[i] = 0.0f;
      rose_seed_next[i] = 0.0f;
    } else if (!has_rose_adult) {
      const float open_fraction = sim_max(0.0f, 1.0f - vegetation_cover_value);
      const float effective_r_seed_pool = rose_seed[i] + rose_seed_input * model_dt_days;
      const float r_germ_flux = effective_r_seed_pool *
        sim_rose_germination_rate(wetness, temp_stress_r, light_rose_stress, ash_load, next_r_readiness, open_fraction, rose_soil);
      r_seed_death = sim_seed_mortality_rate(wetness, temp_c, SIM_ROSE_SEED_BASE_MORTALITY, SIM_ROSE_SEED_STRESS_MORTALITY) * rose_seed[i];
      seed_r = sim_min(rose_seed[i] / model_dt_days + rose_seed_input, r_germ_flux);
      const float r_available_seed_removal = sim_max(0.0f, rose_seed[i] / model_dt_days + rose_seed_input);
      const float r_seed_removal = seed_r + r_seed_death;
      if (r_seed_removal > r_available_seed_removal && r_seed_removal > 0.0f) {
        const float scale = r_available_seed_removal / r_seed_removal;
        seed_r *= scale;
        r_seed_death *= scale;
      }
      rose_seed_next[i] = sim_clamp(
        rose_seed[i] + model_dt_days * (rose_seed_transport[i] + rose_seed_input - seed_r - r_seed_death),
        0.0f,
        0.35f
      );
      const float seedling_climate = sim_rose_seedling_establishment_factor(wetness, temp_stress_r, light_rose_stress, rose_soil);
      const float germinated_seed = sim_max(0.0f, seed_r);
      const float germination_respiration = germinated_seed * SIM_ROSE_GERMINATION_RESPIRATION_FRACTION;
      const float r_seed_establishment =
        germinated_seed * sim_min(1.0f - SIM_ROSE_GERMINATION_RESPIRATION_FRACTION, sim_max(0.0f, 0.9f * seedling_climate));
      r_failed_seed = sim_max(0.0f, germinated_seed - r_seed_establishment - germination_respiration);
      const float establishment_flower_share = sim_clamp((rose_soil - 0.72f) / 0.74f, 0.0f, 1.0f) * 0.18f * sim_clamp(stress_r, 0.0f, 1.0f);
      rose_leaf_next[i] = model_dt_days * r_seed_establishment * (0.4f - establishment_flower_share * 0.45f);
      rose_flower_next[i] = model_dt_days * r_seed_establishment * establishment_flower_share;
      rose_root_next[i] = model_dt_days * r_seed_establishment * (0.6f - establishment_flower_share * 0.55f);
      rose_store_next[i] = 0.0f;
    } else {
      gpp_r = sim_max(0.0f, gpp_rose_value) * rose_ash_factor;
      const float q10_r = sim_lookup_photosynthesis_temperature(
        rose_respiration_q10,
        q10_lookup_steps,
        q10_temp_min_c,
        q10_temp_lookup_scale,
        temp_c
      );
      const float maintenance_r = q10_r * (0.00062f * r_leaf + 0.00082f * r_flower + 0.00028f * r_root + 0.00008f * r_store);
      const float after_maintenance_r = gpp_r - maintenance_r;
      const float growth_resp_r = sim_max(0.0f, after_maintenance_r) * 0.14f;
      const float npp_r = sim_max(0.0f, after_maintenance_r - growth_resp_r);
      const float carbon_balance_r = after_maintenance_r > 0.0f ? npp_r : after_maintenance_r;
      const float rose_shade = 1.0f - canopy_light_rose_stress;
      const float mortality_r =
        SIM_ROSE_BACKGROUND_MORTALITY + 0.029f * (1.0f - stress_r) * (1.0f - stress_r) +
        0.0065f * rose_shade * rose_shade + 0.00045f * (1.0f - substrate_root_r(sub)) + 0.008f * ash_load;
      const float open_fraction = sim_max(0.0f, 1.0f - vegetation_cover_value);
      const float effective_r_seed_pool = rose_seed[i] + rose_seed_input * model_dt_days;
      const float r_germ_flux = effective_r_seed_pool *
        sim_rose_germination_rate(wetness, temp_stress_r, light_rose_stress, ash_load, next_r_readiness, open_fraction, rose_soil);
      r_seed_death = sim_seed_mortality_rate(wetness, temp_c, SIM_ROSE_SEED_BASE_MORTALITY, SIM_ROSE_SEED_STRESS_MORTALITY) * rose_seed[i];
      seed_r = sim_min(rose_seed[i] / model_dt_days + rose_seed_input, r_germ_flux);
      const float r_available_seed_removal = sim_max(0.0f, rose_seed[i] / model_dt_days + rose_seed_input);
      const float r_seed_removal = seed_r + r_seed_death;
      if (r_seed_removal > r_available_seed_removal && r_seed_removal > 0.0f) {
        const float scale = r_available_seed_removal / r_seed_removal;
        seed_r *= scale;
        r_seed_death *= scale;
      }
      rose_seed_next[i] = sim_clamp(
        rose_seed[i] + model_dt_days * (rose_seed_transport[i] + rose_seed_input - seed_r - r_seed_death),
        0.0f,
        0.35f
      );
      const float r_mass = sim_max(1.0e-9f, r_leaf + r_flower + r_root);
      const float r_store_cap = 0.16f * sim_max(0.0f, r_root) + 0.045f * sim_max(0.0f, r_leaf) + 0.012f;
      const float r_deficit = sim_max(0.0f, -carbon_balance_r);
      const float r_mobilized = sim_min(r_store / model_dt_days, r_deficit * 0.9f);
      const float r_unmet_deficit = sim_max(0.0f, r_deficit - r_mobilized);
      const float r_catabolic_respiration = sim_min(r_unmet_deficit, r_mass / model_dt_days);
      const float r_residual_deficit = sim_max(0.0f, r_unmet_deficit - r_catabolic_respiration);
      float r_catabolic_leaf = r_catabolic_respiration * (r_leaf / r_mass);
      float r_catabolic_flower = r_catabolic_respiration * (r_flower / r_mass);
      float r_catabolic_root = r_catabolic_respiration * (r_root / r_mass);
      const float r_positive_npp = sim_max(0.0f, carbon_balance_r);
      const float r_seed_output = sim_max(0.0f, rose_seed_prod);
      const float r_seed_from_npp = sim_min(r_positive_npp * SIM_ROSE_SEED_NPP_ALLOCATION_FRACTION, r_seed_output);
      const float r_seed_from_store = sim_min(sim_max(0.0f, r_seed_output - r_seed_from_npp), sim_max(0.0f, r_store) / model_dt_days);
      const float r_vegetative_npp = r_positive_npp - r_seed_from_npp;
      const float r_store_fraction = sim_storage_allocation_fraction(0.16f, r_vegetative_npp, stress_r, r_store, r_store_cap, 0.22f);
      const float r_storage_sink = r_vegetative_npp * r_store_fraction;
      const float r_growth_carbon = r_vegetative_npp - r_storage_sink;
      float r_alloc_leaf = 0.0f;
      float r_alloc_flower = 0.0f;
      float r_alloc_root = 0.0f;
      sim_rose_allocation(stress_r, canopy_light_rose_stress, rose_soil, ash_load, r_leaf, r_flower, r_root, &r_alloc_leaf, &r_alloc_flower, &r_alloc_root);
      const float seedling_climate = sim_rose_seedling_establishment_factor(wetness, temp_stress_r, light_rose_stress, rose_soil);
      const float germinated_seed = sim_max(0.0f, seed_r);
      const float germination_respiration = germinated_seed * SIM_ROSE_GERMINATION_RESPIRATION_FRACTION;
      const float r_seed_establishment =
        germinated_seed * sim_min(1.0f - SIM_ROSE_GERMINATION_RESPIRATION_FRACTION, sim_max(0.0f, 0.9f * seedling_climate));
      r_failed_seed = sim_max(0.0f, germinated_seed - r_seed_establishment - germination_respiration);
      const float establishment_flower_share = sim_clamp((rose_soil - 0.72f) / 0.74f, 0.0f, 1.0f) * 0.18f * sim_clamp(stress_r, 0.0f, 1.0f);
      const float r_drought = 1.0f - sim_clamp(stress_r, 0.0f, 1.0f);
      const float r_shade = 1.0f - sim_clamp(canopy_light_rose_stress, 0.0f, 1.0f);
      const float r_starvation = r_residual_deficit / r_mass;
      const float r_leaf_loss_rate = (1.0f / 900.0f) * (1.0f + 1.15f * r_drought + 0.4f * r_shade + 0.45f * ash_load) + mortality_r * 0.95f + r_starvation;
      const float r_flower_loss_rate = (1.0f / 420.0f) * (1.0f + 1.5f * r_drought + 0.65f * r_shade + 0.7f * ash_load) + mortality_r * 1.32f + r_starvation * 1.45f;
      const float r_root_loss_rate = (1.0f / 1200.0f) * (1.0f + 0.45f * r_drought) + mortality_r * 0.68f + r_starvation * 0.78f;
      float r_leaf_loss = r_leaf_loss_rate * r_leaf;
      float r_flower_loss = r_flower_loss_rate * r_flower;
      float r_root_loss = r_root_loss_rate * r_root;
      sim_limit_competing_structural_sinks(r_leaf, model_dt_days, &r_leaf_loss, &r_catabolic_leaf);
      sim_limit_competing_structural_sinks(r_flower, model_dt_days, &r_flower_loss, &r_catabolic_flower);
      sim_limit_competing_structural_sinks(r_root, model_dt_days, &r_root_loss, &r_catabolic_root);
      rose_leaf_next[i] = sim_max(0.0f, r_leaf + model_dt_days * (r_growth_carbon * r_alloc_leaf + r_seed_establishment * (0.4f - establishment_flower_share * 0.45f) - r_leaf_loss - r_catabolic_leaf));
      rose_flower_next[i] = sim_max(0.0f, r_flower + model_dt_days * (r_growth_carbon * r_alloc_flower + r_seed_establishment * establishment_flower_share - r_flower_loss - r_catabolic_flower));
      rose_root_next[i] = sim_max(0.0f, r_root + model_dt_days * (r_growth_carbon * r_alloc_root + r_seed_establishment * (0.6f - establishment_flower_share * 0.55f) - r_root_loss - r_catabolic_root));
      rose_store_next[i] = sim_clamp(r_store + model_dt_days * (r_storage_sink - r_mobilized - r_seed_from_store), 0.0f, r_store_cap);
      r_litter_fast = r_flower_loss + r_leaf_loss * 0.84f + r_root_loss * 0.38f;
      r_litter_slow = r_leaf_loss * 0.16f + r_root_loss * 0.62f;
      r_litter_total = r_leaf_loss + r_flower_loss + r_root_loss;
    }
    const float failed_r_establishment = r_failed_seed;
    litter_fast_input += r_litter_fast + r_seed_death + failed_r_establishment;
    litter_slow_input += r_litter_slow;
    plant_nutrient_uptake += 0.068f * gpp_r;
    hydrology_sink0[i] -= 0.00018f * (r_litter_total + r_seed_death);
    mr_next[i] = rose_leaf_next[i] + rose_flower_next[i] + rose_root_next[i];
    if (!fuse_soil_bio) {
      soil_bio_litter_fast_input[i] = litter_fast_input;
      soil_bio_litter_slow_input[i] = litter_slow_input;
      soil_bio_plant_nutrient_uptake[i] = plant_nutrient_uptake;
    }
    if (fuse_soil_bio) {
      sim_update_soil_biogeochemistry_cell(
        i,
        model_dt_days,
        sub,
        wetness,
        temp_c,
        ash_load,
        top_sat,
        groundwater_sat,
        litter_fast_input,
        litter_slow_input,
        plant_nutrient_uptake,
        depth,
        soil_mineral_n,
        soil_mineral_transport,
        litter_carbon,
        litter_fast_carbon,
        litter_slow_carbon,
        soil_carbon_active,
        soil_carbon_stable,
        rose_fertility,
        litter_carbon_next,
        litter_fast_carbon_next,
        litter_slow_carbon_next,
        soil_carbon_active_next,
        soil_carbon_stable_next,
        soil_mineral_n_next
      );
    }
  }
  (void)size2;
}

SIM_EXPORT void sim_update_plant_carbon_seeds(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float model_dt_days,
  float storage_param,
  int32_t q10_lookup_steps,
  float q10_temp_min_c,
  float q10_temp_lookup_scale,
  uintptr_t baobab_respiration_q10_offset,
  uintptr_t rose_respiration_q10_offset,
  uintptr_t substrate_offset,
  uintptr_t baobab_blocked_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_cap_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t gpp_baobab_offset,
  uintptr_t gpp_rose_offset,
  uintptr_t root_stress_baobab_offset,
  uintptr_t root_stress_rose_offset,
  uintptr_t canopy_light_baobab_offset,
  uintptr_t canopy_light_rose_offset,
  uintptr_t light_baobab_offset,
  uintptr_t light_rose_offset,
  uintptr_t vegetation_cover_offset,
  uintptr_t surface_temp_c_offset,
  uintptr_t ash_stress_offset,
  uintptr_t baobab_risk_offset,
  uintptr_t rose_fertility_offset,
  uintptr_t baobab_leaf_offset,
  uintptr_t baobab_stem_offset,
  uintptr_t baobab_root_offset,
  uintptr_t baobab_store_offset,
  uintptr_t baobab_seed_offset,
  uintptr_t rose_leaf_offset,
  uintptr_t rose_flower_offset,
  uintptr_t rose_root_offset,
  uintptr_t rose_store_offset,
  uintptr_t rose_seed_offset,
  uintptr_t baobab_seed_transport_offset,
  uintptr_t rose_seed_transport_offset,
  uintptr_t rose_seed_production_offset,
  uintptr_t rose_seed_arrival_offset,
  uintptr_t baobab_readiness_offset,
  uintptr_t rose_readiness_offset,
  uintptr_t hydrology_sink0_offset,
  uintptr_t baobab_leaf_next_offset,
  uintptr_t baobab_stem_next_offset,
  uintptr_t baobab_root_next_offset,
  uintptr_t baobab_store_next_offset,
  uintptr_t baobab_seed_next_offset,
  uintptr_t baobab_readiness_next_offset,
  uintptr_t rose_leaf_next_offset,
  uintptr_t rose_flower_next_offset,
  uintptr_t rose_root_next_offset,
  uintptr_t rose_store_next_offset,
  uintptr_t rose_seed_next_offset,
  uintptr_t rose_readiness_next_offset,
  uintptr_t mb_next_offset,
  uintptr_t mr_next_offset,
  uintptr_t sb_next_offset,
  uintptr_t soil_bio_wetness_offset,
  uintptr_t soil_bio_temp_c_offset,
  uintptr_t soil_bio_ash_load_offset,
  uintptr_t soil_bio_top_sat_offset,
  uintptr_t soil_bio_groundwater_sat_offset,
  uintptr_t soil_bio_litter_fast_input_offset,
  uintptr_t soil_bio_litter_slow_input_offset,
  uintptr_t soil_bio_plant_nutrient_uptake_offset
) {
  sim_update_plant_carbon_seeds_impl(
    size,
    active_count,
    active_ids_offset,
    model_dt_days,
    storage_param,
    q10_lookup_steps,
    q10_temp_min_c,
    q10_temp_lookup_scale,
    baobab_respiration_q10_offset,
    rose_respiration_q10_offset,
    substrate_offset,
    baobab_blocked_offset,
    soil_water_offset,
    soil_cap_offset,
    groundwater_storage_offset,
    groundwater_cap_offset,
    gpp_baobab_offset,
    gpp_rose_offset,
    root_stress_baobab_offset,
    root_stress_rose_offset,
    canopy_light_baobab_offset,
    canopy_light_rose_offset,
    light_baobab_offset,
    light_rose_offset,
    vegetation_cover_offset,
    surface_temp_c_offset,
    ash_stress_offset,
    baobab_risk_offset,
    rose_fertility_offset,
    0.0f,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    baobab_leaf_offset,
    baobab_stem_offset,
    baobab_root_offset,
    baobab_store_offset,
    baobab_seed_offset,
    rose_leaf_offset,
    rose_flower_offset,
    rose_root_offset,
    rose_store_offset,
    rose_seed_offset,
    baobab_seed_transport_offset,
    rose_seed_transport_offset,
    rose_seed_production_offset,
    rose_seed_arrival_offset,
    baobab_readiness_offset,
    rose_readiness_offset,
    hydrology_sink0_offset,
    baobab_leaf_next_offset,
    baobab_stem_next_offset,
    baobab_root_next_offset,
    baobab_store_next_offset,
    baobab_seed_next_offset,
    baobab_readiness_next_offset,
    rose_leaf_next_offset,
    rose_flower_next_offset,
    rose_root_next_offset,
    rose_store_next_offset,
    rose_seed_next_offset,
    rose_readiness_next_offset,
    mb_next_offset,
    mr_next_offset,
    sb_next_offset,
    soil_bio_wetness_offset,
    soil_bio_temp_c_offset,
    soil_bio_ash_load_offset,
    soil_bio_top_sat_offset,
    soil_bio_groundwater_sat_offset,
    soil_bio_litter_fast_input_offset,
    soil_bio_litter_slow_input_offset,
    soil_bio_plant_nutrient_uptake_offset,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1
  );
}

SIM_EXPORT void sim_update_soil_biogeochemistry(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float model_dt_days,
  uintptr_t substrate_offset,
  uintptr_t depth_offset,
  uintptr_t soil_mineral_n_offset,
  uintptr_t soil_mineral_transport_offset,
  uintptr_t litter_carbon_offset,
  uintptr_t litter_fast_carbon_offset,
  uintptr_t litter_slow_carbon_offset,
  uintptr_t soil_carbon_active_offset,
  uintptr_t soil_carbon_stable_offset,
  uintptr_t rose_fertility_offset,
  uintptr_t soil_bio_wetness_offset,
  uintptr_t soil_bio_temp_c_offset,
  uintptr_t soil_bio_ash_load_offset,
  uintptr_t soil_bio_top_sat_offset,
  uintptr_t soil_bio_groundwater_sat_offset,
  uintptr_t soil_bio_litter_fast_input_offset,
  uintptr_t soil_bio_litter_slow_input_offset,
  uintptr_t soil_bio_plant_nutrient_uptake_offset,
  uintptr_t litter_carbon_next_offset,
  uintptr_t litter_fast_carbon_next_offset,
  uintptr_t litter_slow_carbon_next_offset,
  uintptr_t soil_carbon_active_next_offset,
  uintptr_t soil_carbon_stable_next_offset,
  uintptr_t soil_mineral_n_next_offset
) {
  (void)size;
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *SIM_RESTRICT depth = (const float *)(uintptr_t)depth_offset;
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)soil_mineral_n_offset;
  const float *SIM_RESTRICT soil_mineral_transport = (const float *)(uintptr_t)soil_mineral_transport_offset;
  const float *SIM_RESTRICT litter_carbon = (const float *)(uintptr_t)litter_carbon_offset;
  const float *SIM_RESTRICT litter_fast_carbon = (const float *)(uintptr_t)litter_fast_carbon_offset;
  const float *SIM_RESTRICT litter_slow_carbon = (const float *)(uintptr_t)litter_slow_carbon_offset;
  const float *SIM_RESTRICT soil_carbon_active = (const float *)(uintptr_t)soil_carbon_active_offset;
  const float *SIM_RESTRICT soil_carbon_stable = (const float *)(uintptr_t)soil_carbon_stable_offset;
  const float *SIM_RESTRICT rose_fertility = (const float *)(uintptr_t)rose_fertility_offset;
  const float *SIM_RESTRICT soil_bio_wetness = (const float *)(uintptr_t)soil_bio_wetness_offset;
  const float *SIM_RESTRICT soil_bio_temp_c = (const float *)(uintptr_t)soil_bio_temp_c_offset;
  const float *SIM_RESTRICT soil_bio_ash_load = (const float *)(uintptr_t)soil_bio_ash_load_offset;
  const float *SIM_RESTRICT soil_bio_top_sat = (const float *)(uintptr_t)soil_bio_top_sat_offset;
  const float *SIM_RESTRICT soil_bio_groundwater_sat = (const float *)(uintptr_t)soil_bio_groundwater_sat_offset;
  const float *SIM_RESTRICT soil_bio_litter_fast_input = (const float *)(uintptr_t)soil_bio_litter_fast_input_offset;
  const float *SIM_RESTRICT soil_bio_litter_slow_input = (const float *)(uintptr_t)soil_bio_litter_slow_input_offset;
  const float *SIM_RESTRICT soil_bio_plant_nutrient_uptake = (const float *)(uintptr_t)soil_bio_plant_nutrient_uptake_offset;
  float *SIM_RESTRICT litter_carbon_next = (float *)(uintptr_t)litter_carbon_next_offset;
  float *SIM_RESTRICT litter_fast_carbon_next = (float *)(uintptr_t)litter_fast_carbon_next_offset;
  float *SIM_RESTRICT litter_slow_carbon_next = (float *)(uintptr_t)litter_slow_carbon_next_offset;
  float *SIM_RESTRICT soil_carbon_active_next = (float *)(uintptr_t)soil_carbon_active_next_offset;
  float *SIM_RESTRICT soil_carbon_stable_next = (float *)(uintptr_t)soil_carbon_stable_next_offset;
  float *SIM_RESTRICT soil_mineral_n_next = (float *)(uintptr_t)soil_mineral_n_next_offset;
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const uint8_t sub = sim_substrate_index(substrate[i]);
    sim_update_soil_biogeochemistry_cell(
      i,
      model_dt_days,
      sub,
      soil_bio_wetness[i],
      soil_bio_temp_c[i],
      sim_clamp(soil_bio_ash_load[i], 0.0f, 1.0f),
      soil_bio_top_sat[i],
      soil_bio_groundwater_sat[i],
      soil_bio_litter_fast_input[i],
      soil_bio_litter_slow_input[i],
      soil_bio_plant_nutrient_uptake[i],
      depth,
      soil_mineral_n,
      soil_mineral_transport,
      litter_carbon,
      litter_fast_carbon,
      litter_slow_carbon,
      soil_carbon_active,
      soil_carbon_stable,
      rose_fertility,
      litter_carbon_next,
      litter_fast_carbon_next,
      litter_slow_carbon_next,
      soil_carbon_active_next,
      soil_carbon_stable_next,
      soil_mineral_n_next
    );
  }
}

SIM_EXPORT void sim_richards_columns_update(
  int32_t size,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float dt_days,
  float model_dt_days,
  int32_t write_diagnostics,
  uintptr_t substrate_offset,
  uintptr_t elevation_offset,
  uintptr_t h_offset,
  uintptr_t h_next_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_water_next_offset,
  uintptr_t soil_head_offset,
  uintptr_t soil_hydraulic_k_offset,
  uintptr_t soil_cap_offset,
  uintptr_t soil_thickness_offset,
  uintptr_t soil_residual_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_storage_next_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t groundwater_head_offset,
  uintptr_t groundwater_thickness_offset,
  uintptr_t h_transport_offset,
  uintptr_t soil_transport_offset,
  uintptr_t groundwater_transport_offset,
  uintptr_t hydrology_throughfall_offset,
  uintptr_t hydrology_veg_feedback_offset,
  uintptr_t hydrology_sink0_offset,
  uintptr_t hydrology_sink1_offset,
  uintptr_t hydrology_sink2_offset,
  uintptr_t hydrology_groundwater_sink_offset,
  uintptr_t hydrology_surface_evap_demand_m_offset,
  uintptr_t groundwater_recharge_offset,
  uintptr_t hydrology_horizontal_m_offset,
  uintptr_t hydrology_infiltration_m_offset,
  uintptr_t hydrology_percolation01_m_offset,
  uintptr_t hydrology_percolation12_m_offset,
  uintptr_t hydrology_recharge_m_offset,
  uintptr_t hydrology_leakage_m_offset,
  uintptr_t hydrology_surface_evap_m_offset
) {
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)substrate_offset;
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)elevation_offset;
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)h_offset;
  float *SIM_RESTRICT h_next = (float *)(uintptr_t)h_next_offset;
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)soil_water_offset;
  float *SIM_RESTRICT soil_water_next = (float *)(uintptr_t)soil_water_next_offset;
  const float *SIM_RESTRICT soil_head = (const float *)(uintptr_t)soil_head_offset;
  const float *SIM_RESTRICT soil_hydraulic_k = (const float *)(uintptr_t)soil_hydraulic_k_offset;
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)soil_cap_offset;
  const float *SIM_RESTRICT soil_thickness = (const float *)(uintptr_t)soil_thickness_offset;
  const float *SIM_RESTRICT soil_residual = (const float *)(uintptr_t)soil_residual_offset;
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)groundwater_storage_offset;
  float *SIM_RESTRICT groundwater_storage_next = (float *)(uintptr_t)groundwater_storage_next_offset;
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)groundwater_cap_offset;
  const float *SIM_RESTRICT groundwater_head = (const float *)(uintptr_t)groundwater_head_offset;
  const float *SIM_RESTRICT groundwater_thickness = (const float *)(uintptr_t)groundwater_thickness_offset;
  const float *SIM_RESTRICT h_transport = (const float *)(uintptr_t)h_transport_offset;
  const float *SIM_RESTRICT soil_transport = (const float *)(uintptr_t)soil_transport_offset;
  const float *SIM_RESTRICT groundwater_transport = (const float *)(uintptr_t)groundwater_transport_offset;
  const float *SIM_RESTRICT hydrology_throughfall = (const float *)(uintptr_t)hydrology_throughfall_offset;
  const float *SIM_RESTRICT hydrology_veg_feedback = (const float *)(uintptr_t)hydrology_veg_feedback_offset;
  const float *SIM_RESTRICT hydrology_sink0 = (const float *)(uintptr_t)hydrology_sink0_offset;
  const float *SIM_RESTRICT hydrology_sink1 = (const float *)(uintptr_t)hydrology_sink1_offset;
  const float *SIM_RESTRICT hydrology_sink2 = (const float *)(uintptr_t)hydrology_sink2_offset;
  const float *SIM_RESTRICT hydrology_groundwater_sink = (const float *)(uintptr_t)hydrology_groundwater_sink_offset;
  const float *SIM_RESTRICT hydrology_surface_evap_demand_m = (const float *)(uintptr_t)hydrology_surface_evap_demand_m_offset;
  float *SIM_RESTRICT groundwater_recharge = (float *)(uintptr_t)groundwater_recharge_offset;
  float *SIM_RESTRICT hydrology_horizontal_m = (float *)(uintptr_t)hydrology_horizontal_m_offset;
  float *SIM_RESTRICT hydrology_infiltration_m = (float *)(uintptr_t)hydrology_infiltration_m_offset;
  float *SIM_RESTRICT hydrology_percolation01_m = (float *)(uintptr_t)hydrology_percolation01_m_offset;
  float *SIM_RESTRICT hydrology_percolation12_m = (float *)(uintptr_t)hydrology_percolation12_m_offset;
  float *SIM_RESTRICT hydrology_recharge_m = (float *)(uintptr_t)hydrology_recharge_m_offset;
  float *SIM_RESTRICT hydrology_leakage_m = (float *)(uintptr_t)hydrology_leakage_m_offset;
  float *SIM_RESTRICT hydrology_surface_evap_m = (float *)(uintptr_t)hydrology_surface_evap_m_offset;

  const int32_t size2 = size * 2;
  const float inv_model_dt_days = model_dt_days > 0.0f ? 1.0f / model_dt_days : 0.0f;
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t layer0_index = i;
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const uint8_t sub = substrate[i];
    const float sub_inf_bare = substrate_inf_bare(sub);
    const float sub_inf_veg = substrate_inf_veg(sub);
    const float sub_percolation = substrate_percolation(sub);
    const float sub_leak = substrate_leak(sub);
    const float sub_ksat0 = substrate_ksat0(sub);
    const float sub_ksat1 = substrate_ksat1(sub);
    const float sub_gwk = substrate_gwk(sub);

    const float elevation_value = elevation[i];
    const float cap0 = soil_cap[layer0_index];
    const float cap1 = soil_cap[layer1_index];
    const float cap2 = soil_cap[layer2_index];
    const float thick0 = soil_thickness[layer0_index];
    const float thick1 = soil_thickness[layer1_index];
    const float thick2 = soil_thickness[layer2_index];
    const float residual0 = soil_residual[layer0_index];
    const float residual1 = soil_residual[layer1_index];
    const float residual2 = soil_residual[layer2_index];
    const float groundwater_cap_value = groundwater_cap[i];
    const float groundwater_thickness_value = groundwater_thickness[i];
    const float initial_surface = h[i];
    const float initial_soil0 = soil_water[layer0_index];
    const float initial_soil1 = soil_water[layer1_index];
    const float initial_soil2 = soil_water[layer2_index];
    const float initial_groundwater = groundwater_storage[i];

    const float sat0 = sim_clamp(initial_soil0 / cap0, 0.0f, 1.0f);
    const float groundwater_sat = sim_clamp(initial_groundwater / groundwater_cap_value, 0.0f, 1.0f);
    const float head0 = soil_head[layer0_index];
    const float head1 = soil_head[layer1_index];
    const float head2 = soil_head[layer2_index];
    const float hydraulic_k0 = soil_hydraulic_k[layer0_index];
    const float hydraulic_k1 = soil_hydraulic_k[layer1_index];
    const float hydraulic_k2 = soil_hydraulic_k[layer2_index];
    const float groundwater_head_value = groundwater_head[i];

    const float infiltration_distance = sim_max(0.025f, thick0 * 0.5f);
    const float surface_head = elevation_value + sim_max(0.0f, initial_surface);
    const float infiltration_gradient = sim_max(0.0f, (surface_head - head0) / infiltration_distance);
    const float open_pores = sim_clamp(1.0f - sat0, 0.015f, 1.0f);
    const float surface_k =
      sim_max(hydraulic_k0, sub_ksat0 * 0.012f) *
      (0.35f * sub_inf_bare + 0.65f * sub_inf_veg * (0.25f + 0.75f * hydrology_veg_feedback[i]));
    const float infiltration_capacity = surface_k * infiltration_gradient * open_pores;
    const float infiltration_available = initial_surface / dt_days + hydrology_throughfall[i];
    const float infiltration_pore_space = sim_max(0.0f, cap0 - initial_soil0) / dt_days;
    const float q_inf = sim_min(sim_min(infiltration_available, infiltration_pore_space), sim_max(0.0f, infiltration_capacity));

    const float distance01 = sim_max(0.02f, 0.5f * (thick0 + thick1));
    const float flux01 = sim_harmonic_mean(hydraulic_k0, hydraulic_k1) * sub_percolation * ((head0 - head1) / distance01);
    const float max_down01 =
      sim_min(sim_max(0.0f, initial_soil0 - residual0) / dt_days, sim_max(0.0f, cap1 - initial_soil1) / dt_days);
    const float max_up01 =
      sim_min(sim_max(0.0f, initial_soil1 - residual1) / dt_days, sim_max(0.0f, cap0 - initial_soil0) / dt_days);
    const float q01 = sim_clamp(flux01, -max_up01, max_down01);

    const float distance12 = sim_max(0.02f, 0.5f * (thick1 + thick2));
    const float flux12 = sim_harmonic_mean(hydraulic_k1, hydraulic_k2) * sub_percolation * ((head1 - head2) / distance12);
    const float max_down12 =
      sim_min(sim_max(0.0f, initial_soil1 - residual1) / dt_days, sim_max(0.0f, cap2 - initial_soil2) / dt_days);
    const float max_up12 =
      sim_min(sim_max(0.0f, initial_soil2 - residual2) / dt_days, sim_max(0.0f, cap1 - initial_soil1) / dt_days);
    const float q12 = sim_clamp(flux12, -max_up12, max_down12);

    const float recharge_distance = sim_max(0.025f, 0.5f * thick2 + 0.5f * groundwater_thickness_value);
    const float recharge_flux =
      sim_harmonic_mean(hydraulic_k2, sub_ksat1 * sub_leak) *
      sub_percolation *
      ((head2 - groundwater_head_value) / recharge_distance);
    const float max_recharge_down =
      sim_min(sim_max(0.0f, initial_soil2 - residual2) / dt_days, sim_max(0.0f, groundwater_cap_value - initial_groundwater) / dt_days);
    const float max_recharge_up =
      sim_min(sim_max(0.0f, initial_groundwater) / dt_days, sim_max(0.0f, cap2 - initial_soil2) / dt_days);
    const float recharge = sim_clamp(recharge_flux, -max_recharge_up, max_recharge_down);

    const float excess_groundwater = sim_clamp((groundwater_sat - 0.92f) / 0.08f, 0.0f, 1.0f);
    const float leak =
      sim_min(sim_max(0.0f, initial_groundwater) / dt_days, sub_leak * sub_gwk * excess_groundwater * excess_groundwater * 0.04f);
    const float surface_sink_demand = sim_max(0.0f, hydrology_surface_evap_demand_m[i] * inv_model_dt_days);
    const float surface_before_sink = initial_surface + dt_days * (h_transport[i] + hydrology_throughfall[i] - q_inf);
    const float surface_sink = sim_min(surface_sink_demand, sim_max(0.0f, surface_before_sink) / dt_days);

    const float surface = sim_max(0.0f, surface_before_sink - dt_days * surface_sink);
    const float soil0 =
      sim_clamp(initial_soil0 + dt_days * (soil_transport[layer0_index] + q_inf - q01 - hydrology_sink0[i]), 0.0f, cap0);
    const float soil1 =
      sim_clamp(initial_soil1 + dt_days * (soil_transport[layer1_index] + q01 - q12 - hydrology_sink1[i]), 0.0f, cap1);
    const float soil2 =
      sim_clamp(initial_soil2 + dt_days * (soil_transport[layer2_index] + q12 - recharge - hydrology_sink2[i]), 0.0f, cap2);
    const float groundwater =
      sim_clamp(initial_groundwater + dt_days * (groundwater_transport[i] + recharge - leak - hydrology_groundwater_sink[i]), 0.0f, groundwater_cap_value);

    h_next[i] = surface;
    soil_water_next[layer0_index] = soil0;
    soil_water_next[layer1_index] = soil1;
    soil_water_next[layer2_index] = soil2;
    groundwater_storage_next[i] = groundwater;

    if (write_diagnostics) {
      groundwater_recharge[i] = recharge;
      hydrology_horizontal_m[i] +=
        (h_transport[i] + soil_transport[layer0_index] + soil_transport[layer1_index] + soil_transport[layer2_index] + groundwater_transport[i]) * dt_days;
      hydrology_infiltration_m[i] += q_inf * dt_days;
      hydrology_percolation01_m[i] += q01 * dt_days;
      hydrology_percolation12_m[i] += q12 * dt_days;
      hydrology_recharge_m[i] += recharge * dt_days;
      hydrology_leakage_m[i] += leak * dt_days;
      hydrology_surface_evap_m[i] += surface_sink * dt_days;
    }
  }
}

static void sim_record_disturbance_export(
  int32_t cell_id,
  float exported_carbon,
  uintptr_t disturbance_carbon_export_offset,
  uintptr_t carbon_disturbance_offset,
  uintptr_t carbon_storage_change_offset,
  uintptr_t carbon_input_offset,
  uintptr_t carbon_transport_offset,
  uintptr_t carbon_respiration_offset,
  uintptr_t carbon_residual_offset
) {
  if (exported_carbon <= 0.0f) {
    return;
  }
  float *SIM_RESTRICT disturbance_carbon_export = (float *)(uintptr_t)disturbance_carbon_export_offset;
  float *SIM_RESTRICT carbon_disturbance = (float *)(uintptr_t)carbon_disturbance_offset;
  float *SIM_RESTRICT carbon_storage_change = (float *)(uintptr_t)carbon_storage_change_offset;
  float *SIM_RESTRICT carbon_residual = (float *)(uintptr_t)carbon_residual_offset;
  const float *SIM_RESTRICT carbon_input = (const float *)(uintptr_t)carbon_input_offset;
  const float *SIM_RESTRICT carbon_transport = (const float *)(uintptr_t)carbon_transport_offset;
  const float *SIM_RESTRICT carbon_respiration = (const float *)(uintptr_t)carbon_respiration_offset;

  if (disturbance_carbon_export) {
    disturbance_carbon_export[cell_id] += exported_carbon;
  }
  if (carbon_disturbance) {
    carbon_disturbance[cell_id] += exported_carbon;
  }
  if (carbon_storage_change) {
    carbon_storage_change[cell_id] -= exported_carbon;
  }
  if (carbon_residual && carbon_storage_change && carbon_input && carbon_transport && carbon_respiration && carbon_disturbance) {
    carbon_residual[cell_id] =
      carbon_storage_change[cell_id] -
      (carbon_input[cell_id] + carbon_transport[cell_id] - carbon_respiration[cell_id] - carbon_disturbance[cell_id]);
  }
}

SIM_EXPORT void sim_advance_ash(
  int32_t size,
  uintptr_t ash_offset,
  uintptr_t ash_rate_offset
) {
  float *SIM_RESTRICT ash = (float *)(uintptr_t)ash_offset;
  const float *SIM_RESTRICT ash_rate = (const float *)(uintptr_t)ash_rate_offset;
  if (!ash || !ash_rate || size <= 0) {
    return;
  }
  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    const float next_ash = ash[i] + ash_rate[i];
    ash[i] = next_ash > 1.0f ? 1.0f : next_ash;
  }
}

static inline float sim_ash_clean_cost(float value) {
  if (value >= 0.45f) {
    return 1.9f;
  }
  if (value >= 0.22f) {
    return 1.18f;
  }
  return 0.58f;
}

SIM_EXPORT int32_t sim_clean_ash_cells(
  int32_t target_count,
  uintptr_t ash_offset,
  uintptr_t target_ids_offset,
  uintptr_t efficiencies_offset,
  float work,
  float threshold,
  uintptr_t affected_ids_offset
) {
  float *SIM_RESTRICT ash = (float *)(uintptr_t)ash_offset;
  const int32_t *SIM_RESTRICT target_ids = (const int32_t *)(uintptr_t)target_ids_offset;
  const float *SIM_RESTRICT efficiencies = (const float *)(uintptr_t)efficiencies_offset;
  int32_t *SIM_RESTRICT affected_ids = (int32_t *)(uintptr_t)affected_ids_offset;
  if (!ash || !target_ids || !efficiencies || !affected_ids || target_count <= 0 || work <= 0.0f) {
    return 0;
  }

  float remaining_work = work;
  int32_t affected_count = 0;
  for (int32_t i = 0; i < target_count && remaining_work > 0.0f; i += 1) {
    const int32_t cell_id = target_ids[i];
    if (cell_id < 0) {
      continue;
    }
    const float current = ash[cell_id];
    if (current < threshold) {
      continue;
    }
    const float efficiency = efficiencies[i] > 1.0e-6f ? efficiencies[i] : 1.0e-6f;
    const float cost = sim_ash_clean_cost(current) / efficiency;
    const float reduction = sim_clamp(remaining_work / cost, 0.0f, current);
    if (reduction <= 0.0f) {
      continue;
    }

    ash[cell_id] = sim_clamp(current - reduction, 0.0f, 1.0f);
    remaining_work -= reduction * cost;
    affected_ids[affected_count] = cell_id;
    affected_count += 1;
  }
  return affected_count;
}

SIM_EXPORT void sim_update_sunlight_field(
  int32_t size,
  uintptr_t normal_xyz_offset,
  uintptr_t sunlight_offset,
  int32_t rose_cell,
  float turn,
  float turns_per_day,
  float model_time_offset_days,
  float model_duration_days,
  int32_t sample_count
) {
  const float *SIM_RESTRICT normals = (const float *)(uintptr_t)normal_xyz_offset;
  float *SIM_RESTRICT sunlight = (float *)(uintptr_t)sunlight_offset;
  if (!normals || !sunlight || size <= 0 || rose_cell < 0 || rose_cell >= size) {
    return;
  }
  if (turns_per_day <= 0.0f) {
    turns_per_day = 1.0f;
  }
  if (sample_count <= 0) {
    sample_count = 1;
  }
  if (sample_count > 32) {
    sample_count = 32;
  }

  const int32_t rose_offset = rose_cell * 3;
  const float nx = normals[rose_offset];
  const float ny = normals[rose_offset + 1];
  const float nz = normals[rose_offset + 2];

  float ex = -ny;
  float ey = nx;
  float ez = 0.0f;
  float east_length = sim_sqrt(ex * ex + ey * ey + ez * ez);
  if (east_length < 1.0e-6f) {
    ex = nz;
    ey = 0.0f;
    ez = -nx;
    east_length = sim_sqrt(ex * ex + ey * ey + ez * ez);
  }
  east_length = east_length > 1.0e-6f ? east_length : 1.0f;
  ex /= east_length;
  ey /= east_length;
  ez /= east_length;

  const float start_progress = sim_modulo_float(turn / turns_per_day + model_time_offset_days, 1.0f);
  const float duration_days = model_duration_days > 1.0e-6f ? model_duration_days : 1.0e-6f;
  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    sunlight[i] = 0.0f;
  }

  for (int32_t sample = 0; sample < sample_count; sample += 1) {
    const float sample_fraction = ((float)sample + 0.5f) / (float)sample_count;
    const float sample_progress = sim_modulo_float(start_progress + duration_days * sample_fraction, 1.0f);
    const float solar_angle = sample_progress * 6.283185307179586f;
    const float c = sim_cos(solar_angle);
    const float s = sim_sin(solar_angle);
    const float sx = ex * c + nx * s;
    const float sy = ey * c + ny * s;
    const float sz = ez * c + nz * s;

    SIM_VECTORIZE_LOOP
    for (int32_t i = 0; i < size; i += 1) {
      const int32_t offset = i * 3;
      const float dot = normals[offset] * sx + normals[offset + 1] * sy + normals[offset + 2] * sz;
      sunlight[i] += dot > 0.0f ? dot : 0.0f;
    }
  }

  const float inv_sample_count = 1.0f / (float)sample_count;
  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    sunlight[i] *= inv_sample_count;
  }
}

SIM_EXPORT void sim_remove_baobab_pool(
  int32_t size,
  int32_t cell_id,
  float amount,
  uintptr_t leaf_offset,
  uintptr_t stem_offset,
  uintptr_t root_offset,
  uintptr_t store_offset,
  uintptr_t mb_offset,
  uintptr_t sb_offset,
  uintptr_t disturbance_carbon_export_offset,
  uintptr_t carbon_disturbance_offset,
  uintptr_t carbon_storage_change_offset,
  uintptr_t carbon_input_offset,
  uintptr_t carbon_transport_offset,
  uintptr_t carbon_respiration_offset,
  uintptr_t carbon_residual_offset
) {
  if (cell_id < 0 || cell_id >= size || amount <= 0.0f) {
    return;
  }
  float *SIM_RESTRICT leaf = (float *)(uintptr_t)leaf_offset;
  float *SIM_RESTRICT stem = (float *)(uintptr_t)stem_offset;
  float *SIM_RESTRICT root = (float *)(uintptr_t)root_offset;
  float *SIM_RESTRICT store = (float *)(uintptr_t)store_offset;
  float *SIM_RESTRICT mb = (float *)(uintptr_t)mb_offset;
  float *SIM_RESTRICT sb = (float *)(uintptr_t)sb_offset;
  if (!leaf || !stem || !root || !store || !mb || !sb) {
    return;
  }

  const float mass = sim_max(1.0e-9f, mb[cell_id]);
  const float fraction = sim_clamp(amount / mass, 0.0f, 0.92f);
  const float before = leaf[cell_id] + stem[cell_id] + root[cell_id] + store[cell_id];
  leaf[cell_id] *= 1.0f - fraction;
  stem[cell_id] *= 1.0f - fraction;
  root[cell_id] *= 1.0f - fraction * 0.82f;
  store[cell_id] *= 1.0f - fraction;
  const float after = leaf[cell_id] + stem[cell_id] + root[cell_id] + store[cell_id];
  mb[cell_id] = leaf[cell_id] + stem[cell_id] + root[cell_id];
  sb[cell_id] = store[cell_id];
  sim_record_disturbance_export(
    cell_id,
    sim_max(0.0f, before - after),
    disturbance_carbon_export_offset,
    carbon_disturbance_offset,
    carbon_storage_change_offset,
    carbon_input_offset,
    carbon_transport_offset,
    carbon_respiration_offset,
    carbon_residual_offset
  );
}

SIM_EXPORT void sim_remove_rose_pool(
  int32_t size,
  int32_t cell_id,
  float amount,
  uintptr_t leaf_offset,
  uintptr_t flower_offset,
  uintptr_t root_offset,
  uintptr_t store_offset,
  uintptr_t mr_offset,
  uintptr_t disturbance_carbon_export_offset,
  uintptr_t carbon_disturbance_offset,
  uintptr_t carbon_storage_change_offset,
  uintptr_t carbon_input_offset,
  uintptr_t carbon_transport_offset,
  uintptr_t carbon_respiration_offset,
  uintptr_t carbon_residual_offset
) {
  if (cell_id < 0 || cell_id >= size || amount <= 0.0f) {
    return;
  }
  float *SIM_RESTRICT leaf = (float *)(uintptr_t)leaf_offset;
  float *SIM_RESTRICT flower = (float *)(uintptr_t)flower_offset;
  float *SIM_RESTRICT root = (float *)(uintptr_t)root_offset;
  float *SIM_RESTRICT store = (float *)(uintptr_t)store_offset;
  float *SIM_RESTRICT mr = (float *)(uintptr_t)mr_offset;
  if (!leaf || !flower || !root || !store || !mr) {
    return;
  }

  const float mass = sim_max(1.0e-9f, mr[cell_id]);
  const float fraction = sim_clamp(amount / mass, 0.0f, 0.96f);
  const float before = leaf[cell_id] + flower[cell_id] + root[cell_id] + store[cell_id];
  leaf[cell_id] *= 1.0f - fraction;
  flower[cell_id] *= 1.0f - fraction;
  root[cell_id] *= 1.0f - fraction * 0.72f;
  store[cell_id] *= 1.0f - fraction;
  const float after = leaf[cell_id] + flower[cell_id] + root[cell_id] + store[cell_id];
  mr[cell_id] = leaf[cell_id] + flower[cell_id] + root[cell_id];
  sim_record_disturbance_export(
    cell_id,
    sim_max(0.0f, before - after),
    disturbance_carbon_export_offset,
    carbon_disturbance_offset,
    carbon_storage_change_offset,
    carbon_input_offset,
    carbon_transport_offset,
    carbon_respiration_offset,
    carbon_residual_offset
  );
}

SIM_EXPORT void sim_apply_water_cells(
  int32_t size,
  int32_t target_count,
  uintptr_t target_ids_offset,
  uintptr_t target_weights_offset,
  float amount_m,
  float total_dt_days,
  int32_t substeps,
  int32_t hydraulic_lookup_steps,
  float groundwater_flow_multiplier,
  uintptr_t hydraulic_psi_offset,
  uintptr_t hydraulic_relative_k_offset,
  uintptr_t groundwater_pow17_offset,
  uintptr_t substrate_offset,
  uintptr_t elevation_offset,
  uintptr_t h_offset,
  uintptr_t h_next_offset,
  uintptr_t soil_water_offset,
  uintptr_t soil_water_next_offset,
  uintptr_t soil_head_offset,
  uintptr_t soil_hydraulic_k_offset,
  uintptr_t soil_transmissivity_offset,
  uintptr_t soil_cap_offset,
  uintptr_t soil_thickness_offset,
  uintptr_t soil_center_depth_offset,
  uintptr_t soil_residual_offset,
  uintptr_t groundwater_storage_offset,
  uintptr_t groundwater_storage_next_offset,
  uintptr_t groundwater_cap_offset,
  uintptr_t groundwater_head_offset,
  uintptr_t groundwater_t_offset,
  uintptr_t groundwater_thickness_offset,
  uintptr_t groundwater_top_depth_offset,
  uintptr_t h_transport_offset,
  uintptr_t soil_transport_offset,
  uintptr_t groundwater_transport_offset,
  uintptr_t hydrology_throughfall_offset,
  uintptr_t hydrology_veg_feedback_offset,
  uintptr_t hydrology_sink0_offset,
  uintptr_t hydrology_sink1_offset,
  uintptr_t hydrology_sink2_offset,
  uintptr_t hydrology_groundwater_sink_offset,
  uintptr_t hydrology_surface_evap_demand_m_offset,
  uintptr_t groundwater_recharge_offset,
  uintptr_t hydrology_horizontal_m_offset,
  uintptr_t hydrology_infiltration_m_offset,
  uintptr_t hydrology_percolation01_m_offset,
  uintptr_t hydrology_percolation12_m_offset,
  uintptr_t hydrology_recharge_m_offset,
  uintptr_t hydrology_leakage_m_offset,
  uintptr_t hydrology_surface_evap_m_offset,
  uintptr_t w0_offset,
  uintptr_t w1_offset
) {
  if (size <= 0 || target_count <= 0 || amount_m <= 0.0f) {
    return;
  }
  if (substeps < 1) {
    substeps = 1;
  }
  if (substeps > 64) {
    substeps = 64;
  }

  const int32_t *SIM_RESTRICT target_ids = (const int32_t *)(uintptr_t)target_ids_offset;
  const float *SIM_RESTRICT target_weights = (const float *)(uintptr_t)target_weights_offset;
  float *SIM_RESTRICT h = (float *)(uintptr_t)h_offset;
  float *SIM_RESTRICT h_next = (float *)(uintptr_t)h_next_offset;
  float *SIM_RESTRICT soil_water = (float *)(uintptr_t)soil_water_offset;
  float *SIM_RESTRICT soil_water_next = (float *)(uintptr_t)soil_water_next_offset;
  float *SIM_RESTRICT groundwater_storage = (float *)(uintptr_t)groundwater_storage_offset;
  float *SIM_RESTRICT groundwater_storage_next = (float *)(uintptr_t)groundwater_storage_next_offset;
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)h_transport_offset;
  float *SIM_RESTRICT soil_transport = (float *)(uintptr_t)soil_transport_offset;
  float *SIM_RESTRICT groundwater_transport = (float *)(uintptr_t)groundwater_transport_offset;
  float *SIM_RESTRICT hydrology_throughfall = (float *)(uintptr_t)hydrology_throughfall_offset;
  float *SIM_RESTRICT hydrology_veg_feedback = (float *)(uintptr_t)hydrology_veg_feedback_offset;
  float *SIM_RESTRICT hydrology_sink0 = (float *)(uintptr_t)hydrology_sink0_offset;
  float *SIM_RESTRICT hydrology_sink1 = (float *)(uintptr_t)hydrology_sink1_offset;
  float *SIM_RESTRICT hydrology_sink2 = (float *)(uintptr_t)hydrology_sink2_offset;
  float *SIM_RESTRICT hydrology_groundwater_sink = (float *)(uintptr_t)hydrology_groundwater_sink_offset;
  float *SIM_RESTRICT hydrology_surface_evap_demand_m = (float *)(uintptr_t)hydrology_surface_evap_demand_m_offset;
  if (!target_ids || !target_weights || !h || !h_next || !soil_water || !soil_water_next || !groundwater_storage || !groundwater_storage_next) {
    return;
  }

  for (int32_t target = 0; target < target_count; target += 1) {
    const int32_t i = target_ids[target];
    if (i >= 0 && i < size) {
      h[i] += sim_max(0.0f, amount_m * target_weights[target]);
    }
  }

  const float sub_dt_days = total_dt_days / (float)substeps;
  const int32_t size2 = size * 2;
  for (int32_t step = 0; step < substeps; step += 1) {
    for (int32_t target = 0; target < target_count; target += 1) {
      const int32_t i = target_ids[target];
      if (i < 0 || i >= size) {
        continue;
      }
      h_transport[i] = 0.0f;
      groundwater_transport[i] = 0.0f;
      soil_transport[i] = 0.0f;
      soil_transport[size + i] = 0.0f;
      soil_transport[size2 + i] = 0.0f;
      hydrology_throughfall[i] = 0.0f;
      hydrology_veg_feedback[i] = 0.0f;
      hydrology_sink0[i] = 0.0f;
      hydrology_sink1[i] = 0.0f;
      hydrology_sink2[i] = 0.0f;
      hydrology_groundwater_sink[i] = 0.0f;
      hydrology_surface_evap_demand_m[i] = 0.0f;
    }

    sim_update_hydraulic_state(
      size,
      target_count,
      target_ids_offset,
      hydraulic_lookup_steps,
      groundwater_flow_multiplier,
      hydraulic_psi_offset,
      hydraulic_relative_k_offset,
      groundwater_pow17_offset,
      substrate_offset,
      elevation_offset,
      soil_water_offset,
      soil_cap_offset,
      soil_center_depth_offset,
      soil_thickness_offset,
      groundwater_storage_offset,
      groundwater_cap_offset,
      groundwater_thickness_offset,
      groundwater_top_depth_offset,
      w0_offset,
      w1_offset,
      soil_head_offset,
      soil_hydraulic_k_offset,
      soil_transmissivity_offset,
      groundwater_head_offset,
      groundwater_t_offset
    );

    sim_richards_columns_update(
      size,
      target_count,
      target_ids_offset,
      sub_dt_days,
      sub_dt_days,
      0,
      substrate_offset,
      elevation_offset,
      h_offset,
      h_next_offset,
      soil_water_offset,
      soil_water_next_offset,
      soil_head_offset,
      soil_hydraulic_k_offset,
      soil_cap_offset,
      soil_thickness_offset,
      soil_residual_offset,
      groundwater_storage_offset,
      groundwater_storage_next_offset,
      groundwater_cap_offset,
      groundwater_head_offset,
      groundwater_thickness_offset,
      h_transport_offset,
      soil_transport_offset,
      groundwater_transport_offset,
      hydrology_throughfall_offset,
      hydrology_veg_feedback_offset,
      hydrology_sink0_offset,
      hydrology_sink1_offset,
      hydrology_sink2_offset,
      hydrology_groundwater_sink_offset,
      hydrology_surface_evap_demand_m_offset,
      groundwater_recharge_offset,
      hydrology_horizontal_m_offset,
      hydrology_infiltration_m_offset,
      hydrology_percolation01_m_offset,
      hydrology_percolation12_m_offset,
      hydrology_recharge_m_offset,
      hydrology_leakage_m_offset,
      hydrology_surface_evap_m_offset
    );

    for (int32_t target = 0; target < target_count; target += 1) {
      const int32_t i = target_ids[target];
      if (i < 0 || i >= size) {
        continue;
      }
      h[i] = h_next[i];
      soil_water[i] = soil_water_next[i];
      soil_water[size + i] = soil_water_next[size + i];
      soil_water[size2 + i] = soil_water_next[size2 + i];
      groundwater_storage[i] = groundwater_storage_next[i];
    }
  }

  sim_update_hydraulic_state(
    size,
    target_count,
    target_ids_offset,
    hydraulic_lookup_steps,
    groundwater_flow_multiplier,
    hydraulic_psi_offset,
    hydraulic_relative_k_offset,
    groundwater_pow17_offset,
    substrate_offset,
    elevation_offset,
    soil_water_offset,
    soil_cap_offset,
    soil_center_depth_offset,
    soil_thickness_offset,
    groundwater_storage_offset,
    groundwater_cap_offset,
    groundwater_thickness_offset,
    groundwater_top_depth_offset,
    w0_offset,
    w1_offset,
    soil_head_offset,
    soil_hydraulic_k_offset,
    soil_transmissivity_offset,
    groundwater_head_offset,
    groundwater_t_offset
  );
}

typedef enum SimStepParam {
  STEP_SIZE,
  STEP_ACTIVE_COUNT,
  STEP_ACTIVE_OFFSET,
  STEP_RBF_M,
  STEP_TRANSPORT_BLOCK_COUNT,
  STEP_TRANSPORT_BLOCK_CELL_OFFSETS_OFFSET,
  STEP_TRANSPORT_BLOCK_CELL_IDS_OFFSET,
  STEP_TRANSPORT_BLOCK_HALO_OFFSETS_OFFSET,
  STEP_TRANSPORT_BLOCK_HALO_IDS_OFFSET,
  STEP_TRANSPORT_BLOCK_LOCAL_STENCIL_OFFSET,
  STEP_TRANSPORT_BLOCK_MAX_HALO_COUNT,
  STEP_TRANSPORT_BLOCK_SCRATCH_OFFSET,
  STEP_TRANSPORT_BLOCK_SCRATCH_STRIDE,
  STEP_IS_EARTH,
  STEP_RNG_STATE,
  STEP_RNG_STATE_OUT_OFFSET,
  STEP_MODEL_DT_DAYS,
  STEP_SLOW_STEP_INTERVAL,
  STEP_SLOW_STEP_PHASE,
  STEP_SLOW_STEP_PHASE_OUT_OFFSET,
  STEP_RAIN_AVERAGE_WEIGHT,
  STEP_MEAN_RAIN,
  STEP_ANNUAL_PRECIP_MM,
  STEP_DRY_DAYS,
  STEP_LAST_RAIN_OUT_OFFSET,
  STEP_DAY,
  STEP_RAIN_RENDER_SIZE,
  STEP_RAIN_SCALE,
  STEP_RAIN_PATCHINESS,
  STEP_ASTEROID_CLOUD_COUNT,
  STEP_EARTH_TROPICAL_SCALE,
  STEP_EARTH_MID_LATITUDE_SCALE,
  STEP_EARTH_TROPICAL_COUNT,
  STEP_EARTH_MID_LATITUDE_COUNT,
  STEP_CELL_SIZE_M,
  STEP_SURFACE_WATER_DIFF_M2_DAY,
  STEP_SURFACE_SLOPE_VELOCITY_M_DAY,
  STEP_SURFACE_SLOPE_MAX_VELOCITY_M_DAY,
  STEP_NUTRIENT_DIFF_M2_DAY,
  STEP_BAOBAB_SEED_DIFFUSION_M2_DAY,
  STEP_ROSE_SEED_DIFFUSION_M2_DAY,
  STEP_SURFACE_FILM_THRESHOLD_M,
  STEP_HYDRAULIC_LOOKUP_STEPS,
  STEP_GROUNDWATER_FLOW_MULTIPLIER,
  STEP_HYDRAULIC_STATE_CURRENT,
  STEP_PHOTO_LOOKUP_STEPS,
  STEP_PHOTO_TEMP_MIN_C,
  STEP_PHOTO_TEMP_LOOKUP_SCALE,
  STEP_ROOT_DEPTH,
  STEP_STORAGE,
  STEP_EVAPORATION,
  STEP_ATMOSPHERIC_CO2,
  STEP_BAOBAB_QUANTUM_YIELD,
  STEP_BAOBAB_CURVATURE,
  STEP_BAOBAB_CI_MIN,
  STEP_BAOBAB_CI_MAX,
  STEP_BAOBAB_EXTINCTION,
  STEP_BAOBAB_G0_MOL,
  STEP_BAOBAB_G1,
  STEP_BAOBAB_MAX_CONDUCTANCE_MPS,
  STEP_BAOBAB_MULTIPLIER,
  STEP_ROSE_QUANTUM_YIELD,
  STEP_ROSE_CURVATURE,
  STEP_ROSE_CI_MIN,
  STEP_ROSE_CI_MAX,
  STEP_ROSE_EXTINCTION,
  STEP_ROSE_G0_MOL,
  STEP_ROSE_G1,
  STEP_ROSE_MAX_CONDUCTANCE_MPS,
  STEP_ROSE_MULTIPLIER,
  STEP_ASTEROID_MEAN_TEMP_C,
  STEP_ASTEROID_DIURNAL_RANGE_C,
  STEP_ASTEROID_LATITUDE_TEMP_RANGE_C,
  STEP_SHADE,
  STEP_ROSE_COHORTS,
  STEP_SUNLIGHT_NORMAL_XYZ_OFFSET,
  STEP_SUNLIGHT_ROSE_CELL,
  STEP_SUNLIGHT_TURN,
  STEP_SUNLIGHT_TURNS_PER_DAY,
  STEP_SUNLIGHT_MODEL_TIME_OFFSET_DAYS,
  STEP_SUNLIGHT_MODEL_DURATION_DAYS,
  STEP_SUNLIGHT_SAMPLE_COUNT,
  STEP_STENCIL_OFFSET,
  STEP_LAP_OFFSET,
  STEP_GX_OFFSET,
  STEP_GY_OFFSET,
  STEP_RAIN_X_OFFSET,
  STEP_RAIN_Y_OFFSET,
  STEP_RAIN_TROPICS_OFFSET,
  STEP_RAIN_MID_LATITUDE_OFFSET,
  STEP_RAIN_WEAK_BACKGROUND_OFFSET,
  STEP_RAIN_CLIMATOLOGY_OFFSET,
  STEP_TROPICAL_X_OFFSET,
  STEP_TROPICAL_Y_OFFSET,
  STEP_TROPICAL_RADIUS_OFFSET,
  STEP_TROPICAL_CORE_RADIUS_OFFSET,
  STEP_TROPICAL_CORE_AMP_OFFSET,
  STEP_TROPICAL_AMP_OFFSET,
  STEP_MID_X_OFFSET,
  STEP_MID_Y_OFFSET,
  STEP_MID_RADIUS_OFFSET,
  STEP_MID_COS_PHASE_OFFSET,
  STEP_MID_SIN_PHASE_OFFSET,
  STEP_MID_AMP_OFFSET,
  STEP_HYDRAULIC_PSI_OFFSET,
  STEP_HYDRAULIC_RELATIVE_K_OFFSET,
  STEP_GROUNDWATER_POW17_OFFSET,
  STEP_BAOBAB_VCMAX_OFFSET,
  STEP_BAOBAB_JMAX_OFFSET,
  STEP_BAOBAB_RD_OFFSET,
  STEP_BAOBAB_GAMMA_STAR_OFFSET,
  STEP_BAOBAB_KC_OFFSET,
  STEP_BAOBAB_KO_OFFSET,
  STEP_ROSE_VCMAX_OFFSET,
  STEP_ROSE_JMAX_OFFSET,
  STEP_ROSE_RD_OFFSET,
  STEP_ROSE_GAMMA_STAR_OFFSET,
  STEP_ROSE_KC_OFFSET,
  STEP_ROSE_KO_OFFSET,
  STEP_BAOBAB_RESPIRATION_Q10_OFFSET,
  STEP_ROSE_RESPIRATION_Q10_OFFSET,
  STEP_DISPERSAL_OFFSETS_OFFSET,
  STEP_DISPERSAL_TARGETS_OFFSET,
  STEP_DISPERSAL_WEIGHTS_OFFSET,
  STEP_DISPERSAL_WEIGHT_SUMS_OFFSET,
  STEP_SUBSTRATE_OFFSET,
  STEP_LAND_ACTIVE_OFFSET,
  STEP_BAOBAB_BLOCKED_OFFSET,
  STEP_CELL_HEIGHT_OFFSET,
  STEP_CLIMATE_MEAN_TEMP_C_OFFSET,
  STEP_CLIMATE_DIURNAL_RANGE_C_OFFSET,
  STEP_ELEVATION_OFFSET,
  STEP_DEPTH_OFFSET,
  STEP_H_OFFSET,
  STEP_H_NEXT_OFFSET,
  STEP_H_TRANSPORT_OFFSET,
  STEP_R_OFFSET,
  STEP_RAIN_MEMORY_OFFSET,
  STEP_SNOW_ICE_M_OFFSET,
  STEP_W0_OFFSET,
  STEP_W1_OFFSET,
  STEP_SOIL_WATER_OFFSET,
  STEP_SOIL_WATER_NEXT_OFFSET,
  STEP_SOIL_HEAD_OFFSET,
  STEP_SOIL_HYDRAULIC_K_OFFSET,
  STEP_SOIL_TRANSMISSIVITY_OFFSET,
  STEP_SOIL_RESIDUAL_OFFSET,
  STEP_SOIL_CAP_OFFSET,
  STEP_SOIL_THICKNESS_OFFSET,
  STEP_SOIL_CENTER_DEPTH_OFFSET,
  STEP_SOIL_TRANSPORT_OFFSET,
  STEP_GROUNDWATER_STORAGE_OFFSET,
  STEP_GROUNDWATER_STORAGE_NEXT_OFFSET,
  STEP_GROUNDWATER_CAP_OFFSET,
  STEP_GROUNDWATER_HEAD_OFFSET,
  STEP_GROUNDWATER_T_OFFSET,
  STEP_GROUNDWATER_THICKNESS_OFFSET,
  STEP_GROUNDWATER_TOP_DEPTH_OFFSET,
  STEP_GROUNDWATER_TRANSPORT_OFFSET,
  STEP_GROUNDWATER_RECHARGE_OFFSET,
  STEP_SOIL_MINERAL_N_OFFSET,
  STEP_SOIL_MINERAL_N_NEXT_OFFSET,
  STEP_SOIL_MINERAL_TRANSPORT_OFFSET,
  STEP_SOIL_CARBON_ACTIVE_OFFSET,
  STEP_SOIL_CARBON_ACTIVE_NEXT_OFFSET,
  STEP_SOIL_CARBON_STABLE_OFFSET,
  STEP_SOIL_CARBON_STABLE_NEXT_OFFSET,
  STEP_LITTER_CARBON_OFFSET,
  STEP_LITTER_CARBON_NEXT_OFFSET,
  STEP_LITTER_FAST_CARBON_OFFSET,
  STEP_LITTER_FAST_CARBON_NEXT_OFFSET,
  STEP_LITTER_SLOW_CARBON_OFFSET,
  STEP_LITTER_SLOW_CARBON_NEXT_OFFSET,
  STEP_ROSE_FERTILITY_OFFSET,
  STEP_MOBILE_NUTRIENT_OFFSET,
  STEP_BAOBAB_SEED_OFFSET,
  STEP_BAOBAB_SEED_NEXT_OFFSET,
  STEP_BAOBAB_SEED_TRANSPORT_OFFSET,
  STEP_BAOBAB_READINESS_OFFSET,
  STEP_BAOBAB_READINESS_NEXT_OFFSET,
  STEP_ROSE_SEED_OFFSET,
  STEP_ROSE_SEED_NEXT_OFFSET,
  STEP_ROSE_SEED_TRANSPORT_OFFSET,
  STEP_ROSE_READINESS_OFFSET,
  STEP_ROSE_READINESS_NEXT_OFFSET,
  STEP_ROSE_SEED_PRODUCTION_OFFSET,
  STEP_ROSE_SEED_ARRIVAL_OFFSET,
  STEP_ROSE_SEED_ARRIVAL_THREAD_OFFSET,
  STEP_SLOPE_X_OFFSET,
  STEP_SLOPE_Y_OFFSET,
  STEP_SURFACE_UX_OFFSET,
  STEP_SURFACE_UY_OFFSET,
  STEP_TOP_SOIL_UX_OFFSET,
  STEP_TOP_SOIL_UY_OFFSET,
  STEP_GROUNDWATER_UX_OFFSET,
  STEP_GROUNDWATER_UY_OFFSET,
  STEP_FLUX_X_OFFSET,
  STEP_FLUX_Y_OFFSET,
  STEP_SUNLIGHT_OFFSET,
  STEP_LAI_BAOBAB_OFFSET,
  STEP_LAI_ROSE_OFFSET,
  STEP_COVER_BAOBAB_OFFSET,
  STEP_COVER_ROSE_OFFSET,
  STEP_VEGETATION_COVER_OFFSET,
  STEP_CANOPY_LIGHT_BAOBAB_OFFSET,
  STEP_CANOPY_LIGHT_ROSE_OFFSET,
  STEP_LIGHT_BAOBAB_OFFSET,
  STEP_LIGHT_ROSE_OFFSET,
  STEP_SURFACE_TEMP_C_OFFSET,
  STEP_VPD_KPA_OFFSET,
  STEP_VAPOR_SLOPE_KPA_C_OFFSET,
  STEP_PAR_OFFSET,
  STEP_APAR_TOTAL_OFFSET,
  STEP_APAR_BAOBAB_OFFSET,
  STEP_APAR_ROSE_OFFSET,
  STEP_PHOTO_WATER_STRESS_BAOBAB_OFFSET,
  STEP_PHOTO_WATER_STRESS_ROSE_OFFSET,
  STEP_PHOTO_NUTRIENT_BAOBAB_OFFSET,
  STEP_PHOTO_NUTRIENT_ROSE_OFFSET,
  STEP_GPP_BAOBAB_OFFSET,
  STEP_GPP_ROSE_OFFSET,
  STEP_STOMATAL_CONDUCTANCE_BAOBAB_OFFSET,
  STEP_STOMATAL_CONDUCTANCE_ROSE_OFFSET,
  STEP_CI_BAOBAB_OFFSET,
  STEP_CI_ROSE_OFFSET,
  STEP_ROOT_STRESS_BAOBAB_OFFSET,
  STEP_ROOT_STRESS_ROSE_OFFSET,
  STEP_SLOW_ENV_GPP_BAOBAB_OFFSET,
  STEP_SLOW_ENV_GPP_ROSE_OFFSET,
  STEP_SLOW_ENV_ROOT_STRESS_BAOBAB_OFFSET,
  STEP_SLOW_ENV_ROOT_STRESS_ROSE_OFFSET,
  STEP_SLOW_ENV_CANOPY_LIGHT_BAOBAB_OFFSET,
  STEP_SLOW_ENV_CANOPY_LIGHT_ROSE_OFFSET,
  STEP_SLOW_ENV_LIGHT_BAOBAB_OFFSET,
  STEP_SLOW_ENV_LIGHT_ROSE_OFFSET,
  STEP_SLOW_ENV_VEGETATION_COVER_OFFSET,
  STEP_SLOW_ENV_SURFACE_TEMP_C_OFFSET,
  STEP_SLOW_ENV_ASH_STRESS_OFFSET,
  STEP_SLOW_ENV_WETNESS_OFFSET,
  STEP_SLOW_ENV_TOP_SAT_OFFSET,
  STEP_SLOW_ENV_GROUNDWATER_SAT_OFFSET,
  STEP_CANOPY_WATER_OFFSET,
  STEP_CANOPY_WATER_NEXT_OFFSET,
  STEP_CANOPY_EVAP_M_OFFSET,
  STEP_BAOBAB_LEAF_OFFSET,
  STEP_BAOBAB_LEAF_NEXT_OFFSET,
  STEP_BAOBAB_STEM_OFFSET,
  STEP_BAOBAB_STEM_NEXT_OFFSET,
  STEP_BAOBAB_ROOT_OFFSET,
  STEP_BAOBAB_ROOT_NEXT_OFFSET,
  STEP_BAOBAB_STORE_OFFSET,
  STEP_BAOBAB_STORE_NEXT_OFFSET,
  STEP_ROSE_LEAF_OFFSET,
  STEP_ROSE_LEAF_NEXT_OFFSET,
  STEP_ROSE_FLOWER_OFFSET,
  STEP_ROSE_FLOWER_NEXT_OFFSET,
  STEP_ROSE_ROOT_OFFSET,
  STEP_ROSE_ROOT_NEXT_OFFSET,
  STEP_ROSE_STORE_OFFSET,
  STEP_ROSE_STORE_NEXT_OFFSET,
  STEP_MB_OFFSET,
  STEP_MR_OFFSET,
  STEP_SB_OFFSET,
  STEP_MB_NEXT_OFFSET,
  STEP_MR_NEXT_OFFSET,
  STEP_SB_NEXT_OFFSET,
  STEP_HYDROLOGY_THROUGHFALL_OFFSET,
  STEP_HYDROLOGY_VEG_FEEDBACK_OFFSET,
  STEP_HYDROLOGY_SINK0_OFFSET,
  STEP_HYDROLOGY_SINK1_OFFSET,
  STEP_HYDROLOGY_SINK2_OFFSET,
  STEP_HYDROLOGY_GROUNDWATER_SINK_OFFSET,
  STEP_HYDROLOGY_SURFACE_EVAP_DEMAND_M_OFFSET,
  STEP_HYDROLOGY_HORIZONTAL_M_OFFSET,
  STEP_HYDROLOGY_INFILTRATION_M_OFFSET,
  STEP_HYDROLOGY_PERCOLATION01_M_OFFSET,
  STEP_HYDROLOGY_PERCOLATION12_M_OFFSET,
  STEP_HYDROLOGY_RECHARGE_M_OFFSET,
  STEP_HYDROLOGY_LEAKAGE_M_OFFSET,
  STEP_HYDROLOGY_SURFACE_EVAP_M_OFFSET,
  STEP_SOIL_BIO_WETNESS_OFFSET,
  STEP_SOIL_BIO_TEMP_C_OFFSET,
  STEP_SOIL_BIO_ASH_LOAD_OFFSET,
  STEP_SOIL_BIO_TOP_SAT_OFFSET,
  STEP_SOIL_BIO_GROUNDWATER_SAT_OFFSET,
  STEP_SOIL_BIO_LITTER_FAST_INPUT_OFFSET,
  STEP_SOIL_BIO_LITTER_SLOW_INPUT_OFFSET,
  STEP_SOIL_BIO_PLANT_NUTRIENT_UPTAKE_OFFSET,
  STEP_ASH_STRESS_OFFSET,
  STEP_BAOBAB_RISK_OFFSET,
  STEP_PARAM_COUNT
} SimStepParam;

static inline float sim_param_float(const uint32_t *params, int32_t index) {
  union {
    uint32_t u;
    float f;
  } value;
  value.u = params[index];
  return value.f;
}

static inline uintptr_t sim_param_offset(const uint32_t *params, int32_t index) {
  return (uintptr_t)params[index];
}

static void sim_fill_float(uintptr_t offset, int32_t count, float value) {
  if (!offset || count <= 0) {
    return;
  }
  float *SIM_RESTRICT target = (float *)(uintptr_t)offset;
  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < count; i += 1) {
    target[i] = value;
  }
}

static void sim_fill_float_range(uintptr_t offset, int32_t start, int32_t end, float value) {
  if (!offset || end <= start) {
    return;
  }
  float *SIM_RESTRICT target = (float *)(uintptr_t)offset;
  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    target[i] = value;
  }
}

static inline void sim_set_param_float(uint32_t *params, int32_t index, float value) {
  union {
    uint32_t u;
    float f;
  } packed;
  packed.f = value;
  params[index] = packed.u;
}

static inline void sim_swap_param(uint32_t *params, int32_t a, int32_t b) {
  const uint32_t tmp = params[a];
  params[a] = params[b];
  params[b] = tmp;
}

#define STEP_APAR_BAOBAB STEP_APAR_BAOBAB_OFFSET
#define STEP_APAR_ROSE STEP_APAR_ROSE_OFFSET
#define STEP_APAR_TOTAL STEP_APAR_TOTAL_OFFSET
#define STEP_ASH_STRESS STEP_ASH_STRESS_OFFSET
#define STEP_BAOBAB_BLOCKED STEP_BAOBAB_BLOCKED_OFFSET
#define STEP_BAOBAB_GAMMA_STAR STEP_BAOBAB_GAMMA_STAR_OFFSET
#define STEP_BAOBAB_JMAX STEP_BAOBAB_JMAX_OFFSET
#define STEP_BAOBAB_KC STEP_BAOBAB_KC_OFFSET
#define STEP_BAOBAB_KO STEP_BAOBAB_KO_OFFSET
#define STEP_BAOBAB_LEAF STEP_BAOBAB_LEAF_OFFSET
#define STEP_BAOBAB_LEAF_NEXT STEP_BAOBAB_LEAF_NEXT_OFFSET
#define STEP_BAOBAB_RD STEP_BAOBAB_RD_OFFSET
#define STEP_BAOBAB_RESPIRATION_Q10 STEP_BAOBAB_RESPIRATION_Q10_OFFSET
#define STEP_BAOBAB_READINESS STEP_BAOBAB_READINESS_OFFSET
#define STEP_BAOBAB_READINESS_NEXT STEP_BAOBAB_READINESS_NEXT_OFFSET
#define STEP_BAOBAB_RISK STEP_BAOBAB_RISK_OFFSET
#define STEP_BAOBAB_ROOT STEP_BAOBAB_ROOT_OFFSET
#define STEP_BAOBAB_ROOT_NEXT STEP_BAOBAB_ROOT_NEXT_OFFSET
#define STEP_BAOBAB_SEED STEP_BAOBAB_SEED_OFFSET
#define STEP_BAOBAB_SEED_NEXT STEP_BAOBAB_SEED_NEXT_OFFSET
#define STEP_BAOBAB_SEED_TRANSPORT STEP_BAOBAB_SEED_TRANSPORT_OFFSET
#define STEP_BAOBAB_STEM STEP_BAOBAB_STEM_OFFSET
#define STEP_BAOBAB_STEM_NEXT STEP_BAOBAB_STEM_NEXT_OFFSET
#define STEP_BAOBAB_STORE STEP_BAOBAB_STORE_OFFSET
#define STEP_BAOBAB_STORE_NEXT STEP_BAOBAB_STORE_NEXT_OFFSET
#define STEP_BAOBAB_VCMAX STEP_BAOBAB_VCMAX_OFFSET
#define STEP_CANOPY_EVAP_M STEP_CANOPY_EVAP_M_OFFSET
#define STEP_CANOPY_LIGHT_BAOBAB STEP_CANOPY_LIGHT_BAOBAB_OFFSET
#define STEP_CANOPY_LIGHT_ROSE STEP_CANOPY_LIGHT_ROSE_OFFSET
#define STEP_CANOPY_WATER STEP_CANOPY_WATER_OFFSET
#define STEP_CANOPY_WATER_NEXT STEP_CANOPY_WATER_NEXT_OFFSET
#define STEP_CELL_HEIGHT STEP_CELL_HEIGHT_OFFSET
#define STEP_CI_BAOBAB STEP_CI_BAOBAB_OFFSET
#define STEP_CI_ROSE STEP_CI_ROSE_OFFSET
#define STEP_CLIMATE_DIURNAL_RANGE_C STEP_CLIMATE_DIURNAL_RANGE_C_OFFSET
#define STEP_CLIMATE_MEAN_TEMP_C STEP_CLIMATE_MEAN_TEMP_C_OFFSET
#define STEP_COVER_BAOBAB STEP_COVER_BAOBAB_OFFSET
#define STEP_COVER_ROSE STEP_COVER_ROSE_OFFSET
#define STEP_DEPTH STEP_DEPTH_OFFSET
#define STEP_DISPERSAL_OFFSETS STEP_DISPERSAL_OFFSETS_OFFSET
#define STEP_DISPERSAL_TARGETS STEP_DISPERSAL_TARGETS_OFFSET
#define STEP_DISPERSAL_WEIGHTS STEP_DISPERSAL_WEIGHTS_OFFSET
#define STEP_DISPERSAL_WEIGHT_SUMS STEP_DISPERSAL_WEIGHT_SUMS_OFFSET
#define STEP_ELEVATION STEP_ELEVATION_OFFSET
#define STEP_FLUX_X STEP_FLUX_X_OFFSET
#define STEP_FLUX_Y STEP_FLUX_Y_OFFSET
#define STEP_GPP_BAOBAB STEP_GPP_BAOBAB_OFFSET
#define STEP_GPP_ROSE STEP_GPP_ROSE_OFFSET
#define STEP_GROUNDWATER_CAP STEP_GROUNDWATER_CAP_OFFSET
#define STEP_GROUNDWATER_HEAD STEP_GROUNDWATER_HEAD_OFFSET
#define STEP_GROUNDWATER_POW17 STEP_GROUNDWATER_POW17_OFFSET
#define STEP_GROUNDWATER_RECHARGE STEP_GROUNDWATER_RECHARGE_OFFSET
#define STEP_GROUNDWATER_STORAGE STEP_GROUNDWATER_STORAGE_OFFSET
#define STEP_GROUNDWATER_STORAGE_NEXT STEP_GROUNDWATER_STORAGE_NEXT_OFFSET
#define STEP_GROUNDWATER_T STEP_GROUNDWATER_T_OFFSET
#define STEP_GROUNDWATER_THICKNESS STEP_GROUNDWATER_THICKNESS_OFFSET
#define STEP_GROUNDWATER_TOP_DEPTH STEP_GROUNDWATER_TOP_DEPTH_OFFSET
#define STEP_GROUNDWATER_TRANSPORT STEP_GROUNDWATER_TRANSPORT_OFFSET
#define STEP_GROUNDWATER_UX STEP_GROUNDWATER_UX_OFFSET
#define STEP_GROUNDWATER_UY STEP_GROUNDWATER_UY_OFFSET
#define STEP_GX STEP_GX_OFFSET
#define STEP_GY STEP_GY_OFFSET
#define STEP_MID_AMP STEP_MID_AMP_OFFSET
#define STEP_MID_COS_PHASE STEP_MID_COS_PHASE_OFFSET
#define STEP_MID_RADIUS STEP_MID_RADIUS_OFFSET
#define STEP_MID_SIN_PHASE STEP_MID_SIN_PHASE_OFFSET
#define STEP_MID_X STEP_MID_X_OFFSET
#define STEP_MID_Y STEP_MID_Y_OFFSET
#define STEP_H STEP_H_OFFSET
#define STEP_H_NEXT STEP_H_NEXT_OFFSET
#define STEP_H_TRANSPORT STEP_H_TRANSPORT_OFFSET
#define STEP_HYDRAULIC_PSI STEP_HYDRAULIC_PSI_OFFSET
#define STEP_HYDRAULIC_RELATIVE_K STEP_HYDRAULIC_RELATIVE_K_OFFSET
#define STEP_HYDROLOGY_GROUNDWATER_SINK STEP_HYDROLOGY_GROUNDWATER_SINK_OFFSET
#define STEP_HYDROLOGY_HORIZONTAL_M STEP_HYDROLOGY_HORIZONTAL_M_OFFSET
#define STEP_HYDROLOGY_INFILTRATION_M STEP_HYDROLOGY_INFILTRATION_M_OFFSET
#define STEP_HYDROLOGY_LEAKAGE_M STEP_HYDROLOGY_LEAKAGE_M_OFFSET
#define STEP_HYDROLOGY_PERCOLATION01_M STEP_HYDROLOGY_PERCOLATION01_M_OFFSET
#define STEP_HYDROLOGY_PERCOLATION12_M STEP_HYDROLOGY_PERCOLATION12_M_OFFSET
#define STEP_HYDROLOGY_RECHARGE_M STEP_HYDROLOGY_RECHARGE_M_OFFSET
#define STEP_HYDROLOGY_SINK0 STEP_HYDROLOGY_SINK0_OFFSET
#define STEP_HYDROLOGY_SINK1 STEP_HYDROLOGY_SINK1_OFFSET
#define STEP_HYDROLOGY_SINK2 STEP_HYDROLOGY_SINK2_OFFSET
#define STEP_HYDROLOGY_SURFACE_EVAP_DEMAND_M STEP_HYDROLOGY_SURFACE_EVAP_DEMAND_M_OFFSET
#define STEP_HYDROLOGY_SURFACE_EVAP_M STEP_HYDROLOGY_SURFACE_EVAP_M_OFFSET
#define STEP_HYDROLOGY_THROUGHFALL STEP_HYDROLOGY_THROUGHFALL_OFFSET
#define STEP_HYDROLOGY_VEG_FEEDBACK STEP_HYDROLOGY_VEG_FEEDBACK_OFFSET
#define STEP_LAI_BAOBAB STEP_LAI_BAOBAB_OFFSET
#define STEP_LAI_ROSE STEP_LAI_ROSE_OFFSET
#define STEP_LAP STEP_LAP_OFFSET
#define STEP_LIGHT_BAOBAB STEP_LIGHT_BAOBAB_OFFSET
#define STEP_LIGHT_ROSE STEP_LIGHT_ROSE_OFFSET
#define STEP_LITTER_CARBON STEP_LITTER_CARBON_OFFSET
#define STEP_LITTER_CARBON_NEXT STEP_LITTER_CARBON_NEXT_OFFSET
#define STEP_LITTER_FAST_CARBON STEP_LITTER_FAST_CARBON_OFFSET
#define STEP_LITTER_FAST_CARBON_NEXT STEP_LITTER_FAST_CARBON_NEXT_OFFSET
#define STEP_LITTER_SLOW_CARBON STEP_LITTER_SLOW_CARBON_OFFSET
#define STEP_LITTER_SLOW_CARBON_NEXT STEP_LITTER_SLOW_CARBON_NEXT_OFFSET
#define STEP_MB STEP_MB_OFFSET
#define STEP_MB_NEXT STEP_MB_NEXT_OFFSET
#define STEP_MOBILE_NUTRIENT STEP_MOBILE_NUTRIENT_OFFSET
#define STEP_MR STEP_MR_OFFSET
#define STEP_MR_NEXT STEP_MR_NEXT_OFFSET
#define STEP_PAR STEP_PAR_OFFSET
#define STEP_PHOTO_NUTRIENT_BAOBAB STEP_PHOTO_NUTRIENT_BAOBAB_OFFSET
#define STEP_PHOTO_NUTRIENT_ROSE STEP_PHOTO_NUTRIENT_ROSE_OFFSET
#define STEP_PHOTO_WATER_STRESS_BAOBAB STEP_PHOTO_WATER_STRESS_BAOBAB_OFFSET
#define STEP_PHOTO_WATER_STRESS_ROSE STEP_PHOTO_WATER_STRESS_ROSE_OFFSET
#define STEP_R STEP_R_OFFSET
#define STEP_RAIN_MEMORY STEP_RAIN_MEMORY_OFFSET
#define STEP_SNOW_ICE_M STEP_SNOW_ICE_M_OFFSET
#define STEP_RAIN_CLIMATOLOGY STEP_RAIN_CLIMATOLOGY_OFFSET
#define STEP_RAIN_MID_LATITUDE STEP_RAIN_MID_LATITUDE_OFFSET
#define STEP_RAIN_TROPICS STEP_RAIN_TROPICS_OFFSET
#define STEP_RAIN_WEAK_BACKGROUND STEP_RAIN_WEAK_BACKGROUND_OFFSET
#define STEP_RAIN_X STEP_RAIN_X_OFFSET
#define STEP_RAIN_Y STEP_RAIN_Y_OFFSET
#define STEP_ROOT_STRESS_BAOBAB STEP_ROOT_STRESS_BAOBAB_OFFSET
#define STEP_ROOT_STRESS_ROSE STEP_ROOT_STRESS_ROSE_OFFSET
#define STEP_SLOW_ENV_ASH_STRESS STEP_SLOW_ENV_ASH_STRESS_OFFSET
#define STEP_SLOW_ENV_CANOPY_LIGHT_BAOBAB STEP_SLOW_ENV_CANOPY_LIGHT_BAOBAB_OFFSET
#define STEP_SLOW_ENV_CANOPY_LIGHT_ROSE STEP_SLOW_ENV_CANOPY_LIGHT_ROSE_OFFSET
#define STEP_SLOW_ENV_GPP_BAOBAB STEP_SLOW_ENV_GPP_BAOBAB_OFFSET
#define STEP_SLOW_ENV_GPP_ROSE STEP_SLOW_ENV_GPP_ROSE_OFFSET
#define STEP_SLOW_ENV_GROUNDWATER_SAT STEP_SLOW_ENV_GROUNDWATER_SAT_OFFSET
#define STEP_SLOW_ENV_LIGHT_BAOBAB STEP_SLOW_ENV_LIGHT_BAOBAB_OFFSET
#define STEP_SLOW_ENV_LIGHT_ROSE STEP_SLOW_ENV_LIGHT_ROSE_OFFSET
#define STEP_SLOW_ENV_ROOT_STRESS_BAOBAB STEP_SLOW_ENV_ROOT_STRESS_BAOBAB_OFFSET
#define STEP_SLOW_ENV_ROOT_STRESS_ROSE STEP_SLOW_ENV_ROOT_STRESS_ROSE_OFFSET
#define STEP_SLOW_ENV_SURFACE_TEMP_C STEP_SLOW_ENV_SURFACE_TEMP_C_OFFSET
#define STEP_SLOW_ENV_TOP_SAT STEP_SLOW_ENV_TOP_SAT_OFFSET
#define STEP_SLOW_ENV_VEGETATION_COVER STEP_SLOW_ENV_VEGETATION_COVER_OFFSET
#define STEP_SLOW_ENV_WETNESS STEP_SLOW_ENV_WETNESS_OFFSET
#define STEP_SLOW_STEP_PHASE_OUT STEP_SLOW_STEP_PHASE_OUT_OFFSET
#define STEP_ROSE_FERTILITY STEP_ROSE_FERTILITY_OFFSET
#define STEP_ROSE_FLOWER STEP_ROSE_FLOWER_OFFSET
#define STEP_ROSE_FLOWER_NEXT STEP_ROSE_FLOWER_NEXT_OFFSET
#define STEP_ROSE_GAMMA_STAR STEP_ROSE_GAMMA_STAR_OFFSET
#define STEP_ROSE_JMAX STEP_ROSE_JMAX_OFFSET
#define STEP_ROSE_KC STEP_ROSE_KC_OFFSET
#define STEP_ROSE_KO STEP_ROSE_KO_OFFSET
#define STEP_ROSE_LEAF STEP_ROSE_LEAF_OFFSET
#define STEP_ROSE_LEAF_NEXT STEP_ROSE_LEAF_NEXT_OFFSET
#define STEP_ROSE_RD STEP_ROSE_RD_OFFSET
#define STEP_ROSE_RESPIRATION_Q10 STEP_ROSE_RESPIRATION_Q10_OFFSET
#define STEP_ROSE_READINESS STEP_ROSE_READINESS_OFFSET
#define STEP_ROSE_READINESS_NEXT STEP_ROSE_READINESS_NEXT_OFFSET
#define STEP_ROSE_ROOT STEP_ROSE_ROOT_OFFSET
#define STEP_ROSE_ROOT_NEXT STEP_ROSE_ROOT_NEXT_OFFSET
#define STEP_ROSE_SEED STEP_ROSE_SEED_OFFSET
#define STEP_ROSE_SEED_ARRIVAL STEP_ROSE_SEED_ARRIVAL_OFFSET
#define STEP_ROSE_SEED_ARRIVAL_THREAD STEP_ROSE_SEED_ARRIVAL_THREAD_OFFSET
#define STEP_ROSE_SEED_NEXT STEP_ROSE_SEED_NEXT_OFFSET
#define STEP_ROSE_SEED_PRODUCTION STEP_ROSE_SEED_PRODUCTION_OFFSET
#define STEP_ROSE_SEED_TRANSPORT STEP_ROSE_SEED_TRANSPORT_OFFSET
#define STEP_ROSE_STORE STEP_ROSE_STORE_OFFSET
#define STEP_ROSE_STORE_NEXT STEP_ROSE_STORE_NEXT_OFFSET
#define STEP_ROSE_VCMAX STEP_ROSE_VCMAX_OFFSET
#define STEP_SB STEP_SB_OFFSET
#define STEP_SB_NEXT STEP_SB_NEXT_OFFSET
#define STEP_SLOPE_X STEP_SLOPE_X_OFFSET
#define STEP_SLOPE_Y STEP_SLOPE_Y_OFFSET
#define STEP_SOIL_BIO_ASH_LOAD STEP_SOIL_BIO_ASH_LOAD_OFFSET
#define STEP_SOIL_BIO_GROUNDWATER_SAT STEP_SOIL_BIO_GROUNDWATER_SAT_OFFSET
#define STEP_SOIL_BIO_LITTER_FAST_INPUT STEP_SOIL_BIO_LITTER_FAST_INPUT_OFFSET
#define STEP_SOIL_BIO_LITTER_SLOW_INPUT STEP_SOIL_BIO_LITTER_SLOW_INPUT_OFFSET
#define STEP_SOIL_BIO_PLANT_NUTRIENT_UPTAKE STEP_SOIL_BIO_PLANT_NUTRIENT_UPTAKE_OFFSET
#define STEP_SOIL_BIO_TEMP_C STEP_SOIL_BIO_TEMP_C_OFFSET
#define STEP_SOIL_BIO_TOP_SAT STEP_SOIL_BIO_TOP_SAT_OFFSET
#define STEP_SOIL_BIO_WETNESS STEP_SOIL_BIO_WETNESS_OFFSET
#define STEP_SOIL_CAP STEP_SOIL_CAP_OFFSET
#define STEP_SOIL_CARBON_ACTIVE STEP_SOIL_CARBON_ACTIVE_OFFSET
#define STEP_SOIL_CARBON_ACTIVE_NEXT STEP_SOIL_CARBON_ACTIVE_NEXT_OFFSET
#define STEP_SOIL_CARBON_STABLE STEP_SOIL_CARBON_STABLE_OFFSET
#define STEP_SOIL_CARBON_STABLE_NEXT STEP_SOIL_CARBON_STABLE_NEXT_OFFSET
#define STEP_SOIL_CENTER_DEPTH STEP_SOIL_CENTER_DEPTH_OFFSET
#define STEP_SOIL_HEAD STEP_SOIL_HEAD_OFFSET
#define STEP_SOIL_HYDRAULIC_K STEP_SOIL_HYDRAULIC_K_OFFSET
#define STEP_SOIL_MINERAL_N STEP_SOIL_MINERAL_N_OFFSET
#define STEP_SOIL_MINERAL_N_NEXT STEP_SOIL_MINERAL_N_NEXT_OFFSET
#define STEP_SOIL_MINERAL_TRANSPORT STEP_SOIL_MINERAL_TRANSPORT_OFFSET
#define STEP_SOIL_RESIDUAL STEP_SOIL_RESIDUAL_OFFSET
#define STEP_SOIL_THICKNESS STEP_SOIL_THICKNESS_OFFSET
#define STEP_SOIL_TRANSMISSIVITY STEP_SOIL_TRANSMISSIVITY_OFFSET
#define STEP_SOIL_TRANSPORT STEP_SOIL_TRANSPORT_OFFSET
#define STEP_SOIL_WATER STEP_SOIL_WATER_OFFSET
#define STEP_SOIL_WATER_NEXT STEP_SOIL_WATER_NEXT_OFFSET
#define STEP_STENCIL STEP_STENCIL_OFFSET
#define STEP_STOMATAL_CONDUCTANCE_BAOBAB STEP_STOMATAL_CONDUCTANCE_BAOBAB_OFFSET
#define STEP_STOMATAL_CONDUCTANCE_ROSE STEP_STOMATAL_CONDUCTANCE_ROSE_OFFSET
#define STEP_SUBSTRATE STEP_SUBSTRATE_OFFSET
#define STEP_SUNLIGHT STEP_SUNLIGHT_OFFSET
#define STEP_SURFACE_TEMP_C STEP_SURFACE_TEMP_C_OFFSET
#define STEP_SURFACE_UX STEP_SURFACE_UX_OFFSET
#define STEP_SURFACE_UY STEP_SURFACE_UY_OFFSET
#define STEP_TOP_SOIL_UX STEP_TOP_SOIL_UX_OFFSET
#define STEP_TOP_SOIL_UY STEP_TOP_SOIL_UY_OFFSET
#define STEP_TRANSPORT_BLOCK_CELL_IDS STEP_TRANSPORT_BLOCK_CELL_IDS_OFFSET
#define STEP_TRANSPORT_BLOCK_CELL_OFFSETS STEP_TRANSPORT_BLOCK_CELL_OFFSETS_OFFSET
#define STEP_TRANSPORT_BLOCK_HALO_IDS STEP_TRANSPORT_BLOCK_HALO_IDS_OFFSET
#define STEP_TRANSPORT_BLOCK_HALO_OFFSETS STEP_TRANSPORT_BLOCK_HALO_OFFSETS_OFFSET
#define STEP_TRANSPORT_BLOCK_LOCAL_STENCIL STEP_TRANSPORT_BLOCK_LOCAL_STENCIL_OFFSET
#define STEP_TRANSPORT_BLOCK_SCRATCH STEP_TRANSPORT_BLOCK_SCRATCH_OFFSET
#define STEP_TROPICAL_AMP STEP_TROPICAL_AMP_OFFSET
#define STEP_TROPICAL_CORE_AMP STEP_TROPICAL_CORE_AMP_OFFSET
#define STEP_TROPICAL_CORE_RADIUS STEP_TROPICAL_CORE_RADIUS_OFFSET
#define STEP_TROPICAL_RADIUS STEP_TROPICAL_RADIUS_OFFSET
#define STEP_TROPICAL_X STEP_TROPICAL_X_OFFSET
#define STEP_TROPICAL_Y STEP_TROPICAL_Y_OFFSET
#define STEP_VAPOR_SLOPE_KPA_C STEP_VAPOR_SLOPE_KPA_C_OFFSET
#define STEP_VEGETATION_COVER STEP_VEGETATION_COVER_OFFSET
#define STEP_VPD_KPA STEP_VPD_KPA_OFFSET
#define STEP_W0 STEP_W0_OFFSET
#define STEP_W1 STEP_W1_OFFSET

#define SPI(name) ((int32_t)params[STEP_##name])
#define SPU(name) sim_param_offset(params, STEP_##name)
#define SPF(name) sim_param_float(params, STEP_##name)

static void sim_partition_earth_precipitation_phase_range_from_params(const uint32_t *params, int32_t start, int32_t end);

static void sim_accumulate_slow_environment_range_from_params(
  const uint32_t *params,
  int32_t start,
  int32_t end,
  int32_t reset_window
) {
  const int32_t size = SPI(SIZE);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  if (end <= start) {
    return;
  }

  const int32_t size2 = size * 2;
  const float *SIM_RESTRICT gpp_baobab = (const float *)(uintptr_t)SPU(GPP_BAOBAB);
  const float *SIM_RESTRICT gpp_rose = (const float *)(uintptr_t)SPU(GPP_ROSE);
  const float *SIM_RESTRICT root_stress_baobab = (const float *)(uintptr_t)SPU(ROOT_STRESS_BAOBAB);
  const float *SIM_RESTRICT root_stress_rose = (const float *)(uintptr_t)SPU(ROOT_STRESS_ROSE);
  const float *SIM_RESTRICT canopy_light_baobab = (const float *)(uintptr_t)SPU(CANOPY_LIGHT_BAOBAB);
  const float *SIM_RESTRICT canopy_light_rose = (const float *)(uintptr_t)SPU(CANOPY_LIGHT_ROSE);
  const float *SIM_RESTRICT light_baobab = (const float *)(uintptr_t)SPU(LIGHT_BAOBAB);
  const float *SIM_RESTRICT light_rose = (const float *)(uintptr_t)SPU(LIGHT_ROSE);
  const float *SIM_RESTRICT vegetation_cover = (const float *)(uintptr_t)SPU(VEGETATION_COVER);
  const float *SIM_RESTRICT surface_temp_c = (const float *)(uintptr_t)SPU(SURFACE_TEMP_C);
  const float *SIM_RESTRICT ash_stress = (const float *)(uintptr_t)SPU(ASH_STRESS);
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  float *SIM_RESTRICT slow_gpp_baobab = (float *)(uintptr_t)SPU(SLOW_ENV_GPP_BAOBAB);
  float *SIM_RESTRICT slow_gpp_rose = (float *)(uintptr_t)SPU(SLOW_ENV_GPP_ROSE);
  float *SIM_RESTRICT slow_root_stress_baobab = (float *)(uintptr_t)SPU(SLOW_ENV_ROOT_STRESS_BAOBAB);
  float *SIM_RESTRICT slow_root_stress_rose = (float *)(uintptr_t)SPU(SLOW_ENV_ROOT_STRESS_ROSE);
  float *SIM_RESTRICT slow_canopy_light_baobab = (float *)(uintptr_t)SPU(SLOW_ENV_CANOPY_LIGHT_BAOBAB);
  float *SIM_RESTRICT slow_canopy_light_rose = (float *)(uintptr_t)SPU(SLOW_ENV_CANOPY_LIGHT_ROSE);
  float *SIM_RESTRICT slow_light_baobab = (float *)(uintptr_t)SPU(SLOW_ENV_LIGHT_BAOBAB);
  float *SIM_RESTRICT slow_light_rose = (float *)(uintptr_t)SPU(SLOW_ENV_LIGHT_ROSE);
  float *SIM_RESTRICT slow_vegetation_cover = (float *)(uintptr_t)SPU(SLOW_ENV_VEGETATION_COVER);
  float *SIM_RESTRICT slow_surface_temp_c = (float *)(uintptr_t)SPU(SLOW_ENV_SURFACE_TEMP_C);
  float *SIM_RESTRICT slow_ash_stress = (float *)(uintptr_t)SPU(SLOW_ENV_ASH_STRESS);
  float *SIM_RESTRICT slow_wetness = (float *)(uintptr_t)SPU(SLOW_ENV_WETNESS);
  float *SIM_RESTRICT slow_top_sat = (float *)(uintptr_t)SPU(SLOW_ENV_TOP_SAT);
  float *SIM_RESTRICT slow_groundwater_sat = (float *)(uintptr_t)SPU(SLOW_ENV_GROUNDWATER_SAT);

  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    const float cap0 = soil_cap[i] > 1.0e-12f ? soil_cap[i] : 1.0f;
    const float cap1 = soil_cap[size + i] > 1.0e-12f ? soil_cap[size + i] : 1.0f;
    const float cap2 = soil_cap[size2 + i] > 1.0e-12f ? soil_cap[size2 + i] : 1.0f;
    const float gw_cap = groundwater_cap[i] > 1.0e-12f ? groundwater_cap[i] : 1.0f;
    const float top_sat = sim_clamp(soil_water[i] / cap0, 0.0f, 1.0f);
    const float mid_sat = sim_clamp(soil_water[size + i] / cap1, 0.0f, 1.0f);
    const float deep_sat = sim_clamp(soil_water[size2 + i] / cap2, 0.0f, 1.0f);
    const float groundwater_sat = sim_clamp(groundwater_storage[i] / gw_cap, 0.0f, 1.0f);
    const float wetness = sim_clamp(0.45f * top_sat + 0.25f * mid_sat + 0.18f * deep_sat + 0.12f * groundwater_sat, 0.0f, 1.0f);

    if (reset_window) {
      slow_gpp_baobab[i] = 0.0f;
      slow_gpp_rose[i] = 0.0f;
      slow_root_stress_baobab[i] = 0.0f;
      slow_root_stress_rose[i] = 0.0f;
      slow_canopy_light_baobab[i] = 0.0f;
      slow_canopy_light_rose[i] = 0.0f;
      slow_light_baobab[i] = 0.0f;
      slow_light_rose[i] = 0.0f;
      slow_vegetation_cover[i] = 0.0f;
      slow_surface_temp_c[i] = 0.0f;
      slow_ash_stress[i] = 0.0f;
      slow_wetness[i] = 0.0f;
      slow_top_sat[i] = 0.0f;
      slow_groundwater_sat[i] = 0.0f;
    }

    slow_gpp_baobab[i] += gpp_baobab[i];
    slow_gpp_rose[i] += gpp_rose[i];
    slow_root_stress_baobab[i] += root_stress_baobab[i];
    slow_root_stress_rose[i] += root_stress_rose[i];
    slow_canopy_light_baobab[i] += canopy_light_baobab[i];
    slow_canopy_light_rose[i] += canopy_light_rose[i];
    slow_light_baobab[i] += light_baobab[i];
    slow_light_rose[i] += light_rose[i];
    slow_vegetation_cover[i] += vegetation_cover[i];
    slow_surface_temp_c[i] += surface_temp_c[i];
    slow_ash_stress[i] += ash_stress[i];
    slow_wetness[i] += wetness;
    slow_top_sat[i] += top_sat;
    slow_groundwater_sat[i] += groundwater_sat;
  }
}

static void sim_richards_columns_update_hydraulic_from_params(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_ids_offset
);

static void sim_produce_and_distribute_baobab_seeds_from_params(
  uint32_t *params,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float slow_env_inv_count
);

SIM_EXPORT void sim_step_ecosystem(uintptr_t params_offset) {
  const uint32_t *params = (const uint32_t *)(uintptr_t)params_offset;
  const int32_t size = SPI(SIZE);
  const int32_t active_count = SPI(ACTIVE_COUNT) > 0 ? SPI(ACTIVE_COUNT) : size;
  const uintptr_t active_offset = SPU(ACTIVE_OFFSET);
  const int32_t rbf_m = SPI(RBF_M);
  uint32_t rng_state = (uint32_t)SPI(RNG_STATE);
  const float model_dt_days = SPF(MODEL_DT_DAYS);
  const uintptr_t sunlight_normal_xyz_offset = sim_param_offset(params, STEP_SUNLIGHT_NORMAL_XYZ_OFFSET);
  if (sunlight_normal_xyz_offset && SPI(SUNLIGHT_ROSE_CELL) >= 0 && SPI(SUNLIGHT_SAMPLE_COUNT) > 0) {
    sim_update_sunlight_field(
      size,
      sunlight_normal_xyz_offset,
      SPU(SUNLIGHT),
      SPI(SUNLIGHT_ROSE_CELL),
      SPF(SUNLIGHT_TURN),
      SPF(SUNLIGHT_TURNS_PER_DAY),
      SPF(SUNLIGHT_MODEL_TIME_OFFSET_DAYS),
      SPF(SUNLIGHT_MODEL_DURATION_DAYS),
      SPI(SUNLIGHT_SAMPLE_COUNT)
    );
  }

  const float mean_rain =
    sim_seasonal_rain(SPI(IS_EARTH), SPF(ANNUAL_PRECIP_MM), SPF(DRY_DAYS), SPF(DAY), model_dt_days, &rng_state);
  float *last_rain_out = (float *)(uintptr_t)SPU(LAST_RAIN_OUT_OFFSET);
  if (last_rain_out) {
    *last_rain_out = mean_rain;
  }

  if (SPI(IS_EARTH)) {
    if (SPF(RAIN_PATCHINESS) < 0.01f) {
      const float *SIM_RESTRICT rain_climatology = (const float *)(uintptr_t)SPU(RAIN_CLIMATOLOGY);
      float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);
      SIM_VECTORIZE_LOOP
      for (int32_t i = 0; i < size; i += 1) {
        rain[i] = sim_max(0.0f, rain_climatology[i]) * mean_rain;
      }
    } else {
      sim_update_earth_rain_generated(
        size,
        mean_rain,
        SPF(DAY),
        SPF(RAIN_RENDER_SIZE),
        SPF(RAIN_PATCHINESS),
        SPF(RAIN_SCALE),
        SPU(RAIN_X),
        SPU(RAIN_Y),
        SPU(RAIN_TROPICS),
        SPU(RAIN_MID_LATITUDE),
        SPU(RAIN_WEAK_BACKGROUND),
        SPU(RAIN_CLIMATOLOGY),
        SPU(R)
      );
    }
  } else {
    sim_update_asteroid_dayside_rain(
      size,
      mean_rain,
      SPF(DAY),
      SPF(RAIN_RENDER_SIZE),
      SPF(RAIN_SCALE),
      SPF(RAIN_PATCHINESS),
      SPI(ASTEROID_CLOUD_COUNT),
      SPU(RAIN_X),
      SPU(RAIN_Y),
      SPU(SUNLIGHT),
      SPU(R)
    );
  }

  sim_update_rain_memory(size, SPF(RAIN_AVERAGE_WEIGHT), SPU(R), SPU(RAIN_MEMORY));
  if (SPI(IS_EARTH)) {
    sim_partition_earth_precipitation_phase_range_from_params(params, 0, size);
  }

  if (!SPI(HYDRAULIC_STATE_CURRENT)) {
    sim_update_hydraulic_state(
      size,
      active_count,
      active_offset,
      SPI(HYDRAULIC_LOOKUP_STEPS),
      SPF(GROUNDWATER_FLOW_MULTIPLIER),
      SPU(HYDRAULIC_PSI),
      SPU(HYDRAULIC_RELATIVE_K),
      SPU(GROUNDWATER_POW17),
      SPU(SUBSTRATE),
      SPU(ELEVATION),
      SPU(SOIL_WATER),
      SPU(SOIL_CAP),
      SPU(SOIL_CENTER_DEPTH),
      SPU(SOIL_THICKNESS),
      SPU(GROUNDWATER_STORAGE),
      SPU(GROUNDWATER_CAP),
      SPU(GROUNDWATER_THICKNESS),
      SPU(GROUNDWATER_TOP_DEPTH),
      SPU(W0),
      SPU(W1),
      SPU(SOIL_HEAD),
      SPU(SOIL_HYDRAULIC_K),
      SPU(SOIL_TRANSMISSIVITY),
      SPU(GROUNDWATER_HEAD),
      SPU(GROUNDWATER_T)
    );
  }

  if (active_offset) {
    sim_fill_float(SPU(SOIL_TRANSPORT), size * 3, 0.0f);
    sim_fill_float(SPU(GROUNDWATER_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(H_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(SOIL_MINERAL_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(BAOBAB_SEED_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(ROSE_SEED_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(SURFACE_UX), size, 0.0f);
    sim_fill_float(SPU(SURFACE_UY), size, 0.0f);
    sim_fill_float(SPU(TOP_SOIL_UX), size, 0.0f);
    sim_fill_float(SPU(TOP_SOIL_UY), size, 0.0f);
    sim_fill_float(SPU(GROUNDWATER_UX), size, 0.0f);
    sim_fill_float(SPU(GROUNDWATER_UY), size, 0.0f);
    sim_fill_float(SPU(FLUX_X), size, 0.0f);
    sim_fill_float(SPU(FLUX_Y), size, 0.0f);
  }

  sim_transport_darcy_water_columns(
    size,
    rbf_m,
    active_count,
    active_offset,
    model_dt_days,
    SPF(CELL_SIZE_M),
    SPF(SURFACE_WATER_DIFF_M2_DAY),
    SPF(SURFACE_SLOPE_VELOCITY_M_DAY),
    SPF(SURFACE_SLOPE_MAX_VELOCITY_M_DAY),
    SPF(NUTRIENT_DIFF_M2_DAY),
    SPF(BAOBAB_SEED_DIFFUSION_M2_DAY),
    SPF(ROSE_SEED_DIFFUSION_M2_DAY),
    SPU(STENCIL),
    SPU(LAP),
	    SPU(GX),
	    SPU(GY),
	    SPU(H),
	    SPU(ELEVATION),
	    SPU(SOIL_WATER),
    SPU(SOIL_HEAD),
    SPU(SOIL_TRANSMISSIVITY),
    SPU(SOIL_RESIDUAL),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(GROUNDWATER_HEAD),
    SPU(GROUNDWATER_T),
    SPU(SOIL_MINERAL_N),
    SPU(SOIL_CARBON_ACTIVE),
    SPU(SOIL_CARBON_STABLE),
    SPU(MOBILE_NUTRIENT),
    SPU(BAOBAB_SEED),
    SPU(ROSE_SEED),
    SPU(SLOPE_X),
    SPU(SLOPE_Y),
    SPU(SOIL_TRANSPORT),
    SPU(GROUNDWATER_TRANSPORT),
    SPU(H_TRANSPORT),
    SPU(SOIL_MINERAL_TRANSPORT),
    SPU(BAOBAB_SEED_TRANSPORT),
    SPU(ROSE_SEED_TRANSPORT),
    SPU(SURFACE_UX),
    SPU(SURFACE_UY),
    SPU(TOP_SOIL_UX),
    SPU(TOP_SOIL_UY),
    SPU(GROUNDWATER_UX),
    SPU(GROUNDWATER_UY),
    1,
    SPF(SURFACE_FILM_THRESHOLD_M),
    SPU(FLUX_X),
    SPU(FLUX_Y)
  );
  sim_apply_nutrient_transport_active(
    active_count,
    active_offset,
    model_dt_days,
    (float *)(uintptr_t)SPU(SOIL_MINERAL_N),
    (const float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT),
    (const float *)(uintptr_t)SPU(ROSE_FERTILITY)
  );

  sim_update_canopy_environment_photosynthesis(
    size,
    active_count,
    active_offset,
    SPI(IS_EARTH),
    SPF(ASTEROID_MEAN_TEMP_C),
    SPF(ASTEROID_DIURNAL_RANGE_C),
    SPF(ASTEROID_LATITUDE_TEMP_RANGE_C),
    SPF(SHADE),
    SPI(HYDRAULIC_LOOKUP_STEPS),
    SPI(PHOTO_LOOKUP_STEPS),
    SPF(PHOTO_TEMP_MIN_C),
    SPF(PHOTO_TEMP_LOOKUP_SCALE),
    SPF(ROOT_DEPTH),
    SPF(STORAGE),
    SPF(ATMOSPHERIC_CO2),
    SPF(BAOBAB_QUANTUM_YIELD),
    SPF(BAOBAB_CURVATURE),
    SPF(BAOBAB_CI_MIN),
    SPF(BAOBAB_CI_MAX),
    SPF(BAOBAB_EXTINCTION),
    SPF(BAOBAB_G0_MOL),
    SPF(BAOBAB_G1),
    SPF(BAOBAB_MAX_CONDUCTANCE_MPS),
    SPF(BAOBAB_MULTIPLIER),
    SPF(ROSE_QUANTUM_YIELD),
    SPF(ROSE_CURVATURE),
    SPF(ROSE_CI_MIN),
    SPF(ROSE_CI_MAX),
    SPF(ROSE_EXTINCTION),
    SPF(ROSE_G0_MOL),
    SPF(ROSE_G1),
    SPF(ROSE_MAX_CONDUCTANCE_MPS),
    SPF(ROSE_MULTIPLIER),
    SPU(HYDRAULIC_PSI),
    SPU(BAOBAB_VCMAX),
    SPU(BAOBAB_JMAX),
    SPU(BAOBAB_RD),
    SPU(BAOBAB_GAMMA_STAR),
    SPU(BAOBAB_KC),
    SPU(BAOBAB_KO),
    SPU(ROSE_VCMAX),
    SPU(ROSE_JMAX),
    SPU(ROSE_RD),
    SPU(ROSE_GAMMA_STAR),
    SPU(ROSE_KC),
    SPU(ROSE_KO),
    SPU(CELL_HEIGHT),
    SPU(CLIMATE_MEAN_TEMP_C),
    SPU(CLIMATE_DIURNAL_RANGE_C),
    SPU(ELEVATION),
    SPU(BAOBAB_BLOCKED),
    SPU(SUBSTRATE),
    SPU(SOIL_WATER),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(H),
    SPU(R),
    SPU(W0),
    SPU(W1),
    SPU(SUNLIGHT),
    SPU(BAOBAB_LEAF),
    SPU(BAOBAB_STEM),
    SPU(BAOBAB_ROOT),
    SPU(BAOBAB_STORE),
    SPU(ROSE_LEAF),
    SPU(ROSE_FLOWER),
    SPU(ROSE_ROOT),
    SPU(ROSE_STORE),
    SPU(BAOBAB_SEED),
    SPU(ROSE_SEED),
    SPU(BAOBAB_SEED_TRANSPORT),
    SPU(ROSE_SEED_TRANSPORT),
    SPU(ROSE_SEED_ARRIVAL),
    SPU(ROSE_FERTILITY),
    SPU(SOIL_MINERAL_N),
    SPU(LAI_BAOBAB),
    SPU(LAI_ROSE),
    SPU(COVER_BAOBAB),
    SPU(COVER_ROSE),
    SPU(VEGETATION_COVER),
    SPU(CANOPY_LIGHT_BAOBAB),
    SPU(CANOPY_LIGHT_ROSE),
    SPU(LIGHT_BAOBAB),
    SPU(LIGHT_ROSE),
    SPU(SURFACE_TEMP_C),
    SPU(VPD_KPA),
    SPU(VAPOR_SLOPE_KPA_C),
    SPU(PAR),
    SPU(APAR_TOTAL),
    SPU(APAR_BAOBAB),
    SPU(APAR_ROSE),
    SPU(PHOTO_WATER_STRESS_BAOBAB),
    SPU(PHOTO_WATER_STRESS_ROSE),
    SPU(PHOTO_NUTRIENT_BAOBAB),
    SPU(PHOTO_NUTRIENT_ROSE),
    SPU(GPP_BAOBAB),
    SPU(GPP_ROSE),
    SPU(STOMATAL_CONDUCTANCE_BAOBAB),
    SPU(STOMATAL_CONDUCTANCE_ROSE),
    SPU(CI_BAOBAB),
    SPU(CI_ROSE)
  );

  sim_update_plant_water_fluxes(
    size,
    active_count,
    active_offset,
    SPI(HYDRAULIC_LOOKUP_STEPS),
    SPI(PHOTO_LOOKUP_STEPS),
    SPF(PHOTO_TEMP_MIN_C),
    SPF(PHOTO_TEMP_LOOKUP_SCALE),
    SPF(ROOT_DEPTH),
    SPF(EVAPORATION),
    SPF(ATMOSPHERIC_CO2),
    SPF(BAOBAB_MULTIPLIER),
    SPF(ROSE_MULTIPLIER),
    SPF(BAOBAB_QUANTUM_YIELD),
    SPF(BAOBAB_CURVATURE),
    SPF(BAOBAB_CI_MIN),
    SPF(BAOBAB_CI_MAX),
    SPF(BAOBAB_EXTINCTION),
    SPF(BAOBAB_G0_MOL),
    SPF(BAOBAB_G1),
    SPF(BAOBAB_MAX_CONDUCTANCE_MPS),
    SPF(ROSE_QUANTUM_YIELD),
    SPF(ROSE_CURVATURE),
    SPF(ROSE_CI_MIN),
    SPF(ROSE_CI_MAX),
    SPF(ROSE_EXTINCTION),
    SPF(ROSE_G0_MOL),
    SPF(ROSE_G1),
    SPF(ROSE_MAX_CONDUCTANCE_MPS),
    SPU(HYDRAULIC_PSI),
    SPU(BAOBAB_VCMAX),
    SPU(BAOBAB_JMAX),
    SPU(BAOBAB_RD),
    SPU(BAOBAB_GAMMA_STAR),
    SPU(BAOBAB_KC),
    SPU(BAOBAB_KO),
    SPU(ROSE_VCMAX),
    SPU(ROSE_JMAX),
    SPU(ROSE_RD),
    SPU(ROSE_GAMMA_STAR),
    SPU(ROSE_KC),
    SPU(ROSE_KO),
    SPU(SUBSTRATE),
    SPU(SOIL_WATER),
    SPU(SOIL_CAP),
    SPU(SOIL_HYDRAULIC_K),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(GROUNDWATER_T),
    SPU(GROUNDWATER_THICKNESS),
    SPU(H),
    SPU(R),
    SPU(CANOPY_WATER),
    SPU(CANOPY_WATER_NEXT),
    SPU(CANOPY_EVAP_M),
    SPU(BAOBAB_LEAF),
    SPU(BAOBAB_STEM),
    SPU(BAOBAB_ROOT),
    SPU(ROSE_LEAF),
    SPU(ROSE_FLOWER),
    SPU(ROSE_ROOT),
    SPU(PAR),
    SPU(SURFACE_TEMP_C),
    SPU(VPD_KPA),
    SPU(VAPOR_SLOPE_KPA_C),
    SPU(LAI_BAOBAB),
    SPU(LAI_ROSE),
    SPU(VEGETATION_COVER),
    SPU(LIGHT_BAOBAB),
    SPU(LIGHT_ROSE),
    SPU(APAR_BAOBAB),
    SPU(APAR_ROSE),
    SPU(PHOTO_WATER_STRESS_BAOBAB),
    SPU(PHOTO_WATER_STRESS_ROSE),
    SPU(PHOTO_NUTRIENT_BAOBAB),
    SPU(PHOTO_NUTRIENT_ROSE),
    SPU(GPP_BAOBAB),
    SPU(GPP_ROSE),
    SPU(STOMATAL_CONDUCTANCE_BAOBAB),
    SPU(STOMATAL_CONDUCTANCE_ROSE),
    SPU(CI_BAOBAB),
    SPU(CI_ROSE),
    SPU(ROOT_STRESS_BAOBAB),
    SPU(ROOT_STRESS_ROSE),
    SPU(HYDROLOGY_THROUGHFALL),
    SPU(HYDROLOGY_VEG_FEEDBACK),
    SPU(HYDROLOGY_SINK0),
    SPU(HYDROLOGY_SINK1),
    SPU(HYDROLOGY_SINK2),
    SPU(HYDROLOGY_GROUNDWATER_SINK),
    SPU(HYDROLOGY_SURFACE_EVAP_DEMAND_M)
  );

  sim_fill_float(SPU(BAOBAB_SEED_TRANSPORT), size, 0.0f);
  sim_produce_and_distribute_baobab_seeds_from_params((uint32_t *)(uintptr_t)params, active_count, active_offset, 0.0f);
  rng_state = (uint32_t)SPI(RNG_STATE);
  sim_fill_float(SPU(ROSE_SEED_PRODUCTION), size, 0.0f);
  sim_fill_float(SPU(ROSE_SEED_ARRIVAL), size, 0.0f);
  sim_produce_and_distribute_rose_seeds(
    size,
    active_count,
    active_offset,
    SPI(IS_EARTH),
    SPF(ASTEROID_MEAN_TEMP_C),
    SPF(ASTEROID_DIURNAL_RANGE_C),
    SPF(ASTEROID_LATITUDE_TEMP_RANGE_C),
    SPF(SHADE),
    model_dt_days,
    SPI(ROSE_COHORTS),
    SPU(DISPERSAL_OFFSETS),
    SPU(DISPERSAL_TARGETS),
    SPU(DISPERSAL_WEIGHTS),
    SPU(DISPERSAL_WEIGHT_SUMS),
    SPU(CELL_HEIGHT),
    SPU(CLIMATE_MEAN_TEMP_C),
    SPU(CLIMATE_DIURNAL_RANGE_C),
    SPU(ELEVATION),
    SPU(SOIL_WATER),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(H),
    SPU(R),
    SPU(SUNLIGHT),
    SPU(BAOBAB_LEAF),
    SPU(ROSE_LEAF),
    SPU(ROSE_FLOWER),
    SPU(ROSE_ROOT),
    SPU(ROSE_STORE),
    SPU(GPP_ROSE),
    SPU(ROSE_FERTILITY),
    SPU(ROSE_SEED_PRODUCTION),
    SPU(ROSE_SEED_ARRIVAL),
    rng_state,
    SPU(RNG_STATE_OUT_OFFSET)
  );
  {
    const uint32_t *rng_state_out = (const uint32_t *)(uintptr_t)SPU(RNG_STATE_OUT_OFFSET);
    if (rng_state_out) {
      ((uint32_t *)(uintptr_t)params)[STEP_RNG_STATE] = *rng_state_out;
    }
  }

  sim_update_plant_carbon_seeds_impl(
    size,
    active_count,
    active_offset,
    model_dt_days,
    SPF(STORAGE),
    SPI(PHOTO_LOOKUP_STEPS),
    SPF(PHOTO_TEMP_MIN_C),
    SPF(PHOTO_TEMP_LOOKUP_SCALE),
    SPU(BAOBAB_RESPIRATION_Q10),
    SPU(ROSE_RESPIRATION_Q10),
    SPU(SUBSTRATE),
    SPU(BAOBAB_BLOCKED),
    SPU(SOIL_WATER),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(GPP_BAOBAB),
    SPU(GPP_ROSE),
    SPU(ROOT_STRESS_BAOBAB),
    SPU(ROOT_STRESS_ROSE),
    SPU(CANOPY_LIGHT_BAOBAB),
    SPU(CANOPY_LIGHT_ROSE),
    SPU(LIGHT_BAOBAB),
    SPU(LIGHT_ROSE),
    SPU(VEGETATION_COVER),
    SPU(SURFACE_TEMP_C),
    SPU(ASH_STRESS),
    SPU(BAOBAB_RISK),
    SPU(ROSE_FERTILITY),
    0.0f,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    SPU(BAOBAB_LEAF),
    SPU(BAOBAB_STEM),
    SPU(BAOBAB_ROOT),
    SPU(BAOBAB_STORE),
    SPU(BAOBAB_SEED),
    SPU(ROSE_LEAF),
    SPU(ROSE_FLOWER),
    SPU(ROSE_ROOT),
    SPU(ROSE_STORE),
    SPU(ROSE_SEED),
    SPU(BAOBAB_SEED_TRANSPORT),
    SPU(ROSE_SEED_TRANSPORT),
    SPU(ROSE_SEED_PRODUCTION),
    SPU(ROSE_SEED_ARRIVAL),
    SPU(BAOBAB_READINESS),
    SPU(ROSE_READINESS),
    SPU(HYDROLOGY_SINK0),
    SPU(BAOBAB_LEAF_NEXT),
    SPU(BAOBAB_STEM_NEXT),
    SPU(BAOBAB_ROOT_NEXT),
    SPU(BAOBAB_STORE_NEXT),
    SPU(BAOBAB_SEED_NEXT),
    SPU(BAOBAB_READINESS_NEXT),
    SPU(ROSE_LEAF_NEXT),
    SPU(ROSE_FLOWER_NEXT),
    SPU(ROSE_ROOT_NEXT),
    SPU(ROSE_STORE_NEXT),
    SPU(ROSE_SEED_NEXT),
    SPU(ROSE_READINESS_NEXT),
    SPU(MB_NEXT),
    SPU(MR_NEXT),
    SPU(SB_NEXT),
    SPU(SOIL_BIO_WETNESS),
    SPU(SOIL_BIO_TEMP_C),
    SPU(SOIL_BIO_ASH_LOAD),
    SPU(SOIL_BIO_TOP_SAT),
    SPU(SOIL_BIO_GROUNDWATER_SAT),
    SPU(SOIL_BIO_LITTER_FAST_INPUT),
    SPU(SOIL_BIO_LITTER_SLOW_INPUT),
    SPU(SOIL_BIO_PLANT_NUTRIENT_UPTAKE),
    1,
    SPU(DEPTH),
    SPU(SOIL_MINERAL_N),
    SPU(SOIL_MINERAL_TRANSPORT),
    SPU(LITTER_CARBON),
    SPU(LITTER_FAST_CARBON),
    SPU(LITTER_SLOW_CARBON),
    SPU(SOIL_CARBON_ACTIVE),
    SPU(SOIL_CARBON_STABLE),
    SPU(LITTER_CARBON_NEXT),
    SPU(LITTER_FAST_CARBON_NEXT),
    SPU(LITTER_SLOW_CARBON_NEXT),
    SPU(SOIL_CARBON_ACTIVE_NEXT),
    SPU(SOIL_CARBON_STABLE_NEXT),
    SPU(SOIL_MINERAL_N_NEXT),
    1
  );

  sim_richards_columns_update_hydraulic_from_params(params, active_count, active_offset);
}

#define SIM_BARRIER_SPIN_LIMIT 512

static inline void sim_thread_wait_for_generation_change(int32_t *generation_ptr, int32_t generation) {
  for (int32_t spin = 0; spin < SIM_BARRIER_SPIN_LIMIT; spin += 1) {
    if (__atomic_load_n(generation_ptr, __ATOMIC_ACQUIRE) != generation) {
      return;
    }
  }
  while (__atomic_load_n(generation_ptr, __ATOMIC_ACQUIRE) == generation) {
#if defined(__wasm__) && defined(__wasm_atomics__)
    __builtin_wasm_memory_atomic_wait32(generation_ptr, generation, -1LL);
#endif
  }
}

static void sim_thread_barrier(uintptr_t barrier_offset, int32_t thread_count) {
  if (!barrier_offset || thread_count <= 1) {
    return;
  }
  int32_t *barrier = (int32_t *)(uintptr_t)barrier_offset;
  const int32_t generation = __atomic_load_n(&barrier[1], __ATOMIC_ACQUIRE);
  const int32_t arrived = __atomic_add_fetch(&barrier[0], 1, __ATOMIC_ACQ_REL);
  if (arrived == thread_count) {
    __atomic_store_n(&barrier[0], 0, __ATOMIC_RELEASE);
    __atomic_add_fetch(&barrier[1], 1, __ATOMIC_ACQ_REL);
#if defined(__wasm__) && defined(__wasm_atomics__)
    __builtin_wasm_memory_atomic_notify(&barrier[1], 2147483647);
#endif
    return;
  }
  sim_thread_wait_for_generation_change(&barrier[1], generation);
}

static int32_t sim_thread_barrier_serial_enter(uintptr_t barrier_offset, int32_t thread_count) {
  if (!barrier_offset || thread_count <= 1) {
    return 1;
  }
  int32_t *barrier = (int32_t *)(uintptr_t)barrier_offset;
  const int32_t generation = __atomic_load_n(&barrier[1], __ATOMIC_ACQUIRE);
  const int32_t arrived = __atomic_add_fetch(&barrier[0], 1, __ATOMIC_ACQ_REL);
  if (arrived == thread_count) {
    return 1;
  }
  sim_thread_wait_for_generation_change(&barrier[1], generation);
  return 0;
}

static void sim_thread_barrier_serial_leave(uintptr_t barrier_offset, int32_t thread_count) {
  if (!barrier_offset || thread_count <= 1) {
    return;
  }
  int32_t *barrier = (int32_t *)(uintptr_t)barrier_offset;
  __atomic_store_n(&barrier[0], 0, __ATOMIC_RELEASE);
  __atomic_add_fetch(&barrier[1], 1, __ATOMIC_ACQ_REL);
#if defined(__wasm__) && defined(__wasm_atomics__)
  __builtin_wasm_memory_atomic_notify(&barrier[1], 2147483647);
#endif
}

static void sim_step_ecosystem_setup_to_seed(const uint32_t *params, int32_t include_transport_and_seed) {
  const int32_t size = SPI(SIZE);
  const int32_t active_count = SPI(ACTIVE_COUNT) > 0 ? SPI(ACTIVE_COUNT) : size;
  const uintptr_t active_offset = SPU(ACTIVE_OFFSET);
  const int32_t rbf_m = SPI(RBF_M);
  const float model_dt_days = SPF(MODEL_DT_DAYS);
  uint32_t rng_state = (uint32_t)SPI(RNG_STATE);
  const uintptr_t sunlight_normal_xyz_offset = sim_param_offset(params, STEP_SUNLIGHT_NORMAL_XYZ_OFFSET);
  if (include_transport_and_seed >= 0 && sunlight_normal_xyz_offset && SPI(SUNLIGHT_ROSE_CELL) >= 0 && SPI(SUNLIGHT_SAMPLE_COUNT) > 0) {
    sim_update_sunlight_field(
      size,
      sunlight_normal_xyz_offset,
      SPU(SUNLIGHT),
      SPI(SUNLIGHT_ROSE_CELL),
      SPF(SUNLIGHT_TURN),
      SPF(SUNLIGHT_TURNS_PER_DAY),
      SPF(SUNLIGHT_MODEL_TIME_OFFSET_DAYS),
      SPF(SUNLIGHT_MODEL_DURATION_DAYS),
      SPI(SUNLIGHT_SAMPLE_COUNT)
    );
  }

  const float mean_rain =
    sim_seasonal_rain(SPI(IS_EARTH), SPF(ANNUAL_PRECIP_MM), SPF(DRY_DAYS), SPF(DAY), model_dt_days, &rng_state);
  float *last_rain_out = (float *)(uintptr_t)SPU(LAST_RAIN_OUT_OFFSET);
  if (last_rain_out) {
    *last_rain_out = mean_rain;
  }

  if (include_transport_and_seed >= 0 && SPI(IS_EARTH)) {
    if (SPF(RAIN_PATCHINESS) < 0.01f) {
      const float *SIM_RESTRICT rain_climatology = (const float *)(uintptr_t)SPU(RAIN_CLIMATOLOGY);
      float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);
      SIM_VECTORIZE_LOOP
      for (int32_t i = 0; i < size; i += 1) {
        rain[i] = sim_max(0.0f, rain_climatology[i]) * mean_rain;
      }
    } else {
      sim_update_earth_rain_generated(
        size,
        mean_rain,
        SPF(DAY),
        SPF(RAIN_RENDER_SIZE),
        SPF(RAIN_PATCHINESS),
        SPF(RAIN_SCALE),
        SPU(RAIN_X),
        SPU(RAIN_Y),
        SPU(RAIN_TROPICS),
        SPU(RAIN_MID_LATITUDE),
        SPU(RAIN_WEAK_BACKGROUND),
        SPU(RAIN_CLIMATOLOGY),
        SPU(R)
      );
    }
  } else if (include_transport_and_seed >= 0) {
    sim_update_asteroid_dayside_rain(
      size,
      mean_rain,
      SPF(DAY),
      SPF(RAIN_RENDER_SIZE),
      SPF(RAIN_SCALE),
      SPF(RAIN_PATCHINESS),
      SPI(ASTEROID_CLOUD_COUNT),
      SPU(RAIN_X),
      SPU(RAIN_Y),
      SPU(SUNLIGHT),
      SPU(R)
    );
  }

  if (include_transport_and_seed >= 0) {
    sim_update_rain_memory(size, SPF(RAIN_AVERAGE_WEIGHT), SPU(R), SPU(RAIN_MEMORY));
    if (SPI(IS_EARTH)) {
      sim_partition_earth_precipitation_phase_range_from_params(params, 0, size);
    }
  }
  ((uint32_t *)(uintptr_t)params)[STEP_RNG_STATE] = rng_state;

  if (!SPI(HYDRAULIC_STATE_CURRENT)) {
    sim_update_hydraulic_state(
      size,
      active_count,
      active_offset,
      SPI(HYDRAULIC_LOOKUP_STEPS),
      SPF(GROUNDWATER_FLOW_MULTIPLIER),
      SPU(HYDRAULIC_PSI),
      SPU(HYDRAULIC_RELATIVE_K),
      SPU(GROUNDWATER_POW17),
      SPU(SUBSTRATE),
      SPU(ELEVATION),
      SPU(SOIL_WATER),
      SPU(SOIL_CAP),
      SPU(SOIL_CENTER_DEPTH),
      SPU(SOIL_THICKNESS),
      SPU(GROUNDWATER_STORAGE),
      SPU(GROUNDWATER_CAP),
      SPU(GROUNDWATER_THICKNESS),
      SPU(GROUNDWATER_TOP_DEPTH),
      SPU(W0),
      SPU(W1),
      SPU(SOIL_HEAD),
      SPU(SOIL_HYDRAULIC_K),
      SPU(SOIL_TRANSMISSIVITY),
      SPU(GROUNDWATER_HEAD),
      SPU(GROUNDWATER_T)
    );
  }

  if (active_offset && include_transport_and_seed >= 0) {
    sim_fill_float(SPU(SOIL_TRANSPORT), size * 3, 0.0f);
    sim_fill_float(SPU(GROUNDWATER_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(H_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(SOIL_MINERAL_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(BAOBAB_SEED_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(ROSE_SEED_TRANSPORT), size, 0.0f);
    sim_fill_float(SPU(SURFACE_UX), size, 0.0f);
    sim_fill_float(SPU(SURFACE_UY), size, 0.0f);
    sim_fill_float(SPU(TOP_SOIL_UX), size, 0.0f);
    sim_fill_float(SPU(TOP_SOIL_UY), size, 0.0f);
    sim_fill_float(SPU(GROUNDWATER_UX), size, 0.0f);
    sim_fill_float(SPU(GROUNDWATER_UY), size, 0.0f);
    sim_fill_float(SPU(FLUX_X), size, 0.0f);
    sim_fill_float(SPU(FLUX_Y), size, 0.0f);
  }

  if (include_transport_and_seed <= 0) {
    return;
  }

  sim_transport_darcy_water_columns(
    size,
    rbf_m,
    active_count,
    active_offset,
    model_dt_days,
    SPF(CELL_SIZE_M),
    SPF(SURFACE_WATER_DIFF_M2_DAY),
    SPF(SURFACE_SLOPE_VELOCITY_M_DAY),
    SPF(SURFACE_SLOPE_MAX_VELOCITY_M_DAY),
    SPF(NUTRIENT_DIFF_M2_DAY),
    SPF(BAOBAB_SEED_DIFFUSION_M2_DAY),
    SPF(ROSE_SEED_DIFFUSION_M2_DAY),
    SPU(STENCIL),
    SPU(LAP),
	    SPU(GX),
	    SPU(GY),
	    SPU(H),
	    SPU(ELEVATION),
	    SPU(SOIL_WATER),
    SPU(SOIL_HEAD),
    SPU(SOIL_TRANSMISSIVITY),
    SPU(SOIL_RESIDUAL),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(GROUNDWATER_HEAD),
    SPU(GROUNDWATER_T),
    SPU(SOIL_MINERAL_N),
    SPU(SOIL_CARBON_ACTIVE),
    SPU(SOIL_CARBON_STABLE),
    SPU(MOBILE_NUTRIENT),
    SPU(BAOBAB_SEED),
    SPU(ROSE_SEED),
    SPU(SLOPE_X),
    SPU(SLOPE_Y),
    SPU(SOIL_TRANSPORT),
    SPU(GROUNDWATER_TRANSPORT),
    SPU(H_TRANSPORT),
    SPU(SOIL_MINERAL_TRANSPORT),
    SPU(BAOBAB_SEED_TRANSPORT),
    SPU(ROSE_SEED_TRANSPORT),
    SPU(SURFACE_UX),
    SPU(SURFACE_UY),
    SPU(TOP_SOIL_UX),
    SPU(TOP_SOIL_UY),
    SPU(GROUNDWATER_UX),
    SPU(GROUNDWATER_UY),
    1,
    SPF(SURFACE_FILM_THRESHOLD_M),
    SPU(FLUX_X),
    SPU(FLUX_Y)
  );
  sim_apply_nutrient_transport_active(
    active_count,
    active_offset,
    model_dt_days,
    (float *)(uintptr_t)SPU(SOIL_MINERAL_N),
    (const float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT),
    (const float *)(uintptr_t)SPU(ROSE_FERTILITY)
  );

  sim_fill_float(SPU(BAOBAB_SEED_TRANSPORT), size, 0.0f);
  sim_produce_and_distribute_baobab_seeds_from_params((uint32_t *)(uintptr_t)params, active_count, active_offset, 0.0f);
  rng_state = (uint32_t)SPI(RNG_STATE);
  sim_fill_float(SPU(ROSE_SEED_PRODUCTION), size, 0.0f);
  sim_fill_float(SPU(ROSE_SEED_ARRIVAL), size, 0.0f);
  sim_produce_and_distribute_rose_seeds(
    size,
    active_count,
    active_offset,
    SPI(IS_EARTH),
    SPF(ASTEROID_MEAN_TEMP_C),
    SPF(ASTEROID_DIURNAL_RANGE_C),
    SPF(ASTEROID_LATITUDE_TEMP_RANGE_C),
    SPF(SHADE),
    model_dt_days,
    SPI(ROSE_COHORTS),
    SPU(DISPERSAL_OFFSETS),
    SPU(DISPERSAL_TARGETS),
    SPU(DISPERSAL_WEIGHTS),
    SPU(DISPERSAL_WEIGHT_SUMS),
    SPU(CELL_HEIGHT),
    SPU(CLIMATE_MEAN_TEMP_C),
    SPU(CLIMATE_DIURNAL_RANGE_C),
    SPU(ELEVATION),
    SPU(SOIL_WATER),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(H),
    SPU(R),
    SPU(SUNLIGHT),
    SPU(BAOBAB_LEAF),
    SPU(ROSE_LEAF),
    SPU(ROSE_FLOWER),
    SPU(ROSE_ROOT),
    SPU(ROSE_STORE),
    SPU(GPP_ROSE),
    SPU(ROSE_FERTILITY),
    SPU(ROSE_SEED_PRODUCTION),
    SPU(ROSE_SEED_ARRIVAL),
    rng_state,
    SPU(RNG_STATE_OUT_OFFSET)
  );
  {
    const uint32_t *rng_state_out = (const uint32_t *)(uintptr_t)SPU(RNG_STATE_OUT_OFFSET);
    if (rng_state_out) {
      ((uint32_t *)(uintptr_t)params)[STEP_RNG_STATE] = *rng_state_out;
    }
  }
}

static void sim_zero_rose_seed_arrival_range_from_params(const uint32_t *params, int32_t start, int32_t end) {
  const int32_t size = SPI(SIZE);
  float *SIM_RESTRICT rose_seed_arrival = (float *)(uintptr_t)SPU(ROSE_SEED_ARRIVAL);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    rose_seed_arrival[i] = 0.0f;
  }
}

static void sim_zero_baobab_seed_arrival_range_from_params(const uint32_t *params, int32_t start, int32_t end) {
  const int32_t size = SPI(SIZE);
  float *SIM_RESTRICT baobab_seed_arrival = (float *)(uintptr_t)SPU(BAOBAB_SEED_TRANSPORT);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    baobab_seed_arrival[i] = 0.0f;
  }
}

static void sim_produce_and_distribute_baobab_seeds_from_params(
  uint32_t *params,
  int32_t active_count,
  uintptr_t active_ids_offset,
  float slow_env_inv_count
) {
  const int32_t size = SPI(SIZE);
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const uint8_t *SIM_RESTRICT baobab_blocked = (const uint8_t *)(uintptr_t)SPU(BAOBAB_BLOCKED);
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)SPU(BAOBAB_LEAF);
  const float *SIM_RESTRICT baobab_stem = (const float *)(uintptr_t)SPU(BAOBAB_STEM);
  const float *SIM_RESTRICT baobab_root = (const float *)(uintptr_t)SPU(BAOBAB_ROOT);
  const float *SIM_RESTRICT baobab_store = (const float *)(uintptr_t)SPU(BAOBAB_STORE);
  const float *SIM_RESTRICT gpp_baobab = (const float *)(uintptr_t)SPU(GPP_BAOBAB);
  const float *SIM_RESTRICT ash_stress = (const float *)(uintptr_t)SPU(ASH_STRESS);
  const float *SIM_RESTRICT baobab_respiration_q10 = (const float *)(uintptr_t)SPU(BAOBAB_RESPIRATION_Q10);
  const float *SIM_RESTRICT root_stress_baobab = (const float *)(uintptr_t)SPU(ROOT_STRESS_BAOBAB);
  const float *SIM_RESTRICT surface_temp_c = (const float *)(uintptr_t)SPU(SURFACE_TEMP_C);
  const float *SIM_RESTRICT slow_env_gpp_baobab = (const float *)(uintptr_t)SPU(SLOW_ENV_GPP_BAOBAB);
  const float *SIM_RESTRICT slow_env_root_stress_baobab = (const float *)(uintptr_t)SPU(SLOW_ENV_ROOT_STRESS_BAOBAB);
  const float *SIM_RESTRICT slow_env_surface_temp_c = (const float *)(uintptr_t)SPU(SLOW_ENV_SURFACE_TEMP_C);
  const float *SIM_RESTRICT slow_env_ash_stress = (const float *)(uintptr_t)SPU(SLOW_ENV_ASH_STRESS);
  const int32_t *SIM_RESTRICT dispersal_offsets = (const int32_t *)(uintptr_t)SPU(DISPERSAL_OFFSETS);
  const int32_t *SIM_RESTRICT dispersal_targets = (const int32_t *)(uintptr_t)SPU(DISPERSAL_TARGETS);
  const float *SIM_RESTRICT dispersal_weights = (const float *)(uintptr_t)SPU(DISPERSAL_WEIGHTS);
  const float *SIM_RESTRICT dispersal_weight_sums = (const float *)(uintptr_t)SPU(DISPERSAL_WEIGHT_SUMS);
  float *SIM_RESTRICT baobab_seed_arrival = (float *)(uintptr_t)SPU(BAOBAB_SEED_TRANSPORT);
  uint32_t *rng_state_out = (uint32_t *)(uintptr_t)SPU(RNG_STATE_OUT_OFFSET);
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;
  const int32_t use_slow_env = slow_env_inv_count > 0.0f && slow_env_root_stress_baobab && slow_env_surface_temp_c;
  const float model_dt_days = SPF(MODEL_DT_DAYS);
  int32_t cohorts = SPI(ROSE_COHORTS);
  uint32_t rng_state = (uint32_t)SPI(RNG_STATE);
  if (cohorts < 1) {
    cohorts = 1;
  }

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    if (i < 0 || i >= size || baobab_blocked[i] != 0u) {
      continue;
    }
    const float adult_carbon = baobab_leaf[i] + baobab_stem[i] + baobab_root[i];
    if (adult_carbon <= 1.0e-8f) {
      continue;
    }

    const float stress_b = sim_clamp(
      use_slow_env ? slow_env_root_stress_baobab[i] * slow_env_inv_count : root_stress_baobab[i],
      0.0f,
      1.0f
    );
    const float temp_c = use_slow_env ? slow_env_surface_temp_c[i] * slow_env_inv_count : surface_temp_c[i];
    const float temp_stress = sim_fast_temperature_response(SIM_TEMP_RESPONSE_BAOBAB_CARBON, temp_c);
    const float production_potential = sim_baobab_seed_production(baobab_stem[i], baobab_leaf[i], stress_b, temp_stress);
    const float ash_load = sim_clamp(
      (use_slow_env ? slow_env_ash_stress[i] * slow_env_inv_count : ash_stress[i]) * 1.8f,
      0.0f,
      1.0f
    );
    const float gpp_b = sim_max(
      0.0f,
      use_slow_env ? slow_env_gpp_baobab[i] * slow_env_inv_count : gpp_baobab[i]
    ) * sim_max(0.0f, 1.0f - 0.82f * ash_load);
    const float q10_b = sim_lookup_photosynthesis_temperature(
      baobab_respiration_q10,
      SPI(PHOTO_LOOKUP_STEPS),
      SPF(PHOTO_TEMP_MIN_C),
      SPF(PHOTO_TEMP_LOOKUP_SCALE),
      temp_c
    );
    const float maintenance_b = q10_b * (
      0.00082f * baobab_leaf[i] +
      0.00017f * baobab_stem[i] +
      0.00034f * baobab_root[i] +
      0.00008f * baobab_store[i]
    );
    const float after_maintenance_b = gpp_b - maintenance_b;
    const float growth_resp_b = sim_max(0.0f, after_maintenance_b) * 0.16f;
    const float positive_npp_b = sim_max(0.0f, after_maintenance_b - growth_resp_b);
    const float production = sim_min(
      production_potential,
      sim_baobab_seed_production_carbon_limit(positive_npp_b, baobab_store[i], model_dt_days)
    );
    if (production <= 1.0e-10f) {
      continue;
    }

    const int32_t target_start = dispersal_offsets[i];
    const int32_t target_end = dispersal_offsets[i + 1];
    const float weight_sum = dispersal_weight_sums[i];
    if (weight_sum <= 0.0f || target_end <= target_start) {
      baobab_seed_arrival[i] += production;
      continue;
    }

    if (cohorts == 4) {
      const float cohort_flux = production * 0.25f;
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, baobab_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, baobab_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, baobab_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, baobab_seed_arrival, &rng_state);
    } else {
      const float cohort_flux = production / (float)cohorts;
      for (int32_t cohort = 0; cohort < cohorts; cohort += 1) {
        sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, baobab_seed_arrival, &rng_state);
      }
    }
  }

  params[STEP_RNG_STATE] = rng_state;
  if (rng_state_out) {
    *rng_state_out = rng_state;
  }
  ((uint32_t *)(uintptr_t)params)[STEP_RNG_STATE] = rng_state;
}

static void sim_produce_rose_seeds_range_from_params(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_ids_offset
) {
  const int32_t size = SPI(SIZE);
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t is_earth = SPI(IS_EARTH);
  const float asteroid_mean_temp_c = SPF(ASTEROID_MEAN_TEMP_C);
  const float asteroid_diurnal_range_c = SPF(ASTEROID_DIURNAL_RANGE_C);
  const float asteroid_latitude_temp_range_c = SPF(ASTEROID_LATITUDE_TEMP_RANGE_C);
  const float shade = SPF(SHADE);
  const float model_dt_days = SPF(MODEL_DT_DAYS);
  const float *SIM_RESTRICT cell_height = (const float *)(uintptr_t)SPU(CELL_HEIGHT);
  const float *SIM_RESTRICT climate_mean_temp_c = (const float *)(uintptr_t)SPU(CLIMATE_MEAN_TEMP_C);
  const float *SIM_RESTRICT climate_diurnal_range_c = (const float *)(uintptr_t)SPU(CLIMATE_DIURNAL_RANGE_C);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  const float *SIM_RESTRICT r = (const float *)(uintptr_t)SPU(R);
  const float *SIM_RESTRICT sunlight = (const float *)(uintptr_t)SPU(SUNLIGHT);
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)SPU(BAOBAB_LEAF);
  const float *SIM_RESTRICT rose_leaf = (const float *)(uintptr_t)SPU(ROSE_LEAF);
  const float *SIM_RESTRICT rose_flower = (const float *)(uintptr_t)SPU(ROSE_FLOWER);
  const float *SIM_RESTRICT rose_root = (const float *)(uintptr_t)SPU(ROSE_ROOT);
  const float *SIM_RESTRICT rose_store = (const float *)(uintptr_t)SPU(ROSE_STORE);
  const float *SIM_RESTRICT gpp_rose = (const float *)(uintptr_t)SPU(GPP_ROSE);
  const float *SIM_RESTRICT rose_fertility = (const float *)(uintptr_t)SPU(ROSE_FERTILITY);
  float *SIM_RESTRICT rose_seed_production = (float *)(uintptr_t)SPU(ROSE_SEED_PRODUCTION);

  const int32_t size2 = size * 2;
  const float latitude_temp_range = sim_clamp(asteroid_latitude_temp_range_c, 0.0f, 12.0f);
  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    if (i < 0 || i >= size) {
      continue;
    }
    rose_seed_production[i] = 0.0f;

    const float adult_carbon = rose_leaf[i] + rose_flower[i] + rose_root[i];
    if (adult_carbon <= 1.0e-8f) {
      continue;
    }

    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const float cap0 = soil_cap[i];
    const float cap1 = soil_cap[layer1_index];
    const float cap2 = soil_cap[layer2_index];
    const float gw_cap = groundwater_cap[i];
    const float s0 = cap0 > 0.0f ? sim_clamp(soil_water[i] / cap0, 0.0f, 1.0f) : 0.0f;
    const float s1 = cap1 > 0.0f ? sim_clamp(soil_water[layer1_index] / cap1, 0.0f, 1.0f) : 0.0f;
    const float s2 = cap2 > 0.0f ? sim_clamp(soil_water[layer2_index] / cap2, 0.0f, 1.0f) : 0.0f;
    const float gw_sat = gw_cap > 0.0f ? sim_clamp(groundwater_storage[i] / gw_cap, 0.0f, 1.0f) : 0.0f;
    const float wetness = sim_clamp(0.45f * s0 + 0.25f * s1 + 0.18f * s2 + 0.12f * gw_sat, 0.0f, 1.0f);
    const float lai_b = sim_clamp(6.2f * sim_max(0.0f, baobab_leaf[i]), 0.0f, 8.5f);
    const float lai_r = sim_clamp(6.4f * sim_max(0.0f, rose_leaf[i]) + 0.7f * sim_max(0.0f, rose_flower[i]), 0.0f, 6.5f);
    const float optical_depth = 0.58f * lai_b + 0.68f * lai_r;
    const float cover = sim_clamp(1.0f - sim_exp(-optical_depth), 0.0f, 1.0f);
    const float local_sunlight = sim_clamp(sunlight[i], 0.0f, 1.0f);
    const float cloud_cooling = sim_clamp(r[i] * 900.0f, 0.0f, 1.0f);
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float mean_insolation = sim_ring_mean_daily_insolation_from_height(height);

    float mean_climate = 0.0f;
    float diurnal_range = 0.0f;
    if (is_earth) {
      const float wet_anomaly = (0.5f - wetness) * 0.8f;
      mean_climate = sim_clamp(climate_mean_temp_c[i] + wet_anomaly - cloud_cooling * 0.55f, -34.0f, 34.0f);
      const float damping = cloud_cooling * 2.5f + cover * 1.2f + wetness * 0.8f;
      diurnal_range = sim_clamp(climate_diurnal_range_c[i] - damping, 2.4f, 27.0f);
    } else {
      const float latitude_anomaly = sim_ring_latitude_temperature_unit_from_height(height) * latitude_temp_range;
      const float terrain_cooling = sim_clamp(sim_max(0.0f, elevation[i]) / 5200.0f, 0.0f, 1.6f) * 5.4f;
      mean_climate = sim_clamp(asteroid_mean_temp_c + latitude_anomaly - terrain_cooling - cloud_cooling * 1.3f, -18.0f, 32.0f);
      const float terrain_boost = sim_clamp(sim_max(0.0f, elevation[i]) / 4200.0f, 0.0f, 1.4f) * 2.8f;
      const float damping = wetness * 7.5f + cloud_cooling * 5.5f + cover * 4.0f;
      diurnal_range = sim_clamp(asteroid_diurnal_range_c + terrain_boost - damping, 3.0f, 28.0f);
    }

    const float surface_water_cooling = sim_clamp(h[i] * 12.0f, 0.0f, 1.0f) * (is_earth ? 1.6f : 1.1f);
    const float temp_c = sim_clamp(mean_climate + diurnal_range * (local_sunlight - mean_insolation) - surface_water_cooling, -18.0f, 48.0f);
    const float temp_stress = sim_fast_temperature_response(SIM_TEMP_RESPONSE_ROSE_REPRO, temp_c);
    const float canopy_light = local_sunlight * sim_exp(-(0.57f * shade * lai_b + 0.18f * lai_r));
    const float moisture_stress = sim_clamp((wetness - 0.24f) / 0.48f, 0.0f, 1.0f);
    const float fertility_stress = sim_clamp(rose_fertility[i] / 1.6f, 0.0f, 1.0f);
    const float reproduction_stress = sim_clamp(moisture_stress * fertility_stress, 0.0f, 1.0f);
    const float adult = sim_max(0.0f, adult_carbon);
    const float maturity = adult / (adult + 0.12f);
    const float flowering = sim_clamp((rose_flower[i] + 0.12f * adult) / 0.34f, 0.0f, 1.0f);
    const float light_factor = sim_clamp(0.2f + 0.8f * sim_clamp(canopy_light / 0.32f, 0.0f, 1.0f), 0.0f, 1.0f);
    const float soil_factor = sim_clamp(rose_fertility[i] * 0.7f, 0.0f, 1.0f);
    const float potential_cap =
      SIM_ROSE_SEED_PRODUCTION_COEFF *
      adult *
      maturity *
      (0.25f + 0.75f * flowering) *
      (0.25f + 0.75f * reproduction_stress) *
      (0.25f + 0.75f * temp_stress) *
      light_factor *
      soil_factor;
    const float q10_r = sim_pow_positive(2.05f, (temp_c - 25.0f) * 0.1f);
    const float maintenance_r =
      q10_r * (0.00062f * rose_leaf[i] + 0.00082f * rose_flower[i] + 0.00028f * rose_root[i] + 0.00008f * rose_store[i]);
    const float carbon_surplus = sim_max(0.0f, gpp_rose[i] - maintenance_r) * (1.0f - 0.14f);
    const float reproductive_allocation =
      0.38f *
      maturity *
      (0.18f + 0.82f * flowering) *
      (0.25f + 0.75f * reproduction_stress) *
      (0.25f + 0.75f * temp_stress) *
      light_factor *
      soil_factor;
    const float seed_carbon_limit =
      carbon_surplus * sim_min(SIM_ROSE_SEED_NPP_ALLOCATION_FRACTION, reproductive_allocation) +
      sim_max(0.0f, rose_store[i] - 0.012f) * SIM_ROSE_SEED_STORE_FRACTION_PER_DAY / sim_max(1.0e-6f, model_dt_days);
    const float production = sim_min(potential_cap, seed_carbon_limit);
    if (production > 1.0e-10f) {
      rose_seed_production[i] = production;
    }
  }
}

static void sim_distribute_existing_rose_seeds_from_params(const uint32_t *params) {
  const int32_t size = SPI(SIZE);
  const int32_t active_count = SPI(ACTIVE_COUNT) > 0 ? SPI(ACTIVE_COUNT) : size;
  const uintptr_t active_ids_offset = SPU(ACTIVE_OFFSET);
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT dispersal_offsets = (const int32_t *)(uintptr_t)SPU(DISPERSAL_OFFSETS);
  const int32_t *SIM_RESTRICT dispersal_targets = (const int32_t *)(uintptr_t)SPU(DISPERSAL_TARGETS);
  const float *SIM_RESTRICT dispersal_weights = (const float *)(uintptr_t)SPU(DISPERSAL_WEIGHTS);
  const float *SIM_RESTRICT dispersal_weight_sums = (const float *)(uintptr_t)SPU(DISPERSAL_WEIGHT_SUMS);
  const float *SIM_RESTRICT rose_seed_production = (const float *)(uintptr_t)SPU(ROSE_SEED_PRODUCTION);
  float *SIM_RESTRICT rose_seed_arrival = (float *)(uintptr_t)SPU(ROSE_SEED_ARRIVAL);
  uint32_t rng_state = (uint32_t)SPI(RNG_STATE);
  uint32_t *rng_state_out = (uint32_t *)(uintptr_t)SPU(RNG_STATE_OUT_OFFSET);
  int32_t cohorts = SPI(ROSE_COHORTS);
  if (cohorts < 1) {
    cohorts = 1;
  }
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    if (i < 0 || i >= size) {
      continue;
    }
    const float production = rose_seed_production[i];
    if (production <= 1.0e-10f) {
      continue;
    }

    const int32_t target_start = dispersal_offsets[i];
    const int32_t target_end = dispersal_offsets[i + 1];
    const float weight_sum = dispersal_weight_sums[i];
    if (weight_sum <= 0.0f || target_end <= target_start) {
      rose_seed_arrival[i] += production;
      continue;
    }

    if (cohorts == 4) {
      const float cohort_flux = production * 0.25f;
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
    } else {
      const float cohort_flux = production / (float)cohorts;
      for (int32_t cohort = 0; cohort < cohorts; cohort += 1) {
        sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, rose_seed_arrival, &rng_state);
      }
    }
  }

  if (rng_state_out) {
    *rng_state_out = rng_state;
  }
}

static void sim_thread_barrier(uintptr_t barrier_offset, int32_t thread_count);

static void sim_distribute_existing_rose_seeds_thread_buffers_from_params(
  const uint32_t *params,
  int32_t thread_id,
  int32_t thread_count,
  int32_t active_count,
  uintptr_t active_ids_offset,
  uintptr_t barrier_offset
) {
  const int32_t size = SPI(SIZE);
  if (size <= 0 || thread_count <= 1) {
    return;
  }

  float *SIM_RESTRICT arrival_thread_base = (float *)(uintptr_t)SPU(ROSE_SEED_ARRIVAL_THREAD);
  if (!arrival_thread_base) {
    return;
  }

  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT dispersal_offsets = (const int32_t *)(uintptr_t)SPU(DISPERSAL_OFFSETS);
  const int32_t *SIM_RESTRICT dispersal_targets = (const int32_t *)(uintptr_t)SPU(DISPERSAL_TARGETS);
  const float *SIM_RESTRICT dispersal_weights = (const float *)(uintptr_t)SPU(DISPERSAL_WEIGHTS);
  const float *SIM_RESTRICT dispersal_weight_sums = (const float *)(uintptr_t)SPU(DISPERSAL_WEIGHT_SUMS);
  const float *SIM_RESTRICT rose_seed_production = (const float *)(uintptr_t)SPU(ROSE_SEED_PRODUCTION);
  float *SIM_RESTRICT rose_seed_arrival = (float *)(uintptr_t)SPU(ROSE_SEED_ARRIVAL);
  float *SIM_RESTRICT local_arrival = arrival_thread_base + (int32_t)(thread_id * size);
  int32_t cohorts = SPI(ROSE_COHORTS);
  if (cohorts < 1) {
    cohorts = 1;
  }

  SIM_VECTORIZE_LOOP
  for (int32_t i = 0; i < size; i += 1) {
    local_arrival[i] = 0.0f;
  }

  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;
  const uint32_t base_rng = (uint32_t)SPI(RNG_STATE);
  const uint32_t day_key = (uint32_t)(sim_floor(SPF(DAY) * 4096.0f) + 2147483648.0f);

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    if (i < 0 || i >= size) {
      continue;
    }
    const float production = rose_seed_production[i];
    if (production <= 1.0e-10f) {
      continue;
    }

    const int32_t target_start = dispersal_offsets[i];
    const int32_t target_end = dispersal_offsets[i + 1];
    const float weight_sum = dispersal_weight_sums[i];
    if (weight_sum <= 0.0f || target_end <= target_start) {
      local_arrival[i] += production;
      continue;
    }

    uint32_t rng_state = sim_hash_u32(base_rng ^ day_key ^ ((uint32_t)i * 0x9e3779b9u));
    if (cohorts == 4) {
      const float cohort_flux = production * 0.25f;
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, local_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, local_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, local_arrival, &rng_state);
      sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, local_arrival, &rng_state);
    } else {
      const float cohort_flux = production / (float)cohorts;
      for (int32_t cohort = 0; cohort < cohorts; cohort += 1) {
        sim_deposit_rose_seed_cohort(size, i, target_start, target_end, weight_sum, cohort_flux, dispersal_targets, dispersal_weights, local_arrival, &rng_state);
      }
    }
  }

  sim_thread_barrier(barrier_offset, thread_count);

  const int32_t target_start = (size * thread_id) / thread_count;
  const int32_t target_end = (size * (thread_id + 1)) / thread_count;
  for (int32_t i = target_start; i < target_end; i += 1) {
    float total = 0.0f;
    for (int32_t source_thread = 0; source_thread < thread_count; source_thread += 1) {
      total += arrival_thread_base[(int32_t)(source_thread * size + i)];
    }
    rose_seed_arrival[i] = total;
  }

  sim_thread_barrier(barrier_offset, thread_count);

  if (thread_id == 0) {
    const uint32_t next_rng = sim_hash_u32(base_rng + 0x6d2b79f5u + day_key);
    ((uint32_t *)(uintptr_t)params)[STEP_RNG_STATE] = next_rng;
    uint32_t *rng_state_out = (uint32_t *)(uintptr_t)SPU(RNG_STATE_OUT_OFFSET);
    if (rng_state_out) {
      *rng_state_out = next_rng;
    }
  }
}

static float sim_step_last_rain(const uint32_t *params) {
  const float *last_rain = (const float *)(uintptr_t)SPU(LAST_RAIN_OUT_OFFSET);
  return last_rain ? *last_rain : 0.0f;
}

static void sim_zero_transport_range_from_params(const uint32_t *params, int32_t start, int32_t end, int32_t write_diagnostics) {
  const int32_t size = SPI(SIZE);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  if (end <= start) {
    return;
  }

  sim_fill_float_range(SPU(SOIL_TRANSPORT), start, end, 0.0f);
  sim_fill_float_range(SPU(SOIL_TRANSPORT), size + start, size + end, 0.0f);
  sim_fill_float_range(SPU(SOIL_TRANSPORT), size * 2 + start, size * 2 + end, 0.0f);
  sim_fill_float_range(SPU(GROUNDWATER_TRANSPORT), start, end, 0.0f);
  sim_fill_float_range(SPU(H_TRANSPORT), start, end, 0.0f);
  sim_fill_float_range(SPU(SOIL_MINERAL_TRANSPORT), start, end, 0.0f);
  sim_fill_float_range(SPU(BAOBAB_SEED_TRANSPORT), start, end, 0.0f);
  sim_fill_float_range(SPU(ROSE_SEED_TRANSPORT), start, end, 0.0f);
  sim_fill_float_range(SPU(SURFACE_UX), start, end, 0.0f);
  sim_fill_float_range(SPU(SURFACE_UY), start, end, 0.0f);
  if (write_diagnostics) {
    sim_fill_float_range(SPU(TOP_SOIL_UX), start, end, 0.0f);
    sim_fill_float_range(SPU(TOP_SOIL_UY), start, end, 0.0f);
    sim_fill_float_range(SPU(GROUNDWATER_UX), start, end, 0.0f);
    sim_fill_float_range(SPU(GROUNDWATER_UY), start, end, 0.0f);
  }
  sim_fill_float_range(SPU(FLUX_X), start, end, 0.0f);
  sim_fill_float_range(SPU(FLUX_Y), start, end, 0.0f);
}

static void sim_step_apply_rng_out(uint32_t *params) {
  const uintptr_t rng_out_offset = SPU(RNG_STATE_OUT_OFFSET);
  if (rng_out_offset) {
    const uint32_t *rng_out = (const uint32_t *)(uintptr_t)rng_out_offset;
    params[STEP_RNG_STATE] = *rng_out;
  }
}

static void sim_richards_columns_update_hydraulic_from_params(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_ids_offset
) {
  const int32_t size = SPI(SIZE);
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)SPU(SUBSTRATE);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  float *SIM_RESTRICT h_next = (float *)(uintptr_t)SPU(H_NEXT);
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  float *SIM_RESTRICT soil_water_next = (float *)(uintptr_t)SPU(SOIL_WATER_NEXT);
  const float *SIM_RESTRICT soil_head = (const float *)(uintptr_t)SPU(SOIL_HEAD);
  const float *SIM_RESTRICT soil_hydraulic_k = (const float *)(uintptr_t)SPU(SOIL_HYDRAULIC_K);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT soil_thickness = (const float *)(uintptr_t)SPU(SOIL_THICKNESS);
  const float *SIM_RESTRICT soil_residual = (const float *)(uintptr_t)SPU(SOIL_RESIDUAL);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  float *SIM_RESTRICT groundwater_storage_next = (float *)(uintptr_t)SPU(GROUNDWATER_STORAGE_NEXT);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  const float *SIM_RESTRICT groundwater_head = (const float *)(uintptr_t)SPU(GROUNDWATER_HEAD);
  const float *SIM_RESTRICT groundwater_thickness = (const float *)(uintptr_t)SPU(GROUNDWATER_THICKNESS);
  const float *SIM_RESTRICT h_transport = (const float *)(uintptr_t)SPU(H_TRANSPORT);
  const float *SIM_RESTRICT soil_transport = (const float *)(uintptr_t)SPU(SOIL_TRANSPORT);
  const float *SIM_RESTRICT groundwater_transport = (const float *)(uintptr_t)SPU(GROUNDWATER_TRANSPORT);
  const float *SIM_RESTRICT hydrology_throughfall = (const float *)(uintptr_t)SPU(HYDROLOGY_THROUGHFALL);
  const float *SIM_RESTRICT hydrology_veg_feedback = (const float *)(uintptr_t)SPU(HYDROLOGY_VEG_FEEDBACK);
  const float *SIM_RESTRICT hydrology_sink0 = (const float *)(uintptr_t)SPU(HYDROLOGY_SINK0);
  const float *SIM_RESTRICT hydrology_sink1 = (const float *)(uintptr_t)SPU(HYDROLOGY_SINK1);
  const float *SIM_RESTRICT hydrology_sink2 = (const float *)(uintptr_t)SPU(HYDROLOGY_SINK2);
  const float *SIM_RESTRICT hydrology_groundwater_sink = (const float *)(uintptr_t)SPU(HYDROLOGY_GROUNDWATER_SINK);
  const float *SIM_RESTRICT hydrology_surface_evap_demand_m = (const float *)(uintptr_t)SPU(HYDROLOGY_SURFACE_EVAP_DEMAND_M);
  const float *SIM_RESTRICT hydraulic_psi = (const float *)(uintptr_t)SPU(HYDRAULIC_PSI);
  const float *SIM_RESTRICT hydraulic_relative_k = (const float *)(uintptr_t)SPU(HYDRAULIC_RELATIVE_K);
  const float *SIM_RESTRICT groundwater_pow17 = (const float *)(uintptr_t)SPU(GROUNDWATER_POW17);
  const float *SIM_RESTRICT soil_center_depth = (const float *)(uintptr_t)SPU(SOIL_CENTER_DEPTH);
  const float *SIM_RESTRICT groundwater_top_depth = (const float *)(uintptr_t)SPU(GROUNDWATER_TOP_DEPTH);
  float *SIM_RESTRICT w0 = (float *)(uintptr_t)SPU(W0);
  float *SIM_RESTRICT w1 = (float *)(uintptr_t)SPU(W1);
  float *SIM_RESTRICT soil_head_out = (float *)(uintptr_t)SPU(SOIL_HEAD);
  float *SIM_RESTRICT soil_hydraulic_k_out = (float *)(uintptr_t)SPU(SOIL_HYDRAULIC_K);
  float *SIM_RESTRICT soil_transmissivity = (float *)(uintptr_t)SPU(SOIL_TRANSMISSIVITY);
  float *SIM_RESTRICT groundwater_head_out = (float *)(uintptr_t)SPU(GROUNDWATER_HEAD);
  float *SIM_RESTRICT groundwater_t = (float *)(uintptr_t)SPU(GROUNDWATER_T);

  const int32_t size2 = size * 2;
  const float dt_days = SPF(MODEL_DT_DAYS);
  const float inv_model_dt_days = dt_days > 0.0f ? 1.0f / dt_days : 0.0f;
  const int32_t lookup_steps = SPI(HYDRAULIC_LOOKUP_STEPS);
  const int32_t table_stride = lookup_steps + 1;
  const float groundwater_flow_multiplier = SPF(GROUNDWATER_FLOW_MULTIPLIER);
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t layer0_index = i;
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const uint8_t sub = substrate[i];
    const float sub_inf_bare = substrate_inf_bare(sub);
    const float sub_inf_veg = substrate_inf_veg(sub);
    const float sub_percolation = substrate_percolation(sub);
    const float sub_leak = substrate_leak(sub);
    const float sub_ksat0 = substrate_ksat0(sub);
    const float sub_ksat1 = substrate_ksat1(sub);
    const float sub_gwk = substrate_gwk(sub);

    const float elevation_value = elevation[i];
    const float cap0 = soil_cap[layer0_index];
    const float cap1 = soil_cap[layer1_index];
    const float cap2 = soil_cap[layer2_index];
    const float thick0 = soil_thickness[layer0_index];
    const float thick1 = soil_thickness[layer1_index];
    const float thick2 = soil_thickness[layer2_index];
    const float residual0 = soil_residual[layer0_index];
    const float residual1 = soil_residual[layer1_index];
    const float residual2 = soil_residual[layer2_index];
    const float groundwater_cap_value = groundwater_cap[i];
    const float groundwater_thickness_value = groundwater_thickness[i];
    const float initial_surface = h[i];
    const float initial_soil0 = soil_water[layer0_index];
    const float initial_soil1 = soil_water[layer1_index];
    const float initial_soil2 = soil_water[layer2_index];
    const float initial_groundwater = groundwater_storage[i];

    const float sat0 = sim_clamp(initial_soil0 / cap0, 0.0f, 1.0f);
    const float groundwater_sat = sim_clamp(initial_groundwater / groundwater_cap_value, 0.0f, 1.0f);
    const float head0 = soil_head[layer0_index];
    const float head1 = soil_head[layer1_index];
    const float head2 = soil_head[layer2_index];
    const float hydraulic_k0 = soil_hydraulic_k[layer0_index];
    const float hydraulic_k1 = soil_hydraulic_k[layer1_index];
    const float hydraulic_k2 = soil_hydraulic_k[layer2_index];
    const float groundwater_head_value = groundwater_head[i];

    const float infiltration_distance = sim_max(0.025f, thick0 * 0.5f);
    const float surface_head = elevation_value + sim_max(0.0f, initial_surface);
    const float infiltration_gradient = sim_max(0.0f, (surface_head - head0) / infiltration_distance);
    const float open_pores = sim_clamp(1.0f - sat0, 0.015f, 1.0f);
    const float surface_k =
      sim_max(hydraulic_k0, sub_ksat0 * 0.012f) *
      (0.35f * sub_inf_bare + 0.65f * sub_inf_veg * (0.25f + 0.75f * hydrology_veg_feedback[i]));
    const float infiltration_capacity = surface_k * infiltration_gradient * open_pores;
    const float infiltration_available = initial_surface / dt_days + hydrology_throughfall[i];
    const float infiltration_pore_space = sim_max(0.0f, cap0 - initial_soil0) / dt_days;
    const float q_inf = sim_min(sim_min(infiltration_available, infiltration_pore_space), sim_max(0.0f, infiltration_capacity));

    const float distance01 = sim_max(0.02f, 0.5f * (thick0 + thick1));
    const float flux01 = sim_harmonic_mean(hydraulic_k0, hydraulic_k1) * sub_percolation * ((head0 - head1) / distance01);
    const float max_down01 =
      sim_min(sim_max(0.0f, initial_soil0 - residual0) / dt_days, sim_max(0.0f, cap1 - initial_soil1) / dt_days);
    const float max_up01 =
      sim_min(sim_max(0.0f, initial_soil1 - residual1) / dt_days, sim_max(0.0f, cap0 - initial_soil0) / dt_days);
    const float q01 = sim_clamp(flux01, -max_up01, max_down01);

    const float distance12 = sim_max(0.02f, 0.5f * (thick1 + thick2));
    const float flux12 = sim_harmonic_mean(hydraulic_k1, hydraulic_k2) * sub_percolation * ((head1 - head2) / distance12);
    const float max_down12 =
      sim_min(sim_max(0.0f, initial_soil1 - residual1) / dt_days, sim_max(0.0f, cap2 - initial_soil2) / dt_days);
    const float max_up12 =
      sim_min(sim_max(0.0f, initial_soil2 - residual2) / dt_days, sim_max(0.0f, cap1 - initial_soil1) / dt_days);
    const float q12 = sim_clamp(flux12, -max_up12, max_down12);

    const float recharge_distance = sim_max(0.025f, 0.5f * thick2 + 0.5f * groundwater_thickness_value);
    const float recharge_flux =
      sim_harmonic_mean(hydraulic_k2, sub_ksat1 * sub_leak) *
      sub_percolation *
      ((head2 - groundwater_head_value) / recharge_distance);
    const float max_recharge_down =
      sim_min(sim_max(0.0f, initial_soil2 - residual2) / dt_days, sim_max(0.0f, groundwater_cap_value - initial_groundwater) / dt_days);
    const float max_recharge_up =
      sim_min(sim_max(0.0f, initial_groundwater) / dt_days, sim_max(0.0f, cap2 - initial_soil2) / dt_days);
    const float recharge = sim_clamp(recharge_flux, -max_recharge_up, max_recharge_down);

    const float excess_groundwater = sim_clamp((groundwater_sat - 0.92f) / 0.08f, 0.0f, 1.0f);
    const float leak =
      sim_min(sim_max(0.0f, initial_groundwater) / dt_days, sub_leak * sub_gwk * excess_groundwater * excess_groundwater * 0.04f);
    const float surface_sink_demand = sim_max(0.0f, hydrology_surface_evap_demand_m[i] * inv_model_dt_days);
    const float surface_before_sink = initial_surface + dt_days * (h_transport[i] + hydrology_throughfall[i] - q_inf);
    const float surface_sink = sim_min(surface_sink_demand, sim_max(0.0f, surface_before_sink) / dt_days);

    const float surface = sim_max(0.0f, surface_before_sink - dt_days * surface_sink);
    const float soil0 =
      sim_clamp(initial_soil0 + dt_days * (soil_transport[layer0_index] + q_inf - q01 - hydrology_sink0[i]), 0.0f, cap0);
    const float soil1 =
      sim_clamp(initial_soil1 + dt_days * (soil_transport[layer1_index] + q01 - q12 - hydrology_sink1[i]), 0.0f, cap1);
    const float soil2 =
      sim_clamp(initial_soil2 + dt_days * (soil_transport[layer2_index] + q12 - recharge - hydrology_sink2[i]), 0.0f, cap2);
    const float groundwater =
      sim_clamp(initial_groundwater + dt_days * (groundwater_transport[i] + recharge - leak - hydrology_groundwater_sink[i]), 0.0f, groundwater_cap_value);

    h_next[i] = surface;
    soil_water_next[layer0_index] = soil0;
    soil_water_next[layer1_index] = soil1;
    soil_water_next[layer2_index] = soil2;
    groundwater_storage_next[i] = groundwater;

    const int32_t table_base = (int32_t)sim_substrate_index(sub) * table_stride;
    w0[i] = soil0;
    w1[i] = groundwater;

    float sat = sim_clamp(soil0 / cap0, 0.0f, 1.0f);
    float x = sat * (float)lookup_steps;
    int32_t table_index = (int32_t)x;
    if (table_index >= lookup_steps) {
      table_index = lookup_steps - 1;
    }
    if (table_index < 0) {
      table_index = 0;
    }
    float fraction = x - (float)table_index;
    int32_t lookup_index = table_base + table_index;
    float psi =
      hydraulic_psi[lookup_index] +
      (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
    float rel_k =
      hydraulic_relative_k[lookup_index] +
      (hydraulic_relative_k[lookup_index + 1] - hydraulic_relative_k[lookup_index]) * fraction;
    float hydraulic_k = sub_ksat0 * rel_k;
    soil_head_out[layer0_index] = elevation_value - soil_center_depth[layer0_index] + psi;
    soil_hydraulic_k_out[layer0_index] = hydraulic_k;
    soil_transmissivity[layer0_index] = hydraulic_k * thick0;

    sat = sim_clamp(soil1 / cap1, 0.0f, 1.0f);
    x = sat * (float)lookup_steps;
    table_index = (int32_t)x;
    if (table_index >= lookup_steps) {
      table_index = lookup_steps - 1;
    }
    if (table_index < 0) {
      table_index = 0;
    }
    fraction = x - (float)table_index;
    lookup_index = table_base + table_index;
    psi =
      hydraulic_psi[lookup_index] +
      (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
    rel_k =
      hydraulic_relative_k[lookup_index] +
      (hydraulic_relative_k[lookup_index + 1] - hydraulic_relative_k[lookup_index]) * fraction;
    hydraulic_k = sub_ksat1 * rel_k;
    soil_head_out[layer1_index] = elevation_value - soil_center_depth[layer1_index] + psi;
    soil_hydraulic_k_out[layer1_index] = hydraulic_k;
    soil_transmissivity[layer1_index] = hydraulic_k * thick1;

    sat = sim_clamp(soil2 / cap2, 0.0f, 1.0f);
    x = sat * (float)lookup_steps;
    table_index = (int32_t)x;
    if (table_index >= lookup_steps) {
      table_index = lookup_steps - 1;
    }
    if (table_index < 0) {
      table_index = 0;
    }
    fraction = x - (float)table_index;
    lookup_index = table_base + table_index;
    psi =
      hydraulic_psi[lookup_index] +
      (hydraulic_psi[lookup_index + 1] - hydraulic_psi[lookup_index]) * fraction;
    rel_k =
      hydraulic_relative_k[lookup_index] +
      (hydraulic_relative_k[lookup_index + 1] - hydraulic_relative_k[lookup_index]) * fraction;
    hydraulic_k = sub_ksat1 * rel_k;
    soil_head_out[layer2_index] = elevation_value - soil_center_depth[layer2_index] + psi;
    soil_hydraulic_k_out[layer2_index] = hydraulic_k;
    soil_transmissivity[layer2_index] = hydraulic_k * thick2;

    const float gw_sat_next = sim_clamp(groundwater / groundwater_cap_value, 0.0f, 1.0f);
    float gw_x = gw_sat_next * (float)lookup_steps;
    int32_t gw_table_index = (int32_t)gw_x;
    if (gw_table_index >= lookup_steps) {
      gw_table_index = lookup_steps - 1;
    }
    if (gw_table_index < 0) {
      gw_table_index = 0;
    }
    const float gw_fraction = gw_x - (float)gw_table_index;
    const float gw_pow17 =
      groundwater_pow17[gw_table_index] +
      (groundwater_pow17[gw_table_index + 1] - groundwater_pow17[gw_table_index]) * gw_fraction;
    groundwater_head_out[i] =
      elevation_value - groundwater_top_depth[i] - groundwater_thickness_value + groundwater_thickness_value * gw_sat_next;
    groundwater_t[i] =
      sub_gwk *
      groundwater_thickness_value *
      (0.08f + 0.92f * gw_pow17) *
      groundwater_flow_multiplier;
  }
}

static void sim_update_sunlight_field_range_from_params(const uint32_t *params, int32_t start, int32_t end) {
  const int32_t size = SPI(SIZE);
  const uintptr_t normal_xyz_offset = SPU(SUNLIGHT_NORMAL_XYZ_OFFSET);
  const int32_t rose_cell = SPI(SUNLIGHT_ROSE_CELL);
  int32_t sample_count = SPI(SUNLIGHT_SAMPLE_COUNT);
  float turns_per_day = SPF(SUNLIGHT_TURNS_PER_DAY);
  const float *SIM_RESTRICT normals = (const float *)(uintptr_t)normal_xyz_offset;
  float *SIM_RESTRICT sunlight = (float *)(uintptr_t)SPU(SUNLIGHT);
  if (!normals || !sunlight || size <= 0 || rose_cell < 0 || rose_cell >= size) {
    return;
  }
  if (turns_per_day <= 0.0f) {
    turns_per_day = 1.0f;
  }
  if (sample_count <= 0) {
    sample_count = 1;
  }
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  if (end <= start) {
    return;
  }

  const int32_t rose_offset = rose_cell * 3;
  const float nx = normals[rose_offset];
  const float ny = normals[rose_offset + 1];
  const float nz = normals[rose_offset + 2];

  float ex = -ny;
  float ey = nx;
  float ez = 0.0f;
  float east_length = sim_sqrt(ex * ex + ey * ey + ez * ez);
  if (east_length < 1.0e-6f) {
    ex = nz;
    ey = 0.0f;
    ez = -nx;
    east_length = sim_sqrt(ex * ex + ey * ey + ez * ez);
  }
  east_length = east_length > 1.0e-6f ? east_length : 1.0f;
  ex /= east_length;
  ey /= east_length;
  ez /= east_length;

  const float start_progress = sim_modulo_float(SPF(SUNLIGHT_TURN) / turns_per_day + SPF(SUNLIGHT_MODEL_TIME_OFFSET_DAYS), 1.0f);
  const float duration_days = SPF(SUNLIGHT_MODEL_DURATION_DAYS) > 1.0e-6f ? SPF(SUNLIGHT_MODEL_DURATION_DAYS) : 1.0e-6f;
  float sun_x[32];
  float sun_y[32];
  float sun_z[32];
  for (int32_t sample = 0; sample < sample_count; sample += 1) {
    const float sample_fraction = ((float)sample + 0.5f) / (float)sample_count;
    const float sample_progress = sim_modulo_float(start_progress + duration_days * sample_fraction, 1.0f);
    const float solar_angle = sample_progress * 6.283185307179586f;
    const float c = sim_cos(solar_angle);
    const float s = sim_sin(solar_angle);
    sun_x[sample] = ex * c + nx * s;
    sun_y[sample] = ey * c + ny * s;
    sun_z[sample] = ez * c + nz * s;
  }

  const float inv_sample_count = 1.0f / (float)sample_count;
  for (int32_t i = start; i < end; i += 1) {
    const int32_t offset = i * 3;
    const float cx = normals[offset];
    const float cy = normals[offset + 1];
    const float cz = normals[offset + 2];
    float total = 0.0f;
    for (int32_t sample = 0; sample < sample_count; sample += 1) {
      const float dot = cx * sun_x[sample] + cy * sun_y[sample] + cz * sun_z[sample];
      total += dot > 0.0f ? dot : 0.0f;
    }
    sunlight[i] = total * inv_sample_count;
  }
}

static void sim_update_asteroid_dayside_rain_unscaled_range_from_params(
  const uint32_t *params,
  int32_t start,
  int32_t end,
  float *partial_sums,
  int32_t thread_id
) {
  const int32_t size = SPI(SIZE);
  const float mean_rain = sim_step_last_rain(params);
  const float day = SPF(DAY);
  const float render_size = SPF(RAIN_RENDER_SIZE);
  const float rain_scale = SPF(RAIN_SCALE);
  const float patchiness = SPF(RAIN_PATCHINESS);
  int32_t cloud_count = SPI(ASTEROID_CLOUD_COUNT);
  const float *SIM_RESTRICT rain_x = (const float *)(uintptr_t)SPU(RAIN_X);
  const float *SIM_RESTRICT rain_y = (const float *)(uintptr_t)SPU(RAIN_Y);
  const float *SIM_RESTRICT sunlight = (const float *)(uintptr_t)SPU(SUNLIGHT);
  float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  if (end <= start) {
    if (partial_sums) {
      partial_sums[thread_id] = 0.0f;
    }
    return;
  }
  if (mean_rain <= 0.0f || size <= 0) {
    for (int32_t i = start; i < end; i += 1) {
      rain[i] = 0.0f;
    }
    if (partial_sums) {
      partial_sums[thread_id] = 0.0f;
    }
    return;
  }

  if (cloud_count < 2) {
    cloud_count = 2;
  }
  if (cloud_count > 8) {
    cloud_count = 8;
  }

  const int32_t day_key = (int32_t)sim_floor(day * 2.2f);
  float center_x[8];
  float center_y[8];
  float inv_radius2[8];
  float amp[8];

  for (int32_t index = 0; index < cloud_count; index += 1) {
    const int32_t key = day_key * 53 + index * 17;
    const float phase = sim_deterministic_unit(index, 731) * render_size;
    const float drift = day * (0.42f + sim_deterministic_unit(index, 733) * 0.36f);
    center_x[index] = sim_modulo_float(
      phase + drift + (sim_deterministic_unit(key, 735) - 0.5f) * rain_scale * 0.55f,
      render_size);
    center_y[index] =
      render_size * (0.5f + (sim_deterministic_unit(index, 737) - 0.5f) * 0.8f) +
      sim_sin(day * (0.22f + sim_deterministic_unit(index, 739) * 0.12f) + sim_deterministic_unit(index, 741) * 6.283185307179586f) *
        rain_scale * 0.42f;
    const float radius = rain_scale * (0.24f + sim_deterministic_unit(index, 743) * 0.3f);
    inv_radius2[index] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
    amp[index] = 0.78f + sim_deterministic_unit(index, 745) * 0.72f;
  }

  float raw_sum = 0.0f;
  const float *SIM_RESTRICT daylight_power_table = sim_fast_daylight_power058_table;
  const float *SIM_RESTRICT cloud_exp_table = sim_fast_cloud_exp16_table;
  for (int32_t i = start; i < end; i += 1) {
    const float daylight = sim_clamp((sunlight[i] - 0.03f) / 0.68f, 0.0f, 1.0f);
    const float daylight_index_f = daylight * 256.0f;
    int32_t daylight_index = (int32_t)daylight_index_f;
    float broad_day_rain = daylight_power_table[256];
    if (daylight_index < 256) {
      const float fraction = daylight_index_f - (float)daylight_index;
      broad_day_rain =
        daylight_power_table[daylight_index] +
        (daylight_power_table[daylight_index + 1] - daylight_power_table[daylight_index]) * fraction;
    }
    float cloudiness = 0.0f;

    if (cloud_count == 8) {
      #define SIM_ACCUM_ASTEROID_CLOUD(INDEX) do { \
        const float dx = sim_periodic_delta(rain_x[i], center_x[(INDEX)], render_size); \
        const float dy = rain_y[i] - center_y[(INDEX)]; \
        const float scaled_distance2 = (dx * dx + dy * dy) * inv_radius2[(INDEX)]; \
        if (scaled_distance2 < 16.0f) { \
          const float exp_index_f = scaled_distance2 * 64.0f; \
          const int32_t exp_index = (int32_t)exp_index_f; \
          const float exp_fraction = exp_index_f - (float)exp_index; \
          const float cloud_exp = cloud_exp_table[exp_index] + (cloud_exp_table[exp_index + 1] - cloud_exp_table[exp_index]) * exp_fraction; \
          cloudiness += cloud_exp * amp[(INDEX)]; \
        } \
      } while (0)
      SIM_ACCUM_ASTEROID_CLOUD(0);
      SIM_ACCUM_ASTEROID_CLOUD(1);
      SIM_ACCUM_ASTEROID_CLOUD(2);
      SIM_ACCUM_ASTEROID_CLOUD(3);
      SIM_ACCUM_ASTEROID_CLOUD(4);
      SIM_ACCUM_ASTEROID_CLOUD(5);
      SIM_ACCUM_ASTEROID_CLOUD(6);
      SIM_ACCUM_ASTEROID_CLOUD(7);
      #undef SIM_ACCUM_ASTEROID_CLOUD
    } else {
      for (int32_t cloud_index = 0; cloud_index < cloud_count; cloud_index += 1) {
        const float dx = sim_periodic_delta(rain_x[i], center_x[cloud_index], render_size);
        const float dy = rain_y[i] - center_y[cloud_index];
        const float scaled_distance2 = (dx * dx + dy * dy) * inv_radius2[cloud_index];
        if (scaled_distance2 < 16.0f) {
          const float exp_index_f = scaled_distance2 * 64.0f;
          const int32_t exp_index = (int32_t)exp_index_f;
          const float exp_fraction = exp_index_f - (float)exp_index;
          const float cloud_exp =
            cloud_exp_table[exp_index] +
            (cloud_exp_table[exp_index + 1] - cloud_exp_table[exp_index]) * exp_fraction;
          cloudiness += cloud_exp * amp[cloud_index];
        }
      }
    }

    cloudiness = sim_clamp((cloudiness - 0.12f) / 0.78f, 0.0f, 1.0f);
    const float moving_veil = sim_asteroid_rain_veil(rain_x[i], rain_y[i], render_size, day_key, day);
    const float cloud_mask = (1.0f - patchiness) * 0.58f + patchiness * (0.035f + 0.965f * cloudiness);
    const float local = broad_day_rain * sim_clamp(moving_veil * cloud_mask, 0.025f, 1.18f);
    rain[i] = local;
    raw_sum += local;
  }
  if (partial_sums) {
    partial_sums[thread_id] = raw_sum;
  }
}

static void __attribute__((unused)) sim_update_asteroid_sunlight_dayside_rain_unscaled_range_from_params(
  const uint32_t *params,
  int32_t start,
  int32_t end,
  float *partial_sums,
  int32_t thread_id
) {
  const int32_t size = SPI(SIZE);
  const uintptr_t normal_xyz_offset = SPU(SUNLIGHT_NORMAL_XYZ_OFFSET);
  const int32_t rose_cell = SPI(SUNLIGHT_ROSE_CELL);
  int32_t sample_count = SPI(SUNLIGHT_SAMPLE_COUNT);
  float turns_per_day = SPF(SUNLIGHT_TURNS_PER_DAY);
  const float *SIM_RESTRICT normals = (const float *)(uintptr_t)normal_xyz_offset;
  float *SIM_RESTRICT sunlight = (float *)(uintptr_t)SPU(SUNLIGHT);
  float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);
  const float mean_rain = sim_step_last_rain(params);
  const float day = SPF(DAY);
  const float render_size = SPF(RAIN_RENDER_SIZE);
  const float rain_scale = SPF(RAIN_SCALE);
  const float patchiness = SPF(RAIN_PATCHINESS);
  int32_t cloud_count = SPI(ASTEROID_CLOUD_COUNT);
  const float *SIM_RESTRICT rain_x = (const float *)(uintptr_t)SPU(RAIN_X);
  const float *SIM_RESTRICT rain_y = (const float *)(uintptr_t)SPU(RAIN_Y);

  if (!normals || !sunlight || !rain || size <= 0 || rose_cell < 0 || rose_cell >= size) {
    if (partial_sums) {
      partial_sums[thread_id] = 0.0f;
    }
    return;
  }
  if (turns_per_day <= 0.0f) {
    turns_per_day = 1.0f;
  }
  if (sample_count <= 0) {
    sample_count = 1;
  }
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  if (end <= start) {
    if (partial_sums) {
      partial_sums[thread_id] = 0.0f;
    }
    return;
  }
  if (mean_rain <= 0.0f) {
    for (int32_t i = start; i < end; i += 1) {
      sunlight[i] = 0.0f;
      rain[i] = 0.0f;
    }
    if (partial_sums) {
      partial_sums[thread_id] = 0.0f;
    }
    return;
  }

  if (cloud_count < 2) {
    cloud_count = 2;
  }
  if (cloud_count > 8) {
    cloud_count = 8;
  }
  sim_init_fast_tables();

  const int32_t rose_offset = rose_cell * 3;
  const float nx = normals[rose_offset];
  const float ny = normals[rose_offset + 1];
  const float nz = normals[rose_offset + 2];

  float ex = -ny;
  float ey = nx;
  float ez = 0.0f;
  float east_length = sim_sqrt(ex * ex + ey * ey + ez * ez);
  if (east_length < 1.0e-6f) {
    ex = nz;
    ey = 0.0f;
    ez = -nx;
    east_length = sim_sqrt(ex * ex + ey * ey + ez * ez);
  }
  east_length = east_length > 1.0e-6f ? east_length : 1.0f;
  ex /= east_length;
  ey /= east_length;
  ez /= east_length;

  const float start_progress = sim_modulo_float(SPF(SUNLIGHT_TURN) / turns_per_day + SPF(SUNLIGHT_MODEL_TIME_OFFSET_DAYS), 1.0f);
  const float duration_days = SPF(SUNLIGHT_MODEL_DURATION_DAYS) > 1.0e-6f ? SPF(SUNLIGHT_MODEL_DURATION_DAYS) : 1.0e-6f;
  float sun_x[32];
  float sun_y[32];
  float sun_z[32];
  for (int32_t sample = 0; sample < sample_count; sample += 1) {
    const float sample_fraction = ((float)sample + 0.5f) / (float)sample_count;
    const float sample_progress = sim_modulo_float(start_progress + duration_days * sample_fraction, 1.0f);
    const float solar_angle = sample_progress * 6.283185307179586f;
    const float c = sim_cos(solar_angle);
    const float s = sim_sin(solar_angle);
    sun_x[sample] = ex * c + nx * s;
    sun_y[sample] = ey * c + ny * s;
    sun_z[sample] = ez * c + nz * s;
  }
  const float inv_sample_count = 1.0f / (float)sample_count;

  const int32_t day_key = (int32_t)sim_floor(day * 2.2f);
  float center_x[8];
  float center_y[8];
  float inv_radius2[8];
  float amp[8];
  for (int32_t index = 0; index < cloud_count; index += 1) {
    const int32_t key = day_key * 53 + index * 17;
    const float phase = sim_deterministic_unit(index, 731) * render_size;
    const float drift = day * (0.42f + sim_deterministic_unit(index, 733) * 0.36f);
    center_x[index] = sim_modulo_float(
      phase + drift + (sim_deterministic_unit(key, 735) - 0.5f) * rain_scale * 0.55f,
      render_size);
    center_y[index] =
      render_size * (0.5f + (sim_deterministic_unit(index, 737) - 0.5f) * 0.8f) +
      sim_sin(day * (0.22f + sim_deterministic_unit(index, 739) * 0.12f) + sim_deterministic_unit(index, 741) * 6.283185307179586f) *
        rain_scale * 0.42f;
    const float radius = rain_scale * (0.24f + sim_deterministic_unit(index, 743) * 0.3f);
    inv_radius2[index] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
    amp[index] = 0.78f + sim_deterministic_unit(index, 745) * 0.72f;
  }

  const float *SIM_RESTRICT daylight_power_table = sim_fast_daylight_power058_table;
  const float *SIM_RESTRICT cloud_exp_table = sim_fast_cloud_exp16_table;
  float raw_sum = 0.0f;
  for (int32_t i = start; i < end; i += 1) {
    const int32_t offset = i * 3;
    const float cx = normals[offset];
    const float cy = normals[offset + 1];
    const float cz = normals[offset + 2];
    float total_sunlight = 0.0f;
    for (int32_t sample = 0; sample < sample_count; sample += 1) {
      const float dot = cx * sun_x[sample] + cy * sun_y[sample] + cz * sun_z[sample];
      total_sunlight += dot > 0.0f ? dot : 0.0f;
    }
    const float local_sunlight = total_sunlight * inv_sample_count;
    sunlight[i] = local_sunlight;

    const float daylight = sim_clamp((local_sunlight - 0.03f) / 0.68f, 0.0f, 1.0f);
    const float daylight_index_f = daylight * 256.0f;
    int32_t daylight_index = (int32_t)daylight_index_f;
    float broad_day_rain = daylight_power_table[256];
    if (daylight_index < 256) {
      const float fraction = daylight_index_f - (float)daylight_index;
      broad_day_rain =
        daylight_power_table[daylight_index] +
        (daylight_power_table[daylight_index + 1] - daylight_power_table[daylight_index]) * fraction;
    }

    float cloudiness = 0.0f;
    for (int32_t cloud_index = 0; cloud_index < cloud_count; cloud_index += 1) {
      const float dx = sim_periodic_delta(rain_x[i], center_x[cloud_index], render_size);
      const float dy = rain_y[i] - center_y[cloud_index];
      const float scaled_distance2 = (dx * dx + dy * dy) * inv_radius2[cloud_index];
      if (scaled_distance2 < 16.0f) {
        const float exp_index_f = scaled_distance2 * 64.0f;
        const int32_t exp_index = (int32_t)exp_index_f;
        const float exp_fraction = exp_index_f - (float)exp_index;
        const float cloud_exp =
          cloud_exp_table[exp_index] +
          (cloud_exp_table[exp_index + 1] - cloud_exp_table[exp_index]) * exp_fraction;
        cloudiness += cloud_exp * amp[cloud_index];
      }
    }

    cloudiness = sim_clamp((cloudiness - 0.12f) / 0.78f, 0.0f, 1.0f);
    const float moving_veil = sim_asteroid_rain_veil(rain_x[i], rain_y[i], render_size, day_key, day);
    const float cloud_mask = (1.0f - patchiness) * 0.58f + patchiness * (0.035f + 0.965f * cloudiness);
    const float local = broad_day_rain * sim_clamp(moving_veil * cloud_mask, 0.025f, 1.18f);
    rain[i] = local;
    raw_sum += local;
  }

  if (partial_sums) {
    partial_sums[thread_id] = raw_sum;
  }
}

static void sim_scale_rain_range_from_params(const uint32_t *params, int32_t start, int32_t end, float scale) {
  const int32_t size = SPI(SIZE);
  float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  for (int32_t i = start; i < end; i += 1) {
    rain[i] *= scale;
  }
}

static void sim_partition_earth_precipitation_phase_range_from_params(const uint32_t *params, int32_t start, int32_t end) {
  if (!SPI(IS_EARTH)) {
    return;
  }

  const int32_t size = SPI(SIZE);
  const float dt_days = SPF(MODEL_DT_DAYS);
  float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);
  float *SIM_RESTRICT snow_ice_m = (float *)(uintptr_t)SPU(SNOW_ICE_M);
  const float *SIM_RESTRICT mean_temp_c = (const float *)(uintptr_t)SPU(CLIMATE_MEAN_TEMP_C);
  const float *SIM_RESTRICT diurnal_range_c = (const float *)(uintptr_t)SPU(CLIMATE_DIURNAL_RANGE_C);
  if (!rain || !snow_ice_m || !mean_temp_c || !diurnal_range_c || dt_days <= 0.0f) {
    return;
  }
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }

  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    const float precipitation_rate = sim_max(0.0f, rain[i]);
    const float snow_fraction = sim_snow_precip_fraction_from_mean_diurnal(mean_temp_c[i], diurnal_range_c[i]);
    const float snowfall_rate = precipitation_rate * snow_fraction;
    rain[i] = sim_max(0.0f, precipitation_rate - snowfall_rate);
    snow_ice_m[i] = sim_max(0.0f, snow_ice_m[i] + snowfall_rate * dt_days);
  }
}

static void sim_update_rain_memory_range_from_params(const uint32_t *params, int32_t start, int32_t end) {
  const int32_t size = SPI(SIZE);
  const float rain_average_weight = SPF(RAIN_AVERAGE_WEIGHT);
  const float *SIM_RESTRICT rain = (const float *)(uintptr_t)SPU(R);
  float *SIM_RESTRICT rain_memory = (float *)(uintptr_t)SPU(RAIN_MEMORY);
  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    rain_memory[i] += (rain[i] - rain_memory[i]) * rain_average_weight;
  }
}

static void sim_update_earth_rain_generated_unscaled_range_from_params(
  const uint32_t *params,
  int32_t start,
  int32_t end,
  float *partial_sums,
  int32_t thread_id
) {
  const int32_t size = SPI(SIZE);
  const float mean_rain = sim_step_last_rain(params);
  const float day = SPF(DAY);
  const float render_size = SPF(RAIN_RENDER_SIZE);
  const float patchiness = SPF(RAIN_PATCHINESS);
  const float rain_scale = SPF(RAIN_SCALE);
  const float *SIM_RESTRICT rain_x = (const float *)(uintptr_t)SPU(RAIN_X);
  const float *SIM_RESTRICT rain_y = (const float *)(uintptr_t)SPU(RAIN_Y);
  const float *SIM_RESTRICT rain_tropics = (const float *)(uintptr_t)SPU(RAIN_TROPICS);
  const float *SIM_RESTRICT rain_mid_latitude = (const float *)(uintptr_t)SPU(RAIN_MID_LATITUDE);
  const float *SIM_RESTRICT rain_weak_background = (const float *)(uintptr_t)SPU(RAIN_WEAK_BACKGROUND);
  const float *SIM_RESTRICT rain_climatology = (const float *)(uintptr_t)SPU(RAIN_CLIMATOLOGY);
  float *SIM_RESTRICT rain = (float *)(uintptr_t)SPU(R);

  if (start < 0) {
    start = 0;
  }
  if (end > size) {
    end = size;
  }
  if (end <= start) {
    if (partial_sums) {
      partial_sums[thread_id * 2] = 0.0f;
      partial_sums[thread_id * 2 + 1] = 0.0f;
    }
    return;
  }
  if (mean_rain <= 0.0f || render_size <= 0.0f || size <= 0) {
    for (int32_t i = start; i < end; i += 1) {
      rain[i] = 0.0f;
    }
    if (partial_sums) {
      partial_sums[thread_id * 2] = 0.0f;
      partial_sums[thread_id * 2 + 1] = 0.0f;
    }
    return;
  }

  const float tropical_scale = rain_scale * 0.48f;
  const float mid_latitude_scale = rain_scale * 0.92f;
  const int32_t convective_key = (int32_t)sim_floor(day * 1.45f);
  const int32_t burst_key = (int32_t)sim_floor(day * 3.1f);
  int32_t tropical_count = (int32_t)(render_size / sim_max(8.0f, rain_scale * 0.72f) + 0.5f);
  int32_t mid_count = (int32_t)(render_size / sim_max(10.0f, rain_scale * 0.82f) + 0.5f);
  if (tropical_count < 4) {
    tropical_count = 4;
  }
  if (tropical_count > 12) {
    tropical_count = 12;
  }
  if (mid_count < 4) {
    mid_count = 4;
  }
  if (mid_count > 11) {
    mid_count = 11;
  }

  float tropical_x[12];
  float tropical_y[12];
  float tropical_inv_radius2[12];
  float tropical_inv_core_radius2[12];
  float tropical_core_amp[12];
  float tropical_amp[12];
  float mid_x[11];
  float mid_y[11];
  float mid_inv_radius2[11];
  float mid_cos_phase[11];
  float mid_sin_phase[11];
  float mid_amp[11];

  const int32_t strong_index = (int32_t)sim_floor(sim_deterministic_unit(convective_key, 161) * (float)tropical_count);
  for (int32_t index = 0; index < tropical_count; index += 1) {
    const int32_t key = convective_key * 37 + index * 11;
    const int32_t burst = burst_key * 41 + index * 13;
    const float phase = sim_deterministic_unit(key, 101) * render_size;
    const float drift = sim_modulo_float(day * (0.2f + sim_deterministic_unit(index, 102) * 0.22f), render_size);
    const float jitter = (sim_deterministic_unit(key, 103) - 0.5f) * render_size * 0.22f;
    const float latitude_jitter = (sim_deterministic_unit(key, 104) - 0.5f) * 0.28f;
    const int32_t is_strong_core = index == strong_index;
    float active_pulse = 0.0f;
    if (is_strong_core) {
      active_pulse = 1.2f + sim_deterministic_unit(burst, 116) * 0.55f;
    } else if (sim_deterministic_unit(burst, 105) > 0.36f) {
      active_pulse = 0.74f + sim_deterministic_unit(burst, 106) * 0.68f;
    } else {
      active_pulse = 0.1f + sim_deterministic_unit(burst, 107) * 0.18f;
    }
    tropical_x[index] = sim_modulo_float(phase + drift + jitter, render_size);
    tropical_y[index] = render_size * (0.5f + latitude_jitter);
    const float radius_factor =
      is_strong_core ? 0.22f + sim_deterministic_unit(key, 108) * 0.12f : 0.32f + sim_deterministic_unit(key, 109) * 0.28f;
    const float core_factor =
      is_strong_core ? 0.16f + sim_deterministic_unit(key, 110) * 0.08f : 0.24f + sim_deterministic_unit(key, 111) * 0.14f;
    const float radius = tropical_scale * radius_factor;
    float core_radius = radius * core_factor;
    if (core_radius < 0.35f) {
      core_radius = 0.35f;
    }
    tropical_inv_radius2[index] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
    tropical_inv_core_radius2[index] = core_radius > 0.0f ? 1.0f / (core_radius * core_radius) : 0.0f;
    tropical_core_amp[index] =
      is_strong_core ? 3.2f + sim_deterministic_unit(key, 112) * 1.6f : 0.7f + sim_deterministic_unit(key, 113) * 0.9f;
    tropical_amp[index] =
      (is_strong_core ? 1.85f + sim_deterministic_unit(key, 114) * 1.45f : 0.46f + sim_deterministic_unit(key, 115) * 0.95f) *
      active_pulse;
  }

  for (int32_t index = 0; index < mid_count; index += 1) {
    const float hemisphere = sim_deterministic_unit(index, 206) < 0.54f ? -1.0f : 1.0f;
    const float phase = sim_deterministic_unit(index, 201) * render_size;
    const float eastward_drift = day * (1.55f + sim_deterministic_unit(index, 202) * 0.55f);
    const float latitude =
      0.19f +
      sim_deterministic_unit(index, 203) * 0.17f +
      0.045f *
        sim_sin(day * (0.12f + sim_deterministic_unit(index, 207) * 0.08f) +
          sim_deterministic_unit(index, 208) * 6.283185307179586f);
    const float meander =
      0.035f *
      sim_sin(day * (0.18f + sim_deterministic_unit(index, 209) * 0.11f) +
        sim_deterministic_unit(index, 210) * 6.283185307179586f);
    const float phase_angle =
      sim_deterministic_unit(index, 211) * 6.283185307179586f + day * (0.09f + sim_deterministic_unit(index, 212) * 0.08f);
    mid_x[index] = sim_modulo_float(phase + eastward_drift, render_size);
    mid_y[index] = render_size * (0.5f + hemisphere * latitude + meander);
    const float radius = mid_latitude_scale * (0.72f + sim_deterministic_unit(index, 204) * 0.46f);
    mid_inv_radius2[index] = radius > 0.0f ? 1.0f / (radius * radius) : 0.0f;
    mid_cos_phase[index] = sim_cos(phase_angle);
    mid_sin_phase[index] = sim_sin(phase_angle);
    mid_amp[index] = 0.68f + sim_deterministic_unit(index, 205) * 0.95f;
  }

  const float broad_climate_rain = 0.16f + 0.44f * (1.0f - patchiness);
  float raw_sum = 0.0f;
  float climatology_sum = 0.0f;
  for (int32_t i = start; i < end; i += 1) {
    const float x = rain_x[i];
    const float y = rain_y[i];
    const float tropics = rain_tropics[i];
    const float mid_latitude = rain_mid_latitude[i];
    float tropical_rain = 0.0f;
    float mid_latitude_rain = 0.0f;

    for (int32_t storm = 0; storm < tropical_count; storm += 1) {
      const float dx = sim_periodic_delta(x, tropical_x[storm], render_size);
      const float dy = y - tropical_y[storm];
      const float distance2 = dx * dx + dy * dy;
      const float envelope = sim_exp(-0.5f * distance2 * tropical_inv_radius2[storm]);
      const float core = sim_exp(-0.5f * distance2 * tropical_inv_core_radius2[storm]);
      tropical_rain += tropical_amp[storm] * (0.34f * envelope + tropical_core_amp[storm] * core);
    }

    for (int32_t storm = 0; storm < mid_count; storm += 1) {
      const float dx = sim_periodic_delta(x, mid_x[storm], render_size);
      const float dy = y - mid_y[storm];
      const float distance2 = dx * dx + dy * dy;
      const float core = sim_exp(-0.5f * distance2 * mid_inv_radius2[storm]);
      float cos_angle = 1.0f;
      float sin_angle = 0.0f;
      if (distance2 > 1.0e-12f) {
        const float inv_distance = 1.0f / sim_sqrt(distance2);
        cos_angle = dx * inv_distance;
        sin_angle = dy * inv_distance;
      }
      const float lopsided = 0.78f + 0.22f * (cos_angle * mid_cos_phase[storm] + sin_angle * mid_sin_phase[storm]);
      mid_latitude_rain += mid_amp[storm] * core * lopsided;
    }

    const float climate = sim_max(0.0f, rain_climatology[i]);
    const float local =
      climate *
      (broad_climate_rain +
        rain_weak_background[i] +
        patchiness * (0.58f * tropics * tropical_rain + 0.72f * mid_latitude * mid_latitude_rain));
    rain[i] = local;
    raw_sum += local;
    climatology_sum += climate;
  }

  if (partial_sums) {
    partial_sums[thread_id * 2] = raw_sum;
    partial_sums[thread_id * 2 + 1] = climatology_sum;
  }
}

static void sim_transport_mobile_nutrient_range(const uint32_t *params, int32_t start, int32_t end) {
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)SPU(SOIL_MINERAL_N);
  const float *SIM_RESTRICT soil_carbon_active = (const float *)(uintptr_t)SPU(SOIL_CARBON_ACTIVE);
  const float *SIM_RESTRICT soil_carbon_stable = (const float *)(uintptr_t)SPU(SOIL_CARBON_STABLE);
  float *SIM_RESTRICT mobile_nutrient = (float *)(uintptr_t)SPU(MOBILE_NUTRIENT);

  SIM_VECTORIZE_LOOP
  for (int32_t i = start; i < end; i += 1) {
    mobile_nutrient[i] = sim_mobile_nutrient_value(
      i,
      soil_water,
      soil_cap,
      groundwater_storage,
      groundwater_cap,
      soil_mineral_n,
      soil_carbon_active,
      soil_carbon_stable);
  }
}

static void sim_transport_darcy_core_chunk(const uint32_t *params, int32_t active_count, uintptr_t active_ids_offset, int32_t write_diagnostics) {
  const int32_t size = SPI(SIZE);
  const int32_t size2 = size * 2;
  const float dt_days = SPF(MODEL_DT_DAYS);
  const float cell_size_m = SPF(CELL_SIZE_M);
  const float inv_dt_days = 1.0f / dt_days;
  const float soil_transport_limit_scale = 0.42f * inv_dt_days;
  const float groundwater_transport_limit_scale = 0.36f * inv_dt_days;
  const float top_flux_limit_scale = cell_size_m * 0.16f * inv_dt_days;
  const float groundwater_flux_limit_scale = cell_size_m * 0.12f * inv_dt_days;
  const float surface_water_diff_m2_day = SPF(SURFACE_WATER_DIFF_M2_DAY);
  const float surface_slope_velocity_m_day = SPF(SURFACE_SLOPE_VELOCITY_M_DAY);
  (void)surface_slope_velocity_m_day;
  const float surface_slope_max_velocity_m_day = SPF(SURFACE_SLOPE_MAX_VELOCITY_M_DAY);
  const float surface_film_threshold_m = SPF(SURFACE_FILM_THRESHOLD_M);
  const float nutrient_diff_m2_day = SPF(NUTRIENT_DIFF_M2_DAY);
  const float baobab_seed_diffusion_m2_day = SPF(BAOBAB_SEED_DIFFUSION_M2_DAY);
  const float rose_seed_diffusion_m2_day = SPF(ROSE_SEED_DIFFUSION_M2_DAY);
  const int32_t transport_baobab_seed = baobab_seed_diffusion_m2_day != 0.0f;
  const int32_t transport_rose_seed = rose_seed_diffusion_m2_day != 0.0f;
  (void)baobab_seed_diffusion_m2_day;
  (void)transport_baobab_seed;

  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT stencil = (const int32_t *)(uintptr_t)SPU(STENCIL);
  const float *SIM_RESTRICT lap_w = (const float *)(uintptr_t)SPU(LAP);
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)SPU(GX);
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)SPU(GY);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  const float *SIM_RESTRICT soil_head = (const float *)(uintptr_t)SPU(SOIL_HEAD);
  const float *SIM_RESTRICT soil_transmissivity = (const float *)(uintptr_t)SPU(SOIL_TRANSMISSIVITY);
  const float *SIM_RESTRICT soil_residual = (const float *)(uintptr_t)SPU(SOIL_RESIDUAL);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  const float *SIM_RESTRICT groundwater_head = (const float *)(uintptr_t)SPU(GROUNDWATER_HEAD);
  const float *SIM_RESTRICT groundwater_t = (const float *)(uintptr_t)SPU(GROUNDWATER_T);
  const float *SIM_RESTRICT mobile_nutrient = (const float *)(uintptr_t)SPU(MOBILE_NUTRIENT);
  const float *SIM_RESTRICT baobab_seed = (const float *)(uintptr_t)SPU(BAOBAB_SEED);
  const float *SIM_RESTRICT rose_seed = (const float *)(uintptr_t)SPU(ROSE_SEED);
  float *SIM_RESTRICT soil_transport = (float *)(uintptr_t)SPU(SOIL_TRANSPORT);
  float *SIM_RESTRICT groundwater_transport = (float *)(uintptr_t)SPU(GROUNDWATER_TRANSPORT);
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)SPU(H_TRANSPORT);
  float *SIM_RESTRICT soil_mineral_transport = (float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT);
  float *SIM_RESTRICT baobab_seed_transport = (float *)(uintptr_t)SPU(BAOBAB_SEED_TRANSPORT);
  float *SIM_RESTRICT rose_seed_transport = (float *)(uintptr_t)SPU(ROSE_SEED_TRANSPORT);
  float *SIM_RESTRICT surface_ux = (float *)(uintptr_t)SPU(SURFACE_UX);
  float *SIM_RESTRICT surface_uy = (float *)(uintptr_t)SPU(SURFACE_UY);
  float *SIM_RESTRICT top_soil_ux = (float *)(uintptr_t)SPU(TOP_SOIL_UX);
  float *SIM_RESTRICT top_soil_uy = (float *)(uintptr_t)SPU(TOP_SOIL_UY);
  float *SIM_RESTRICT groundwater_ux = (float *)(uintptr_t)SPU(GROUNDWATER_UX);
  float *SIM_RESTRICT groundwater_uy = (float *)(uintptr_t)SPU(GROUNDWATER_UY);
  float *SIM_RESTRICT flux_x = (float *)(uintptr_t)SPU(FLUX_X);
  float *SIM_RESTRICT flux_y = (float *)(uintptr_t)SPU(FLUX_Y);
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t stencil_cell_offset = i * SIM_RBF_STENCIL_SIZE;

    float lap_head0 = 0.0f;
    float gx_head0 = 0.0f;
    float gy_head0 = 0.0f;
    float gx_t0 = 0.0f;
    float gy_t0 = 0.0f;
    float lap_head1 = 0.0f;
    float gx_head1 = 0.0f;
    float gy_head1 = 0.0f;
    float gx_t1 = 0.0f;
    float gy_t1 = 0.0f;
    float lap_head2 = 0.0f;
    float gx_head2 = 0.0f;
    float gy_head2 = 0.0f;
    float gx_t2 = 0.0f;
    float gy_t2 = 0.0f;
    float lap_gw_head = 0.0f;
    float gx_gw_head = 0.0f;
    float gy_gw_head = 0.0f;
    float gx_gw_t = 0.0f;
    float gy_gw_t = 0.0f;
    float surface_mfd_x = 0.0f;
    float surface_mfd_y = 0.0f;
    float lap_surface_water = 0.0f;
    float lap_nutrient = 0.0f;
    float lap_baobab_seed = 0.0f;
    float lap_rose_seed = 0.0f;

    SIM_UNROLL_LOOP
    for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
      const int32_t weight_index = stencil_cell_offset + k;
      const int32_t cell_id = stencil[weight_index];
      const float lap_weight = lap_w[weight_index];
      const float gx_weight = gx_w[weight_index];
      const float gy_weight = gy_w[weight_index];
      const int32_t layer1_stencil_index = size + cell_id;
      const int32_t layer2_stencil_index = size2 + cell_id;

      const float head0 = soil_head[cell_id];
      const float transmissivity0 = soil_transmissivity[cell_id];
      lap_head0 += lap_weight * head0;
      gx_head0 += gx_weight * head0;
      gy_head0 += gy_weight * head0;
      gx_t0 += gx_weight * transmissivity0;
      gy_t0 += gy_weight * transmissivity0;

      const float head1 = soil_head[layer1_stencil_index];
      const float transmissivity1 = soil_transmissivity[layer1_stencil_index];
      lap_head1 += lap_weight * head1;
      gx_head1 += gx_weight * head1;
      gy_head1 += gy_weight * head1;
      gx_t1 += gx_weight * transmissivity1;
      gy_t1 += gy_weight * transmissivity1;

      const float head2 = soil_head[layer2_stencil_index];
      const float transmissivity2 = soil_transmissivity[layer2_stencil_index];
      lap_head2 += lap_weight * head2;
      gx_head2 += gx_weight * head2;
      gy_head2 += gy_weight * head2;
      gx_t2 += gx_weight * transmissivity2;
      gy_t2 += gy_weight * transmissivity2;

      const float groundwater_head_value = groundwater_head[cell_id];
      const float groundwater_t_value = groundwater_t[cell_id];
      lap_gw_head += lap_weight * groundwater_head_value;
      gx_gw_head += gx_weight * groundwater_head_value;
      gy_gw_head += gy_weight * groundwater_head_value;
      gx_gw_t += gx_weight * groundwater_t_value;
      gy_gw_t += gy_weight * groundwater_t_value;

      const float surface_water = h[cell_id];
      const float surface_drop = elevation[i] + h[i] - (elevation[cell_id] + surface_water);
      if (surface_drop > 0.0f) {
        surface_mfd_x += gx_weight * surface_drop;
        surface_mfd_y += gy_weight * surface_drop;
      }
      lap_surface_water += lap_weight * surface_water;

      lap_nutrient += lap_weight * mobile_nutrient[cell_id];
      lap_baobab_seed += lap_weight * baobab_seed[cell_id];
      lap_rose_seed += lap_weight * rose_seed[cell_id];
    }

    const int32_t layer0_index = i;
    const int32_t layer1_index = size + i;
    const int32_t layer2_index = size2 + i;
    const float local_t0 = soil_transmissivity[layer0_index];
    const float local_t1 = soil_transmissivity[layer1_index];
    const float local_t2 = soil_transmissivity[layer2_index];
    const float local_groundwater_t = groundwater_t[i];
    const float storage0 = soil_water[layer0_index];
    const float storage1 = soil_water[layer1_index];
    const float storage2 = soil_water[layer2_index];
    const float groundwater_storage_value = groundwater_storage[i];

    const float raw_transport0 = local_t0 * lap_head0 + gx_t0 * gx_head0 + gy_t0 * gy_head0;
    const float raw_transport1 = local_t1 * lap_head1 + gx_t1 * gx_head1 + gy_t1 * gy_head1;
    const float raw_transport2 = local_t2 * lap_head2 + gx_t2 * gx_head2 + gy_t2 * gy_head2;
    const float max_loss0 = (storage0 > soil_residual[layer0_index] ? storage0 - soil_residual[layer0_index] : 0.0f) * soil_transport_limit_scale;
    const float max_gain0 = (soil_cap[layer0_index] > storage0 ? soil_cap[layer0_index] - storage0 : 0.0f) * soil_transport_limit_scale;
    const float max_loss1 = (storage1 > soil_residual[layer1_index] ? storage1 - soil_residual[layer1_index] : 0.0f) * soil_transport_limit_scale;
    const float max_gain1 = (soil_cap[layer1_index] > storage1 ? soil_cap[layer1_index] - storage1 : 0.0f) * soil_transport_limit_scale;
    const float max_loss2 = (storage2 > soil_residual[layer2_index] ? storage2 - soil_residual[layer2_index] : 0.0f) * soil_transport_limit_scale;
    const float max_gain2 = (soil_cap[layer2_index] > storage2 ? soil_cap[layer2_index] - storage2 : 0.0f) * soil_transport_limit_scale;
    soil_transport[layer0_index] = sim_clamp(raw_transport0, -max_loss0, max_gain0);
    soil_transport[layer1_index] = sim_clamp(raw_transport1, -max_loss1, max_gain1);
    soil_transport[layer2_index] = sim_clamp(raw_transport2, -max_loss2, max_gain2);

    const float raw_groundwater_transport =
      local_groundwater_t * lap_gw_head + gx_gw_t * gx_gw_head + gy_gw_t * gy_gw_head;
    const float max_groundwater_loss = (groundwater_storage_value > 0.0f ? groundwater_storage_value : 0.0f) * groundwater_transport_limit_scale;
    const float max_groundwater_gain =
      (groundwater_cap[i] > groundwater_storage_value ? groundwater_cap[i] - groundwater_storage_value : 0.0f) * groundwater_transport_limit_scale;
    groundwater_transport[i] = sim_clamp(raw_groundwater_transport, -max_groundwater_loss, max_groundwater_gain);

    const float surface_scale = sim_surface_water_velocity_scale(
      h[i],
      surface_mfd_x,
      surface_mfd_y,
      surface_film_threshold_m,
      surface_slope_max_velocity_m_day);
    const float surface_vx = surface_mfd_x * surface_scale;
    const float surface_vy = surface_mfd_y * surface_scale;
    surface_ux[i] = surface_vx;
    surface_uy[i] = surface_vy;

    float top_qx = -local_t0 * gx_head0;
    float top_qy = -local_t0 * gy_head0;
    const float raw_top_max_flux = storage0 * top_flux_limit_scale;
    const float top_max_flux = raw_top_max_flux > 1.0e-7f ? raw_top_max_flux : 1.0e-7f;
    const float top_magnitude2 = top_qx * top_qx + top_qy * top_qy;
    const float top_max_flux2 = top_max_flux * top_max_flux;
    if (top_magnitude2 > top_max_flux2 && top_magnitude2 > 0.0f) {
      const float scale = top_max_flux / sim_sqrt(top_magnitude2);
      top_qx *= scale;
      top_qy *= scale;
    }
    const float top_speed_scale = storage0 > 1.0e-9f ? 1.0f / storage0 : 0.0f;
    const float top_soil_ux_value = top_qx * top_speed_scale;
    const float top_soil_uy_value = top_qy * top_speed_scale;
    if (write_diagnostics) {
      top_soil_ux[i] = top_soil_ux_value;
      top_soil_uy[i] = top_soil_uy_value;
    }

    float groundwater_qx = -local_groundwater_t * gx_gw_head;
    float groundwater_qy = -local_groundwater_t * gy_gw_head;
    const float raw_groundwater_max_flux = groundwater_storage_value * groundwater_flux_limit_scale;
    const float groundwater_max_flux = raw_groundwater_max_flux > 1.0e-7f ? raw_groundwater_max_flux : 1.0e-7f;
    const float groundwater_magnitude2 = groundwater_qx * groundwater_qx + groundwater_qy * groundwater_qy;
    const float groundwater_max_flux2 = groundwater_max_flux * groundwater_max_flux;
    if (groundwater_magnitude2 > groundwater_max_flux2 && groundwater_magnitude2 > 0.0f) {
      const float scale = groundwater_max_flux / sim_sqrt(groundwater_magnitude2);
      groundwater_qx *= scale;
      groundwater_qy *= scale;
    }
    const float groundwater_speed_scale = groundwater_storage_value > 1.0e-9f ? 1.0f / groundwater_storage_value : 0.0f;
    const float groundwater_ux_value = groundwater_qx * groundwater_speed_scale;
    const float groundwater_uy_value = groundwater_qy * groundwater_speed_scale;
    if (write_diagnostics) {
      groundwater_ux[i] = groundwater_ux_value;
      groundwater_uy[i] = groundwater_uy_value;
    }

    const float top_cap = soil_cap[layer0_index] > 1.0e-12f ? soil_cap[layer0_index] : 1.0e-12f;
    const float gw_cap = groundwater_cap[i] > 1.0e-12f ? groundwater_cap[i] : 1.0e-12f;
    const float top_sat = sim_clamp(storage0 / top_cap, 0.0f, 1.0f);
    const float gw_sat = sim_clamp(groundwater_storage_value / gw_cap, 0.0f, 1.0f);
    const float mobile_n = mobile_nutrient[i];
    const float top_weight = sim_clamp(0.68f + 0.18f * top_sat - 0.12f * gw_sat, 0.45f, 0.86f);
    const float ground_weight = 1.0f - top_weight;
    flux_x[i] = mobile_n * (top_weight * top_soil_ux_value + ground_weight * groundwater_ux_value);
    flux_y[i] = mobile_n * (top_weight * top_soil_uy_value + ground_weight * groundwater_uy_value);

    h_transport[i] = surface_water_diff_m2_day * lap_surface_water;
    soil_mineral_transport[i] = nutrient_diff_m2_day * lap_nutrient;
    (void)lap_baobab_seed;
    baobab_seed_transport[i] = 0.0f;
    rose_seed_transport[i] = transport_rose_seed ? rose_seed_diffusion_m2_day * lap_rose_seed : 0.0f;
  }
}

static void sim_transport_divergence_chunk(const uint32_t *params, int32_t active_count, uintptr_t active_ids_offset) {
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_ids_offset;
  const int32_t *SIM_RESTRICT stencil = (const int32_t *)(uintptr_t)SPU(STENCIL);
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)SPU(GX);
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)SPU(GY);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const uint8_t *SIM_RESTRICT land_active = (const uint8_t *)(uintptr_t)SPU(LAND_ACTIVE_OFFSET);
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)SPU(SOIL_MINERAL_N);
  const float *SIM_RESTRICT surface_ux = (const float *)(uintptr_t)SPU(SURFACE_UX);
  const float *SIM_RESTRICT surface_uy = (const float *)(uintptr_t)SPU(SURFACE_UY);
  const float *SIM_RESTRICT flux_x = (const float *)(uintptr_t)SPU(FLUX_X);
  const float *SIM_RESTRICT flux_y = (const float *)(uintptr_t)SPU(FLUX_Y);
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)SPU(H_TRANSPORT);
  float *SIM_RESTRICT soil_mineral_transport = (float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT);
  const float surface_film_threshold_m = SPF(SURFACE_FILM_THRESHOLD_M);
  const float dt_days = SPF(MODEL_DT_DAYS);
  const float cell_size_m = SPF(CELL_SIZE_M);
  const float nutrient_limit_scale = 0.32f / dt_days;
  const int32_t active_range = (active_ids_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_ids_offset >> 1u) : 0;

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_ids_offset, active_ids, cell_offset);
    const int32_t offset = i * SIM_RBF_STENCIL_SIZE;
    float nutrient_flux_divergence_x = 0.0f;
    float nutrient_flux_divergence_y = 0.0f;

    SIM_UNROLL_LOOP
    for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
      const int32_t weight_index = offset + k;
      const int32_t cell_id = stencil[weight_index];
      const float gx_weight = gx_w[weight_index];
      const float gy_weight = gy_w[weight_index];
      nutrient_flux_divergence_x += gx_weight * flux_x[cell_id];
      nutrient_flux_divergence_y += gy_weight * flux_y[cell_id];
    }

    const float source_drop_sum = sim_surface_mfd_drop_sum(i, stencil, elevation, h);
    const float source_outflow =
      source_drop_sum > 0.0f
        ? sim_surface_mfd_outflow_rate(h[i], surface_ux[i], surface_uy[i], cell_size_m, surface_film_threshold_m)
        : 0.0f;
    float surface_inflow = 0.0f;
    SIM_UNROLL_LOOP
    for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
      const int32_t source = stencil[offset + k];
      if (source == i || land_active[source] != 1u) {
        continue;
      }
      const float drop_to_target = sim_surface_mfd_drop_to_target(source, i, stencil, elevation, h);
      if (drop_to_target <= 0.0f) {
        continue;
      }
      const float drop_sum = sim_surface_mfd_drop_sum(source, stencil, elevation, h);
      if (drop_sum <= 0.0f) {
        continue;
      }
      const float source_rate =
        sim_surface_mfd_outflow_rate(h[source], surface_ux[source], surface_uy[source], cell_size_m, surface_film_threshold_m);
      surface_inflow += source_rate * (drop_to_target / drop_sum);
    }
    h_transport[i] = surface_inflow - source_outflow;
    const float max_surface_loss = sim_max(0.0f, h[i] - surface_film_threshold_m) / dt_days;
    if (h_transport[i] < -max_surface_loss) {
      h_transport[i] = -max_surface_loss;
    }
    soil_mineral_transport[i] -= nutrient_flux_divergence_x + nutrient_flux_divergence_y;
    const float max_loss = sim_max(0.0f, soil_mineral_n[i] - 0.002f) * nutrient_limit_scale;
    const float max_gain = sim_max(0.0f, 1.4f - soil_mineral_n[i]) * nutrient_limit_scale;
    soil_mineral_transport[i] = sim_clamp(soil_mineral_transport[i], -max_loss, max_gain);
  }
}

static inline float *sim_transport_scratch_field(float *scratch, int32_t scratch_stride, int32_t field) {
  return scratch + (int32_t)(field * scratch_stride);
}

static int32_t sim_transport_blocks_available(const uint32_t *params) {
  return
    SPI(TRANSPORT_BLOCK_COUNT) > 0 &&
    SPI(TRANSPORT_BLOCK_MAX_HALO_COUNT) > 0 &&
    SPI(TRANSPORT_BLOCK_SCRATCH_STRIDE) >= SPI(TRANSPORT_BLOCK_MAX_HALO_COUNT) &&
    SPU(TRANSPORT_BLOCK_CELL_OFFSETS) &&
    SPU(TRANSPORT_BLOCK_CELL_IDS) &&
    SPU(TRANSPORT_BLOCK_HALO_OFFSETS) &&
    SPU(TRANSPORT_BLOCK_HALO_IDS) &&
    SPU(TRANSPORT_BLOCK_LOCAL_STENCIL) &&
    SPU(TRANSPORT_BLOCK_SCRATCH);
}

static void sim_transport_darcy_core_blocks(
  const uint32_t *params,
  int32_t block_start,
  int32_t block_end,
  int32_t block_step,
  int32_t thread_id,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t write_diagnostics
) {
  const int32_t size = SPI(SIZE);
  const int32_t size2 = size * 2;
  const float dt_days = SPF(MODEL_DT_DAYS);
  const float cell_size_m = SPF(CELL_SIZE_M);
  const float inv_dt_days = 1.0f / dt_days;
  const float soil_transport_limit_scale = 0.42f * inv_dt_days;
  const float groundwater_transport_limit_scale = 0.36f * inv_dt_days;
  const float top_flux_limit_scale = cell_size_m * 0.16f * inv_dt_days;
  const float groundwater_flux_limit_scale = cell_size_m * 0.12f * inv_dt_days;
  const float surface_water_diff_m2_day = SPF(SURFACE_WATER_DIFF_M2_DAY);
  const float surface_slope_velocity_m_day = SPF(SURFACE_SLOPE_VELOCITY_M_DAY);
  (void)surface_slope_velocity_m_day;
  const float surface_slope_max_velocity_m_day = SPF(SURFACE_SLOPE_MAX_VELOCITY_M_DAY);
  const float surface_film_threshold_m = SPF(SURFACE_FILM_THRESHOLD_M);
  const float nutrient_diff_m2_day = SPF(NUTRIENT_DIFF_M2_DAY);
  const float baobab_seed_diffusion_m2_day = SPF(BAOBAB_SEED_DIFFUSION_M2_DAY);
  const float rose_seed_diffusion_m2_day = SPF(ROSE_SEED_DIFFUSION_M2_DAY);
  const int32_t transport_baobab_seed = baobab_seed_diffusion_m2_day != 0.0f;
  const int32_t transport_rose_seed = rose_seed_diffusion_m2_day != 0.0f;
  (void)baobab_seed_diffusion_m2_day;
  (void)transport_baobab_seed;

  const int32_t *SIM_RESTRICT block_cell_offsets = (const int32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_CELL_OFFSETS);
  const uint32_t *SIM_RESTRICT block_cell_ids = (const uint32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_CELL_IDS);
  const int32_t *SIM_RESTRICT block_halo_offsets = (const int32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_HALO_OFFSETS);
  const uint32_t *SIM_RESTRICT block_halo_ids = (const uint32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_HALO_IDS);
  const uint16_t *SIM_RESTRICT block_local_stencil = (const uint16_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_LOCAL_STENCIL);
  const float *SIM_RESTRICT lap_w = (const float *)(uintptr_t)SPU(LAP);
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)SPU(GX);
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)SPU(GY);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  const float *SIM_RESTRICT soil_head = (const float *)(uintptr_t)SPU(SOIL_HEAD);
  const float *SIM_RESTRICT soil_transmissivity = (const float *)(uintptr_t)SPU(SOIL_TRANSMISSIVITY);
  const float *SIM_RESTRICT soil_residual = (const float *)(uintptr_t)SPU(SOIL_RESIDUAL);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  const float *SIM_RESTRICT groundwater_head = (const float *)(uintptr_t)SPU(GROUNDWATER_HEAD);
  const float *SIM_RESTRICT groundwater_t = (const float *)(uintptr_t)SPU(GROUNDWATER_T);
  const float *SIM_RESTRICT mobile_nutrient = (const float *)(uintptr_t)SPU(MOBILE_NUTRIENT);
  const float *SIM_RESTRICT baobab_seed = (const float *)(uintptr_t)SPU(BAOBAB_SEED);
  const float *SIM_RESTRICT rose_seed = (const float *)(uintptr_t)SPU(ROSE_SEED);
  float *SIM_RESTRICT soil_transport = (float *)(uintptr_t)SPU(SOIL_TRANSPORT);
  float *SIM_RESTRICT groundwater_transport = (float *)(uintptr_t)SPU(GROUNDWATER_TRANSPORT);
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)SPU(H_TRANSPORT);
  float *SIM_RESTRICT soil_mineral_transport = (float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT);
  float *SIM_RESTRICT baobab_seed_transport = (float *)(uintptr_t)SPU(BAOBAB_SEED_TRANSPORT);
  float *SIM_RESTRICT rose_seed_transport = (float *)(uintptr_t)SPU(ROSE_SEED_TRANSPORT);
  float *SIM_RESTRICT surface_ux = (float *)(uintptr_t)SPU(SURFACE_UX);
  float *SIM_RESTRICT surface_uy = (float *)(uintptr_t)SPU(SURFACE_UY);
  float *SIM_RESTRICT top_soil_ux = (float *)(uintptr_t)SPU(TOP_SOIL_UX);
  float *SIM_RESTRICT top_soil_uy = (float *)(uintptr_t)SPU(TOP_SOIL_UY);
  float *SIM_RESTRICT groundwater_ux = (float *)(uintptr_t)SPU(GROUNDWATER_UX);
  float *SIM_RESTRICT groundwater_uy = (float *)(uintptr_t)SPU(GROUNDWATER_UY);
  float *SIM_RESTRICT flux_x = (float *)(uintptr_t)SPU(FLUX_X);
  float *SIM_RESTRICT flux_y = (float *)(uintptr_t)SPU(FLUX_Y);
  const int32_t scratch_stride = SPI(TRANSPORT_BLOCK_SCRATCH_STRIDE);
  float *SIM_RESTRICT scratch_base = (float *)(uintptr_t)SPU(TRANSPORT_BLOCK_SCRATCH);
  float *SIM_RESTRICT scratch = scratch_base + (int32_t)(thread_id * scratch_stride * SIM_TRANSPORT_SCRATCH_FIELDS);
  float *SIM_RESTRICT scratch_h = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_H);
  float *SIM_RESTRICT scratch_mobile_n = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_MOBILE_N);
  float *SIM_RESTRICT scratch_baobab_seed = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_BAOBAB_SEED);
  float *SIM_RESTRICT scratch_rose_seed = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_ROSE_SEED);
  float *SIM_RESTRICT scratch_soil_head0 = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_SOIL_HEAD0);
  float *SIM_RESTRICT scratch_soil_head1 = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_SOIL_HEAD1);
  float *SIM_RESTRICT scratch_soil_head2 = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_SOIL_HEAD2);
  float *SIM_RESTRICT scratch_soil_t0 = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_SOIL_T0);
  float *SIM_RESTRICT scratch_soil_t1 = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_SOIL_T1);
  float *SIM_RESTRICT scratch_soil_t2 = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_SOIL_T2);
  float *SIM_RESTRICT scratch_gw_head = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_GW_HEAD);
  float *SIM_RESTRICT scratch_gw_t = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_GW_T);

  if (block_step < 1) {
    block_step = 1;
  }
  for (int32_t block = block_start; block < block_end; block += block_step) {
    const int32_t center_start = block_cell_offsets[block];
    const int32_t center_end = block_cell_offsets[block + 1];
    const int32_t halo_count = block_halo_offsets[block + 1] - block_halo_offsets[block];
    const int32_t halo_base = block * scratch_stride;

    double subphase_start = sim_profile_clock(profile_offset);
    SIM_VECTORIZE_LOOP
    for (int32_t hidx = 0; hidx < halo_count; hidx += 1) {
      const int32_t cell_id = block_halo_ids[halo_base + hidx];
      const int32_t layer1_index = size + cell_id;
      const int32_t layer2_index = size2 + cell_id;
      scratch_h[hidx] = h[cell_id];
      scratch_mobile_n[hidx] = mobile_nutrient[cell_id];
      scratch_baobab_seed[hidx] = baobab_seed[cell_id];
      scratch_rose_seed[hidx] = rose_seed[cell_id];
      scratch_soil_head0[hidx] = soil_head[cell_id];
      scratch_soil_head1[hidx] = soil_head[layer1_index];
      scratch_soil_head2[hidx] = soil_head[layer2_index];
      scratch_soil_t0[hidx] = soil_transmissivity[cell_id];
      scratch_soil_t1[hidx] = soil_transmissivity[layer1_index];
      scratch_soil_t2[hidx] = soil_transmissivity[layer2_index];
      scratch_gw_head[hidx] = groundwater_head[cell_id];
      scratch_gw_t[hidx] = groundwater_t[cell_id];
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DARCY_CORE_HALO, subphase_start);

    subphase_start = sim_profile_clock(profile_offset);
    for (int32_t center_pos = center_start; center_pos < center_end; center_pos += 1) {
      const int32_t i = block_cell_ids[center_pos];
      const int32_t stencil_cell_offset = i * SIM_RBF_STENCIL_SIZE;
      const int32_t local_stencil_offset = center_pos * SIM_RBF_STENCIL_SIZE;
      const float *SIM_RESTRICT lap_ptr = lap_w + stencil_cell_offset;
      const float *SIM_RESTRICT gx_ptr = gx_w + stencil_cell_offset;
      const float *SIM_RESTRICT gy_ptr = gy_w + stencil_cell_offset;
      const uint16_t *SIM_RESTRICT local_stencil_ptr = block_local_stencil + local_stencil_offset;

      float lap_head0 = 0.0f;
      float gx_head0 = 0.0f;
      float gy_head0 = 0.0f;
      float gx_t0 = 0.0f;
      float gy_t0 = 0.0f;
      float lap_head1 = 0.0f;
      float gx_head1 = 0.0f;
      float gy_head1 = 0.0f;
      float gx_t1 = 0.0f;
      float gy_t1 = 0.0f;
      float lap_head2 = 0.0f;
      float gx_head2 = 0.0f;
      float gy_head2 = 0.0f;
      float gx_t2 = 0.0f;
      float gy_t2 = 0.0f;
      float lap_gw_head = 0.0f;
      float gx_gw_head = 0.0f;
      float gy_gw_head = 0.0f;
      float gx_gw_t = 0.0f;
      float gy_gw_t = 0.0f;
      float surface_mfd_x = 0.0f;
      float surface_mfd_y = 0.0f;
      float lap_surface_water = 0.0f;
      float lap_nutrient = 0.0f;
      float lap_baobab_seed = 0.0f;
      float lap_rose_seed = 0.0f;

      SIM_UNROLL_LOOP
      for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
        const int32_t local_index = local_stencil_ptr[k];
        const float lap_weight = lap_ptr[k];
        const float gx_weight = gx_ptr[k];
        const float gy_weight = gy_ptr[k];

        const float head0 = scratch_soil_head0[local_index];
        const float transmissivity0 = scratch_soil_t0[local_index];
        lap_head0 += lap_weight * head0;
        gx_head0 += gx_weight * head0;
        gy_head0 += gy_weight * head0;
        gx_t0 += gx_weight * transmissivity0;
        gy_t0 += gy_weight * transmissivity0;

        const float head1 = scratch_soil_head1[local_index];
        const float transmissivity1 = scratch_soil_t1[local_index];
        lap_head1 += lap_weight * head1;
        gx_head1 += gx_weight * head1;
        gy_head1 += gy_weight * head1;
        gx_t1 += gx_weight * transmissivity1;
        gy_t1 += gy_weight * transmissivity1;

        const float head2 = scratch_soil_head2[local_index];
        const float transmissivity2 = scratch_soil_t2[local_index];
        lap_head2 += lap_weight * head2;
        gx_head2 += gx_weight * head2;
        gy_head2 += gy_weight * head2;
        gx_t2 += gx_weight * transmissivity2;
        gy_t2 += gy_weight * transmissivity2;

        const float groundwater_head_value = scratch_gw_head[local_index];
        const float groundwater_t_value = scratch_gw_t[local_index];
        lap_gw_head += lap_weight * groundwater_head_value;
        gx_gw_head += gx_weight * groundwater_head_value;
        gy_gw_head += gy_weight * groundwater_head_value;
        gx_gw_t += gx_weight * groundwater_t_value;
        gy_gw_t += gy_weight * groundwater_t_value;

        const float surface_water = scratch_h[local_index];
        const int32_t cell_id = block_halo_ids[halo_base + local_index];
        const float surface_drop = elevation[i] + h[i] - (elevation[cell_id] + surface_water);
        if (surface_drop > 0.0f) {
          surface_mfd_x += gx_weight * surface_drop;
          surface_mfd_y += gy_weight * surface_drop;
        }
        lap_surface_water += lap_weight * surface_water;

        lap_nutrient += lap_weight * scratch_mobile_n[local_index];
        lap_baobab_seed += lap_weight * scratch_baobab_seed[local_index];
        lap_rose_seed += lap_weight * scratch_rose_seed[local_index];
      }

      const int32_t layer0_index = i;
      const int32_t layer1_index = size + i;
      const int32_t layer2_index = size2 + i;
      const float local_t0 = soil_transmissivity[layer0_index];
      const float local_t1 = soil_transmissivity[layer1_index];
      const float local_t2 = soil_transmissivity[layer2_index];
      const float local_groundwater_t = groundwater_t[i];
      const float storage0 = soil_water[layer0_index];
      const float storage1 = soil_water[layer1_index];
      const float storage2 = soil_water[layer2_index];
      const float groundwater_storage_value = groundwater_storage[i];

      const float raw_transport0 = local_t0 * lap_head0 + gx_t0 * gx_head0 + gy_t0 * gy_head0;
      const float raw_transport1 = local_t1 * lap_head1 + gx_t1 * gx_head1 + gy_t1 * gy_head1;
      const float raw_transport2 = local_t2 * lap_head2 + gx_t2 * gx_head2 + gy_t2 * gy_head2;
      const float max_loss0 = (storage0 > soil_residual[layer0_index] ? storage0 - soil_residual[layer0_index] : 0.0f) * soil_transport_limit_scale;
      const float max_gain0 = (soil_cap[layer0_index] > storage0 ? soil_cap[layer0_index] - storage0 : 0.0f) * soil_transport_limit_scale;
      const float max_loss1 = (storage1 > soil_residual[layer1_index] ? storage1 - soil_residual[layer1_index] : 0.0f) * soil_transport_limit_scale;
      const float max_gain1 = (soil_cap[layer1_index] > storage1 ? soil_cap[layer1_index] - storage1 : 0.0f) * soil_transport_limit_scale;
      const float max_loss2 = (storage2 > soil_residual[layer2_index] ? storage2 - soil_residual[layer2_index] : 0.0f) * soil_transport_limit_scale;
      const float max_gain2 = (soil_cap[layer2_index] > storage2 ? soil_cap[layer2_index] - storage2 : 0.0f) * soil_transport_limit_scale;
      soil_transport[layer0_index] = sim_clamp(raw_transport0, -max_loss0, max_gain0);
      soil_transport[layer1_index] = sim_clamp(raw_transport1, -max_loss1, max_gain1);
      soil_transport[layer2_index] = sim_clamp(raw_transport2, -max_loss2, max_gain2);

      const float raw_groundwater_transport =
        local_groundwater_t * lap_gw_head + gx_gw_t * gx_gw_head + gy_gw_t * gy_gw_head;
      const float max_groundwater_loss = (groundwater_storage_value > 0.0f ? groundwater_storage_value : 0.0f) * groundwater_transport_limit_scale;
      const float max_groundwater_gain =
        (groundwater_cap[i] > groundwater_storage_value ? groundwater_cap[i] - groundwater_storage_value : 0.0f) * groundwater_transport_limit_scale;
      groundwater_transport[i] = sim_clamp(raw_groundwater_transport, -max_groundwater_loss, max_groundwater_gain);

      const float surface_scale = sim_surface_water_velocity_scale(
        h[i],
        surface_mfd_x,
        surface_mfd_y,
        surface_film_threshold_m,
        surface_slope_max_velocity_m_day);
      const float surface_vx = surface_mfd_x * surface_scale;
      const float surface_vy = surface_mfd_y * surface_scale;
      surface_ux[i] = surface_vx;
      surface_uy[i] = surface_vy;

      float top_qx = -local_t0 * gx_head0;
      float top_qy = -local_t0 * gy_head0;
      const float raw_top_max_flux = storage0 * top_flux_limit_scale;
      const float top_max_flux = raw_top_max_flux > 1.0e-7f ? raw_top_max_flux : 1.0e-7f;
      const float top_magnitude2 = top_qx * top_qx + top_qy * top_qy;
      const float top_max_flux2 = top_max_flux * top_max_flux;
      if (top_magnitude2 > top_max_flux2 && top_magnitude2 > 0.0f) {
        const float scale = top_max_flux / sim_sqrt(top_magnitude2);
        top_qx *= scale;
        top_qy *= scale;
      }
      const float top_speed_scale = storage0 > 1.0e-9f ? 1.0f / storage0 : 0.0f;
      const float top_soil_ux_value = top_qx * top_speed_scale;
      const float top_soil_uy_value = top_qy * top_speed_scale;
      if (write_diagnostics) {
        top_soil_ux[i] = top_soil_ux_value;
        top_soil_uy[i] = top_soil_uy_value;
      }

      float groundwater_qx = -local_groundwater_t * gx_gw_head;
      float groundwater_qy = -local_groundwater_t * gy_gw_head;
      const float raw_groundwater_max_flux = groundwater_storage_value * groundwater_flux_limit_scale;
      const float groundwater_max_flux = raw_groundwater_max_flux > 1.0e-7f ? raw_groundwater_max_flux : 1.0e-7f;
      const float groundwater_magnitude2 = groundwater_qx * groundwater_qx + groundwater_qy * groundwater_qy;
      const float groundwater_max_flux2 = groundwater_max_flux * groundwater_max_flux;
      if (groundwater_magnitude2 > groundwater_max_flux2 && groundwater_magnitude2 > 0.0f) {
        const float scale = groundwater_max_flux / sim_sqrt(groundwater_magnitude2);
        groundwater_qx *= scale;
        groundwater_qy *= scale;
      }
      const float groundwater_speed_scale = groundwater_storage_value > 1.0e-9f ? 1.0f / groundwater_storage_value : 0.0f;
      const float groundwater_ux_value = groundwater_qx * groundwater_speed_scale;
      const float groundwater_uy_value = groundwater_qy * groundwater_speed_scale;
      if (write_diagnostics) {
        groundwater_ux[i] = groundwater_ux_value;
        groundwater_uy[i] = groundwater_uy_value;
      }

      const float top_cap = soil_cap[layer0_index] > 1.0e-12f ? soil_cap[layer0_index] : 1.0e-12f;
      const float gw_cap = groundwater_cap[i] > 1.0e-12f ? groundwater_cap[i] : 1.0e-12f;
      const float top_sat = sim_clamp(storage0 / top_cap, 0.0f, 1.0f);
      const float gw_sat = sim_clamp(groundwater_storage_value / gw_cap, 0.0f, 1.0f);
      const float mobile_n = mobile_nutrient[i];
      const float top_weight = sim_clamp(0.68f + 0.18f * top_sat - 0.12f * gw_sat, 0.45f, 0.86f);
      const float ground_weight = 1.0f - top_weight;
      flux_x[i] = mobile_n * (top_weight * top_soil_ux_value + ground_weight * groundwater_ux_value);
      flux_y[i] = mobile_n * (top_weight * top_soil_uy_value + ground_weight * groundwater_uy_value);

      h_transport[i] = surface_water_diff_m2_day * lap_surface_water;
      soil_mineral_transport[i] = nutrient_diff_m2_day * lap_nutrient;
      (void)lap_baobab_seed;
      baobab_seed_transport[i] = 0.0f;
      rose_seed_transport[i] = transport_rose_seed ? rose_seed_diffusion_m2_day * lap_rose_seed : 0.0f;
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DARCY_CORE_STENCIL, subphase_start);
  }
}

static void sim_transport_divergence_blocks(
  const uint32_t *params,
  int32_t block_start,
  int32_t block_end,
  int32_t block_step,
  int32_t thread_id,
  uintptr_t profile_offset,
  int32_t profile_stride
) {
  const int32_t *SIM_RESTRICT block_cell_offsets = (const int32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_CELL_OFFSETS);
  const uint32_t *SIM_RESTRICT block_cell_ids = (const uint32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_CELL_IDS);
  const int32_t *SIM_RESTRICT block_halo_offsets = (const int32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_HALO_OFFSETS);
  const uint32_t *SIM_RESTRICT block_halo_ids = (const uint32_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_HALO_IDS);
  const uint16_t *SIM_RESTRICT block_local_stencil = (const uint16_t *)(uintptr_t)SPU(TRANSPORT_BLOCK_LOCAL_STENCIL);
  const int32_t *SIM_RESTRICT stencil = (const int32_t *)(uintptr_t)SPU(STENCIL);
  const float *SIM_RESTRICT gx_w = (const float *)(uintptr_t)SPU(GX);
  const float *SIM_RESTRICT gy_w = (const float *)(uintptr_t)SPU(GY);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const uint8_t *SIM_RESTRICT land_active = (const uint8_t *)(uintptr_t)SPU(LAND_ACTIVE_OFFSET);
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)SPU(SOIL_MINERAL_N);
  const float *SIM_RESTRICT surface_ux = (const float *)(uintptr_t)SPU(SURFACE_UX);
  const float *SIM_RESTRICT surface_uy = (const float *)(uintptr_t)SPU(SURFACE_UY);
  const float *SIM_RESTRICT flux_x = (const float *)(uintptr_t)SPU(FLUX_X);
  const float *SIM_RESTRICT flux_y = (const float *)(uintptr_t)SPU(FLUX_Y);
  float *SIM_RESTRICT h_transport = (float *)(uintptr_t)SPU(H_TRANSPORT);
  float *SIM_RESTRICT soil_mineral_transport = (float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT);
  const float surface_film_threshold_m = SPF(SURFACE_FILM_THRESHOLD_M);
  const float dt_days = SPF(MODEL_DT_DAYS);
  const float cell_size_m = SPF(CELL_SIZE_M);
  const float nutrient_limit_scale = 0.32f / dt_days;
  const int32_t scratch_stride = SPI(TRANSPORT_BLOCK_SCRATCH_STRIDE);
  float *SIM_RESTRICT scratch_base = (float *)(uintptr_t)SPU(TRANSPORT_BLOCK_SCRATCH);
  float *SIM_RESTRICT scratch = scratch_base + (int32_t)(thread_id * scratch_stride * SIM_TRANSPORT_SCRATCH_FIELDS);
  float *SIM_RESTRICT scratch_flux_x = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_FLUX_X);
  float *SIM_RESTRICT scratch_flux_y = sim_transport_scratch_field(scratch, scratch_stride, SIM_TRANSPORT_SCRATCH_FLUX_Y);

  if (block_step < 1) {
    block_step = 1;
  }
  for (int32_t block = block_start; block < block_end; block += block_step) {
    const int32_t center_start = block_cell_offsets[block];
    const int32_t center_end = block_cell_offsets[block + 1];
    const int32_t halo_count = block_halo_offsets[block + 1] - block_halo_offsets[block];
    const int32_t halo_base = block * scratch_stride;

    double subphase_start = sim_profile_clock(profile_offset);
    SIM_VECTORIZE_LOOP
    for (int32_t hidx = 0; hidx < halo_count; hidx += 1) {
      const int32_t cell_id = block_halo_ids[halo_base + hidx];
      scratch_flux_x[hidx] = flux_x[cell_id];
      scratch_flux_y[hidx] = flux_y[cell_id];
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DIVERGENCE_HALO, subphase_start);

    subphase_start = sim_profile_clock(profile_offset);
    for (int32_t center_pos = center_start; center_pos < center_end; center_pos += 1) {
      const int32_t i = block_cell_ids[center_pos];
      const int32_t offset = i * SIM_RBF_STENCIL_SIZE;
      const int32_t local_stencil_offset = center_pos * SIM_RBF_STENCIL_SIZE;
      const float *SIM_RESTRICT gx_ptr = gx_w + offset;
      const float *SIM_RESTRICT gy_ptr = gy_w + offset;
      const uint16_t *SIM_RESTRICT local_stencil_ptr = block_local_stencil + local_stencil_offset;
      float nutrient_flux_divergence_x = 0.0f;
      float nutrient_flux_divergence_y = 0.0f;

      SIM_UNROLL_LOOP
      for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
        const int32_t local_index = local_stencil_ptr[k];
        const float gx_weight = gx_ptr[k];
        const float gy_weight = gy_ptr[k];
        nutrient_flux_divergence_x += gx_weight * scratch_flux_x[local_index];
        nutrient_flux_divergence_y += gy_weight * scratch_flux_y[local_index];
      }

      const float source_drop_sum = sim_surface_mfd_drop_sum(i, stencil, elevation, h);
      const float source_outflow =
        source_drop_sum > 0.0f
          ? sim_surface_mfd_outflow_rate(h[i], surface_ux[i], surface_uy[i], cell_size_m, surface_film_threshold_m)
          : 0.0f;
      float surface_inflow = 0.0f;
      SIM_UNROLL_LOOP
      for (int32_t k = 0; k < SIM_RBF_STENCIL_SIZE; k += 1) {
        const int32_t source = stencil[offset + k];
        if (source == i || land_active[source] != 1u) {
          continue;
        }
        const float drop_to_target = sim_surface_mfd_drop_to_target(source, i, stencil, elevation, h);
        if (drop_to_target <= 0.0f) {
          continue;
        }
        const float drop_sum = sim_surface_mfd_drop_sum(source, stencil, elevation, h);
        if (drop_sum <= 0.0f) {
          continue;
        }
        const float source_rate =
          sim_surface_mfd_outflow_rate(h[source], surface_ux[source], surface_uy[source], cell_size_m, surface_film_threshold_m);
        surface_inflow += source_rate * (drop_to_target / drop_sum);
      }
      h_transport[i] = surface_inflow - source_outflow;
      const float max_surface_loss = sim_max(0.0f, h[i] - surface_film_threshold_m) / dt_days;
      if (h_transport[i] < -max_surface_loss) {
        h_transport[i] = -max_surface_loss;
      }
      soil_mineral_transport[i] -= nutrient_flux_divergence_x + nutrient_flux_divergence_y;
      const float max_loss = sim_max(0.0f, soil_mineral_n[i] - 0.002f) * nutrient_limit_scale;
      const float max_gain = sim_max(0.0f, 1.4f - soil_mineral_n[i]) * nutrient_limit_scale;
      soil_mineral_transport[i] = sim_clamp(soil_mineral_transport[i], -max_loss, max_gain);
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DIVERGENCE_STENCIL, subphase_start);
  }
}

static void sim_update_canopy_environment_plant_water_fluxes_from_params(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  int32_t write_diagnostics
) {
  const int32_t size = SPI(SIZE);
  const int32_t *SIM_RESTRICT active_ids = (const int32_t *)(uintptr_t)active_offset;
  const int32_t active_range = (active_offset & SIM_ACTIVE_RANGE_FLAG) ? 1 : 0;
  const int32_t active_start = active_range ? (int32_t)(active_offset >> 1u) : 0;
  const int32_t size2 = size * 2;

  const int32_t is_earth = SPI(IS_EARTH);
  const int32_t hydraulic_lookup_steps = SPI(HYDRAULIC_LOOKUP_STEPS);
  const int32_t photo_lookup_steps = SPI(PHOTO_LOOKUP_STEPS);
  const float photo_temp_min_c = SPF(PHOTO_TEMP_MIN_C);
  const float photo_temp_lookup_scale = SPF(PHOTO_TEMP_LOOKUP_SCALE);
  const float root_depth = SPF(ROOT_DEPTH);
  const float storage = SPF(STORAGE);
  const float evaporation_factor = SPF(EVAPORATION);
  const float atmospheric_co2 = SPF(ATMOSPHERIC_CO2);
  const float asteroid_mean_temp_c = SPF(ASTEROID_MEAN_TEMP_C);
  const float asteroid_diurnal_range_c = SPF(ASTEROID_DIURNAL_RANGE_C);
  const float asteroid_latitude_temp_range_c = SPF(ASTEROID_LATITUDE_TEMP_RANGE_C);
  const float shade_param = SPF(SHADE);
  const float deep_bias = sim_clamp((root_depth - 1.0f) / 7.0f, 0.0f, 1.0f);
  const float dt = SPF(MODEL_DT_DAYS);
  const float reference_aero = 1.65f / 208.0f;
  const float reference_surface = reference_aero / sim_max(0.05f, 0.34f * 1.65f);
  const float bare_soil_aero = sim_min(0.014f, sim_max(0.0035f, reference_aero * (0.72f + 0.18f * 1.65f)));

  const float baobab_quantum_yield = SPF(BAOBAB_QUANTUM_YIELD);
  const float baobab_curvature = SPF(BAOBAB_CURVATURE);
  const float baobab_ci_min = SPF(BAOBAB_CI_MIN);
  const float baobab_ci_max = SPF(BAOBAB_CI_MAX);
  const float baobab_extinction = SPF(BAOBAB_EXTINCTION);
  const float baobab_g0_mol = SPF(BAOBAB_G0_MOL);
  const float baobab_g1 = SPF(BAOBAB_G1);
  const float baobab_max_conductance_mps = SPF(BAOBAB_MAX_CONDUCTANCE_MPS);
  const float baobab_multiplier = SPF(BAOBAB_MULTIPLIER);
  const float rose_quantum_yield = SPF(ROSE_QUANTUM_YIELD);
  const float rose_curvature = SPF(ROSE_CURVATURE);
  const float rose_ci_min = SPF(ROSE_CI_MIN);
  const float rose_ci_max = SPF(ROSE_CI_MAX);
  const float rose_extinction = SPF(ROSE_EXTINCTION);
  const float rose_g0_mol = SPF(ROSE_G0_MOL);
  const float rose_g1 = SPF(ROSE_G1);
  const float rose_max_conductance_mps = SPF(ROSE_MAX_CONDUCTANCE_MPS);
  const float rose_multiplier = SPF(ROSE_MULTIPLIER);

  const float *SIM_RESTRICT hydraulic_psi = (const float *)(uintptr_t)SPU(HYDRAULIC_PSI);
  const float *SIM_RESTRICT baobab_vcmax = (const float *)(uintptr_t)SPU(BAOBAB_VCMAX);
  const float *SIM_RESTRICT baobab_jmax = (const float *)(uintptr_t)SPU(BAOBAB_JMAX);
  const float *SIM_RESTRICT baobab_rd = (const float *)(uintptr_t)SPU(BAOBAB_RD);
  const float *SIM_RESTRICT baobab_gamma_star = (const float *)(uintptr_t)SPU(BAOBAB_GAMMA_STAR);
  const float *SIM_RESTRICT baobab_kc = (const float *)(uintptr_t)SPU(BAOBAB_KC);
  const float *SIM_RESTRICT baobab_ko = (const float *)(uintptr_t)SPU(BAOBAB_KO);
  const float *SIM_RESTRICT rose_vcmax = (const float *)(uintptr_t)SPU(ROSE_VCMAX);
  const float *SIM_RESTRICT rose_jmax = (const float *)(uintptr_t)SPU(ROSE_JMAX);
  const float *SIM_RESTRICT rose_rd = (const float *)(uintptr_t)SPU(ROSE_RD);
  const float *SIM_RESTRICT rose_gamma_star = (const float *)(uintptr_t)SPU(ROSE_GAMMA_STAR);
  const float *SIM_RESTRICT rose_kc = (const float *)(uintptr_t)SPU(ROSE_KC);
  const float *SIM_RESTRICT rose_ko = (const float *)(uintptr_t)SPU(ROSE_KO);
  const float *SIM_RESTRICT cell_height = (const float *)(uintptr_t)SPU(CELL_HEIGHT);
  const float *SIM_RESTRICT climate_mean_temp_c = (const float *)(uintptr_t)SPU(CLIMATE_MEAN_TEMP_C);
  const float *SIM_RESTRICT climate_diurnal_range_c = (const float *)(uintptr_t)SPU(CLIMATE_DIURNAL_RANGE_C);
  const float *SIM_RESTRICT elevation = (const float *)(uintptr_t)SPU(ELEVATION);
  const uint8_t *SIM_RESTRICT baobab_blocked = (const uint8_t *)(uintptr_t)SPU(BAOBAB_BLOCKED);
  const uint8_t *SIM_RESTRICT substrate = (const uint8_t *)(uintptr_t)SPU(SUBSTRATE);
  const float *SIM_RESTRICT soil_water = (const float *)(uintptr_t)SPU(SOIL_WATER);
  const float *SIM_RESTRICT soil_cap = (const float *)(uintptr_t)SPU(SOIL_CAP);
  const float *SIM_RESTRICT soil_hydraulic_k = (const float *)(uintptr_t)SPU(SOIL_HYDRAULIC_K);
  const float *SIM_RESTRICT groundwater_storage = (const float *)(uintptr_t)SPU(GROUNDWATER_STORAGE);
  const float *SIM_RESTRICT groundwater_cap = (const float *)(uintptr_t)SPU(GROUNDWATER_CAP);
  const float *SIM_RESTRICT groundwater_t = (const float *)(uintptr_t)SPU(GROUNDWATER_T);
  const float *SIM_RESTRICT groundwater_thickness = (const float *)(uintptr_t)SPU(GROUNDWATER_THICKNESS);
  const float *SIM_RESTRICT h = (const float *)(uintptr_t)SPU(H);
  const float *SIM_RESTRICT r = (const float *)(uintptr_t)SPU(R);
  const float *SIM_RESTRICT w0 = (const float *)(uintptr_t)SPU(W0);
  const float *SIM_RESTRICT w1 = (const float *)(uintptr_t)SPU(W1);
  const float *SIM_RESTRICT sunlight = (const float *)(uintptr_t)SPU(SUNLIGHT);
  const float *SIM_RESTRICT canopy_water = (const float *)(uintptr_t)SPU(CANOPY_WATER);
  float *SIM_RESTRICT canopy_water_next = (float *)(uintptr_t)SPU(CANOPY_WATER_NEXT);
  float *SIM_RESTRICT canopy_evap_m = (float *)(uintptr_t)SPU(CANOPY_EVAP_M);
  const float *SIM_RESTRICT baobab_leaf = (const float *)(uintptr_t)SPU(BAOBAB_LEAF);
  const float *SIM_RESTRICT baobab_stem = (const float *)(uintptr_t)SPU(BAOBAB_STEM);
  const float *SIM_RESTRICT baobab_root = (const float *)(uintptr_t)SPU(BAOBAB_ROOT);
  const float *SIM_RESTRICT baobab_store = (const float *)(uintptr_t)SPU(BAOBAB_STORE);
  const float *SIM_RESTRICT rose_leaf = (const float *)(uintptr_t)SPU(ROSE_LEAF);
  const float *SIM_RESTRICT rose_flower = (const float *)(uintptr_t)SPU(ROSE_FLOWER);
  const float *SIM_RESTRICT rose_root = (const float *)(uintptr_t)SPU(ROSE_ROOT);
  const float *SIM_RESTRICT rose_store = (const float *)(uintptr_t)SPU(ROSE_STORE);
  const float *SIM_RESTRICT rose_fertility = (const float *)(uintptr_t)SPU(ROSE_FERTILITY);
  const float *SIM_RESTRICT soil_mineral_n = (const float *)(uintptr_t)SPU(SOIL_MINERAL_N);

  float *SIM_RESTRICT lai_baobab = (float *)(uintptr_t)SPU(LAI_BAOBAB);
  float *SIM_RESTRICT lai_rose = (float *)(uintptr_t)SPU(LAI_ROSE);
  float *SIM_RESTRICT cover_baobab = (float *)(uintptr_t)SPU(COVER_BAOBAB);
  float *SIM_RESTRICT cover_rose = (float *)(uintptr_t)SPU(COVER_ROSE);
  float *SIM_RESTRICT vegetation_cover = (float *)(uintptr_t)SPU(VEGETATION_COVER);
  float *SIM_RESTRICT canopy_light_baobab = (float *)(uintptr_t)SPU(CANOPY_LIGHT_BAOBAB);
  float *SIM_RESTRICT canopy_light_rose = (float *)(uintptr_t)SPU(CANOPY_LIGHT_ROSE);
  float *SIM_RESTRICT light_baobab = (float *)(uintptr_t)SPU(LIGHT_BAOBAB);
  float *SIM_RESTRICT light_rose = (float *)(uintptr_t)SPU(LIGHT_ROSE);
  float *SIM_RESTRICT surface_temp_c = (float *)(uintptr_t)SPU(SURFACE_TEMP_C);
  float *SIM_RESTRICT vpd_kpa = (float *)(uintptr_t)SPU(VPD_KPA);
  float *SIM_RESTRICT vapor_slope_kpa_c = (float *)(uintptr_t)SPU(VAPOR_SLOPE_KPA_C);
  float *SIM_RESTRICT par = (float *)(uintptr_t)SPU(PAR);
  float *SIM_RESTRICT apar_total = (float *)(uintptr_t)SPU(APAR_TOTAL);
  float *SIM_RESTRICT apar_baobab = (float *)(uintptr_t)SPU(APAR_BAOBAB);
  float *SIM_RESTRICT apar_rose = (float *)(uintptr_t)SPU(APAR_ROSE);
  float *SIM_RESTRICT photo_water_stress_baobab = (float *)(uintptr_t)SPU(PHOTO_WATER_STRESS_BAOBAB);
  float *SIM_RESTRICT photo_water_stress_rose = (float *)(uintptr_t)SPU(PHOTO_WATER_STRESS_ROSE);
  float *SIM_RESTRICT photo_nutrient_baobab = (float *)(uintptr_t)SPU(PHOTO_NUTRIENT_BAOBAB);
  float *SIM_RESTRICT photo_nutrient_rose = (float *)(uintptr_t)SPU(PHOTO_NUTRIENT_ROSE);
  float *SIM_RESTRICT gpp_baobab = (float *)(uintptr_t)SPU(GPP_BAOBAB);
  float *SIM_RESTRICT gpp_rose = (float *)(uintptr_t)SPU(GPP_ROSE);
  float *SIM_RESTRICT conductance_baobab = (float *)(uintptr_t)SPU(STOMATAL_CONDUCTANCE_BAOBAB);
  float *SIM_RESTRICT conductance_rose = (float *)(uintptr_t)SPU(STOMATAL_CONDUCTANCE_ROSE);
  float *SIM_RESTRICT ci_baobab = (float *)(uintptr_t)SPU(CI_BAOBAB);
  float *SIM_RESTRICT ci_rose = (float *)(uintptr_t)SPU(CI_ROSE);
  float *SIM_RESTRICT root_stress_baobab = (float *)(uintptr_t)SPU(ROOT_STRESS_BAOBAB);
  float *SIM_RESTRICT root_stress_rose = (float *)(uintptr_t)SPU(ROOT_STRESS_ROSE);
  float *SIM_RESTRICT hydrology_throughfall = (float *)(uintptr_t)SPU(HYDROLOGY_THROUGHFALL);
  float *SIM_RESTRICT hydrology_veg_feedback = (float *)(uintptr_t)SPU(HYDROLOGY_VEG_FEEDBACK);
  float *SIM_RESTRICT hydrology_sink0 = (float *)(uintptr_t)SPU(HYDROLOGY_SINK0);
  float *SIM_RESTRICT hydrology_sink1 = (float *)(uintptr_t)SPU(HYDROLOGY_SINK1);
  float *SIM_RESTRICT hydrology_sink2 = (float *)(uintptr_t)SPU(HYDROLOGY_SINK2);
  float *SIM_RESTRICT hydrology_groundwater_sink = (float *)(uintptr_t)SPU(HYDROLOGY_GROUNDWATER_SINK);
  float *SIM_RESTRICT hydrology_surface_evap_demand_m = (float *)(uintptr_t)SPU(HYDROLOGY_SURFACE_EVAP_DEMAND_M);

  sim_init_fast_tables();

  for (int32_t cell_offset = 0; cell_offset < active_count; cell_offset += 1) {
    const int32_t i = active_range ? active_start + cell_offset : sim_active_cell_id(active_offset, active_ids, cell_offset);
    const int32_t layer1 = size + i;
    const int32_t layer2 = size2 + i;
    const uint8_t sub = substrate[i];
    const int32_t blocked = baobab_blocked[i] != 0u;
    const float sub_root_b_value = substrate_root_b(sub);
    const float sub_root_r_value = substrate_root_r(sub);
    const float sub_evap_value = substrate_evap(sub);
    const float sub_nutrient_b_value = substrate_nutrient_b(sub);
    const float sub_nutrient_r_value = substrate_nutrient_r(sub);
    const float b_leaf = blocked ? 0.0f : baobab_leaf[i];
    const float b_stem = blocked ? 0.0f : baobab_stem[i];
    const float b_root = blocked ? 0.0f : baobab_root[i];
    const float b_store = baobab_store[i];
    const float r_leaf = rose_leaf[i];
    const float r_flower = rose_flower[i];
    const float r_root = rose_root[i];
    const float r_store = rose_store[i];
    const float soil_cap0 = soil_cap[i];
    const float groundwater_cap_value = groundwater_cap[i];
    const float surface_water = h[i];

    const float lai_b = sim_clamp(6.2f * sim_max(0.0f, b_leaf), 0.0f, 8.5f);
    const float lai_r = sim_clamp(6.4f * sim_max(0.0f, r_leaf) + 0.7f * sim_max(0.0f, r_flower), 0.0f, 6.5f);
    const float optical_depth_b = 0.58f * lai_b;
    const float optical_depth_r = 0.68f * lai_r;
    const float cover_b = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, optical_depth_b * 102.4f), 0.0f, 1.0f);
    const float cover_r = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, optical_depth_r * 102.4f), 0.0f, 1.0f);
    const float cover = sim_clamp(1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (optical_depth_b + optical_depth_r) * 102.4f), 0.0f, 1.0f);
    const float canopy_b = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.11f * lai_b) * 102.4f);
    const float canopy_r = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.57f * shade_param * lai_b + 0.18f * lai_r) * 102.4f);
    const float local_sunlight = sim_clamp(sunlight[i], 0.0f, 1.0f);
    const float light_b = local_sunlight * canopy_b;
    const float light_r = local_sunlight * canopy_r;

    if (write_diagnostics) {
      lai_baobab[i] = lai_b;
      lai_rose[i] = lai_r;
      cover_baobab[i] = cover_b;
      cover_rose[i] = cover_r;
    }
    vegetation_cover[i] = cover;
    canopy_light_baobab[i] = canopy_b;
    canopy_light_rose[i] = canopy_r;
    light_baobab[i] = light_b;
    light_rose[i] = light_r;

    const float top_sat = sim_clamp(w0[i] / soil_cap0, 0.0f, 1.0f);
    const float groundwater_sat = sim_clamp(w1[i] / groundwater_cap_value, 0.0f, 1.0f);
    const float wetness = sim_clamp(0.62f * top_sat + 0.38f * groundwater_sat, 0.0f, 1.0f);
    const float lai_total = lai_b + lai_r;
    const float rain = r[i];
    const float cloud_cooling = sim_clamp(rain * 900.0f, 0.0f, 1.0f);
    const float height = sim_clamp(cell_height[i], -1.0f, 1.0f);
    const float mean_insolation = sim_ring_mean_daily_insolation_from_height(height);
    float mean_climate = 0.0f;
    float diurnal_range = 0.0f;
    if (is_earth) {
      const float wet_anomaly = (0.5f - wetness) * 0.8f;
      mean_climate = sim_clamp(climate_mean_temp_c[i] + wet_anomaly - cloud_cooling * 0.55f, -34.0f, 34.0f);
      const float damping = cloud_cooling * 2.5f + cover * 1.2f + wetness * 0.8f;
      diurnal_range = sim_clamp(climate_diurnal_range_c[i] - damping, 2.4f, 27.0f);
    } else {
      const float latitude_range = sim_clamp(asteroid_latitude_temp_range_c, 0.0f, 12.0f);
      const float latitude_anomaly = sim_ring_latitude_temperature_unit_from_height(height) * latitude_range;
      const float terrain_cooling = sim_clamp(sim_max(0.0f, elevation[i]) / 5200.0f, 0.0f, 1.6f) * 5.4f;
      mean_climate = sim_clamp(asteroid_mean_temp_c + latitude_anomaly - terrain_cooling - cloud_cooling * 1.3f, -18.0f, 32.0f);
      const float terrain_boost = sim_clamp(sim_max(0.0f, elevation[i]) / 4200.0f, 0.0f, 1.4f) * 2.8f;
      const float damping = wetness * 7.5f + cloud_cooling * 5.5f + cover * 4.0f;
      diurnal_range = sim_clamp(asteroid_diurnal_range_c + terrain_boost - damping, 3.0f, 28.0f);
    }
    const float diurnal_anomaly = diurnal_range * (local_sunlight - mean_insolation);
    const float surface_water_scaled = sim_clamp(surface_water * 12.0f, 0.0f, 1.0f);
    const float surface_water_cooling = surface_water_scaled * (is_earth ? 1.6f : 1.1f);
    const float temp_c = sim_clamp(mean_climate + diurnal_anomaly - surface_water_cooling, -18.0f, 48.0f);
    const float saturated_vapor_pressure =
      sim_lookup_linear_table(sim_fast_vapor_pressure_table, 512, (temp_c + 20.0f) * (512.0f / 70.0f));
    const float vapor_slope_denom = temp_c + 237.3f;
    const float relative_humidity =
      sim_clamp(0.22f + 0.62f * wetness + 0.08f * sim_clamp(surface_water * 12.0f, 0.0f, 1.0f) + 0.04f * sim_min(1.0f, lai_total / 4.5f), 0.0f, 1.0f);
    const float local_par =
      42.0f *
      local_sunlight *
      3.1415926535897932f *
      (0.74f + 0.26f * sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.18f * lai_total) * 102.4f));
    const float local_vpd = sim_max(0.0f, saturated_vapor_pressure * (1.0f - relative_humidity));
    const float vapor_slope = (4098.0f * saturated_vapor_pressure) / (vapor_slope_denom * vapor_slope_denom);
    surface_temp_c[i] = temp_c;
    if (write_diagnostics) {
      vpd_kpa[i] = local_vpd;
      vapor_slope_kpa_c[i] = vapor_slope;
      par[i] = local_par;
    }

    float total_apar = 0.0f;
    float baobab_apar = 0.0f;
    float rose_apar = 0.0f;
    float stress_b = 0.0f;
    float stress_r = 0.0f;
    float nutrient_b = 0.0f;
    float nutrient_r = 0.0f;
    float gpp_b = 0.0f;
    float gpp_r = 0.0f;
    float conduct_b = 0.0f;
    float conduct_r = 0.0f;
    float ci_b = ci_baobab[i];
    float ci_r = ci_rose[i];
    float sat0 = 0.0f;
    float sat1 = 0.0f;
    float sat2 = 0.0f;
    float gw_sat = 0.0f;
    float psi0 = 0.0f;
    float psi1 = 0.0f;
    float psi2 = 0.0f;
    float layer_stress_b0 = 0.0f;
    float layer_stress_b1 = 0.0f;
    float layer_stress_b2 = 0.0f;
    float layer_stress_b3 = 0.0f;
    float layer_stress_r0 = 0.0f;
    float layer_stress_r1 = 0.0f;
    float layer_stress_r2 = 0.0f;
    float layer_stress_r3 = 0.0f;
    float baobab_root_frac = 0.42f;
    float rose_root_frac = 0.24f;
    SimPhotoTempLookup photo_temp_lookup;
    int32_t has_photo_temp_lookup = 0;

    const int32_t has_adult_canopy_or_root =
      b_leaf > 0.0f ||
      b_stem > 0.0f ||
      b_root > 0.0f ||
      b_store > 0.0f ||
      r_leaf > 0.0f ||
      r_flower > 0.0f ||
      r_root > 0.0f ||
      r_store > 0.0f;

    if (has_adult_canopy_or_root) {
      sat0 = sim_clamp(soil_water[i] / soil_cap0, 0.0f, 1.0f);
      sat1 = sim_clamp(soil_water[layer1] / soil_cap[layer1], 0.0f, 1.0f);
      sat2 = sim_clamp(soil_water[layer2] / soil_cap[layer2], 0.0f, 1.0f);
      gw_sat = sim_clamp(groundwater_storage[i] / groundwater_cap_value, 0.0f, 1.0f);
      const float baobab_mass = b_leaf + b_stem + b_root;
      const float rose_mass = r_leaf + r_flower + r_root;
      baobab_root_frac = baobab_mass > 0.0f ? b_root / baobab_mass : 0.42f;
      rose_root_frac = rose_mass > 0.0f ? r_root / rose_mass : 0.24f;
      psi0 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat0);
      psi1 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat1);
      psi2 = sim_lookup_hydraulic_psi(hydraulic_psi, hydraulic_lookup_steps, sub, sat2);
      layer_stress_b0 = sim_root_water_stress_from_psi(psi0, 0.06f, 105.0f, 520.0f);
      layer_stress_b1 = sim_root_water_stress_from_psi(psi1, 0.06f, 105.0f, 520.0f);
      layer_stress_b2 = sim_root_water_stress_from_psi(psi2, 0.06f, 105.0f, 520.0f);
      layer_stress_b3 = sim_clamp(0.18f + 0.82f * gw_sat, 0.0f, 1.0f);
      layer_stress_r0 = sim_root_water_stress_from_psi(psi0, 0.05f, 18.0f, 82.0f);
      layer_stress_r1 = sim_root_water_stress_from_psi(psi1, 0.05f, 18.0f, 82.0f);
      layer_stress_r2 = sim_root_water_stress_from_psi(psi2, 0.05f, 18.0f, 82.0f);
      layer_stress_r3 = sim_root_water_stress_from_psi(0.0f, 0.05f, 18.0f, 82.0f);
      const float structural_bias = sim_clamp((baobab_root_frac - 0.32f) / 0.36f, 0.0f, 1.0f);
      const float root_water_b = sim_weighted_root_stress4(
        0.34f - 0.22f * deep_bias,
        0.24f + 0.01f * structural_bias,
        0.25f + 0.13f * deep_bias + 0.05f * structural_bias,
        0.17f + 0.16f * deep_bias + 0.05f * structural_bias,
        layer_stress_b0,
        layer_stress_b1,
        layer_stress_b2,
        layer_stress_b3,
        sub_root_b_value
      );
      const float rose_deeper = sim_clamp((rose_root_frac - 0.2f) / 0.26f, 0.0f, 1.0f);
      const float root_water_r = sim_weighted_root_stress4(
        0.82f - 0.1f * rose_deeper,
        0.16f + 0.08f * rose_deeper,
        0.02f + 0.02f * rose_deeper,
        0.0f,
        layer_stress_r0,
        layer_stress_r1,
        layer_stress_r2,
        layer_stress_r3,
        sub_root_r_value
      );
      const float store_cap = storage * (1.14f * sim_max(0.0f, b_stem) + 0.54f * sim_max(0.0f, b_root) + 0.035f);
      const float store_norm = store_cap > 0.0f ? sim_clamp(b_store / store_cap, 0.0f, 1.0f) : 0.0f;
      const float rose_soil = rose_fertility[i];
      nutrient_b = sim_nutrient_stress(soil_mineral_n[i], sub_nutrient_b_value);
      const float rose_site_nutrient = sub_nutrient_r_value * sim_clamp(0.45f + 0.55f * rose_soil, 0.32f, 1.45f);
      nutrient_r = sim_nutrient_stress(soil_mineral_n[i], rose_site_nutrient);
      stress_b = sim_clamp(0.06f + 0.78f * root_water_b + 0.22f * store_norm, 0.0f, 1.0f);
      stress_r = sim_rose_water_stress_with_waterlogging(root_water_r, rose_soil, surface_water, sat0);
      sim_partition_apar(
        local_par,
        lai_b,
        lai_r,
        baobab_extinction,
        rose_extinction,
        cover,
        &total_apar,
        &baobab_apar,
        &rose_apar
      );
      const int32_t needs_baobab_photo = baobab_apar > 0.0f && lai_b > 0.0f && stress_b > 0.0f && nutrient_b > 0.0f;
      const int32_t needs_rose_photo = rose_apar > 0.0f && lai_r > 0.0f && stress_r > 0.0f && nutrient_r > 0.0f;
      if (needs_baobab_photo || needs_rose_photo) {
        photo_temp_lookup =
          sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
        has_photo_temp_lookup = 1;
        if (needs_baobab_photo) {
          sim_canopy_photosynthesis_cached(
            local_par,
            lai_b,
            photo_temp_lookup,
            stress_b,
            local_vpd,
            nutrient_b,
            baobab_multiplier,
            baobab_apar,
            atmospheric_co2,
            baobab_vcmax,
            baobab_jmax,
            baobab_rd,
            baobab_gamma_star,
            baobab_kc,
            baobab_ko,
            baobab_quantum_yield,
            baobab_curvature,
            baobab_ci_min,
            baobab_ci_max,
            baobab_extinction,
            baobab_g0_mol,
            baobab_g1,
            baobab_max_conductance_mps,
            &gpp_b,
            &conduct_b,
            &ci_b
          );
        }
        if (needs_rose_photo) {
          sim_canopy_photosynthesis_cached(
            local_par,
            lai_r,
            photo_temp_lookup,
            stress_r,
            local_vpd,
            nutrient_r,
            rose_multiplier,
            rose_apar,
            atmospheric_co2,
            rose_vcmax,
            rose_jmax,
            rose_rd,
            rose_gamma_star,
            rose_kc,
            rose_ko,
            rose_quantum_yield,
            rose_curvature,
            rose_ci_min,
            rose_ci_max,
            rose_extinction,
            rose_g0_mol,
            rose_g1,
            rose_max_conductance_mps,
            &gpp_r,
            &conduct_r,
            &ci_r
          );
        }
      }
    }

    if (write_diagnostics) {
      apar_total[i] = total_apar;
      apar_baobab[i] = baobab_apar;
      apar_rose[i] = rose_apar;
      photo_water_stress_baobab[i] = stress_b;
      photo_water_stress_rose[i] = stress_r;
      photo_nutrient_baobab[i] = nutrient_b;
      photo_nutrient_rose[i] = nutrient_r;
    }
    gpp_baobab[i] = gpp_b;
    gpp_rose[i] = gpp_r;
    if (write_diagnostics) {
      conductance_baobab[i] = conduct_b;
      conductance_rose[i] = conduct_r;
      ci_baobab[i] = ci_b;
      ci_rose[i] = ci_r;
    }
    if (!write_diagnostics) {
      ci_baobab[i] = ci_b;
      ci_rose[i] = ci_r;
    }

    const float net_radiation = sim_net_radiation_mj_m2_day(local_par, cover, rain);
    const float et0 = sim_penman_monteith_m_with_delta(temp_c, local_vpd, net_radiation, reference_surface, reference_aero, vapor_slope);
    float throughfall = rain;
    float canopy_evap = 0.0f;
    if (lai_total <= 0.0f) {
      canopy_water_next[i] = 0.0f;
      if (write_diagnostics) {
        canopy_evap_m[i] = 0.0f;
      }
    } else {
      const float positive_lai_total = sim_max(0.0f, lai_total);
      const float canopy_capacity =
        0.00018f +
        0.00082f *
          (1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.52f * positive_lai_total) * 102.4f)) *
          positive_lai_total;
      const float interception_fraction =
        1.0f - sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (0.42f * lai_total) * 102.4f);
      const float max_capture = sim_max(0.0f, canopy_capacity - canopy_water[i]) / dt;
      const float capture = sim_min(sim_max(0.0f, rain * interception_fraction), max_capture);
      const float available_canopy_water = canopy_water[i] / dt + capture;
      canopy_evap = sim_min(available_canopy_water, et0 * (0.32f + 0.68f * interception_fraction));
      canopy_water_next[i] = sim_clamp(canopy_water[i] + dt * (capture - canopy_evap), 0.0f, canopy_capacity);
      if (write_diagnostics) {
        canopy_evap_m[i] = canopy_evap;
      }
      throughfall = sim_max(0.0f, rain - capture);
    }
    const float remaining_et0 = sim_max(0.0f, et0 - canopy_evap);
    const float remaining_net_radiation = et0 > 0.0f ? net_radiation * sim_clamp(remaining_et0 / et0, 0.0f, 1.0f) : net_radiation;
    float soil_evap = 0.0f;
    if (evaporation_factor > 0.0f) {
      const float bare_fraction = sim_lookup_linear_table(sim_fast_exp_neg_table, 1024, (2.35f * cover) * 102.4f);
      const float sat0_for_evap = sim_clamp(soil_water[i] / soil_cap0, 0.0f, 1.0f);
      const float surface_wetness = sim_clamp(sat0_for_evap * 1.35f + surface_water_scaled * 1.5f, 0.0f, 1.0f);
      const float surface_conductance = 0.00012f + 0.0062f * surface_wetness * bare_fraction * sub_evap_value * evaporation_factor;
      soil_evap = sim_penman_monteith_m_with_delta(
        temp_c,
        local_vpd,
        remaining_net_radiation * bare_fraction,
        surface_conductance,
        bare_soil_aero,
        vapor_slope
      );
    }
    const float surface_evap = sim_min(soil_evap, sim_max(0.0f, surface_water) / dt);
    soil_evap -= surface_evap;

    const int32_t has_baobab_water_demand =
      b_leaf > 0.0f || b_stem > 0.0f || b_root > 0.0f || lai_b > 0.0f || conduct_b > 0.0f;
    const int32_t has_rose_water_demand =
      r_leaf > 0.0f || r_flower > 0.0f || r_root > 0.0f || lai_r > 0.0f || conduct_r > 0.0f;
    if (!has_baobab_water_demand && !has_rose_water_demand) {
      root_stress_baobab[i] = stress_b;
      root_stress_rose[i] = stress_r;
      hydrology_throughfall[i] = throughfall;
      hydrology_veg_feedback[i] = cover;
      hydrology_sink0[i] = soil_evap;
      hydrology_sink1[i] = 0.0f;
      hydrology_sink2[i] = 0.0f;
      hydrology_groundwater_sink[i] = 0.0f;
      hydrology_surface_evap_demand_m[i] = surface_evap * dt;
      continue;
    }

    const float sub_root_b = sub_root_b_value;
    const float sub_root_r = sub_root_r_value;
    const float soil_water0 = soil_water[i];
    const float soil_water1 = soil_water[layer1];
    const float soil_water2 = soil_water[layer2];
    const float groundwater_storage_value = groundwater_storage[i];
    const float structural_bias = sim_clamp((baobab_root_frac - 0.32f) / 0.36f, 0.0f, 1.0f);
    float brf0 = 0.34f - 0.22f * deep_bias;
    float brf1 = 0.24f + 0.01f * structural_bias;
    float brf2 = 0.25f + 0.13f * deep_bias + 0.05f * structural_bias;
    float brf3 = 0.17f + 0.16f * deep_bias + 0.05f * structural_bias;
    const float brf_total = sim_max(1.0e-12f, sim_max(0.0f, brf0) + sim_max(0.0f, brf1) + sim_max(0.0f, brf2) + sim_max(0.0f, brf3));
    brf0 = sim_max(0.0f, brf0) / brf_total;
    brf1 = sim_max(0.0f, brf1) / brf_total;
    brf2 = sim_max(0.0f, brf2) / brf_total;
    brf3 = sim_max(0.0f, brf3) / brf_total;
    const float rose_deeper = sim_clamp((rose_root_frac - 0.2f) / 0.26f, 0.0f, 1.0f);
    const float rrf0 = 0.82f - 0.1f * rose_deeper;
    const float rrf1 = 0.16f + 0.08f * rose_deeper;
    const float rrf2 = 0.02f + 0.02f * rose_deeper;
    const float rrf3 = 0.0f;

    float b_demand =
      sim_canopy_transpiration_demand_with_delta(temp_c, local_vpd, remaining_net_radiation, lai_b, conduct_b, 0.45f, vapor_slope) +
      (0.0016f * b_leaf + 0.00028f * b_stem + 0.0005f * b_root) * (0.22f + 0.78f * light_b) * 0.28f;
    float r_demand =
      sim_canopy_transpiration_demand_with_delta(temp_c, local_vpd, remaining_net_radiation, lai_r, conduct_r, 0.92f, vapor_slope) +
      (0.0045f * r_leaf + 0.0032f * r_flower + 0.0012f * r_root) * (0.32f + 0.68f * light_r) * 0.22f;
    float b_plant_psi = sim_plant_water_potential_m(0.06f, 105.0f, 520.0f, b_demand, local_vpd);
    float r_plant_psi = sim_plant_water_potential_m(0.05f, 18.0f, 82.0f, r_demand, local_vpd);
    const float gw_k = groundwater_t[i] / sim_max(1.0e-6f, groundwater_thickness[i]);
    float ub0 = 0.0f;
    float ub1 = 0.0f;
    float ub2 = 0.0f;
    float ub3 = 0.0f;
    float ur0 = 0.0f;
    float ur1 = 0.0f;
    float ur2 = 0.0f;
    float ur3 = 0.0f;
    sim_root_hydraulic_uptake4(
      &ub0, &ub1, &ub2, &ub3,
      b_demand * sub_root_b,
      brf0, brf1, brf2, brf3,
      layer_stress_b0, layer_stress_b1, layer_stress_b2, layer_stress_b3,
      soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
      sat0, sat1, sat2, gw_sat,
      psi0, psi1, psi2, 0.0f,
      b_plant_psi,
      105.0f,
      sub_root_b,
      2.1f
    );
    sim_root_hydraulic_uptake4(
      &ur0, &ur1, &ur2, &ur3,
      r_demand * sub_root_r,
      rrf0, rrf1, rrf2, rrf3,
      layer_stress_r0, layer_stress_r1, layer_stress_r2, layer_stress_r3,
      soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
      sat0, sat1, sat2, gw_sat,
      psi0, psi1, psi2, 0.0f,
      r_plant_psi,
      18.0f,
      sub_root_r,
      0.92f
    );

    float hydraulic_b = sim_hydraulic_stress_from_uptake(ub0 + ub1 + ub2 + ub3, b_demand * sub_root_b, stress_b);
    if (hydraulic_b < stress_b - 0.005f) {
      stress_b = hydraulic_b;
      if (!has_photo_temp_lookup) {
        photo_temp_lookup =
          sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
        has_photo_temp_lookup = 1;
      }
      sim_canopy_photosynthesis_cached(
        local_par, lai_b, photo_temp_lookup, stress_b, local_vpd, nutrient_b, baobab_multiplier, baobab_apar, atmospheric_co2,
        baobab_vcmax, baobab_jmax, baobab_rd, baobab_gamma_star, baobab_kc, baobab_ko,
        baobab_quantum_yield, baobab_curvature, baobab_ci_min, baobab_ci_max, baobab_extinction,
        baobab_g0_mol, baobab_g1, baobab_max_conductance_mps,
        &gpp_b, &conduct_b, &ci_b
      );
      b_demand =
        sim_canopy_transpiration_demand_with_delta(temp_c, local_vpd, remaining_net_radiation, lai_b, conduct_b, 0.45f, vapor_slope) +
        (0.0016f * b_leaf + 0.00028f * b_stem + 0.0005f * b_root) * (0.22f + 0.78f * light_b) * 0.28f;
      b_plant_psi = sim_plant_water_potential_m(0.06f, 105.0f, 520.0f, b_demand, local_vpd);
      sim_root_hydraulic_uptake4(
        &ub0, &ub1, &ub2, &ub3,
        b_demand * sub_root_b,
        brf0, brf1, brf2, brf3,
        layer_stress_b0, layer_stress_b1, layer_stress_b2, layer_stress_b3,
        soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
        sat0, sat1, sat2, gw_sat,
        psi0, psi1, psi2, 0.0f,
        b_plant_psi,
        105.0f,
        sub_root_b,
        2.1f
      );
    }
    float hydraulic_r = sim_hydraulic_stress_from_uptake(ur0 + ur1 + ur2 + ur3, r_demand * sub_root_r, stress_r);
    if (hydraulic_r < stress_r - 0.005f) {
      stress_r = hydraulic_r;
      if (!has_photo_temp_lookup) {
        photo_temp_lookup =
          sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
        has_photo_temp_lookup = 1;
      }
      sim_canopy_photosynthesis_cached(
        local_par, lai_r, photo_temp_lookup, stress_r, local_vpd, nutrient_r, rose_multiplier, rose_apar, atmospheric_co2,
        rose_vcmax, rose_jmax, rose_rd, rose_gamma_star, rose_kc, rose_ko,
        rose_quantum_yield, rose_curvature, rose_ci_min, rose_ci_max, rose_extinction,
        rose_g0_mol, rose_g1, rose_max_conductance_mps,
        &gpp_r, &conduct_r, &ci_r
      );
      r_demand =
        sim_canopy_transpiration_demand_with_delta(temp_c, local_vpd, remaining_net_radiation, lai_r, conduct_r, 0.92f, vapor_slope) +
        (0.0045f * r_leaf + 0.0032f * r_flower + 0.0012f * r_root) * (0.32f + 0.68f * light_r) * 0.22f;
      r_plant_psi = sim_plant_water_potential_m(0.05f, 18.0f, 82.0f, r_demand, local_vpd);
      sim_root_hydraulic_uptake4(
        &ur0, &ur1, &ur2, &ur3,
        r_demand * sub_root_r,
        rrf0, rrf1, rrf2, rrf3,
        layer_stress_r0, layer_stress_r1, layer_stress_r2, layer_stress_r3,
        soil_hydraulic_k[i], soil_hydraulic_k[layer1], soil_hydraulic_k[layer2], gw_k,
        sat0, sat1, sat2, gw_sat,
        psi0, psi1, psi2, 0.0f,
        r_plant_psi,
        18.0f,
        sub_root_r,
        0.92f
      );
    }

    soil_evap = sim_min(soil_evap, sim_max(0.0f, soil_water0 * 0.38f) / dt);
    const float total0 = ub0 + ur0 + soil_evap;
    if (total0 * dt > soil_water0 * 0.72f && total0 > 0.0f) {
      const float scale = (soil_water0 * 0.72f) / (total0 * dt);
      ub0 *= scale;
      ur0 *= scale;
      soil_evap *= scale;
    }
    const float total1 = ub1 + ur1;
    if (total1 * dt > soil_water1 * 0.66f && total1 > 0.0f) {
      const float scale = (soil_water1 * 0.66f) / (total1 * dt);
      ub1 *= scale;
      ur1 *= scale;
    }
    const float total2 = ub2 + ur2;
    if (total2 * dt > soil_water2 * 0.66f && total2 > 0.0f) {
      const float scale = (soil_water2 * 0.66f) / (total2 * dt);
      ub2 *= scale;
      ur2 *= scale;
    }
    if (ub3 * dt > groundwater_storage_value * 0.68f && ub3 > 0.0f) {
      ub3 *= (groundwater_storage_value * 0.68f) / (ub3 * dt);
    }

    const float transp_b = ub0 + ub1 + ub2 + ub3;
    const float transp_r = ur0 + ur1 + ur2;
    const float final_stress_b = sim_hydraulic_stress_from_uptake(transp_b, b_demand * sub_root_b, stress_b);
    if (final_stress_b < stress_b - 0.005f) {
      stress_b = final_stress_b;
      if (!has_photo_temp_lookup) {
        photo_temp_lookup =
          sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
        has_photo_temp_lookup = 1;
      }
      sim_canopy_photosynthesis_cached(
        local_par, lai_b, photo_temp_lookup, stress_b, local_vpd, nutrient_b, baobab_multiplier, baobab_apar, atmospheric_co2,
        baobab_vcmax, baobab_jmax, baobab_rd, baobab_gamma_star, baobab_kc, baobab_ko,
        baobab_quantum_yield, baobab_curvature, baobab_ci_min, baobab_ci_max, baobab_extinction,
        baobab_g0_mol, baobab_g1, baobab_max_conductance_mps,
        &gpp_b, &conduct_b, &ci_b
      );
    }
    const float final_stress_r = sim_hydraulic_stress_from_uptake(transp_r, r_demand * sub_root_r, stress_r);
    if (final_stress_r < stress_r - 0.005f) {
      stress_r = final_stress_r;
      if (!has_photo_temp_lookup) {
        photo_temp_lookup =
          sim_photosynthesis_temperature_lookup(photo_lookup_steps, photo_temp_min_c, photo_temp_lookup_scale, temp_c);
        has_photo_temp_lookup = 1;
      }
      sim_canopy_photosynthesis_cached(
        local_par, lai_r, photo_temp_lookup, stress_r, local_vpd, nutrient_r, rose_multiplier, rose_apar, atmospheric_co2,
        rose_vcmax, rose_jmax, rose_rd, rose_gamma_star, rose_kc, rose_ko,
        rose_quantum_yield, rose_curvature, rose_ci_min, rose_ci_max, rose_extinction,
        rose_g0_mol, rose_g1, rose_max_conductance_mps,
        &gpp_r, &conduct_r, &ci_r
      );
    }

    root_stress_baobab[i] = stress_b;
    root_stress_rose[i] = stress_r;
    gpp_baobab[i] = gpp_b;
    gpp_rose[i] = gpp_r;
    if (write_diagnostics) {
      conductance_baobab[i] = conduct_b;
      conductance_rose[i] = conduct_r;
      ci_baobab[i] = ci_b;
      ci_rose[i] = ci_r;
    }
    if (!write_diagnostics) {
      ci_baobab[i] = ci_b;
      ci_rose[i] = ci_r;
    }
    hydrology_throughfall[i] = throughfall;
    hydrology_veg_feedback[i] = cover;
    hydrology_sink0[i] = soil_evap + ub0 + ur0;
    hydrology_sink1[i] = ub1 + ur1;
    hydrology_sink2[i] = ub2 + ur2;
    hydrology_groundwater_sink[i] = ub3;
    hydrology_surface_evap_demand_m[i] = surface_evap * dt;
  }
}

static void sim_step_ecosystem_cell_canopy_update_kernels(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id,
  int32_t write_diagnostics
) {
  double phase_start = sim_profile_clock(profile_offset);
  sim_update_canopy_environment_plant_water_fluxes_from_params(params, active_count, active_offset, write_diagnostics);
  sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_CELL_CANOPY_PHOTOSYNTHESIS, phase_start);
}

static void sim_step_ecosystem_cell_carbon_update_kernels(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id,
  float slow_env_inv_count,
  int32_t write_diagnostics
) {
  const int32_t size = SPI(SIZE);
  const float model_dt_days = SPF(MODEL_DT_DAYS);

  double phase_start = sim_profile_clock(profile_offset);
  sim_update_plant_carbon_seeds_impl(
    size,
    active_count,
    active_offset,
    model_dt_days,
    SPF(STORAGE),
    SPI(PHOTO_LOOKUP_STEPS),
    SPF(PHOTO_TEMP_MIN_C),
    SPF(PHOTO_TEMP_LOOKUP_SCALE),
    SPU(BAOBAB_RESPIRATION_Q10),
    SPU(ROSE_RESPIRATION_Q10),
    SPU(SUBSTRATE),
    SPU(BAOBAB_BLOCKED),
    SPU(SOIL_WATER),
    SPU(SOIL_CAP),
    SPU(GROUNDWATER_STORAGE),
    SPU(GROUNDWATER_CAP),
    SPU(GPP_BAOBAB),
    SPU(GPP_ROSE),
    SPU(ROOT_STRESS_BAOBAB),
    SPU(ROOT_STRESS_ROSE),
    SPU(CANOPY_LIGHT_BAOBAB),
    SPU(CANOPY_LIGHT_ROSE),
    SPU(LIGHT_BAOBAB),
    SPU(LIGHT_ROSE),
    SPU(VEGETATION_COVER),
    SPU(SURFACE_TEMP_C),
    SPU(ASH_STRESS),
    SPU(BAOBAB_RISK),
    SPU(ROSE_FERTILITY),
    slow_env_inv_count,
    SPU(SLOW_ENV_GPP_BAOBAB),
    SPU(SLOW_ENV_GPP_ROSE),
    SPU(SLOW_ENV_ROOT_STRESS_BAOBAB),
    SPU(SLOW_ENV_ROOT_STRESS_ROSE),
    SPU(SLOW_ENV_CANOPY_LIGHT_BAOBAB),
    SPU(SLOW_ENV_CANOPY_LIGHT_ROSE),
    SPU(SLOW_ENV_LIGHT_BAOBAB),
    SPU(SLOW_ENV_LIGHT_ROSE),
    SPU(SLOW_ENV_VEGETATION_COVER),
    SPU(SLOW_ENV_SURFACE_TEMP_C),
    SPU(SLOW_ENV_ASH_STRESS),
    SPU(SLOW_ENV_WETNESS),
    SPU(SLOW_ENV_TOP_SAT),
    SPU(SLOW_ENV_GROUNDWATER_SAT),
    SPU(BAOBAB_LEAF),
    SPU(BAOBAB_STEM),
    SPU(BAOBAB_ROOT),
    SPU(BAOBAB_STORE),
    SPU(BAOBAB_SEED),
    SPU(ROSE_LEAF),
    SPU(ROSE_FLOWER),
    SPU(ROSE_ROOT),
    SPU(ROSE_STORE),
    SPU(ROSE_SEED),
    SPU(BAOBAB_SEED_TRANSPORT),
    SPU(ROSE_SEED_TRANSPORT),
    SPU(ROSE_SEED_PRODUCTION),
    SPU(ROSE_SEED_ARRIVAL),
    SPU(BAOBAB_READINESS),
    SPU(ROSE_READINESS),
    SPU(HYDROLOGY_SINK0),
    SPU(BAOBAB_LEAF_NEXT),
    SPU(BAOBAB_STEM_NEXT),
    SPU(BAOBAB_ROOT_NEXT),
    SPU(BAOBAB_STORE_NEXT),
    SPU(BAOBAB_SEED_NEXT),
    SPU(BAOBAB_READINESS_NEXT),
    SPU(ROSE_LEAF_NEXT),
    SPU(ROSE_FLOWER_NEXT),
    SPU(ROSE_ROOT_NEXT),
    SPU(ROSE_STORE_NEXT),
    SPU(ROSE_SEED_NEXT),
    SPU(ROSE_READINESS_NEXT),
    SPU(MB_NEXT),
    SPU(MR_NEXT),
    SPU(SB_NEXT),
    SPU(SOIL_BIO_WETNESS),
    SPU(SOIL_BIO_TEMP_C),
    SPU(SOIL_BIO_ASH_LOAD),
    SPU(SOIL_BIO_TOP_SAT),
    SPU(SOIL_BIO_GROUNDWATER_SAT),
    SPU(SOIL_BIO_LITTER_FAST_INPUT),
    SPU(SOIL_BIO_LITTER_SLOW_INPUT),
    SPU(SOIL_BIO_PLANT_NUTRIENT_UPTAKE),
    1,
    SPU(DEPTH),
    SPU(SOIL_MINERAL_N),
    SPU(SOIL_MINERAL_TRANSPORT),
    SPU(LITTER_CARBON),
    SPU(LITTER_FAST_CARBON),
    SPU(LITTER_SLOW_CARBON),
    SPU(SOIL_CARBON_ACTIVE),
    SPU(SOIL_CARBON_STABLE),
    SPU(LITTER_CARBON_NEXT),
    SPU(LITTER_FAST_CARBON_NEXT),
    SPU(LITTER_SLOW_CARBON_NEXT),
    SPU(SOIL_CARBON_ACTIVE_NEXT),
    SPU(SOIL_CARBON_STABLE_NEXT),
    SPU(SOIL_MINERAL_N_NEXT),
    write_diagnostics
  );
  sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_CELL_PLANT_CARBON, phase_start);
}

static void sim_step_ecosystem_cell_hydrology_update_kernels(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id
) {
  double phase_start = sim_profile_clock(profile_offset);
  sim_richards_columns_update_hydraulic_from_params(params, active_count, active_offset);
  sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_CELL_RICHARDS_HYDRAULIC, phase_start);
}

static void sim_step_ecosystem_cell_update_kernels(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id,
  int32_t write_diagnostics
) {
  sim_step_ecosystem_cell_canopy_update_kernels(
    params,
    active_count,
    active_offset,
    profile_offset,
    profile_stride,
    thread_id,
    write_diagnostics
  );
  sim_step_ecosystem_cell_carbon_update_kernels(
    params,
    active_count,
    active_offset,
    profile_offset,
    profile_stride,
    thread_id,
    0.0f,
    write_diagnostics
  );
  sim_step_ecosystem_cell_hydrology_update_kernels(
    params,
    active_count,
    active_offset,
    profile_offset,
    profile_stride,
    thread_id
  );
}

static uintptr_t sim_sub_active_offset(uintptr_t active_offset, int32_t start) {
  if (active_offset & SIM_ACTIVE_RANGE_FLAG) {
    return (((active_offset >> 1u) + (uintptr_t)start) << 1u) | SIM_ACTIVE_RANGE_FLAG;
  }
  if (active_offset) {
    return active_offset + (uintptr_t)start * sizeof(int32_t);
  }
  return start > 0 ? (((uintptr_t)start << 1u) | SIM_ACTIVE_RANGE_FLAG) : 0;
}

static void __attribute__((unused)) sim_step_ecosystem_cell_updates(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id,
  int32_t write_diagnostics
) {
  if (active_count <= SIM_CELL_KERNEL_BLOCK_SIZE) {
    sim_step_ecosystem_cell_update_kernels(params, active_count, active_offset, profile_offset, profile_stride, thread_id, write_diagnostics);
  } else {
    for (int32_t start = 0; start < active_count; start += SIM_CELL_KERNEL_BLOCK_SIZE) {
      const int32_t end = start + SIM_CELL_KERNEL_BLOCK_SIZE < active_count ? start + SIM_CELL_KERNEL_BLOCK_SIZE : active_count;
      sim_step_ecosystem_cell_update_kernels(
        params,
        end - start,
        sim_sub_active_offset(active_offset, start),
        profile_offset,
        profile_stride,
        thread_id,
        write_diagnostics
      );
    }
  }
}

static void sim_step_ecosystem_cell_canopy_updates(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id,
  int32_t write_diagnostics
) {
  if (active_count <= SIM_CELL_KERNEL_BLOCK_SIZE) {
    sim_step_ecosystem_cell_canopy_update_kernels(
      params,
      active_count,
      active_offset,
      profile_offset,
      profile_stride,
      thread_id,
      write_diagnostics
    );
  } else {
    for (int32_t start = 0; start < active_count; start += SIM_CELL_KERNEL_BLOCK_SIZE) {
      const int32_t end = start + SIM_CELL_KERNEL_BLOCK_SIZE < active_count ? start + SIM_CELL_KERNEL_BLOCK_SIZE : active_count;
      sim_step_ecosystem_cell_canopy_update_kernels(
        params,
        end - start,
        sim_sub_active_offset(active_offset, start),
        profile_offset,
        profile_stride,
        thread_id,
        write_diagnostics
      );
    }
  }
}

static void sim_step_ecosystem_cell_carbon_updates(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id,
  float slow_env_inv_count,
  int32_t write_diagnostics
) {
  if (active_count <= SIM_CELL_KERNEL_BLOCK_SIZE) {
    sim_step_ecosystem_cell_carbon_update_kernels(
      params,
      active_count,
      active_offset,
      profile_offset,
      profile_stride,
      thread_id,
      slow_env_inv_count,
      write_diagnostics
    );
  } else {
    for (int32_t start = 0; start < active_count; start += SIM_CELL_KERNEL_BLOCK_SIZE) {
      const int32_t end = start + SIM_CELL_KERNEL_BLOCK_SIZE < active_count ? start + SIM_CELL_KERNEL_BLOCK_SIZE : active_count;
      sim_step_ecosystem_cell_carbon_update_kernels(
        params,
        end - start,
        sim_sub_active_offset(active_offset, start),
        profile_offset,
        profile_stride,
        thread_id,
        slow_env_inv_count,
        write_diagnostics
      );
    }
  }
}

static void sim_step_ecosystem_cell_hydrology_updates(
  const uint32_t *params,
  int32_t active_count,
  uintptr_t active_offset,
  uintptr_t profile_offset,
  int32_t profile_stride,
  int32_t thread_id
) {
  if (active_count <= SIM_CELL_KERNEL_BLOCK_SIZE) {
    sim_step_ecosystem_cell_hydrology_update_kernels(
      params,
      active_count,
      active_offset,
      profile_offset,
      profile_stride,
      thread_id
    );
  } else {
    for (int32_t start = 0; start < active_count; start += SIM_CELL_KERNEL_BLOCK_SIZE) {
      const int32_t end = start + SIM_CELL_KERNEL_BLOCK_SIZE < active_count ? start + SIM_CELL_KERNEL_BLOCK_SIZE : active_count;
      sim_step_ecosystem_cell_hydrology_update_kernels(
        params,
        end - start,
        sim_sub_active_offset(active_offset, start),
        profile_offset,
        profile_stride,
        thread_id
      );
    }
  }
}

static void sim_swap_ecosystem_current_next_params(uint32_t *params) {
  sim_swap_param(params, STEP_H_OFFSET, STEP_H_NEXT_OFFSET);
  sim_swap_param(params, STEP_SOIL_WATER_OFFSET, STEP_SOIL_WATER_NEXT_OFFSET);
  sim_swap_param(params, STEP_GROUNDWATER_STORAGE_OFFSET, STEP_GROUNDWATER_STORAGE_NEXT_OFFSET);
  sim_swap_param(params, STEP_CANOPY_WATER_OFFSET, STEP_CANOPY_WATER_NEXT_OFFSET);
  sim_swap_param(params, STEP_BAOBAB_LEAF_OFFSET, STEP_BAOBAB_LEAF_NEXT_OFFSET);
  sim_swap_param(params, STEP_BAOBAB_STEM_OFFSET, STEP_BAOBAB_STEM_NEXT_OFFSET);
  sim_swap_param(params, STEP_BAOBAB_ROOT_OFFSET, STEP_BAOBAB_ROOT_NEXT_OFFSET);
  sim_swap_param(params, STEP_BAOBAB_STORE_OFFSET, STEP_BAOBAB_STORE_NEXT_OFFSET);
  sim_swap_param(params, STEP_BAOBAB_SEED_OFFSET, STEP_BAOBAB_SEED_NEXT_OFFSET);
  sim_swap_param(params, STEP_BAOBAB_READINESS_OFFSET, STEP_BAOBAB_READINESS_NEXT_OFFSET);
  sim_swap_param(params, STEP_ROSE_LEAF_OFFSET, STEP_ROSE_LEAF_NEXT_OFFSET);
  sim_swap_param(params, STEP_ROSE_FLOWER_OFFSET, STEP_ROSE_FLOWER_NEXT_OFFSET);
  sim_swap_param(params, STEP_ROSE_ROOT_OFFSET, STEP_ROSE_ROOT_NEXT_OFFSET);
  sim_swap_param(params, STEP_ROSE_STORE_OFFSET, STEP_ROSE_STORE_NEXT_OFFSET);
  sim_swap_param(params, STEP_ROSE_SEED_OFFSET, STEP_ROSE_SEED_NEXT_OFFSET);
  sim_swap_param(params, STEP_ROSE_READINESS_OFFSET, STEP_ROSE_READINESS_NEXT_OFFSET);
  sim_swap_param(params, STEP_SOIL_MINERAL_N_OFFSET, STEP_SOIL_MINERAL_N_NEXT_OFFSET);
  sim_swap_param(params, STEP_LITTER_CARBON_OFFSET, STEP_LITTER_CARBON_NEXT_OFFSET);
  sim_swap_param(params, STEP_LITTER_FAST_CARBON_OFFSET, STEP_LITTER_FAST_CARBON_NEXT_OFFSET);
  sim_swap_param(params, STEP_LITTER_SLOW_CARBON_OFFSET, STEP_LITTER_SLOW_CARBON_NEXT_OFFSET);
  sim_swap_param(params, STEP_SOIL_CARBON_ACTIVE_OFFSET, STEP_SOIL_CARBON_ACTIVE_NEXT_OFFSET);
  sim_swap_param(params, STEP_SOIL_CARBON_STABLE_OFFSET, STEP_SOIL_CARBON_STABLE_NEXT_OFFSET);
  sim_swap_param(params, STEP_MB_OFFSET, STEP_MB_NEXT_OFFSET);
  sim_swap_param(params, STEP_MR_OFFSET, STEP_MR_NEXT_OFFSET);
  sim_swap_param(params, STEP_SB_OFFSET, STEP_SB_NEXT_OFFSET);
}

static void sim_swap_ecosystem_hydrology_current_next_params(uint32_t *params) {
  sim_swap_param(params, STEP_H_OFFSET, STEP_H_NEXT_OFFSET);
  sim_swap_param(params, STEP_SOIL_WATER_OFFSET, STEP_SOIL_WATER_NEXT_OFFSET);
  sim_swap_param(params, STEP_GROUNDWATER_STORAGE_OFFSET, STEP_GROUNDWATER_STORAGE_NEXT_OFFSET);
  sim_swap_param(params, STEP_CANOPY_WATER_OFFSET, STEP_CANOPY_WATER_NEXT_OFFSET);
}

static void sim_step_ecosystem_parallel_worker_impl(
  uintptr_t params_offset,
  int32_t thread_id,
  int32_t thread_count,
  uintptr_t active_ids_offset,
  int32_t active_count,
  uintptr_t barrier_offset,
  int32_t repeat_count,
  uintptr_t profile_offset,
  int32_t profile_stride
);

SIM_EXPORT void sim_step_ecosystem_in_place(uintptr_t params_offset, int32_t repeat_count) {
  uint32_t *params = (uint32_t *)(uintptr_t)params_offset;
  if (repeat_count < 1) {
    repeat_count = 1;
  }
  if (repeat_count > 32) {
    repeat_count = 32;
  }

  const int32_t size = SPI(SIZE);
  const int32_t active_count = SPI(ACTIVE_COUNT) > 0 ? SPI(ACTIVE_COUNT) : size;
  const uintptr_t active_offset = SPU(ACTIVE_OFFSET);
  sim_step_ecosystem_parallel_worker_impl(
    params_offset,
    0,
    1,
    active_offset,
    active_count,
    0,
    repeat_count,
    0,
    0
  );
}

static void sim_step_ecosystem_parallel_worker_impl(
  uintptr_t params_offset,
  int32_t thread_id,
  int32_t thread_count,
  uintptr_t active_ids_offset,
  int32_t active_count,
  uintptr_t barrier_offset,
  int32_t repeat_count,
  uintptr_t profile_offset,
  int32_t profile_stride
) {
  uint32_t *params = (uint32_t *)(uintptr_t)params_offset;
  if (thread_count < 1) {
    thread_count = 1;
  }
  if (thread_id < 0 || thread_id >= thread_count) {
    return;
  }
  if (repeat_count < 1) {
    repeat_count = 1;
  }
  if (repeat_count > 32) {
    repeat_count = 32;
  }
  if (active_count < 0) {
    active_count = 0;
  }

  const float base_day = SPF(DAY);
  const float base_sunlight_offset = SPF(SUNLIGHT_MODEL_TIME_OFFSET_DAYS);
  const float model_dt_days = SPF(MODEL_DT_DAYS);
  int32_t slow_step_interval = SPI(SLOW_STEP_INTERVAL);
  if (slow_step_interval < 1) {
    slow_step_interval = 1;
  }
  if (slow_step_interval > 32) {
    slow_step_interval = 32;
  }
  int32_t slow_step_phase = SPI(SLOW_STEP_PHASE);
  if (slow_step_phase < 0 || slow_step_phase >= slow_step_interval) {
    slow_step_phase = 0;
  }
  const int32_t transport_block_count = sim_transport_blocks_available(params) ? SPI(TRANSPORT_BLOCK_COUNT) : 0;
  const int32_t transport_block_start = transport_block_count > 0 ? thread_id : 0;
  const int32_t transport_block_end = transport_block_count;
  const int32_t transport_block_step = transport_block_count > 0 ? thread_count : 1;
  float local_partial_sums[16];

  double phase_start = sim_profile_clock(profile_offset);
  if (thread_id == 0) {
    sim_set_param_float(params, STEP_DAY, base_day);
    sim_set_param_float(params, STEP_SUNLIGHT_MODEL_TIME_OFFSET_DAYS, base_sunlight_offset);
    sim_step_ecosystem_setup_to_seed(params, -2);
  }
  sim_thread_barrier(barrier_offset, thread_count);
  sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_SETUP, phase_start);

  for (int32_t step = 0; step < repeat_count; step += 1) {
    const int32_t slow_phase_before = slow_step_phase;
    const int32_t slow_steps_since_update = slow_phase_before + 1;
    const int32_t run_slow_step = slow_steps_since_update >= slow_step_interval;
    const float slow_dt_days = model_dt_days * (float)slow_steps_since_update;
    const int32_t size = SPI(SIZE);
    const int32_t range_start = (size * thread_id) / thread_count;
    const int32_t range_end = (size * (thread_id + 1)) / thread_count;
    float *partial_sums = barrier_offset
      ? (float *)(uintptr_t)(barrier_offset + 16u)
      : local_partial_sums;
    int32_t rain_needs_normalization = 0;
    phase_start = sim_profile_clock(profile_offset);
    if (!SPI(HYDRAULIC_STATE_CURRENT)) {
      sim_update_hydraulic_state(
        size,
        active_count,
        active_ids_offset,
        SPI(HYDRAULIC_LOOKUP_STEPS),
        SPF(GROUNDWATER_FLOW_MULTIPLIER),
        SPU(HYDRAULIC_PSI),
        SPU(HYDRAULIC_RELATIVE_K),
        SPU(GROUNDWATER_POW17),
        SPU(SUBSTRATE),
        SPU(ELEVATION),
        SPU(SOIL_WATER),
        SPU(SOIL_CAP),
        SPU(SOIL_CENTER_DEPTH),
        SPU(SOIL_THICKNESS),
        SPU(GROUNDWATER_STORAGE),
        SPU(GROUNDWATER_CAP),
        SPU(GROUNDWATER_THICKNESS),
        SPU(GROUNDWATER_TOP_DEPTH),
        SPU(W0),
        SPU(W1),
        SPU(SOIL_HEAD),
        SPU(SOIL_HYDRAULIC_K),
        SPU(SOIL_TRANSMISSIVITY),
        SPU(GROUNDWATER_HEAD),
        SPU(GROUNDWATER_T)
      );
    }
    if (SPU(ACTIVE_OFFSET) && !(SPU(ACTIVE_OFFSET) & SIM_ACTIVE_RANGE_FLAG)) {
      sim_zero_transport_range_from_params(params, range_start, range_end, step + 1 == repeat_count);
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_HYDRAULIC_ZERO, phase_start);

    phase_start = sim_profile_clock(profile_offset);
    if (SPI(IS_EARTH)) {
      sim_update_sunlight_field_range_from_params(params, range_start, range_end);
      const float mean_rain = sim_step_last_rain(params);
      if (mean_rain <= 0.0f) {
        float *rain = (float *)(uintptr_t)SPU(R);
        for (int32_t i = range_start; i < range_end; i += 1) {
          rain[i] = 0.0f;
        }
      } else if (SPF(RAIN_PATCHINESS) < 0.01f) {
        float *rain = (float *)(uintptr_t)SPU(R);
        const float *SIM_RESTRICT rain_climatology = (const float *)(uintptr_t)SPU(RAIN_CLIMATOLOGY);
        for (int32_t i = range_start; i < range_end; i += 1) {
          rain[i] = sim_max(0.0f, rain_climatology[i]) * mean_rain;
        }
      } else {
        sim_update_earth_rain_generated_unscaled_range_from_params(params, range_start, range_end, partial_sums, thread_id);
        rain_needs_normalization = 1;
      }
    } else {
      sim_update_sunlight_field_range_from_params(params, range_start, range_end);
      sim_update_asteroid_dayside_rain_unscaled_range_from_params(params, range_start, range_end, partial_sums, thread_id);
      rain_needs_normalization = 1;
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_SUNLIGHT_RAIN, phase_start);

    const int32_t nutrient_start = (size * thread_id) / thread_count;
    const int32_t nutrient_end = (size * (thread_id + 1)) / thread_count;
    phase_start = sim_profile_clock(profile_offset);
    sim_transport_mobile_nutrient_range(params, nutrient_start, nutrient_end);
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_MOBILE_NUTRIENT, phase_start);
    phase_start = sim_profile_clock(profile_offset);
    if (sim_thread_barrier_serial_enter(barrier_offset, thread_count)) {
      if (rain_needs_normalization) {
        float raw_sum = 0.0f;
        float climatology_sum = 0.0f;
        for (int32_t index = 0; index < thread_count; index += 1) {
          if (SPI(IS_EARTH)) {
            raw_sum += partial_sums[index * 2];
            climatology_sum += partial_sums[index * 2 + 1];
          } else {
            raw_sum += partial_sums[index];
          }
        }
        const float mean_rain = sim_step_last_rain(params);
        const float target_sum = SPI(IS_EARTH) ? climatology_sum * mean_rain : mean_rain * (float)size;
        partial_sums[0] = raw_sum > 0.0f ? target_sum / raw_sum : 0.0f;
      }
      sim_thread_barrier_serial_leave(barrier_offset, thread_count);
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_RAIN_SERIAL, phase_start);
    phase_start = sim_profile_clock(profile_offset);
    if (rain_needs_normalization) {
      sim_scale_rain_range_from_params(params, range_start, range_end, partial_sums[0]);
    }
    sim_update_rain_memory_range_from_params(params, range_start, range_end);
    if (SPI(IS_EARTH)) {
      sim_partition_earth_precipitation_phase_range_from_params(params, range_start, range_end);
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_RAIN_SCALE_MEMORY, phase_start);

    phase_start = sim_profile_clock(profile_offset);
    if (transport_block_count > 0) {
      sim_transport_darcy_core_blocks(
        params,
        transport_block_start,
        transport_block_end,
        transport_block_step,
        thread_id,
        profile_offset,
        profile_stride,
        step + 1 == repeat_count
      );
    } else {
      sim_transport_darcy_core_chunk(params, active_count, active_ids_offset, step + 1 == repeat_count);
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DARCY_CORE, phase_start);
    phase_start = sim_profile_clock(profile_offset);
    sim_thread_barrier(barrier_offset, thread_count);
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DARCY_BARRIER, phase_start);
    phase_start = sim_profile_clock(profile_offset);
    if (transport_block_count > 0) {
      sim_transport_divergence_blocks(params, transport_block_start, transport_block_end, transport_block_step, thread_id, profile_offset, profile_stride);
    } else {
      sim_transport_divergence_chunk(params, active_count, active_ids_offset);
    }
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DIVERGENCE, phase_start);
    sim_apply_nutrient_transport_range(
      range_start,
      range_end,
      SPF(MODEL_DT_DAYS),
      (float *)(uintptr_t)SPU(SOIL_MINERAL_N),
      (const float *)(uintptr_t)SPU(SOIL_MINERAL_TRANSPORT),
      (const float *)(uintptr_t)SPU(ROSE_FERTILITY)
    );
    phase_start = sim_profile_clock(profile_offset);
    sim_step_ecosystem_cell_canopy_updates(
      params,
      active_count,
      active_ids_offset,
      profile_offset,
      profile_stride,
      thread_id,
      step + 1 == repeat_count
    );
    sim_accumulate_slow_environment_range_from_params(params, range_start, range_end, slow_phase_before == 0);
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_CELL_UPDATES, phase_start);
    phase_start = sim_profile_clock(profile_offset);
    sim_thread_barrier(barrier_offset, thread_count);
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_DARCY_BARRIER, phase_start);

    if (run_slow_step) {
      phase_start = sim_profile_clock(profile_offset);
      if (sim_thread_barrier_serial_enter(barrier_offset, thread_count)) {
        sim_set_param_float(params, STEP_MODEL_DT_DAYS, slow_dt_days);
        sim_thread_barrier_serial_leave(barrier_offset, thread_count);
      }
      sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_SWAP_SETUP, phase_start);

      phase_start = sim_profile_clock(profile_offset);
      sim_zero_baobab_seed_arrival_range_from_params(params, range_start, range_end);
      if (!SPU(ROSE_SEED_ARRIVAL_THREAD)) {
        sim_zero_rose_seed_arrival_range_from_params(params, range_start, range_end);
      }
      sim_thread_barrier(barrier_offset, thread_count);
      if (sim_thread_barrier_serial_enter(barrier_offset, thread_count)) {
        sim_produce_and_distribute_baobab_seeds_from_params(
          params,
          active_count,
          active_ids_offset,
          slow_steps_since_update > 0 ? 1.0f / (float)slow_steps_since_update : 0.0f
        );
        sim_thread_barrier_serial_leave(barrier_offset, thread_count);
      }
      sim_produce_rose_seeds_range_from_params(params, active_count, active_ids_offset);
      sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_ROSE_PRODUCE, phase_start);
      phase_start = sim_profile_clock(profile_offset);
      if (SPU(ROSE_SEED_ARRIVAL_THREAD)) {
        sim_distribute_existing_rose_seeds_thread_buffers_from_params(
          params,
          thread_id,
          thread_count,
          active_count,
          active_ids_offset,
          barrier_offset
        );
      } else if (sim_thread_barrier_serial_enter(barrier_offset, thread_count)) {
        sim_distribute_existing_rose_seeds_from_params(params);
        sim_step_apply_rng_out(params);
        sim_thread_barrier_serial_leave(barrier_offset, thread_count);
      }
      sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_ROSE_DISTRIBUTE, phase_start);
      phase_start = sim_profile_clock(profile_offset);
      sim_step_ecosystem_cell_carbon_updates(
        params,
        active_count,
        active_ids_offset,
        profile_offset,
        profile_stride,
        thread_id,
        slow_steps_since_update > 0 ? 1.0f / (float)slow_steps_since_update : 0.0f,
        step + 1 == repeat_count
      );
      sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_CELL_UPDATES, phase_start);

      phase_start = sim_profile_clock(profile_offset);
      if (sim_thread_barrier_serial_enter(barrier_offset, thread_count)) {
        sim_set_param_float(params, STEP_MODEL_DT_DAYS, model_dt_days);
        sim_thread_barrier_serial_leave(barrier_offset, thread_count);
      }
      sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_SWAP_SETUP, phase_start);
    }

    phase_start = sim_profile_clock(profile_offset);
    sim_step_ecosystem_cell_hydrology_updates(
      params,
      active_count,
      active_ids_offset,
      profile_offset,
      profile_stride,
      thread_id
    );
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_CELL_UPDATES, phase_start);

    phase_start = sim_profile_clock(profile_offset);
    if (sim_thread_barrier_serial_enter(barrier_offset, thread_count)) {
      params[STEP_HYDRAULIC_STATE_CURRENT] = 1u;
      if (step + 1 < repeat_count) {
        if (run_slow_step) {
          sim_swap_ecosystem_current_next_params(params);
        } else {
          sim_swap_ecosystem_hydrology_current_next_params(params);
        }
        sim_set_param_float(params, STEP_DAY, base_day + model_dt_days * (float)(step + 1));
        sim_set_param_float(params, STEP_SUNLIGHT_MODEL_TIME_OFFSET_DAYS, base_sunlight_offset + model_dt_days * (float)(step + 1));
        sim_step_ecosystem_setup_to_seed(params, -2);
      }
      sim_thread_barrier_serial_leave(barrier_offset, thread_count);
    }
    slow_step_phase = run_slow_step ? 0 : slow_steps_since_update;
    sim_profile_add(profile_offset, profile_stride, thread_id, SIM_PROFILE_SWAP_SETUP, phase_start);
  }

  if (thread_id == 0 && SPU(SLOW_STEP_PHASE_OUT)) {
    uint32_t *slow_step_phase_out = (uint32_t *)(uintptr_t)SPU(SLOW_STEP_PHASE_OUT);
    *slow_step_phase_out = (uint32_t)slow_step_phase;
  }
}

SIM_EXPORT void sim_step_ecosystem_parallel_worker(
  uintptr_t params_offset,
  int32_t thread_id,
  int32_t thread_count,
  uintptr_t active_ids_offset,
  int32_t active_count,
  uintptr_t barrier_offset,
  int32_t repeat_count
) {
  sim_step_ecosystem_parallel_worker_impl(
    params_offset,
    thread_id,
    thread_count,
    active_ids_offset,
    active_count,
    barrier_offset,
    repeat_count,
    0,
    0
  );
}

SIM_EXPORT void sim_step_ecosystem_parallel_worker_profile(
  uintptr_t params_offset,
  int32_t thread_id,
  int32_t thread_count,
  uintptr_t active_ids_offset,
  int32_t active_count,
  uintptr_t barrier_offset,
  int32_t repeat_count,
  uintptr_t profile_offset,
  int32_t profile_stride
) {
  sim_step_ecosystem_parallel_worker_impl(
    params_offset,
    thread_id,
    thread_count,
    active_ids_offset,
    active_count,
    barrier_offset,
    repeat_count,
    profile_offset,
    profile_stride
  );
}

#undef SPI
#undef SPU
#undef SPF
