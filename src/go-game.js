import {
  BLACK,
  EMPTY,
  WHITE
} from "./healpix.js";

export { BLACK, EMPTY, WHITE };

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function createPoleSet(topology) {
  return new Set(topology.vertices.filter((vertex) => Math.abs(vertex.normal[1]) > 0.999999).map((vertex) => vertex.id));
}

export function createGoState(topology) {
  const board = new Array(topology.vertices.length).fill(EMPTY);
  const moveNumbers = new Array(topology.vertices.length).fill(null);

  return {
    board,
    moveNumbers,
    current: BLACK,
    captures: {
      [BLACK]: 0,
      [WHITE]: 0
    },
    consecutivePasses: 0,
    moveCount: 0,
    gameOver: false,
    lastMove: null,
    previousBoardKey: null,
    positionHistory: new Set([boardKey(board)]),
    deadStones: new Set()
  };
}

function boardKey(board) {
  return board.map((value) => String(value + 1)).join("");
}

export function collectGroup(topology, board, startId) {
  const color = board[startId];
  if (color === EMPTY) {
    return [];
  }

  const group = [];
  const visited = new Set([startId]);
  const stack = [startId];

  while (stack.length > 0) {
    const vertexId = stack.pop();
    group.push(vertexId);

    for (const neighborId of topology.neighbors(vertexId)) {
      if (!visited.has(neighborId) && board[neighborId] === color) {
        visited.add(neighborId);
        stack.push(neighborId);
      }
    }
  }

  return group;
}

export function groupLiberties(topology, board, group, poleIds = createPoleSet(topology)) {
  const liberties = new Set();

  for (const vertexId of group) {
    for (const neighborId of topology.neighbors(vertexId)) {
      if (!poleIds.has(neighborId) && board[neighborId] === EMPTY) {
        liberties.add(neighborId);
      }
    }
  }

  return liberties;
}

export function analyzeGoMove(topology, state, vertexId, poleIds = createPoleSet(topology)) {
  if (state.gameOver) {
    return { ok: false, reason: "game-over" };
  }

  if (poleIds.has(vertexId)) {
    return { ok: false, reason: "pole" };
  }

  if (state.board[vertexId] !== EMPTY) {
    return { ok: false, reason: "occupied" };
  }

  const player = state.current;
  const rival = opponent(player);
  const board = state.board.slice();
  const captured = [];
  board[vertexId] = player;

  for (const neighborId of topology.neighbors(vertexId)) {
    if (board[neighborId] !== rival) {
      continue;
    }

    const group = collectGroup(topology, board, neighborId);
    if (groupLiberties(topology, board, group, poleIds).size === 0) {
      for (const capturedId of group) {
        board[capturedId] = EMPTY;
        captured.push(capturedId);
      }
    }
  }

  const ownGroup = collectGroup(topology, board, vertexId);
  const ownLiberties = groupLiberties(topology, board, ownGroup, poleIds);
  if (ownLiberties.size === 0) {
    return { ok: false, reason: "suicide" };
  }

  const key = boardKey(board);
  if (state.positionHistory?.has(key) || (state.previousBoardKey && key === state.previousBoardKey)) {
    return { ok: false, reason: "ko" };
  }

  return {
    ok: true,
    board,
    captured,
    liberties: ownLiberties.size,
    boardKey: key
  };
}

export function applyGoMove(topology, state, vertexId, poleIds = createPoleSet(topology)) {
  const analysis = analyzeGoMove(topology, state, vertexId, poleIds);
  if (!analysis.ok) {
    return null;
  }

  const captures = {
    ...state.captures,
    [state.current]: state.captures[state.current] + analysis.captured.length
  };
  const moveNumbers = (state.moveNumbers ?? new Array(state.board.length).fill(null)).slice();
  for (const capturedId of analysis.captured) {
    moveNumbers[capturedId] = null;
  }
  moveNumbers[vertexId] = state.moveCount + 1;
  const positionHistory = new Set(state.positionHistory ?? [boardKey(state.board)]);
  positionHistory.add(analysis.boardKey);

  return {
    board: analysis.board,
    moveNumbers,
    current: opponent(state.current),
    captures,
    consecutivePasses: 0,
    moveCount: state.moveCount + 1,
    gameOver: false,
    lastMove: {
      type: "move",
      player: state.current,
      vertexId,
      captured: analysis.captured
    },
    previousBoardKey: boardKey(state.board),
    positionHistory,
    deadStones: new Set()
  };
}

export function passGoTurn(state) {
  if (state.gameOver) {
    return null;
  }

  const consecutivePasses = state.consecutivePasses + 1;
  return {
    ...state,
    moveNumbers: state.moveNumbers ?? new Array(state.board.length).fill(null),
    current: opponent(state.current),
    consecutivePasses,
    moveCount: state.moveCount + 1,
    gameOver: consecutivePasses >= 2,
    lastMove: {
      type: "pass",
      player: state.current
    },
    previousBoardKey: null,
    positionHistory: state.positionHistory ?? new Set([boardKey(state.board)]),
    deadStones: state.deadStones ?? new Set()
  };
}

export function validGoMoves(topology, state, poleIds = createPoleSet(topology)) {
  const moves = [];

  for (const vertex of topology.vertices) {
    if (analyzeGoMove(topology, state, vertex.id, poleIds).ok) {
      moves.push(vertex.id);
    }
  }

  return moves;
}

function emptyRegionInfo(topology, board, startId, poleIds) {
  const region = [];
  const adjacentColors = new Set();
  const visited = new Set([startId]);
  const stack = [startId];
  let touchesPole = false;

  while (stack.length > 0) {
    const vertexId = stack.pop();
    region.push(vertexId);

    for (const neighborId of topology.neighbors(vertexId)) {
      if (poleIds.has(neighborId)) {
        touchesPole = true;
        continue;
      }

      const value = board[neighborId];
      if (value === BLACK || value === WHITE) {
        adjacentColors.add(value);
        continue;
      }

      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        stack.push(neighborId);
      }
    }
  }

  return {
    points: region,
    owner: !touchesPole && adjacentColors.size === 1 ? [...adjacentColors][0] : null,
    touchesPole,
    adjacentColors
  };
}

function boardWithDeadRemoved(state) {
  const deadStones = state.deadStones ?? new Set();
  if (deadStones.size === 0) {
    return state.board;
  }

  const board = state.board.slice();
  for (const vertexId of deadStones) {
    board[vertexId] = EMPTY;
  }
  return board;
}

export function classifyGoTerritory(topology, state, poleIds = createPoleSet(topology)) {
  const board = boardWithDeadRemoved(state);
  const visited = new Set();
  const ownerByPoint = new Map();
  const regions = [];

  for (const vertex of topology.vertices) {
    if (poleIds.has(vertex.id) || visited.has(vertex.id) || board[vertex.id] !== EMPTY) {
      continue;
    }

    const area = [];
    const stack = [vertex.id];
    const adjacentColors = new Set();
    let touchesPole = false;
    visited.add(vertex.id);

    while (stack.length > 0) {
      const vertexId = stack.pop();
      area.push(vertexId);

      for (const neighborId of topology.neighbors(vertexId)) {
        if (poleIds.has(neighborId)) {
          touchesPole = true;
          continue;
        }

        const value = board[neighborId];
        if (value === BLACK || value === WHITE) {
          adjacentColors.add(value);
          continue;
        }

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }

    const owner = !touchesPole && adjacentColors.size === 1 ? [...adjacentColors][0] : null;
    for (const vertexId of area) {
      ownerByPoint.set(vertexId, owner);
    }
    regions.push({ points: area, owner, touchesPole, adjacentColors });
  }

  return { ownerByPoint, regions };
}

export function scoreGoGame(topology, state, poleIds = createPoleSet(topology)) {
  const board = boardWithDeadRemoved(state);
  const deadStones = state.deadStones ?? new Set();
  const territory = {
    [BLACK]: 0,
    [WHITE]: 0,
    neutral: 0
  };
  const stones = {
    [BLACK]: 0,
    [WHITE]: 0
  };
  const dead = {
    [BLACK]: 0,
    [WHITE]: 0
  };

  for (const vertex of topology.vertices) {
    const value = board[vertex.id];
    if (value === BLACK || value === WHITE) {
      stones[value] += 1;
    }
  }

  for (const vertexId of deadStones) {
    const value = state.board[vertexId];
    if (value === BLACK || value === WHITE) {
      dead[value] += 1;
    }
  }

  for (const region of classifyGoTerritory(topology, state, poleIds).regions) {
    if (region.owner === BLACK || region.owner === WHITE) {
      territory[region.owner] += region.points.length;
    } else {
      territory.neutral += region.points.length;
    }
  }

  return {
    blackStones: stones[BLACK],
    whiteStones: stones[WHITE],
    blackTerritory: territory[BLACK],
    whiteTerritory: territory[WHITE],
    neutral: territory.neutral + poleIds.size,
    blackAreaScore: stones[BLACK] + territory[BLACK],
    whiteAreaScore: stones[WHITE] + territory[WHITE],
    blackScore: territory[BLACK] + state.captures[BLACK] + dead[WHITE],
    whiteScore: territory[WHITE] + state.captures[WHITE] + dead[BLACK],
    captures: state.captures,
    deadBlack: dead[BLACK],
    deadWhite: dead[WHITE]
  };
}

export function toggleDeadGroup(topology, state, vertexId, poleIds = createPoleSet(topology)) {
  if (!state.gameOver || poleIds.has(vertexId) || state.board[vertexId] === EMPTY) {
    return state;
  }

  const group = collectGroup(topology, state.board, vertexId);
  const deadStones = new Set(state.deadStones ?? []);
  const allDead = group.every((groupVertexId) => deadStones.has(groupVertexId));

  for (const groupVertexId of group) {
    if (allDead) {
      deadStones.delete(groupVertexId);
    } else {
      deadStones.add(groupVertexId);
    }
  }

  return {
    ...state,
    deadStones,
    lastMove: {
      type: "dead-toggle",
      player: state.board[vertexId],
      vertexId,
      dead: !allDead
    }
  };
}

export function resumeGoGame(state) {
  if (!state.gameOver) {
    return state;
  }

  return {
    ...state,
    gameOver: false,
    consecutivePasses: 0,
    deadStones: new Set(),
    lastMove: {
      type: "resume"
    }
  };
}

function relativeAreaScore(score, player) {
  return player === BLACK
    ? score.blackAreaScore - score.whiteAreaScore
    : score.whiteAreaScore - score.blackAreaScore;
}

function relativeTerritoryScore(score, player) {
  const blackScore = score.blackTerritory + score.captures[BLACK] * 1.6;
  const whiteScore = score.whiteTerritory + score.captures[WHITE] * 1.6;
  return player === BLACK ? blackScore - whiteScore : whiteScore - blackScore;
}

function evaluateGoMove(topology, state, vertexId, poleIds) {
  const analysis = analyzeGoMove(topology, state, vertexId, poleIds);
  if (!analysis.ok) {
    return null;
  }

  const region = emptyRegionInfo(topology, state.board, vertexId, poleIds);
  const beforeScore = scoreGoGame(topology, state, poleIds);
  const nextState = applyGoMove(topology, state, vertexId, poleIds);
  const afterScore = scoreGoGame(topology, nextState, poleIds);
  const areaGain = relativeAreaScore(afterScore, state.current) - relativeAreaScore(beforeScore, state.current);
  const territoryGain =
    relativeTerritoryScore(afterScore, state.current) - relativeTerritoryScore(beforeScore, state.current);
  const captures = analysis.captured.length;
  const rival = opponent(state.current);
  const seenGroups = new Set();
  let attackGain = 0;
  let saveGain = 0;
  let contactGain = 0;
  let ownNeighborGroups = 0;
  let rivalNeighborGroups = 0;

  for (const neighborId of topology.neighbors(vertexId)) {
    if (poleIds.has(neighborId)) {
      continue;
    }

    const value = state.board[neighborId];
    if (value !== BLACK && value !== WHITE) {
      continue;
    }

    const group = collectGroup(topology, state.board, neighborId);
    const groupKey = Math.min(...group);
    if (seenGroups.has(groupKey)) {
      continue;
    }

    seenGroups.add(groupKey);
    const liberties = groupLiberties(topology, state.board, group, poleIds);
    if (!liberties.has(vertexId)) {
      continue;
    }

    if (value === rival) {
      rivalNeighborGroups += 1;
      contactGain += 0.18;
      if (liberties.size === 1) {
        attackGain += group.length * 2.4;
      } else if (liberties.size === 2) {
        attackGain += group.length * 0.9;
      }
    } else {
      ownNeighborGroups += 1;
      contactGain += 0.12;
      if (liberties.size === 1) {
        saveGain += group.length * 1.15;
      } else if (liberties.size === 2) {
        saveGain += group.length * 0.35;
      }
    }
  }

  const mergedGroup = collectGroup(topology, analysis.board, vertexId);
  const postLiberties = groupLiberties(topology, analysis.board, mergedGroup, poleIds).size;
  const connectionGain =
    ownNeighborGroups > 1
      ? (ownNeighborGroups - 1) * 1.2 + Math.min(mergedGroup.length, 10) * 0.06
      : ownNeighborGroups === 1
        ? 0.24
        : 0;
  const cutGain = rivalNeighborGroups > 1 ? (rivalNeighborGroups - 1) * 1.15 : 0;
  const libertyShapeGain = Math.min(postLiberties, 5) * 0.25 + Math.min(mergedGroup.length, 10) * 0.05;
  const shapeGain = connectionGain + cutGain + libertyShapeGain;
  const occupiedCount = state.board.reduce((total, value) => total + (value === BLACK || value === WHITE ? 1 : 0), 0);
  const phase = occupiedCount / Math.max(1, topology.vertices.length - poleIds.size);
  const contactGroups = ownNeighborGroups + rivalNeighborGroups;
  const developmentGain =
    region.owner === null
      ? phase < 0.2
        ? 0.86
        : phase < 0.48 && contactGroups > 0
          ? 0.42
          : 0
      : 0;
  const quietOwnTerritory =
    region.owner === state.current && captures === 0 && attackGain === 0;
  const smallDamePenalty = region.owner === null && region.points.length <= 2 && captures === 0 ? 1.05 : 0;
  const settledTerritoryPenalty =
    region.owner !== null && region.owner !== state.current && captures === 0 ? 2.2 : 0;
  const ownTerritoryPenalty = quietOwnTerritory ? 3.4 : 0;
  const lateNeutralFiller =
    phase > 0.44 &&
    region.owner === null &&
    contactGroups === 0 &&
    captures === 0 &&
    attackGain === 0 &&
    saveGain === 0;
  const lateBoundaryFiller =
    phase > 0.62 &&
    region.owner === null &&
    captures === 0 &&
    attackGain === 0 &&
    saveGain === 0 &&
    cutGain === 0 &&
    connectionGain < 0.8;
  const fillerPenalty = (lateNeutralFiller ? 3.1 : 0) + (lateBoundaryFiller ? 1.6 : 0);
  const lowLibertyPenalty =
    postLiberties === 1 && analysis.captured.length === 0 ? 1.45 : postLiberties === 2 && captures === 0 ? 0.35 : 0;
  const effectiveGain =
    territoryGain + developmentGain - smallDamePenalty - settledTerritoryPenalty - fillerPenalty;
  const tacticalGain = captures * 2.6 + attackGain + saveGain + contactGain;
  const strongScore =
    effectiveGain * 16 +
    tacticalGain * 1.25 +
    shapeGain * 1.45 +
    postLiberties * 0.12 -
    lowLibertyPenalty -
    ownTerritoryPenalty;

  return {
    vertexId,
    areaGain,
    effectiveGain,
    captures,
    liberties: postLiberties,
    regionOwner: region.owner,
    regionSize: region.points.length,
    phase,
    attackGain,
    saveGain,
    contactGain,
    connectionGain,
    cutGain,
    developmentGain,
    territoryGain,
    fillerPenalty,
    shapeGain,
    tacticalGain,
    quietOwnTerritory,
    score: effectiveGain * 14 + tacticalGain + postLiberties * 0.16 - lowLibertyPenalty,
    strongScore
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomItemWithRng(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function scoreGoMoves(topology, state, poleIds, moves) {
  return moves.map((vertexId) => evaluateGoMove(topology, state, vertexId, poleIds)).filter(Boolean);
}

function viableScoredGoMoves(scored, options = {}) {
  const passMargin = options.passMargin ?? 0.01;
  const tacticalThreshold = options.tacticalThreshold ?? 1.6;
  const allowShape = options.allowShape ?? false;
  const shapeThreshold = options.shapeThreshold ?? 3.1;

  return scored.filter((move) => {
    if (move.quietOwnTerritory) {
      return false;
    }

    if (move.fillerPenalty > 0 && move.captures === 0 && move.attackGain === 0 && move.saveGain === 0) {
      return false;
    }

    return (
      move.effectiveGain > passMargin ||
      move.captures > 0 ||
      move.tacticalGain > tacticalThreshold ||
      (allowShape && move.strongScore > shapeThreshold && (move.developmentGain > 0 || move.cutGain > 0 || move.connectionGain > 0.8))
    );
  });
}

function chooseWeakGoNpcMove(topology, state, poleIds, moves) {
  if (state.moveCount > 6 && Math.random() < 0.08) {
    return null;
  }

  const scored = scoreGoMoves(topology, state, poleIds, moves);
  const beginnerMoves = scored.filter((move) => !move.quietOwnTerritory && move.fillerPenalty === 0);
  if (state.moveCount > (topology.vertices.length - poleIds.size) * 0.5 && beginnerMoves.length === 0) {
    return Math.random() < 0.65 ? null : randomItem(moves);
  }

  const captures = scored.filter((move) => move.captures > 0);
  if (captures.length > 0 && Math.random() < 0.42) {
    return randomItem(captures).vertexId;
  }

  const tactical = scored.filter((move) => move.tacticalGain > 1.8);
  if (tactical.length > 0 && Math.random() < 0.18) {
    return randomItem(tactical).vertexId;
  }

  if (scored.length > 0 && Math.random() < 0.25) {
    scored.sort((a, b) => b.score - a.score || a.vertexId - b.vertexId);
    const poolSize = Math.max(4, Math.ceil(scored.length * 0.35));
    return randomItem(scored.slice(0, poolSize)).vertexId;
  }

  if (beginnerMoves.length > 0 && Math.random() < 0.82) {
    return randomItem(beginnerMoves).vertexId;
  }

  return randomItem(moves);
}

function chooseMediumGoNpcMove(topology, state, poleIds, moves, options = {}) {
  const passMargin = options.passMargin ?? 0.01;
  const scored = viableScoredGoMoves(scoreGoMoves(topology, state, poleIds, moves), {
    passMargin,
    tacticalThreshold: 1.8,
    allowShape: false
  });

  if (scored.length === 0) {
    return null;
  }

  scored.sort((a, b) => b.score - a.score || a.vertexId - b.vertexId);
  const bestScore = scored[0].score;
  const pool = scored.filter((move) => bestScore - move.score < 1.2).slice(0, Math.min(4, scored.length));
  return pool[Math.floor(Math.random() * pool.length)].vertexId;
}

function chooseStrongGoNpcMove(topology, state, poleIds, moves) {
  const scored = viableScoredGoMoves(scoreGoMoves(topology, state, poleIds, moves), {
    passMargin: 0.48,
    tacticalThreshold: 2.45,
    allowShape: true,
    shapeThreshold: 7.8
  });

  if (scored.length === 0) {
    return null;
  }

  scored.sort((a, b) => b.score - a.score || a.vertexId - b.vertexId);
  const bestScore = scored[0].score;
  const pool = scored.filter((move) => bestScore - move.score < 2.8).slice(0, Math.min(6, scored.length));
  const pattern = [0, 1, 2, 1, 3, 0, 2, 4];
  const index = Math.min(pattern[hashString(`${state.current}:${state.moveCount}:${boardKey(state.board)}`) % pattern.length], pool.length - 1);

  return pool[index].vertexId;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

function seedForGoState(state, level) {
  return hashString(`${level}:${state.current}:${state.moveCount}:${boardKey(state.board)}`);
}

function rolloutMoveScore(topology, state, vertexId, analysis, poleIds) {
  const rival = opponent(state.current);
  const region = emptyRegionInfo(topology, state.board, vertexId, poleIds);
  const occupiedCount = state.board.reduce((total, value) => total + (value === BLACK || value === WHITE ? 1 : 0), 0);
  const phase = occupiedCount / Math.max(1, topology.vertices.length - poleIds.size);
  let score = analysis.captured.length * 4.2 + Math.min(analysis.liberties, 5) * 0.18;
  const seenGroups = new Set();
  let contactGroups = 0;
  let fightingScore = 0;

  if (region.owner === state.current && analysis.captured.length === 0) {
    score -= 5.0;
  } else if (region.owner === rival && analysis.captured.length === 0) {
    score -= 1.4;
  } else if (region.owner === null && region.points.length <= 2 && analysis.captured.length === 0) {
    score -= 1.6;
  }

  for (const neighborId of topology.neighbors(vertexId)) {
    if (poleIds.has(neighborId)) {
      continue;
    }

    const value = state.board[neighborId];
    if (value !== BLACK && value !== WHITE) {
      continue;
    }

    const group = collectGroup(topology, state.board, neighborId);
    const groupKey = Math.min(...group);
    if (seenGroups.has(groupKey)) {
      continue;
    }

    seenGroups.add(groupKey);
    contactGroups += 1;
    const liberties = groupLiberties(topology, state.board, group, poleIds);
    if (!liberties.has(vertexId)) {
      continue;
    }

    if (value === rival) {
      fightingScore += liberties.size === 1 ? group.length * 2.2 : liberties.size === 2 ? group.length * 0.65 : 0.12;
    } else {
      fightingScore += liberties.size === 1 ? group.length * 1.25 : liberties.size === 2 ? group.length * 0.28 : 0.1;
    }
  }

  score += fightingScore;
  if (region.owner === null && phase < 0.2) {
    score += 0.8;
  } else if (region.owner === null && phase < 0.48 && contactGroups > 0) {
    score += 0.35;
  }

  if (region.owner === null && phase > 0.44 && contactGroups === 0 && fightingScore === 0 && analysis.captured.length === 0) {
    score -= 4.2;
  }

  if (region.owner === null && phase > 0.62 && fightingScore < 0.4 && analysis.captured.length === 0) {
    score -= 2.4;
  }

  return score;
}

function chooseRolloutMove(topology, state, poleIds, rng, config) {
  if (state.consecutivePasses > 0 && rng() < config.secondPassBias) {
    return null;
  }

  const sampled = [];
  const seen = new Set();

  for (let attempt = 0; attempt < config.sampleAttempts && sampled.length < config.sampleSize; attempt += 1) {
    const vertexId = Math.floor(rng() * topology.vertices.length);
    if (seen.has(vertexId) || poleIds.has(vertexId) || state.board[vertexId] !== EMPTY) {
      continue;
    }

    seen.add(vertexId);
    const analysis = analyzeGoMove(topology, state, vertexId, poleIds);
    if (!analysis.ok) {
      continue;
    }

    sampled.push({
      vertexId,
      score: rolloutMoveScore(topology, state, vertexId, analysis, poleIds)
    });
  }

  if (sampled.length === 0) {
    const fallbackMoves = validGoMoves(topology, state, poleIds);
    return fallbackMoves.length === 0 ? null : randomItemWithRng(fallbackMoves, rng);
  }

  sampled.sort((a, b) => b.score - a.score || a.vertexId - b.vertexId);
  const playableCount = topology.vertices.length - poleIds.size;
  if (state.moveCount > playableCount * 0.38 && sampled[0].score < config.passScore && rng() < config.passChance) {
    return null;
  }

  const poolSize = Math.min(config.rolloutChoicePool, sampled.length);
  return randomItemWithRng(sampled.slice(0, poolSize), rng).vertexId;
}

function simulateGoPlayout(topology, startState, poleIds, rootPlayer, rng, config) {
  let rolloutState = startState;

  for (let turn = 0; turn < config.playoutLimit && !rolloutState.gameOver; turn += 1) {
    const move = chooseRolloutMove(topology, rolloutState, poleIds, rng, config);
    if (move === null) {
      rolloutState = passGoTurn(rolloutState);
      continue;
    }

    const nextState = applyGoMove(topology, rolloutState, move, poleIds);
    rolloutState = nextState ?? passGoTurn(rolloutState);
  }

  return relativeTerritoryScore(scoreGoGame(topology, rolloutState, poleIds), rootPlayer);
}

function mctsConfigFor(topology, level) {
  const smallBoard = topology.nside <= 2;
  if (level === "god") {
    return {
      candidateLimit: smallBoard ? 24 : 9,
      iterations: smallBoard ? 360 : 64,
      playoutLimit: smallBoard ? 112 : 54,
      sampleAttempts: smallBoard ? 56 : 24,
      sampleSize: smallBoard ? 17 : 8,
      rolloutChoicePool: 3,
      passScore: 0.9,
      passChance: 0.68,
      secondPassBias: 0.74,
      exploration: 1.25,
      rootPassEarlyPhase: smallBoard ? 0.32 : 0.26,
      rootPassPhase: smallBoard ? 0.52 : 0.46,
      rootPassScore: 5.2,
      rootPassBias: 0.8,
      rootPriorRollout: smallBoard ? 0.06 : 0.04,
      rootPriorSort: smallBoard ? 0.025 : 0.01,
      responseRiskPenalty: smallBoard ? 0.12 : 0.06,
      responseRiskSortPenalty: smallBoard ? 0.06 : 0.025
    };
  }

  return {
    candidateLimit: smallBoard ? 8 : 7,
    iterations: smallBoard ? 54 : 30,
    playoutLimit: smallBoard ? 46 : 34,
    sampleAttempts: smallBoard ? 22 : 18,
    sampleSize: smallBoard ? 8 : 7,
    rolloutChoicePool: 4,
    passScore: 0.55,
    passChance: 0.58,
    secondPassBias: 0.68,
    exploration: 1.45,
    rootPassEarlyPhase: 0.34,
    rootPassPhase: 0.58,
    rootPassScore: 3.4,
    rootPassBias: 0.25,
    rootPriorRollout: 0.04,
    rootPriorSort: 0.01,
    responseRiskPenalty: 0.045,
    responseRiskSortPenalty: 0.018
  };
}

function selectMctsChild(children, totalVisits, exploration) {
  for (const child of children) {
    if (child.visits === 0) {
      return child;
    }
  }

  let bestChild = children[0];
  let bestValue = -Infinity;
  for (const child of children) {
    const average = child.totalScore / child.visits;
    const value = average + exploration * Math.sqrt(Math.log(totalVisits + 1) / child.visits);
    if (value > bestValue || (value === bestValue && moveSortId(child.move) < moveSortId(bestChild.move))) {
      bestValue = value;
      bestChild = child;
    }
  }

  return bestChild;
}

function moveSortId(move) {
  return move.vertexId === null ? -1 : move.vertexId;
}

function shouldAddRootPass(topology, state, poleIds, scored, config) {
  if (state.consecutivePasses > 0) {
    return true;
  }

  const occupiedCount = state.board.reduce((total, value) => total + (value === BLACK || value === WHITE ? 1 : 0), 0);
  const phase = occupiedCount / Math.max(1, topology.vertices.length - poleIds.size);
  const bestScore = scored[0]?.strongScore ?? -Infinity;
  const bestTactical = scored[0]?.tacticalGain ?? 0;
  const bestTerritoryGain = scored[0]?.territoryGain ?? 0;

  return (
    phase >= config.rootPassPhase ||
    (phase >= config.rootPassEarlyPhase && bestScore < config.rootPassScore && bestTactical < 1.6 && bestTerritoryGain < 0.55)
  );
}

function opponentResponseRisk(topology, state, poleIds) {
  if (state.gameOver) {
    return 0;
  }

  const moves = validGoMoves(topology, state, poleIds);
  if (moves.length === 0) {
    return 0;
  }

  const scored = viableScoredGoMoves(scoreGoMoves(topology, state, poleIds, moves), {
    passMargin: 0.08,
    tacticalThreshold: 1.25,
    allowShape: true,
    shapeThreshold: 4.0
  }).sort((a, b) => b.strongScore - a.strongScore || a.vertexId - b.vertexId);

  return Math.max(0, scored[0]?.strongScore ?? 0);
}

function chooseMctsGoNpcMove(topology, state, poleIds, moves, level) {
  const config = mctsConfigFor(topology, level);
  const scored = viableScoredGoMoves(scoreGoMoves(topology, state, poleIds, moves), {
    passMargin: level === "god" ? 0.08 : 0.02,
    tacticalThreshold: level === "god" ? 1.2 : 1.1,
    allowShape: true,
    shapeThreshold: level === "god" ? 4.0 : 3.8
  }).sort((a, b) => b.strongScore - a.strongScore || a.vertexId - b.vertexId);

  if (scored.length === 0) {
    return null;
  }

  const children = scored
    .slice(0, config.candidateLimit)
    .map((move) => ({
      move,
      state: applyGoMove(topology, state, move.vertexId, poleIds),
      visits: 0,
      totalScore: 0,
      responseRisk: 0
    }))
    .filter((child) => child.state !== null);

  for (const child of children) {
    child.responseRisk = opponentResponseRisk(topology, child.state, poleIds);
  }

  if (shouldAddRootPass(topology, state, poleIds, scored, config)) {
    const passState = passGoTurn(state);
    children.push({
      move: {
        vertexId: null,
        strongScore: config.rootPassBias
      },
      state: passState,
      visits: 0,
      totalScore: 0,
      responseRisk: opponentResponseRisk(topology, passState, poleIds)
    });
  }

  if (children.length === 0) {
    return chooseStrongGoNpcMove(topology, state, poleIds, moves);
  }

  const rng = createSeededRng(seedForGoState(state, level));
  let totalVisits = 0;
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const child = selectMctsChild(children, totalVisits, config.exploration);
    const rolloutScore =
      simulateGoPlayout(topology, child.state, poleIds, state.current, rng, config) +
      child.move.strongScore * config.rootPriorRollout -
      child.responseRisk * config.responseRiskPenalty;
    child.visits += 1;
    child.totalScore += rolloutScore;
    totalVisits += 1;
  }

  children.sort((a, b) => {
    const aScore = a.totalScore / a.visits + a.move.strongScore * config.rootPriorSort;
    const bScore = b.totalScore / b.visits + b.move.strongScore * config.rootPriorSort;
    const aSafeScore = aScore - a.responseRisk * config.responseRiskSortPenalty;
    const bSafeScore = bScore - b.responseRisk * config.responseRiskSortPenalty;
    return bSafeScore - aSafeScore || b.visits - a.visits || moveSortId(a.move) - moveSortId(b.move);
  });

  return children[0].move.vertexId;
}

export function chooseGoNpcMove(topology, state, poleIds = createPoleSet(topology), options = {}) {
  const moves = validGoMoves(topology, state, poleIds);
  if (moves.length === 0) {
    return null;
  }

  const level = options.level ?? "medium";
  if (level === "weak") {
    return chooseWeakGoNpcMove(topology, state, poleIds, moves);
  }

  if (level === "strong") {
    return chooseStrongGoNpcMove(topology, state, poleIds, moves);
  }

  if (level === "expert" || level === "god") {
    return chooseMctsGoNpcMove(topology, state, poleIds, moves, level);
  }

  return chooseMediumGoNpcMove(topology, state, poleIds, moves, options);
}
