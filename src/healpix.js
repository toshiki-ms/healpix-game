export const DEFAULT_NSIDE = 2;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = -1;

export const DIRECTIONS = Object.freeze([
  { name: "south-west", label: "SW", dx: 0, dy: -1 },
  { name: "west", label: "W", dx: 1, dy: -1 },
  { name: "north-west", label: "NW", dx: 1, dy: 0 },
  { name: "north", label: "N", dx: 1, dy: 1 },
  { name: "north-east", label: "NE", dx: 0, dy: 1 },
  { name: "east", label: "E", dx: -1, dy: 1 },
  { name: "south-east", label: "SE", dx: -1, dy: 0 },
  { name: "south", label: "S", dx: -1, dy: -1 }
]);

const TAU = Math.PI * 2;
const FACE_RING_ANCHORS = Object.freeze([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
const FACE_PHI_ANCHORS = Object.freeze([1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7]);
const EDGE_TARGET_FACE = Object.freeze({
  SW: Object.freeze([4, 5, 6, 7, 11, 8, 9, 10, 11, 8, 9, 10]),
  SE: Object.freeze([5, 6, 7, 4, 8, 9, 10, 11, 9, 10, 11, 8]),
  NE: Object.freeze([1, 2, 3, 0, 0, 1, 2, 3, 5, 6, 7, 4]),
  NW: Object.freeze([3, 0, 1, 2, 3, 0, 1, 2, 4, 5, 6, 7])
});

const CORNER_TARGET = Object.freeze({
  S: Object.freeze([
    [8, "hi", "hi"],
    [9, "hi", "hi"],
    [10, "hi", "hi"],
    [11, "hi", "hi"],
    null,
    null,
    null,
    null,
    [10, 0, 0],
    [11, 0, 0],
    [8, 0, 0],
    [9, 0, 0]
  ]),
  W: Object.freeze([
    null,
    null,
    null,
    null,
    [7, 0, "hi"],
    [4, 0, "hi"],
    [5, 0, "hi"],
    [6, 0, "hi"],
    null,
    null,
    null,
    null
  ]),
  E: Object.freeze([
    null,
    null,
    null,
    null,
    [5, "hi", 0],
    [6, "hi", 0],
    [7, "hi", 0],
    [4, "hi", 0],
    null,
    null,
    null,
    null
  ]),
  N: Object.freeze([
    [2, "hi", "hi"],
    [3, "hi", "hi"],
    [0, "hi", "hi"],
    [1, "hi", "hi"],
    null,
    null,
    null,
    null,
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [3, 0, 0]
  ])
});
const spreadBitsTableCache = new Map();

export function modulo(value, size) {
  return ((value % size) + size) % size;
}

export function wrapTau(value) {
  return modulo(value, TAU);
}

export function ringCount(nside = DEFAULT_NSIDE) {
  return 4 * nside - 1;
}

export function pixelCount(nside = DEFAULT_NSIDE) {
  return 12 * nside * nside;
}

export function ringCellCount(ring, nside = DEFAULT_NSIDE) {
  if (ring < 1 || ring > ringCount(nside)) {
    return 0;
  }

  if (ring < nside) {
    return 4 * ring;
  }

  if (ring <= 3 * nside) {
    return 4 * nside;
  }

  return 4 * (4 * nside - ring);
}

function ringHeight(ring, nside) {
  if (ring < nside) {
    return 1 - (ring * ring) / (3 * nside * nside);
  }

  if (ring <= 3 * nside) {
    return ((2 * nside - ring) * 2) / (3 * nside);
  }

  const mirror = 4 * nside - ring;
  return -1 + (mirror * mirror) / (3 * nside * nside);
}

function spreadBits(value, nside) {
  const table = spreadBitsTableForNside(nside);
  if (table) {
    return table[value] ?? 0;
  }

  let spread = 0;
  let bit = 0;

  while (1 << bit < nside) {
    spread |= ((value >> bit) & 1) << (2 * bit);
    bit += 1;
  }

  return spread;
}

function spreadBitsTableForNside(nside) {
  let table = spreadBitsTableCache.get(nside);
  if (table) {
    return table;
  }

  if (!Number.isInteger(nside) || nside <= 0 || nside > 65536) {
    return null;
  }

  table = new Uint32Array(nside);
  for (let value = 0; value < nside; value += 1) {
    let spread = 0;
    let bit = 0;
    while (1 << bit < nside) {
      spread |= ((value >> bit) & 1) << (2 * bit);
      bit += 1;
    }
    table[value] = spread;
  }
  spreadBitsTableCache.set(nside, table);
  return table;
}

function nestedId(face, ix, iy, nside) {
  return face * nside * nside + spreadBits(iy, nside) + 2 * spreadBits(ix, nside);
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function centerPhiFromGrid(rawJp, ring, nside) {
  return wrapTau(((centerPhiRawFromGrid(rawJp, ring, nside) - 1) * Math.PI) / (4 * nside));
}

function centerPhiRawFromGrid(rawJp, ring, nside) {
  if (ring < nside) {
    const anchor = nearestPolarAnchor(rawJp, nside);
    return anchor + (rawJp - anchor) * (nside / ring);
  }

  if (ring > 3 * nside) {
    const anchor = nearestPolarAnchor(rawJp, nside);
    return anchor + (rawJp - anchor) * (nside / (4 * nside - ring));
  }

  return rawJp;
}

function nearestPolarAnchor(rawJp, nside) {
  const period = 8 * nside;
  const anchors = [nside + 1, 3 * nside + 1, 5 * nside + 1, 7 * nside + 1];
  let best = anchors[0];
  let bestDistance = Infinity;

  for (const anchor of anchors) {
    const wrappedAnchor = anchor + Math.round((rawJp - anchor) / period) * period;
    const distance = Math.abs(rawJp - wrappedAnchor);
    if (distance < bestDistance) {
      best = wrappedAnchor;
      bestDistance = distance;
    }
  }

  return best;
}

function createNestedCell(face, ix, iy, nside) {
  const id = nestedId(face, ix, iy, nside);
  const ring = FACE_RING_ANCHORS[face] * nside - ix - iy - 1;
  const rawJp = FACE_PHI_ANCHORS[face] * nside - ix + iy + 1;
  const phi = centerPhiFromGrid(rawJp, ring, nside);
  const height = ringHeight(ring, nside);
  const horizontalRadius = Math.sqrt(Math.max(0, 1 - height * height));
  const normal = [
    Math.cos(phi) * horizontalRadius,
    height,
    Math.sin(phi) * horizontalRadius
  ];

  return {
    id,
    face,
    ix,
    iy,
    ring,
    column: 0,
    nphi: 0,
    rawJp,
    gridJp: modulo(rawJp, 8 * nside),
    gridJr: ring,
    phi,
    height,
    normal,
    polarBand: ring < nside ? "north" : ring > 3 * nside ? "south" : "equatorial"
  };
}

function resolveCorner(face, label, nside) {
  const target = CORNER_TARGET[label]?.[face] ?? null;
  if (!target) {
    return null;
  }

  const hi = nside - 1;
  return {
    face: target[0],
    ix: target[1] === "hi" ? hi : target[1],
    iy: target[2] === "hi" ? hi : target[2]
  };
}

function resolveEdge(face, edge, coordinate, nside) {
  if (coordinate < 0 || coordinate >= nside) {
    return null;
  }

  const targetFace = EDGE_TARGET_FACE[edge][face];
  const hi = nside - 1;

  if (edge === "SW") {
    return face < 8
      ? { face: targetFace, ix: coordinate, iy: hi }
      : { face: targetFace, ix: 0, iy: coordinate };
  }

  if (edge === "SE") {
    return face < 8
      ? { face: targetFace, ix: hi, iy: coordinate }
      : { face: targetFace, ix: coordinate, iy: 0 };
  }

  if (edge === "NE") {
    return face < 4
      ? { face: targetFace, ix: hi, iy: coordinate }
      : { face: targetFace, ix: coordinate, iy: 0 };
  }

  return face < 4
    ? { face: targetFace, ix: coordinate, iy: hi }
    : { face: targetFace, ix: 0, iy: coordinate };
}

function stepNested(cell, direction, nside) {
  const nextIx = cell.ix + direction.dx;
  const nextIy = cell.iy + direction.dy;
  const outsideX = nextIx < 0 || nextIx >= nside;
  const outsideY = nextIy < 0 || nextIy >= nside;

  if (!outsideX && !outsideY) {
    return nestedId(cell.face, nextIx, nextIy, nside);
  }

  if (outsideX && outsideY) {
    const corner = resolveCorner(cell.face, direction.label, nside);
    return corner ? nestedId(corner.face, corner.ix, corner.iy, nside) : null;
  }

  let edge;
  let coordinate;
  if (nextIy < 0) {
    edge = "SW";
    coordinate = nextIx;
  } else if (nextIx < 0) {
    edge = "SE";
    coordinate = nextIy;
  } else if (nextIy >= nside) {
    edge = "NE";
    coordinate = nextIx;
  } else {
    edge = "NW";
    coordinate = nextIy;
  }

  const target = resolveEdge(cell.face, edge, coordinate, nside);
  return target ? nestedId(target.face, target.ix, target.iy, nside) : null;
}

export function createHealpixTopology(nside = DEFAULT_NSIDE) {
  if (!Number.isInteger(nside) || nside < 2) {
    throw new Error("nside must be an integer greater than 1");
  }

  if (!isPowerOfTwo(nside)) {
    throw new Error("NESTED HEALPix indexing requires nside to be a power of two");
  }

  const maxRing = ringCount(nside);
  const cells = new Array(pixelCount(nside));
  const rings = new Map();
  const ringBuckets = Array.from({ length: maxRing + 1 }, () => []);

  for (let face = 0; face < 12; face += 1) {
    for (let ix = 0; ix < nside; ix += 1) {
      for (let iy = 0; iy < nside; iy += 1) {
        const cell = createNestedCell(face, ix, iy, nside);
        cells[cell.id] = cell;
        ringBuckets[cell.ring].push(cell.id);
      }
    }
  }

  let ringIndex = 0;
  for (let ring = 1; ring <= maxRing; ring += 1) {
    const ids = ringBuckets[ring];
    ids.sort((a, b) => cells[a].phi - cells[b].phi);
    for (let column = 0; column < ids.length; column += 1) {
      const cell = cells[ids[column]];
      cell.column = column;
      cell.nphi = ringCellCount(ring, nside);
      cell.ringIndex = ringIndex + column;
    }

    rings.set(ring, ids);
    ringIndex += ids.length;
  }

  const cellAt = (ring, column) => {
    const ids = rings.get(ring);
    if (!ids) {
      return null;
    }

    return ids[modulo(column, ids.length)];
  };

  const cellAtPhi = (ring, phi) => {
    const ids = rings.get(ring);
    if (!ids) {
      return null;
    }

    let bestId = ids[0];
    let bestDistance = Infinity;
    for (const id of ids) {
      const distance = Math.abs(Math.atan2(Math.sin(cells[id].phi - phi), Math.cos(cells[id].phi - phi)));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = id;
      }
    }
    return bestId;
  };

  const neighbor = (cellId, direction) => {
    const cell = cells[cellId];
    if (!cell) {
      return null;
    }

    return stepNested(cell, direction, nside);
  };

  return Object.freeze({
    nside,
    maxRing,
    cells,
    rings,
    directions: DIRECTIONS,
    cellAt,
    cellAtPhi,
    neighbor
  });
}

export function createHealpixVertexTopology(nside = DEFAULT_NSIDE) {
  const cellTopology = createHealpixTopology(nside);
  const vertices = [];
  const vertexByKey = new Map();
  const adjacency = [];
  const edgeKeys = new Set();
  const wrapX = 16 * nside;
  const directionByLabel = Object.fromEntries(DIRECTIONS.map((direction) => [direction.label, direction]));
  const corners = Object.freeze({
    HL: Object.freeze({ directions: ["NW", "SW", "W"], offset: [-1, 0] }),
    HH: Object.freeze({ directions: ["NW", "NE", "N"], offset: [0, -1] }),
    LH: Object.freeze({ directions: ["SE", "NE", "E"], offset: [1, 0] }),
    LL: Object.freeze({ directions: ["SE", "SW", "S"], offset: [0, 1] })
  });

  const cornerKey = (cell, definition) => {
    const ids = [cell.id];
    for (const label of definition.directions) {
      const neighborId = cellTopology.neighbor(cell.id, directionByLabel[label]);
      if (neighborId !== null) {
        ids.push(neighborId);
      }
    }

    return ids.sort((a, b) => a - b).join(",");
  };

  const getVertex = (cell, definition) => {
    const key = cornerKey(cell, definition);
    const existing = vertexByKey.get(key);
    const x2 = modulo(2 * cell.gridJp + definition.offset[0], wrapX);
    const y2 = 2 * cell.gridJr + definition.offset[1];
    const angle = (x2 / wrapX) * TAU;

    if (existing !== undefined) {
      vertices[existing].xSin += Math.sin(angle);
      vertices[existing].xCos += Math.cos(angle);
      vertices[existing].yTotal += y2;
      vertices[existing].pointCount += 1;
      return existing;
    }

    const id = vertices.length;
    vertices.push({
      id,
      key,
      gridJp: 0,
      gridJr: 0,
      normal: [0, 0, 0],
      cellIds: key.split(",").map(Number),
      xSin: Math.sin(angle),
      xCos: Math.cos(angle),
      yTotal: y2,
      pointCount: 1
    });
    vertexByKey.set(key, id);
    adjacency[id] = new Set();
    return id;
  };

  const addEdge = (a, b) => {
    if (a === b) {
      return;
    }

    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) {
      return;
    }

    edgeKeys.add(key);
    adjacency[a].add(b);
    adjacency[b].add(a);
  };

  for (const cell of cellTopology.cells) {
    const highLow = getVertex(cell, corners.HL);
    const highHigh = getVertex(cell, corners.HH);
    const lowHigh = getVertex(cell, corners.LH);
    const lowLow = getVertex(cell, corners.LL);

    addEdge(highLow, highHigh);
    addEdge(highHigh, lowHigh);
    addEdge(lowHigh, lowLow);
    addEdge(lowLow, highLow);
  }

  for (const vertex of vertices) {
    const normal = [0, 0, 0];
    for (const cellId of vertex.cellIds) {
      const cellNormal = cellTopology.cells[cellId].normal;
      normal[0] += cellNormal[0];
      normal[1] += cellNormal[1];
      normal[2] += cellNormal[2];
    }

    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const angle = Math.atan2(vertex.xSin, vertex.xCos);
    const wrappedAngle = angle < 0 ? angle + TAU : angle;
    vertex.normal = [normal[0] / length, normal[1] / length, normal[2] / length];
    vertex.gridJp = (wrappedAngle / TAU) * (wrapX / 2);
    vertex.gridJr = vertex.yTotal / vertex.pointCount / 2;
    vertex.neighborIds = [...adjacency[vertex.id]].sort((a, b) => a - b);
    delete vertex.xSin;
    delete vertex.xCos;
    delete vertex.yTotal;
    delete vertex.pointCount;
  }

  return Object.freeze({
    nside,
    cells: vertices,
    vertices,
    edges: [...edgeKeys].map((key) => key.split(":").map(Number)),
    directions: [],
    neighbors: (vertexId) => vertices[vertexId]?.neighborIds ?? [],
    neighbor: (vertexId, direction) => vertices[vertexId]?.neighborIds[direction.index] ?? null,
    cellTopology
  });
}
