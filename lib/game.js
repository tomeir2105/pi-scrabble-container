import {
  BLANK_TILE,
  BOARD_PREMIUMS,
  BOARD_SIZE,
  CENTER_INDEX,
  LETTER_ORDER,
  LETTER_DISTRIBUTION,
  LETTER_VALUES,
  MAX_PLAYERS,
  RACK_SIZE
} from "./constants.js";
import { createId } from "./uuid.js";

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function cloneLetterMap(source) {
  return Object.fromEntries(LETTER_ORDER.map((letter) => [letter, Number(source?.[letter] ?? 0)]));
}

function createDefaultRules() {
  return {
    letterDistribution: cloneLetterMap(LETTER_DISTRIBUTION),
    letterValues: cloneLetterMap(LETTER_VALUES)
  };
}

function validateLetterMap(map, { allowZero = true } = {}) {
  const normalized = {};

  LETTER_ORDER.forEach((letter) => {
    const rawValue = map?.[letter];
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
      throw new Error("יש להזין ערכים תקינים לכל האותיות.");
    }
    normalized[letter] = value;
  });

  return normalized;
}

function normalizeRules(inputRules) {
  const letterDistribution = validateLetterMap(inputRules?.letterDistribution);
  const letterValues = validateLetterMap(inputRules?.letterValues);

  if (letterDistribution[BLANK_TILE] < 0 || letterValues[BLANK_TILE] !== 0) {
    throw new Error("האות הריקה חייבת להיות עם ניקוד 0.");
  }

  const totalTiles = Object.values(letterDistribution).reduce((sum, value) => sum + value, 0);
  if (totalTiles <= 0) {
    throw new Error("צריך לפחות אות אחת בשקית.");
  }

  return {
    letterDistribution,
    letterValues,
    totalTiles
  };
}

function createTile(letter, letterValues) {
  return {
    id: createId(),
    letter,
    value: letterValues[letter],
    isBlank: letter === BLANK_TILE
  };
}

function createBag(letterDistribution, letterValues) {
  const bag = [];
  Object.entries(letterDistribution).forEach(([letter, count]) => {
    for (let index = 0; index < count; index += 1) {
      bag.push(createTile(letter, letterValues));
    }
  });
  return shuffle(bag);
}

function drawTiles(bag, count) {
  const nextBag = [...bag];
  const tiles = nextBag.splice(0, count);
  return [tiles, nextBag];
}

function nextActivePlayerId(room, currentPlayerId) {
  const orderedPlayers = [...room.players];
  const currentIndex = orderedPlayers.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex === -1 || orderedPlayers.length === 0) {
    return orderedPlayers[0]?.id ?? null;
  }

  for (let offset = 1; offset <= orderedPlayers.length; offset += 1) {
    const candidate = orderedPlayers[(currentIndex + offset) % orderedPlayers.length];
    if (candidate) {
      return candidate.id;
    }
  }

  return orderedPlayers[0]?.id ?? null;
}

function isBoardEmpty(board) {
  return board.every((row) => row.every((cell) => cell === null));
}

function getCell(board, row, column) {
  if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) {
    return null;
  }
  return board[row][column];
}

function getPremium(row, column) {
  return BOARD_PREMIUMS[row][column];
}

function createPlacementMap(placements) {
  const map = new Map();
  placements.forEach((placement) => {
    map.set(`${placement.row}:${placement.column}`, placement);
  });
  return map;
}

function getLetterAt(board, placementMap, row, column) {
  const placement = placementMap.get(`${row}:${column}`);
  if (placement) {
    return placement;
  }
  const cell = getCell(board, row, column);
  return cell
    ? {
        row,
        column,
        tileId: cell.tileId,
        letter: cell.letter,
        value: cell.value,
        isNew: false
      }
    : null;
}

function buildWord(board, placementMap, row, column, orientation) {
  const isHorizontal = orientation === "horizontal";
  let startRow = row;
  let startColumn = column;

  while (getLetterAt(board, placementMap, startRow - (isHorizontal ? 0 : 1), startColumn - (isHorizontal ? 1 : 0))) {
    startRow -= isHorizontal ? 0 : 1;
    startColumn -= isHorizontal ? 1 : 0;
  }

  const positions = [];
  let currentRow = startRow;
  let currentColumn = startColumn;
  let current;

  while ((current = getLetterAt(board, placementMap, currentRow, currentColumn))) {
    positions.push(current);
    currentRow += isHorizontal ? 0 : 1;
    currentColumn += isHorizontal ? 1 : 0;
  }

  return {
    word: positions.map((position) => position.letter).join(""),
    positions,
    orientation
  };
}

function scoreWord(wordData) {
  let wordMultiplier = 1;
  let total = 0;

  wordData.positions.forEach((position) => {
    let letterScore = position.value;
    if (position.isNew) {
      const premium = getPremium(position.row, position.column);
      if (premium === "DL") {
        letterScore *= 2;
      } else if (premium === "TL") {
        letterScore *= 3;
      } else if (premium === "DW" || premium === "ST") {
        wordMultiplier *= 2;
      } else if (premium === "TW") {
        wordMultiplier *= 3;
      }
    }
    total += letterScore;
  });

  return total * wordMultiplier;
}

function normalizePlacements(placements, player) {
  if (!Array.isArray(placements) || placements.length === 0) {
    throw new Error("יש להניח לפחות אות אחת.");
  }

  const seenSquares = new Set();
  const seenTileIds = new Set();
  const rackIds = new Set(player.rack.map((tile) => tile.id));

  return placements.map((placement) => {
    const row = Number(placement.row);
    const column = Number(placement.column);
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) {
      throw new Error("אות הונחה מחוץ ללוח.");
    }
    if (!rackIds.has(placement.tileId)) {
      throw new Error("אחת האותיות שנבחרו כבר לא נמצאת במדף שלך.");
    }
    if (seenTileIds.has(placement.tileId)) {
      throw new Error("כל אות יכולה להיות מונחת פעם אחת בלבד בתור.");
    }
    seenTileIds.add(placement.tileId);
    const key = `${row}:${column}`;
    if (seenSquares.has(key)) {
      throw new Error("אפשר להניח אות אחת בלבד בכל משבצת.");
    }
    seenSquares.add(key);
    const tile = player.rack.find((rackTile) => rackTile.id === placement.tileId);
    const nextLetter = typeof placement.letter === "string" ? placement.letter.normalize("NFKC").trim() : tile.letter;

    if (tile.isBlank) {
      if (!/^[א-ת]$/.test(nextLetter)) {
        throw new Error("יש לבחור לאות הריקה אות עברית אחת.");
      }
    } else if (nextLetter !== tile.letter) {
      throw new Error("לא ניתן לשנות את האות שנבחרה.");
    }

    return {
      row,
      column,
      tileId: tile.id,
      letter: nextLetter,
      value: tile.value,
      isBlank: Boolean(tile.isBlank),
      isNew: true
    };
  });
}

function resolveOrientation(board, placements) {
  const sameRow = placements.every((placement) => placement.row === placements[0].row);
  const sameColumn = placements.every((placement) => placement.column === placements[0].column);

  if (!sameRow && !sameColumn) {
    throw new Error("יש להניח אותיות בשורה אחת או בעמודה אחת.");
  }

  if (sameRow && !sameColumn) {
    return "horizontal";
  }

  if (sameColumn && !sameRow) {
    return "vertical";
  }

  const placement = placements[0];
  const horizontalNeighbors =
    getCell(board, placement.row, placement.column - 1) || getCell(board, placement.row, placement.column + 1);
  const verticalNeighbors = getCell(board, placement.row - 1, placement.column) || getCell(board, placement.row + 1, placement.column);

  if (horizontalNeighbors && !verticalNeighbors) {
    return "horizontal";
  }
  if (verticalNeighbors && !horizontalNeighbors) {
    return "vertical";
  }

  return "horizontal";
}

function validateLineContinuity(board, placements, orientation, placementMap) {
  const sorted = [...placements].sort((left, right) =>
    orientation === "horizontal" ? left.column - right.column : left.row - right.row
  );
  const fixedIndex = orientation === "horizontal" ? sorted[0].row : sorted[0].column;
  const start = orientation === "horizontal" ? sorted[0].column : sorted[0].row;
  const end = orientation === "horizontal" ? sorted[sorted.length - 1].column : sorted[sorted.length - 1].row;

  for (let index = start; index <= end; index += 1) {
    const row = orientation === "horizontal" ? fixedIndex : index;
    const column = orientation === "horizontal" ? index : fixedIndex;
    if (!getLetterAt(board, placementMap, row, column)) {
      throw new Error("האותיות שהונחו חייבות ליצור רצף אחד.");
    }
  }
}

function validateConnectivity(board, placements, placementMap) {
  if (isBoardEmpty(board)) {
    const touchesCenter = placements.some((placement) => placement.row === CENTER_INDEX && placement.column === CENTER_INDEX);
    if (!touchesCenter) {
      throw new Error("המילה הראשונה חייבת לעבור דרך הכוכב המרכזי.");
    }
    return;
  }

  const connected = placements.some((placement) => {
    const neighbors = [
      getCell(board, placement.row - 1, placement.column),
      getCell(board, placement.row + 1, placement.column),
      getCell(board, placement.row, placement.column - 1),
      getCell(board, placement.row, placement.column + 1)
    ];
    return neighbors.some(Boolean);
  });

  const crossesExistingTile = placements.some((placement) => {
    const horizontalWord = buildWord(board, placementMap, placement.row, placement.column, "horizontal");
    const verticalWord = buildWord(board, placementMap, placement.row, placement.column, "vertical");
    return horizontalWord.positions.some((position) => !position.isNew) || verticalWord.positions.some((position) => !position.isNew);
  });

  if (!connected && !crossesExistingTile) {
    throw new Error("המילה חייבת להתחבר ללוח הקיים.");
  }
}

function collectWords(board, placements, orientation, placementMap) {
  const anchor = placements[0];
  const mainWord = buildWord(board, placementMap, anchor.row, anchor.column, orientation);
  if (mainWord.word.length < 2) {
    throw new Error("כל מהלך חייב ליצור לפחות מילה אחת עם שתי אותיות או יותר.");
  }

  const crossOrientation = orientation === "horizontal" ? "vertical" : "horizontal";
  const crossWords = placements
    .map((placement) => buildWord(board, placementMap, placement.row, placement.column, crossOrientation))
    .filter((wordData) => wordData.word.length > 1);

  const uniqueWords = new Map();
  [mainWord, ...crossWords].forEach((wordData) => {
    const key = wordData.positions.map((position) => `${position.row}:${position.column}`).join("|");
    uniqueWords.set(key, wordData);
  });

  return [...uniqueWords.values()];
}

function validateDictionary(words, dictionary) {
  if (!dictionary || dictionary.size === 0) {
    return;
  }

  const invalidWords = words.filter((wordData) => !dictionary.has(wordData.word.toLowerCase()));
  if (invalidWords.length > 0) {
    throw new Error(`מילה לא מוכרת: ${invalidWords[0].word}`);
  }
}

function refillRack(player, bag) {
  const neededTiles = Math.max(0, RACK_SIZE - player.rack.length);
  const [drawnTiles, nextBag] = drawTiles(bag, neededTiles);
  player.rack = [...player.rack, ...drawnTiles];
  return nextBag;
}

function remainingRackPenalty(player) {
  return player.rack.reduce((total, tile) => total + tile.value, 0);
}

function finalizeEmptyRackGame(room, winner) {
  let bonus = 0;
  room.players.forEach((player) => {
    if (player.id === winner.id) {
      return;
    }
    const penalty = remainingRackPenalty(player);
    player.score -= penalty;
    bonus += penalty;
  });
  winner.score += bonus;
  room.finished = true;
  room.winnerIds = [winner.id];
  room.lastAction = `${winner.name} רוקן את המדף וניצח במשחק.`;
}

function finalizeByScore(room, message) {
  room.finished = true;
  const topScore = Math.max(...room.players.map((player) => player.score));
  room.winnerIds = room.players.filter((player) => player.score === topScore).map((player) => player.id);
  room.lastAction = message;
}

function cloneRack(rack) {
  return rack.map((tile) => ({ ...tile }));
}

function createUndoSnapshot(room, actorId, actionLabel, restoredTurnPlayerId) {
  const actor = room.players.find((player) => player.id === actorId);
  return {
    board: cloneBoard(room.board),
    bag: cloneRack(room.bag),
    players: room.players.map((player) => ({
      id: player.id,
      rack: cloneRack(player.rack),
      score: player.score
    })),
    started: room.started,
    finished: room.finished,
    winnerIds: [...room.winnerIds],
    currentTurnPlayerId: room.currentTurnPlayerId,
    lastWords: [...room.lastWords],
    lastScore: room.lastScore,
    consecutivePasses: room.consecutivePasses,
    lastAction: room.lastAction,
    actorId,
    actorName: actor?.name || "שחקן",
    actionLabel,
    restoredTurnPlayerId
  };
}

function restoreUndoSnapshot(room, snapshot) {
  room.board = cloneBoard(snapshot.board);
  room.bag = cloneRack(snapshot.bag);
  room.started = snapshot.started;
  room.finished = snapshot.finished;
  room.winnerIds = [...snapshot.winnerIds];
  room.currentTurnPlayerId = snapshot.currentTurnPlayerId;
  room.lastWords = [...snapshot.lastWords];
  room.lastScore = snapshot.lastScore;
  room.consecutivePasses = snapshot.consecutivePasses;
  room.lastAction = snapshot.lastAction;

  room.players.forEach((player) => {
    const saved = snapshot.players.find((candidate) => candidate.id === player.id);
    if (!saved) {
      return;
    }
    player.rack = cloneRack(saved.rack);
    player.score = saved.score;
  });
}

export function createRoomCode(existingCodes = new Set()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";

  do {
    roomCode = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (existingCodes.has(roomCode));

  return roomCode;
}

export function createRoom({ roomId, playerId, playerName }) {
  const rules = createDefaultRules();
  const host = {
    id: playerId,
    name: playerName,
    rack: [],
    score: 0,
    connected: true,
    isHost: true,
    socketId: null
  };

  return {
    id: roomId,
    board: Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null)),
    bag: createBag(rules.letterDistribution, rules.letterValues),
    rules,
    players: [host],
    started: false,
    finished: false,
    winnerIds: [],
    currentTurnPlayerId: null,
    lastWords: [],
    lastScore: 0,
    consecutivePasses: 0,
    undoState: null,
    lastAction: `${playerName} יצר את החדר.`,
    createdAt: Date.now()
  };
}

export function attachSocketToPlayer(room, playerId, socketId) {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return null;
  }
  player.socketId = socketId;
  player.connected = true;
  return player;
}

export function detachSocket(room, socketId) {
  const player = room.players.find((candidate) => candidate.socketId === socketId);
  if (!player) {
    return null;
  }
  player.socketId = null;
  player.connected = false;
  return player;
}

export function addPlayerToRoom(room, { playerId, playerName }) {
  const normalizedIncomingName = String(playerName || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

  const existing = room.players.find((player) => player.id === playerId);
  if (existing) {
    const duplicateByName = room.players.find(
      (player) => player.id !== playerId && player.name.normalize("NFKC").trim().toLowerCase() === normalizedIncomingName
    );
    if (duplicateByName) {
      throw new Error("שם השחקן כבר תפוס.");
    }
    existing.name = playerName || existing.name;
    existing.connected = true;
    return existing;
  }

  const sameNamePlayer = room.players.find(
    (player) => player.name.normalize("NFKC").trim().toLowerCase() === normalizedIncomingName
  );
  if (sameNamePlayer) {
    if (room.started && !sameNamePlayer.connected) {
      // Reclaim the same in-game player slot (rack/score) after refresh/login.
      sameNamePlayer.id = playerId;
      sameNamePlayer.connected = true;
      sameNamePlayer.socketId = null;
      return sameNamePlayer;
    }
    throw new Error("שם השחקן כבר תפוס.");
  }

  if (room.started) {
    throw new Error("המשחק כבר התחיל.");
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new Error("החדר מלא.");
  }

  const player = {
    id: playerId,
    name: playerName,
    rack: [],
    score: 0,
    connected: true,
    isHost: false,
    socketId: null
  };
  room.players.push(player);
  room.lastAction = `${playerName} הצטרף לחדר.`;
  return player;
}

export function startGame(room, playerId) {
  if (room.started) {
    throw new Error("המשחק כבר התחיל.");
  }
  const requester = room.players.find((player) => player.id === playerId);
  if (!requester?.isHost) {
    throw new Error("רק מנהל החדר יכול להתחיל את המשחק.");
  }
  if (room.players.length < 2) {
    throw new Error("נדרשים לפחות שני שחקנים כדי להתחיל.");
  }
  if (room.bag.length < room.players.length * RACK_SIZE) {
    throw new Error("אין מספיק אותיות בשקית כדי לחלק מדף פתיחה לכולם.");
  }

  room.players.forEach((player) => {
    const [tiles, nextBag] = drawTiles(room.bag, RACK_SIZE);
    player.rack = tiles;
    room.bag = nextBag;
    player.score = 0;
  });

  room.started = true;
  room.finished = false;
  room.winnerIds = [];
  room.currentTurnPlayerId = room.players[0].id;
  room.lastWords = [];
  room.lastScore = 0;
  room.consecutivePasses = 0;
  room.undoState = null;
  room.lastAction = `${requester.name} התחיל את המשחק.`;
}

export function updateRoomConfig(room, playerId, nextRules) {
  if (room.started) {
    throw new Error("אי אפשר לשנות הגדרות אחרי תחילת המשחק.");
  }

  const requester = room.players.find((player) => player.id === playerId);
  if (!requester?.isHost) {
    throw new Error("רק מנהל החדר יכול לעדכן הגדרות.");
  }

  const normalizedRules = normalizeRules(nextRules);
  room.rules = {
    letterDistribution: normalizedRules.letterDistribution,
    letterValues: normalizedRules.letterValues
  };
  room.bag = createBag(room.rules.letterDistribution, room.rules.letterValues);
  room.lastAction = `${requester.name} עדכן את הגדרות המשחק.`;
}

export function playMove(room, playerId, placements, options = {}) {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!room.started || room.finished) {
    throw new Error("לא ניתן לבצע מהלכים כרגע.");
  }
  if (!player) {
    throw new Error("השחקן לא נמצא.");
  }
  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("זה לא התור שלך.");
  }

  const nextPlayerId = nextActivePlayerId(room, playerId);
  const undoSnapshot = createUndoSnapshot(room, playerId, "מהלך", nextPlayerId);

  const normalizedPlacements = normalizePlacements(placements, player);
  normalizedPlacements.forEach((placement) => {
    if (getCell(room.board, placement.row, placement.column)) {
      throw new Error("אי אפשר להניח אות על משבצת תפוסה.");
    }
  });

  const placementMap = createPlacementMap(normalizedPlacements);
  const orientation = resolveOrientation(room.board, normalizedPlacements);
  validateLineContinuity(room.board, normalizedPlacements, orientation, placementMap);
  validateConnectivity(room.board, normalizedPlacements, placementMap);

  const words = collectWords(room.board, normalizedPlacements, orientation, placementMap);
  validateDictionary(words, options.dictionary);

  const moveScore = words.reduce((total, wordData) => total + scoreWord(wordData), 0) + (normalizedPlacements.length === 7 ? 50 : 0);

  normalizedPlacements.forEach((placement) => {
    room.board[placement.row][placement.column] = {
      tileId: placement.tileId,
      letter: placement.letter,
      value: placement.value,
      isBlank: placement.isBlank
    };
  });

  const usedTileIds = new Set(normalizedPlacements.map((placement) => placement.tileId));
  player.rack = player.rack.filter((tile) => !usedTileIds.has(tile.id));
  room.bag = refillRack(player, room.bag);
  player.score += moveScore;

  room.lastWords = words.map((wordData) => wordData.word);
  room.lastScore = moveScore;
  room.lastAction = `${player.name} שיחק את ${words[0].word} וקיבל ${moveScore} נקודות.`;
  room.consecutivePasses = 0;

  if (room.bag.length === 0 && player.rack.length === 0) {
    finalizeEmptyRackGame(room, player);
    room.undoState = null;
    return;
  }

  room.currentTurnPlayerId = nextPlayerId;
  room.undoState = undoSnapshot;
}

export function passTurn(room, playerId) {
  if (!room.started || room.finished) {
    throw new Error("לא ניתן לבצע מהלכים כרגע.");
  }
  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("זה לא התור שלך.");
  }

  const player = room.players.find((candidate) => candidate.id === playerId);
  const nextPlayerId = nextActivePlayerId(room, playerId);
  const undoSnapshot = createUndoSnapshot(room, playerId, "דילוג", nextPlayerId);
  room.consecutivePasses += 1;
  room.lastAction = `${player.name} דילג על התור.`;
  room.lastWords = [];
  room.lastScore = 0;

  if (room.consecutivePasses >= Math.max(6, room.players.length * 2)) {
    finalizeByScore(room, "המשחק הסתיים לאחר יותר מדי דילוגים רצופים.");
    room.undoState = null;
    return;
  }

  room.currentTurnPlayerId = nextPlayerId;
  room.undoState = undoSnapshot;
}

export function exchangeTiles(room, playerId, tileIds) {
  if (!room.started || room.finished) {
    throw new Error("לא ניתן לבצע מהלכים כרגע.");
  }
  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("זה לא התור שלך.");
  }
  if (!Array.isArray(tileIds) || tileIds.length === 0) {
    throw new Error("יש לבחור לפחות אות אחת להחלפה.");
  }
  if (room.bag.length < tileIds.length) {
    throw new Error("אין מספיק אותיות בשקית להחלפה.");
  }

  const player = room.players.find((candidate) => candidate.id === playerId);
  const nextPlayerId = nextActivePlayerId(room, playerId);
  const undoSnapshot = createUndoSnapshot(room, playerId, "החלפה", nextPlayerId);
  const selectedIds = new Set(tileIds);
  const selectedTiles = player.rack.filter((tile) => selectedIds.has(tile.id));
  if (selectedTiles.length !== tileIds.length) {
    throw new Error("אחת האותיות שנבחרו כבר לא נמצאת במדף שלך.");
  }

  player.rack = player.rack.filter((tile) => !selectedIds.has(tile.id));
  room.bag = shuffle([...room.bag, ...selectedTiles]);
  room.bag = refillRack(player, room.bag);
  room.consecutivePasses += 1;
  room.lastAction = `${player.name} החליף ${selectedTiles.length} אותיות.`;
  room.lastWords = [];
  room.lastScore = 0;

  if (room.consecutivePasses >= Math.max(6, room.players.length * 2)) {
    finalizeByScore(room, "המשחק הסתיים לאחר יותר מדי דילוגים והחלפות רצופים.");
    room.undoState = null;
    return;
  }

  room.currentTurnPlayerId = nextPlayerId;
  room.undoState = undoSnapshot;
}

export function undoLastTurn(room, playerId) {
  if (!room.started || room.finished) {
    throw new Error("לא ניתן לשחזר תור כרגע.");
  }
  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("רק השחקן שבתור יכול להחזיר את התור הקודם.");
  }
  if (!room.undoState) {
    throw new Error("אין תור קודם לשחזור.");
  }
  if (room.undoState.restoredTurnPlayerId !== playerId) {
    throw new Error("כרגע אי אפשר לשחזר את התור הזה.");
  }

  const requester = room.players.find((player) => player.id === playerId);
  const restoredPlayer = room.players.find((player) => player.id === room.undoState.actorId);
  restoreUndoSnapshot(room, room.undoState);
  room.undoState = null;
  room.lastAction = `${requester?.name || "השחקן שבתור"} החזיר את התור של ${restoredPlayer?.name || "השחקן הקודם"}.`;
}

export function serializeRoomForPlayer(room, viewerId) {
  const totalTiles = Object.values(room.rules.letterDistribution).reduce((sum, value) => sum + value, 0);
  return {
    id: room.id,
    board: cloneBoard(room.board),
    bagCount: room.bag.length,
    rules: {
      letterDistribution: { ...room.rules.letterDistribution },
      letterValues: { ...room.rules.letterValues },
      totalTiles
    },
    started: room.started,
    finished: room.finished,
    winnerIds: room.winnerIds,
    currentTurnPlayerId: room.currentTurnPlayerId,
    undo: room.undoState
      ? {
          actorId: room.undoState.actorId,
          actorName: room.undoState.actorName,
          actionLabel: room.undoState.actionLabel,
          availableToPlayerId: room.undoState.restoredTurnPlayerId
        }
      : null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.connected,
      isHost: player.isHost,
      rack: player.id === viewerId ? [...player.rack] : [],
      rackCount: player.rack.length
    })),
    lastWords: [...room.lastWords],
    lastScore: room.lastScore,
    lastAction: room.lastAction
  };
}
