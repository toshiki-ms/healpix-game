import { chromium } from "playwright";

const DEFAULT_BASE_URL = "http://localhost:50979/asteroid.html?lang=ja";
const TURNS_PER_DAY = 8;

const SCENARIOS = {
  "earth-default": {
    planet: "earth",
    params: null,
    action: "wait"
  },
  "asteroid-default": {
    planet: "asteroid",
    params: null,
    action: "wait"
  },
  "asteroid-default-water": {
    planet: "asteroid",
    params: null,
    action: "water"
  },
  "asteroid-default-water-every-other": {
    planet: "asteroid",
    params: null,
    action: "waterEveryOther"
  },
  "asteroid-default-water-rose105": {
    planet: "asteroid",
    params: { roseGrowth: 1.05 },
    action: "water"
  },
  "asteroid-default-water-rose112": {
    planet: "asteroid",
    params: { roseGrowth: 1.12 },
    action: "water"
  },
  "asteroid-default-water-rose180": {
    planet: "asteroid",
    params: { roseGrowth: 1.8 },
    action: "water"
  },
  "asteroid-default-rose180": {
    planet: "asteroid",
    params: { roseGrowth: 1.8 },
    action: "wait"
  },
  "asteroid-default-water-co2": {
    planet: "asteroid",
    params: { atmosphericCo2Ppm: 900 },
    action: "water"
  },
  "asteroid-default-water-rose180-co2": {
    planet: "asteroid",
    params: { roseGrowth: 1.8, atmosphericCo2Ppm: 900 },
    action: "water"
  },
  "asteroid-default-water-rose180-co2720": {
    planet: "asteroid",
    params: { roseGrowth: 1.8, atmosphericCo2Ppm: 720 },
    action: "water"
  },
  "asteroid-default-water-rose180-co2600": {
    planet: "asteroid",
    params: { roseGrowth: 1.8, atmosphericCo2Ppm: 600 },
    action: "water"
  },
  "asteroid-default-rose180-co2600": {
    planet: "asteroid",
    params: { roseGrowth: 1.8, atmosphericCo2Ppm: 600 },
    action: "wait"
  },
  "asteroid-default-rose180-co2": {
    planet: "asteroid",
    params: { roseGrowth: 1.8, atmosphericCo2Ppm: 900 },
    action: "wait"
  },
  "asteroid-default-water-clearer": {
    planet: "asteroid",
    params: { shade: 0.85 },
    action: "water"
  },
  "asteroid-default-clearer": {
    planet: "asteroid",
    params: { shade: 0.85 },
    action: "wait"
  },
  "asteroid-default-water-mild": {
    planet: "asteroid",
    params: { shade: 0.85, asteroidMeanTempC: 18, asteroidDiurnalRangeC: 10 },
    action: "water"
  },
  "asteroid-default-water-mild-co2": {
    planet: "asteroid",
    params: { shade: 0.85, asteroidMeanTempC: 18, asteroidDiurnalRangeC: 10, atmosphericCo2Ppm: 900 },
    action: "water"
  },
  "asteroid-default-mild-co2": {
    planet: "asteroid",
    params: { shade: 0.85, asteroidMeanTempC: 18, asteroidDiurnalRangeC: 10, atmosphericCo2Ppm: 900 },
    action: "wait"
  },
  "asteroid-default-bright-warm": {
    planet: "asteroid",
    params: { shade: 0.65, asteroidMeanTempC: 18, asteroidDiurnalRangeC: 10, atmosphericCo2Ppm: 900 },
    action: "wait"
  },
  "asteroid-default-water-bright-warm": {
    planet: "asteroid",
    params: { shade: 0.65, asteroidMeanTempC: 18, asteroidDiurnalRangeC: 10, atmosphericCo2Ppm: 900 },
    action: "water"
  },
  "asteroid-default-garden": {
    planet: "asteroid",
    params: {
      asteroidMeanTempC: 21,
      asteroidDiurnalRangeC: 6,
      evaporation: 0.68,
      rootDepth: 6,
      shade: 0.25,
      storage: 1.35,
      atmosphericCo2Ppm: 900
    },
    action: "wait"
  },
  "asteroid-default-water-garden": {
    planet: "asteroid",
    params: {
      asteroidMeanTempC: 21,
      asteroidDiurnalRangeC: 6,
      evaporation: 0.68,
      rootDepth: 6,
      shade: 0.25,
      storage: 1.35,
      atmosphericCo2Ppm: 900
    },
    action: "water"
  },
  "asteroid-default-mild": {
    planet: "asteroid",
    params: { shade: 0.85, asteroidMeanTempC: 18, asteroidDiurnalRangeC: 10 },
    action: "wait"
  },
  "asteroid-retentive": {
    planet: "asteroid",
    params: { annualPrecipMm: 95, dryDays: 330, evaporation: 1.25, asteroidMeanTempC: 17, asteroidDiurnalRangeC: 12 },
    action: "wait"
  },
  "asteroid-retentive-water": {
    planet: "asteroid",
    params: { annualPrecipMm: 95, dryDays: 330, evaporation: 1.25, asteroidMeanTempC: 17, asteroidDiurnalRangeC: 12 },
    action: "water"
  },
  "asteroid-retentive-water-every-other": {
    planet: "asteroid",
    params: { annualPrecipMm: 95, dryDays: 330, evaporation: 1.25, asteroidMeanTempC: 17, asteroidDiurnalRangeC: 12 },
    action: "waterEveryOther"
  },
  "asteroid-rose-favorable": {
    planet: "asteroid",
    action: "wait",
    params: {
      annualPrecipMm: 720,
      dryDays: 85,
      rainPatchiness: 0.32,
      rainScale: 32,
      asteroidMeanTempC: 21,
      asteroidDiurnalRangeC: 6,
      asteroidLatitudeTempRangeC: 1,
      evaporation: 0.68,
      gwFlow: 0.002,
      rootDepth: 6,
      shade: 0.55,
      roseGrowth: 1.35,
      baobabGrowth: 1,
      storage: 1.35,
      atmosphericCo2Ppm: 420
    }
  },
  "asteroid-rose-favorable-water": {
    planet: "asteroid",
    action: "water",
    params: {
      annualPrecipMm: 720,
      dryDays: 85,
      rainPatchiness: 0.32,
      rainScale: 32,
      asteroidMeanTempC: 21,
      asteroidDiurnalRangeC: 6,
      asteroidLatitudeTempRangeC: 1,
      evaporation: 0.68,
      gwFlow: 0.002,
      rootDepth: 6,
      shade: 0.55,
      roseGrowth: 1.35,
      baobabGrowth: 1,
      storage: 1.35,
      atmosphericCo2Ppm: 420
    }
  },
  "asteroid-rose-upper": {
    planet: "asteroid",
    action: "wait",
    params: {
      annualPrecipMm: 1100,
      dryDays: 20,
      rainPatchiness: 0.18,
      rainScale: 40,
      asteroidMeanTempC: 22,
      asteroidDiurnalRangeC: 5,
      asteroidLatitudeTempRangeC: 0,
      evaporation: 0.5,
      gwFlow: 0.006,
      rootDepth: 8,
      shade: 0,
      roseGrowth: 1.8,
      baobabGrowth: 1,
      storage: 1.8,
      atmosphericCo2Ppm: 420
    }
  },
  "asteroid-rose-upper-water": {
    planet: "asteroid",
    action: "water",
    params: {
      annualPrecipMm: 1100,
      dryDays: 20,
      rainPatchiness: 0.18,
      rainScale: 40,
      asteroidMeanTempC: 22,
      asteroidDiurnalRangeC: 5,
      asteroidLatitudeTempRangeC: 0,
      evaporation: 0.5,
      gwFlow: 0.006,
      rootDepth: 8,
      shade: 0,
      roseGrowth: 1.8,
      baobabGrowth: 1,
      storage: 1.8,
      atmosphericCo2Ppm: 420
    }
  },
  "asteroid-rose-upper-co2": {
    planet: "asteroid",
    action: "wait",
    params: {
      annualPrecipMm: 1100,
      dryDays: 20,
      rainPatchiness: 0.18,
      rainScale: 40,
      asteroidMeanTempC: 22,
      asteroidDiurnalRangeC: 5,
      asteroidLatitudeTempRangeC: 0,
      evaporation: 0.5,
      gwFlow: 0.006,
      rootDepth: 8,
      shade: 0,
      roseGrowth: 1.8,
      baobabGrowth: 1,
      storage: 1.8,
      atmosphericCo2Ppm: 900
    }
  }
};

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    nside: 64,
    days: 100,
    samples: [0, 30, 100],
    scenarios: ["earth-default", "asteroid-default", "asteroid-rose-favorable"],
    actionScale: 1,
    maxStepDays: null,
    slowStepInterval: null,
    detail: false,
    assertBalance: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--base-url" && next) {
      options.baseUrl = next;
      i += 1;
    } else if (arg === "--nside" && next) {
      options.nside = Number(next);
      i += 1;
    } else if (arg === "--days" && next) {
      options.days = Number(next);
      i += 1;
    } else if (arg === "--samples" && next) {
      options.samples = next.split(",").map(Number).filter(Number.isFinite);
      i += 1;
    } else if (arg === "--scenarios" && next) {
      options.scenarios = next.split(",").filter(Boolean);
      i += 1;
    } else if ((arg === "--action-scale" || arg === "--time-scale") && next) {
      options.actionScale = Number(next);
      i += 1;
    } else if (arg === "--max-step-days" && next) {
      options.maxStepDays = Number(next);
      i += 1;
    } else if (arg === "--slow-step-interval" && next) {
      options.slowStepInterval = Number(next);
      i += 1;
    } else if (arg === "--detail") {
      options.detail = true;
    } else if (arg === "--assert-balance") {
      options.assertBalance = true;
    }
  }

  options.samples = [...new Set([0, ...options.samples, options.days])]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= options.days)
    .sort((a, b) => a - b);
  return options;
}

function lastSample(result) {
  return result.samples[result.samples.length - 1]?.state ?? null;
}

function firstSample(result) {
  return result.samples[0]?.state ?? null;
}

function assertAsteroidBalance(results) {
  const byScenario = new Map(results.map((result) => [result.scenario, result]));
  const failures = [];
  const defaultResult = byScenario.get("asteroid-default");
  const waterResult = byScenario.get("asteroid-default-water");
  const upperCo2Result = byScenario.get("asteroid-rose-upper-co2");
  const upperResult = byScenario.get("asteroid-rose-upper");

  if (defaultResult) {
    const first = firstSample(defaultResult);
    const last = lastSample(defaultResult);
    if (!first || !last || last.roseCellMass > first.roseCellMass * 0.9) {
      failures.push("asteroid-default should decline by at least 10% without care");
    }
  }

  if (waterResult) {
    const first = firstSample(waterResult);
    const last = lastSample(waterResult);
    if (!first || !last || last.roseCellMass < first.roseCellMass * 0.95) {
      failures.push("asteroid-default-water should keep at least 95% of the primary rose biomass");
    }
  }

  if (upperCo2Result) {
    const first = firstSample(upperCo2Result);
    const last = lastSample(upperCo2Result);
    if (!first || !last || last.roseMass <= first.roseMass * 1.005) {
      failures.push("asteroid-rose-upper-co2 should increase total rose biomass under favorable conditions");
    }
    if (!last || last.offRoseMass <= 1e-5) {
      failures.push("asteroid-rose-upper-co2 should show nonzero off-primary rose establishment");
    }
  }

  if (upperResult && upperCo2Result) {
    const upperLast = lastSample(upperResult);
    const co2Last = lastSample(upperCo2Result);
    if (!upperLast || !co2Last || co2Last.roseMass <= upperLast.roseMass + 0.004) {
      failures.push("CO2 enrichment should measurably improve rose biomass under the upper favorable case");
    }
  }

  if (failures.length > 0) {
    throw new Error(`Asteroid balance validation failed:\n- ${failures.join("\n- ")}`);
  }
}

function scenarioSettings(scenario, actionScale) {
  return {
    ...(scenario.params ?? {}),
    actionTimeScale: actionScale
  };
}

function pageUrl(baseUrl, nside, planet) {
  const url = new URL(baseUrl);
  url.searchParams.set("nside", String(nside));
  url.searchParams.set("planet", planet);
  url.searchParams.set("check", String(Date.now()));
  return url.href;
}

async function summarize(page, detail) {
  return page.evaluate((includeDetail) => {
    const state = window.__healpixAsteroidDebug.state();
    const topology = window.__healpixAsteroidDebug.topology();
    const model = state.vegetation;
    const s = model.state;
    const size = s.MR.length;
    const roseCell = state.roseCell;
    let roseMass = 0;
    let roseCells001 = 0;
    let roseCells01 = 0;
    let roseCells05 = 0;
    let roseSeed = 0;
    let baobabMass = 0;
    let baobabCells05 = 0;
    let baobabSeed = 0;

    for (let i = 0; i < size; i += 1) {
      const rose = s.MR[i];
      const baobab = s.MB[i];
      roseMass += rose;
      roseSeed += s.roseSeed[i];
      baobabMass += baobab;
      baobabSeed += s.baobabSeed[i];
      if (rose > 0.001) roseCells001 += 1;
      if (rose > 0.01) roseCells01 += 1;
      if (rose > 0.05) roseCells05 += 1;
      if (baobab > 0.05) baobabCells05 += 1;
    }

    const roseCellDisplayMass = Math.max(
      state.flower?.[roseCell] ?? 0,
      s.MR[roseCell],
      s.roseLeaf[roseCell] + s.roseFlower[roseCell] + s.roseRoot[roseCell]
    );
    const visibleRosePercent = state.roseWitheredNotified ? 0 : Math.round(roseCellDisplayMass * 100);

    const output = {
      day: state.day,
      turn: state.turn,
      gameOver: state.gameOver,
      roseWitheredNotified: state.roseWitheredNotified,
      roseHealth: state.roseHealth,
      roseCell,
      hudRoseText: document.querySelector("#roseValue")?.textContent ?? null,
      roseCellMass: s.MR[roseCell],
      roseCellBaobabMass: s.MB[roseCell],
      roseCellDisplayMass,
      visibleRosePercent,
      roseCellSeed: s.roseSeed[roseCell],
      roseMass,
      offRoseMass: roseMass - s.MR[roseCell],
      roseCells001,
      roseCells01,
      roseCells05,
      roseSeed,
      baobabMass,
      baobabCells05,
      baobabSeed
    };

    if (includeDetail) {
      const layer0 = roseCell;
      const layer1 = size + roseCell;
      const layer2 = size * 2 + roseCell;
      let neighborRose = 0;
      let neighborSeed = 0;
      for (const direction of topology.directions) {
        const neighbor = topology.neighbor(roseCell, direction);
        if (neighbor === null || neighbor === undefined || neighbor === roseCell) {
          continue;
        }
        neighborRose += s.MR[neighbor];
        neighborSeed += s.roseSeed[neighbor];
      }
      output.roseCellGpp = s.gppRose[roseCell];
      output.roseCellNpp = s.nppRose?.[roseCell] ?? null;
      output.roseCellResp = s.autotrophicRespirationRose[roseCell];
      output.roseCellBalance = s.carbonBalanceRose[roseCell];
      output.roseSeedProduction = s.roseSeedProduction?.[roseCell] ?? null;
      output.roseSeedArrival = s.roseSeedArrival?.[roseCell] ?? null;
      output.roseLeafLoss = s.roseLeafLossCarbon?.[roseCell] ?? null;
      output.roseFlowerLoss = s.roseFlowerLossCarbon?.[roseCell] ?? null;
      output.roseRootLoss = s.roseRootLossCarbon?.[roseCell] ?? null;
      output.roseAllocLeafC = s.roseAllocLeafC?.[roseCell] ?? null;
      output.roseAllocFlowerC = s.roseAllocFlowerC?.[roseCell] ?? null;
      output.roseAllocRootC = s.roseAllocRootC?.[roseCell] ?? null;
      output.roseAllocStoreC = s.roseAllocStoreC?.[roseCell] ?? null;
      output.roseLeaf = s.roseLeaf[roseCell];
      output.roseFlower = s.roseFlower[roseCell];
      output.roseRoot = s.roseRoot[roseCell];
      output.roseStore = s.roseStore[roseCell];
      output.laiRose = s.laiRose[roseCell];
      output.aparRose = s.aparRose[roseCell];
      output.rootStressRose = s.rootStressRose[roseCell];
      output.nutrientStressRose = s.nutrientStressRose[roseCell];
      output.tempStressRose = s.tempStressRose[roseCell];
      output.vpdStressRose = s.vpdStressRose[roseCell];
      output.photosynthesisStressRose = s.photosynthesisStressRose[roseCell];
      output.sunlight = s.sunlight[roseCell];
      output.par = s.par[roseCell];
      output.surfaceTempC = s.surfaceTempC?.[roseCell] ?? null;
      output.vpdKpa = s.vpdKpa?.[roseCell] ?? null;
      output.topWater = s.soilWater[layer0] / s.soilCap[layer0];
      output.midWater = s.soilWater[layer1] / s.soilCap[layer1];
      output.deepWater = s.soilWater[layer2] / s.soilCap[layer2];
      output.groundwater = s.groundwaterStorage[roseCell] / s.groundwaterCap[roseCell];
      output.rainMemoryMm = s.rainMemory[roseCell] * 1000;
      output.rainInstantMmDay = (s.R?.[roseCell] ?? 0) * 1000;
      output.neighborRose = neighborRose;
      output.neighborSeed = neighborSeed;
    }

    return output;
  }, detail);
}

async function advanceWaitDays(page, days) {
  const turns = Math.round(days * TURNS_PER_DAY);
  if (turns <= 0) {
    return;
  }
  for (let i = 0; i < turns; i += 1) {
    const gameOver = await page.evaluate(async () => {
      const debug = window.__healpixAsteroidDebug;
      await debug.advanceTurns(1);
      return Boolean(debug.state().gameOver);
    });
    if (gameOver) {
      break;
    }
  }
}

async function clickActionAndWait(page, buttonSelector, expectedDay) {
  await page.click(buttonSelector);
  await page.waitForFunction(
    (targetDay) => {
      const state = window.__healpixAsteroidDebug.state();
      return state.gameOver || state.day + state.turn / 8 >= targetDay - 1e-6;
    },
    expectedDay,
    { timeout: 300000 }
  );
}

async function applyActionUntilDay(page, action, targetDay, startDay, actionScale) {
  const buttonSelector = action === "water" || action === "waterEveryOther"
    ? "#waterButton"
    : action === "wait"
      ? "#endDayButton"
      : null;
  if (!buttonSelector) {
    throw new Error(`Unsupported action: ${action}`);
  }

  const actionDays = Math.max(1 / TURNS_PER_DAY, actionScale / TURNS_PER_DAY);
  while (true) {
    const currentDay = await page.evaluate(() => {
      const state = window.__healpixAsteroidDebug.state();
      return state.day + state.turn / 8;
    });
    if (currentDay >= targetDay || !Number.isFinite(currentDay)) {
      break;
    }
    const before = currentDay;
    const actionIndex = Math.max(0, Math.floor((currentDay - startDay) / actionDays + 1e-6));
    const shouldWater = action === "water" || (action === "waterEveryOther" && actionIndex % 2 === 0);
    const actionButtonSelector = action === "wait" || !shouldWater ? "#endDayButton" : buttonSelector;
    if (shouldWater) {
      await page.evaluate(() => {
        const state = window.__healpixAsteroidDebug.state();
        state.selectedCell = state.roseCell;
      });
    }
    const expectedAfterAction = Math.min(targetDay, before + actionDays);
    await clickActionAndWait(page, actionButtonSelector, expectedAfterAction);
  }
}

async function runScenario(browser, options, name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const context = await browser.newContext();
  await context.addInitScript(
    ({ storageKey, settings }) => {
      localStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(settings));
      localStorage.setItem("healpixAsteroidViewMode", "vegetation");
    },
    {
      storageKey: `healpixAsteroidSimulationSettingsV15:${scenario.planet}`,
      settings: scenarioSettings(scenario, options.actionScale)
    }
  );
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  const url = pageUrl(options.baseUrl, options.nside, scenario.planet);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.__healpixAsteroidDebug?.state?.()?.vegetation, null, { timeout: 120000 });

  const samples = [];
  const startDay = await page.evaluate(() => {
    const state = window.__healpixAsteroidDebug.state();
    return state.day + state.turn / 8;
  });
  const startedAt = Date.now();
  for (const sampleDay of options.samples) {
    if (sampleDay > 0) {
      await applyActionUntilDay(page, scenario.action ?? "wait", startDay + sampleDay, startDay, options.actionScale);
    }
    samples.push({ day: sampleDay, state: await summarize(page, options.detail) });
  }

  await context.close();
  const first = samples[0]?.state;
  const last = samples[samples.length - 1]?.state;
  return {
    scenario: name,
    planet: scenario.planet,
    nside: options.nside,
    actionScale: options.actionScale,
    maxStepDays: options.maxStepDays,
    slowStepInterval: options.slowStepInterval,
    action: scenario.action ?? "wait",
    elapsedMs: Date.now() - startedAt,
    params: scenario.params,
    delta: first && last ? {
      roseCellMass: last.roseCellMass - first.roseCellMass,
      roseMass: last.roseMass - first.roseMass,
      offRoseMass: last.offRoseMass - first.offRoseMass,
      roseSeed: last.roseSeed - first.roseSeed,
      baobabMass: last.baobabMass - first.baobabMass,
      baobabSeed: last.baobabSeed - first.baobabSeed
    } : null,
    samples,
    errors
  };
}

const options = parseArgs(process.argv.slice(2));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const scenario of options.scenarios) {
    console.error(`running ${scenario}`);
    results.push(await runScenario(browser, options, scenario));
  }
} finally {
  await browser.close();
}

if (options.assertBalance) {
  assertAsteroidBalance(results);
}

console.log(JSON.stringify(results, null, 2));
