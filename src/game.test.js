import assert from "node:assert/strict";
import {
  BLACK,
  EMPTY,
  WHITE,
  applyMove,
  chooseAiMove,
  countPieces,
  createInitialState,
  flipsForMove,
  passTurn,
  validMoves
} from "./game.js";
import {
  analyzeGoMove,
  applyGoMove,
  chooseGoNpcMove,
  classifyGoTerritory,
  createGoState,
  createPoleSet,
  passGoTurn,
  resumeGoGame,
  scoreGoGame,
  toggleDeadGroup,
  validGoMoves
} from "./go-game.js";
import { HEALPIX_BOUNDARY_SEGMENTS_NSIDE2 } from "./healpix-boundaries-nside2.js";
import { createHealpixTopology, createHealpixVertexTopology, pixelCount } from "./healpix.js";

function bruteValidMoves(topology, board, player) {
  const moves = [];

  for (const cell of topology.cells) {
    const flips = flipsForMove(topology, board, cell.id, player);
    if (flips.length > 0) {
      moves.push({ cellId: cell.id, flips });
    }
  }

  return moves;
}

function moveIds(moves) {
  return moves.map((move) => move.cellId);
}

const topology = createHealpixTopology(2);
assert.equal(topology.cells.length, pixelCount(2));
assert.equal(
  HEALPIX_BOUNDARY_SEGMENTS_NSIDE2.length,
  2 * pixelCount(2) * 4 * 6,
  "HEALPix NSIDE=2 boundary data should contain 384 XYZ line segments"
);
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);
closeTo(topology.cells[1].normal[0], 0.2852353895437616);
closeTo(topology.cells[1].normal[1], 2 / 3);
closeTo(topology.cells[1].normal[2], 0.6886191459053213);
assert.deepEqual(
  topology.directions.map((direction) => topology.neighbor(0, direction)),
  [17, 19, 2, 3, 1, 23, 22, 35],
  "HEALPix NESTED direction order should be SW, W, NW, N, NE, E, SE, S"
);
assert.deepEqual(
  topology.directions.map((direction) => topology.neighbor(5, direction) ?? -1),
  [4, 6, 7, 11, 10, -1, 27, 26],
  "NESTED face-corner transitions should preserve missing neighbours"
);
assert.deepEqual(
  topology.directions.map((direction) => topology.neighbor(47, direction) ?? -1),
  [46, 28, 29, 12, 18, 16, 45, 44],
  "NESTED south-cap transitions should wrap across base faces"
);

const goTopology = createHealpixVertexTopology(2);
const goPoleIds = createPoleSet(goTopology);
const goInitial = createGoState(goTopology);
assert.equal(goTopology.vertices.length, 50, "NSIDE 2 HEALPix pixel vertices should include 50 unique points");
assert.equal(goPoleIds.size, 2, "HEALPix Go should treat the two polar vertices as board holes");
assert.equal(validGoMoves(goTopology, goInitial, goPoleIds).length, 48, "all non-polar vertices start legal");
const goTopologyNside4 = createHealpixVertexTopology(4);
const goPoleIdsNside4 = createPoleSet(goTopologyNside4);
assert.equal(goTopologyNside4.vertices.length, 194, "NSIDE 4 HEALPix pixel vertices should include 194 unique points");
assert.equal(goPoleIdsNside4.size, 2, "NSIDE 4 HEALPix Go should still have two polar board holes");
assert.equal(
  validGoMoves(goTopologyNside4, createGoState(goTopologyNside4), goPoleIdsNside4).length,
  192,
  "all non-polar NSIDE 4 vertices start legal"
);
for (const poleId of goPoleIds) {
  assert.equal(analyzeGoMove(goTopology, goInitial, poleId, goPoleIds).reason, "pole");
}
const goOpening = validGoMoves(goTopology, goInitial, goPoleIds)[0];
const afterGoOpening = applyGoMove(goTopology, goInitial, goOpening, goPoleIds);
assert.ok(afterGoOpening, "a legal HEALPix Go move should apply");
assert.equal(afterGoOpening.current, WHITE);
assert.equal(afterGoOpening.moveNumbers[goOpening], 1, "HEALPix Go should keep the displayed move order");
assert.equal(scoreGoGame(goTopology, afterGoOpening, goPoleIds).blackStones, 1);
assert.equal(passGoTurn(passGoTurn(afterGoOpening)).gameOver, true, "two passes should end HEALPix Go");
assert.ok(
  validGoMoves(goTopology, goInitial, goPoleIds).includes(chooseGoNpcMove(goTopology, goInitial, goPoleIds)),
  "HEALPix Go NPC should choose a legal opening move"
);
const weakGoOpening = chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "weak" });
assert.ok(
  validGoMoves(goTopology, goInitial, goPoleIds).includes(weakGoOpening),
  "weak HEALPix Go NPC should still choose a legal opening move"
);
for (const difficulty of ["medium", "strong", "expert", "god"]) {
  const npcMove = chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: difficulty });
  assert.ok(
    npcMove === null || validGoMoves(goTopology, goInitial, goPoleIds).includes(npcMove),
    `${difficulty} HEALPix Go NPC should choose a legal opening move or pass`
  );
}
assert.equal(
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "expert" }),
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "expert" }),
  "expert HEALPix Go NPC should be deterministic for the same position"
);
assert.equal(
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "god" }),
  chooseGoNpcMove(goTopology, goInitial, goPoleIds, { level: "god" }),
  "god HEALPix Go NPC should be deterministic for the same position"
);

const blackTerritoryToyTopology = {
  vertices: Array.from({ length: 6 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return [
      [1, 2, 3, 4],
      [0, 2, 4, 5],
      [0, 1, 3],
      [0, 2, 4],
      [0, 1, 3],
      [1]
    ][vertexId];
  }
};
const blackTerritoryState = createGoState(blackTerritoryToyTopology);
blackTerritoryState.board = [EMPTY, BLACK, BLACK, BLACK, BLACK, EMPTY];
assert.equal(
  chooseGoNpcMove(blackTerritoryToyTopology, blackTerritoryState, new Set()),
  null,
  "Go NPC should pass instead of filling its own territory"
);
for (const difficulty of ["medium", "strong", "expert", "god"]) {
  assert.equal(
    chooseGoNpcMove(blackTerritoryToyTopology, blackTerritoryState, new Set(), { level: difficulty }),
    null,
    `${difficulty} Go NPC should pass instead of filling its own territory`
  );
}
const lateNeutralToyTopology = {
  vertices: Array.from({ length: 6 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return [
      [1],
      [0],
      [3],
      [2],
      [5],
      [4]
    ][vertexId];
  }
};
const lateNeutralState = createGoState(lateNeutralToyTopology);
lateNeutralState.board = [BLACK, WHITE, BLACK, WHITE, EMPTY, EMPTY];
lateNeutralState.moveCount = 16;
for (const difficulty of ["medium", "strong", "expert", "god"]) {
  assert.equal(
    chooseGoNpcMove(lateNeutralToyTopology, lateNeutralState, new Set(), { level: difficulty }),
    null,
    `${difficulty} Go NPC should pass instead of filling disconnected late neutral points`
  );
}
const captureOrderToyTopology = {
  vertices: Array.from({ length: 4 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return [
      [1, 2, 3],
      [0],
      [0],
      [0]
    ][vertexId];
  }
};
const captureOrderState = createGoState(captureOrderToyTopology);
captureOrderState.board = [WHITE, BLACK, BLACK, EMPTY];
captureOrderState.moveNumbers = [3, 1, 2, null];
captureOrderState.moveCount = 3;
const afterCaptureOrder = applyGoMove(captureOrderToyTopology, captureOrderState, 3, new Set());
assert.equal(afterCaptureOrder.moveNumbers[0], null, "captured Go stones should lose their displayed move order");
assert.equal(afterCaptureOrder.moveNumbers[3], 4, "new Go stones should receive the next displayed move order");
const deadStoneState = createGoState(blackTerritoryToyTopology);
deadStoneState.gameOver = true;
deadStoneState.board = [EMPTY, BLACK, BLACK, BLACK, BLACK, WHITE];
const deadMarkedState = toggleDeadGroup(blackTerritoryToyTopology, deadStoneState, 5, new Set());
assert.equal(deadMarkedState.deadStones.has(5), true, "dead stone marking should toggle a whole group");
assert.equal(scoreGoGame(blackTerritoryToyTopology, deadMarkedState, new Set()).blackScore, 3);
assert.equal(classifyGoTerritory(blackTerritoryToyTopology, deadMarkedState, new Set()).ownerByPoint.get(5), BLACK);
assert.equal(resumeGoGame(deadMarkedState).gameOver, false, "scoring should be resumable when players disagree");

const superkoToyTopology = {
  vertices: Array.from({ length: 2 }, (_, id) => ({ id })),
  neighbors(vertexId) {
    return vertexId === 0 ? [1] : [0];
  }
};
const superkoState = createGoState(superkoToyTopology);
superkoState.positionHistory.add("21");
assert.equal(analyzeGoMove(superkoToyTopology, superkoState, 0, new Set()).reason, "ko");

const initial = createInitialState(topology);
assert.deepEqual(countPieces(initial.board), { black: 2, white: 2, empty: 44 });

const blackMoves = validMoves(topology, initial.board, BLACK);
const whiteMoves = validMoves(topology, initial.board, WHITE);
assert.equal(blackMoves.length, 4, "black should have four opening moves");
assert.equal(whiteMoves.length, 4, "white should have four opening moves");

const afterBlack = applyMove(topology, initial, blackMoves[0].cellId);
assert.ok(afterBlack, "a legal black move should apply");
assert.equal(afterBlack.board[blackMoves[0].cellId], BLACK);

const counts = countPieces(afterBlack.board);
assert.equal(counts.black + counts.white + counts.empty, topology.cells.length);
assert.equal(counts.black + counts.white, 5);

function playNpcGame(topology, initialState, difficulty) {
  let sampleState = initialState;
  for (let turn = 0; turn < topology.cells.length + 20 && !sampleState.gameOver; turn += 1) {
    const sampleMoves = validMoves(topology, sampleState.board, sampleState.current);
    if (sampleMoves.length === 0) {
      const passed = passTurn(topology, sampleState);
      if (!passed) {
        break;
      }
      sampleState = passed;
      continue;
    }

    const move = chooseAiMove(topology, sampleState.board, sampleState.current, difficulty);
    sampleState = applyMove(topology, sampleState, move.cellId);
  }

  return sampleState;
}

for (const nside of [2]) {
  const variableTopology = createHealpixTopology(nside);
  const variableInitial = createInitialState(variableTopology);
  const variableBlackMoves = validMoves(variableTopology, variableInitial.board, BLACK);
  const variableWhiteMoves = validMoves(variableTopology, variableInitial.board, WHITE);

  assert.equal(variableTopology.cells.length, pixelCount(nside));
  assert.deepEqual(countPieces(variableInitial.board), {
    black: 2,
    white: 2,
    empty: pixelCount(nside) - 4
  });
  assert.equal(variableBlackMoves.length, 4, `black should have four opening moves at NSIDE ${nside}`);
  assert.equal(variableWhiteMoves.length, 4, `white should have four opening moves at NSIDE ${nside}`);
  assert.deepEqual(moveIds(variableBlackMoves), moveIds(bruteValidMoves(variableTopology, variableInitial.board, BLACK)));

  for (const difficulty of ["easy", "normal", "hard", "expert", "god"]) {
    const npcMove = chooseAiMove(variableTopology, variableInitial.board, BLACK, difficulty);
    assert.ok(
      variableBlackMoves.some((move) => move.cellId === npcMove.cellId),
      `${difficulty} NPC should choose a legal NSIDE ${nside} opening`
    );
  }

  const expertMoveA = chooseAiMove(variableTopology, variableInitial.board, BLACK, "expert");
  const expertMoveB = chooseAiMove(variableTopology, variableInitial.board, BLACK, "expert");
  assert.equal(expertMoveA.cellId, expertMoveB.cellId, `expert NPC should be deterministic at NSIDE ${nside}`);

  const godMoveA = chooseAiMove(variableTopology, variableInitial.board, BLACK, "god");
  const godMoveB = chooseAiMove(variableTopology, variableInitial.board, BLACK, "god");
  assert.equal(godMoveA.cellId, godMoveB.cellId, `god NPC should be deterministic at NSIDE ${nside}`);

  let sampleState = variableInitial;
  for (let turn = 0; turn < 8 && !sampleState.gameOver; turn += 1) {
    const sampleMoves = validMoves(variableTopology, sampleState.board, sampleState.current);
    assert.deepEqual(
      moveIds(sampleMoves),
      moveIds(bruteValidMoves(variableTopology, sampleState.board, sampleState.current)),
      `candidate legal moves should match brute-force moves at NSIDE ${nside}`
    );
    if (sampleMoves.length === 0) {
      break;
    }
    sampleState = applyMove(variableTopology, sampleState, sampleMoves[Math.floor(sampleMoves.length / 2)].cellId);
  }
}

const godGame = playNpcGame(topology, initial, "god");
assert.deepEqual(countPieces(godGame.board), {
  black: 24,
  white: 24,
  empty: 0
});

console.log(`logic ok: ${topology.cells.length} HEALPix cells, ${blackMoves.length} black openings`);
