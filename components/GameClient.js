"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import { BLANK_TILE, BOARD_PREMIUMS, BOARD_SIZE, LETTER_LABELS, LETTER_ORDER, PREMIUM_LABELS } from "@/lib/constants";
import { createId } from "@/lib/uuid";
import PlayerSummary from "@/components/PlayerSummary";
import RoomShareCard from "@/components/RoomShareCard";

const COLUMN_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס"];
const PREMIUM_FULL_LABELS = {
  TW: "מילה משולשת",
  DW: "מילה כפולה",
  TL: "אות משולשת",
  DL: "אות כפולה",
  ST: "כוכב",
  __: ""
};
const PREMIUM_SHORT_LABELS = {
  TW: "ממ",
  DW: "מכ",
  TL: "אמ",
  DL: "אכ",
  ST: "כוכב",
  __: ""
};
const TRAY_SIZE = 7;

function emitWithAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response));
  });
}

function formatError(message) {
  if (!message) {
    return "אירעה שגיאה.";
  }
  return message;
}

function sanitizeNameInput(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function promptBlankTileLetter() {
  const input = window.prompt("בחרו אות עברית עבור האות הריקה:", "");
  const normalized = String(input || "")
    .normalize("NFKC")
    .trim();

  if (!normalized) {
    return null;
  }

  if (!/^[א-ת]$/.test(normalized)) {
    return "";
  }

  return normalized;
}

export default function GameClient({ view = "entry" }) {
  const searchParams = useSearchParams();
  const initialRoomCode = (searchParams.get("room") || "").toUpperCase();
  const socketRef = useRef(null);
  const autoJoinAttemptedRef = useRef(false);
  const draggedTileIdRef = useRef(null);
  const floatingDragRef = useRef(null);

  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode);
  const [roomState, setRoomState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [feedback, setFeedback] = useState("צרו חדר או הצטרפו מחדר אחר.");
  const [busy, setBusy] = useState(false);
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [pendingPlacements, setPendingPlacements] = useState([]);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeTileIds, setExchangeTileIds] = useState([]);
  const [rulesDraft, setRulesDraft] = useState(null);
  const [traySlots, setTraySlots] = useState(() => Array.from({ length: TRAY_SIZE }, () => null));
  const [isRackFloating, setIsRackFloating] = useState(false);
  const [floatingRackPos, setFloatingRackPos] = useState({ x: 24, y: 24 });

  const selfPlayer = roomState?.players.find((player) => player.id === playerId) || null;
  const isMyTurn = roomState?.currentTurnPlayerId === playerId;
  const pendingBySquare = new Map(pendingPlacements.map((placement) => [`${placement.row}:${placement.column}`, placement]));
  const pendingByTileId = new Map(pendingPlacements.map((placement) => [placement.tileId, placement]));

  useEffect(() => {
    const savedPlayerId = window.localStorage.getItem("scrable-player-id");
    const nextPlayerId = savedPlayerId || createId();
    const savedPlayerName = window.localStorage.getItem("scrable-player-name") || "";
    window.localStorage.setItem("scrable-player-id", nextPlayerId);
    setPlayerId(nextPlayerId);
    setPlayerName(savedPlayerName);
  }, []);

  useEffect(() => {
    const socket = io({
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setFeedback((current) =>
        current === "החיבור אבד. מנסה להתחבר מחדש..." ? "החיבור חודש." : current || "מחובר."
      );
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setFeedback("החיבור אבד. מנסה להתחבר מחדש...");
    });

    socket.on("room:state", (nextRoomState) => {
      setRoomState(nextRoomState);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    setRoomCodeInput(initialRoomCode);
  }, [initialRoomCode]);

  useEffect(() => {
    if (!selfPlayer) {
      return;
    }

    const rackIds = new Set(selfPlayer.rack.map((tile) => tile.id));
    const pendingTileIds = new Set(pendingPlacements.map((placement) => placement.tileId));
    setPendingPlacements((current) => current.filter((placement) => rackIds.has(placement.tileId)));
    setExchangeTileIds((current) => current.filter((tileId) => rackIds.has(tileId)));
    setTraySlots((current) => current.map((tileId) => (tileId && rackIds.has(tileId) && !pendingTileIds.has(tileId) ? tileId : null)));

    if (selectedTileId && !rackIds.has(selectedTileId)) {
      setSelectedTileId(null);
    }
  }, [roomState, selfPlayer, selectedTileId, pendingPlacements]);

  useEffect(() => {
    if (!roomState?.rules) {
      return;
    }

    setRulesDraft({
      letterDistribution: { ...roomState.rules.letterDistribution },
      letterValues: { ...roomState.rules.letterValues }
    });
  }, [roomState?.rules]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!floatingDragRef.current) {
        return;
      }

      const { offsetX, offsetY } = floatingDragRef.current;
      const nextX = Math.max(8, Math.min(window.innerWidth - 280, event.clientX - offsetX));
      const nextY = Math.max(8, Math.min(window.innerHeight - 120, event.clientY - offsetY));
      setFloatingRackPos({ x: nextX, y: nextY });
    }

    function stopDragging() {
      floatingDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, []);

  useEffect(() => {
    if (!connected || !playerId || !playerName.trim() || !initialRoomCode || autoJoinAttemptedRef.current || roomState) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    joinRoom(initialRoomCode);
  }, [connected, initialRoomCode, playerId, playerName, roomState]);

  function navigateTo(pathname, roomId = roomState?.id) {
    if (!roomId) {
      window.location.href = pathname;
      return;
    }

    window.location.href = `${pathname}?room=${roomId}`;
  }

  async function createRoom() {
    if (!socketRef.current) {
      return;
    }

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setFeedback("יש להזין שם שחקן קודם.");
      return;
    }

    window.localStorage.setItem("scrable-player-name", trimmedName);
    setBusy(true);
    setFeedback("יוצר חדר...");
    const response = await emitWithAck(socketRef.current, "room:create", {
      name: trimmedName,
      playerId
    });
    setBusy(false);

    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    window.history.replaceState({}, "", `?room=${response.roomId}`);
    setRoomCodeInput(response.roomId);
    setFeedback(`החדר ${response.roomId} מוכן. שתפו את הקישור והתחילו כשכולם הצטרפו.`);
  }

  async function joinRoom(overrideRoomCode) {
    if (!socketRef.current) {
      return;
    }

    const trimmedName = playerName.trim();
    const nextRoomCode = (overrideRoomCode || roomCodeInput).toUpperCase().trim();
    if (!trimmedName) {
      setFeedback("יש להזין שם שחקן קודם.");
      return;
    }
    if (!nextRoomCode) {
      setFeedback("יש להזין קוד חדר.");
      return;
    }

    window.localStorage.setItem("scrable-player-name", trimmedName);
    setBusy(true);
    setFeedback(`מצטרף לחדר ${nextRoomCode}...`);
    const response = await emitWithAck(socketRef.current, "room:join", {
      roomId: nextRoomCode,
      name: trimmedName,
      playerId
    });
    setBusy(false);

    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    window.history.replaceState({}, "", `?room=${response.roomId}`);
    setRoomCodeInput(response.roomId);
    setFeedback(`הצטרפת לחדר ${response.roomId}.`);
  }

  async function startGame() {
    if (!socketRef.current) {
      return;
    }

    setBusy(true);
    const response = await emitWithAck(socketRef.current, "game:start");
    setBusy(false);
    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }
    setFeedback("המשחק התחיל.");
  }

  async function submitMove() {
    if (!socketRef.current || pendingPlacements.length === 0) {
      return;
    }

    setBusy(true);
    const response = await emitWithAck(socketRef.current, "game:play", {
      placements: pendingPlacements
    });
    setBusy(false);

    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    setPendingPlacements([]);
    setSelectedTileId(null);
    setExchangeMode(false);
    setExchangeTileIds([]);
    setFeedback("המהלך נשלח.");
  }

  async function passMove() {
    if (!socketRef.current) {
      return;
    }

    setBusy(true);
    const response = await emitWithAck(socketRef.current, "game:pass");
    setBusy(false);
    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    setPendingPlacements([]);
    setSelectedTileId(null);
    setExchangeMode(false);
    setExchangeTileIds([]);
    setFeedback("התור דולג.");
  }

  async function exchangeTiles() {
    if (!socketRef.current || exchangeTileIds.length === 0) {
      return;
    }

    setBusy(true);
    const response = await emitWithAck(socketRef.current, "game:exchange", {
      tileIds: exchangeTileIds
    });
    setBusy(false);
    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    setPendingPlacements([]);
    setSelectedTileId(null);
    setExchangeMode(false);
    setExchangeTileIds([]);
    setFeedback("האותיות הוחלפו.");
  }

  function toggleExchangeTile(tileId) {
    setExchangeTileIds((current) =>
      current.includes(tileId) ? current.filter((candidate) => candidate !== tileId) : [...current, tileId]
    );
  }

  function handleRackTileClick(tileId) {
    if (!selfPlayer || !isMyTurn || roomState?.finished) {
      return;
    }

    if (exchangeMode) {
      toggleExchangeTile(tileId);
      return;
    }

    const existingPlacement = pendingByTileId.get(tileId);
    if (existingPlacement) {
      setPendingPlacements((current) => current.filter((placement) => placement.tileId !== tileId));
      setSelectedTileId(tileId);
      return;
    }

    setSelectedTileId((current) => (current === tileId ? null : tileId));
  }

  function placeTileOnBoard(tileId, row, column) {
    if (!selfPlayer || !roomState?.started || !isMyTurn || roomState.finished || exchangeMode || !tileId) {
      return;
    }

    const lockedCell = roomState.board[row][column];
    if (lockedCell) {
      return;
    }

    const tile = selfPlayer.rack.find((rackTile) => rackTile.id === tileId);
    if (!tile) {
      return;
    }

    let placedLetter = tile.letter;
    if (tile.isBlank || tile.letter === BLANK_TILE) {
      const chosenLetter = promptBlankTileLetter();
      if (chosenLetter === null) {
        return;
      }
      if (!chosenLetter) {
        setFeedback("לאות ריקה צריך לבחור אות עברית אחת.");
        return;
      }
      placedLetter = chosenLetter;
    }

    setPendingPlacements((current) => {
      const withoutTile = current.filter((placement) => placement.tileId !== tileId);
      const withoutSquare = withoutTile.filter((placement) => !(placement.row === row && placement.column === column));
      return [...withoutSquare, { tileId, row, column, letter: placedLetter, value: tile.value, isBlank: Boolean(tile.isBlank) }];
    });
    setSelectedTileId(null);
  }

  function handleBoardClick(row, column) {
    if (!selfPlayer || !roomState?.started || !isMyTurn || roomState.finished || exchangeMode) {
      return;
    }

    const lockedCell = roomState.board[row][column];
    if (lockedCell) {
      return;
    }

    const existingPlacement = pendingBySquare.get(`${row}:${column}`);
    if (existingPlacement) {
      setPendingPlacements((current) => current.filter((placement) => placement.tileId !== existingPlacement.tileId));
      setSelectedTileId(existingPlacement.tileId);
      return;
    }

    if (!selectedTileId) {
      setFeedback("בחרו אות מהמדף ואז לחצו על משבצת.");
      return;
    }

    placeTileOnBoard(selectedTileId, row, column);
  }

  function handleRackDragStart(event, tileId) {
    if (!selfPlayer || !isMyTurn || !roomState?.started || roomState.finished || exchangeMode) {
      event.preventDefault();
      return;
    }

    draggedTileIdRef.current = tileId;
    event.dataTransfer.setData("text/plain", tileId);
    event.dataTransfer.effectAllowed = "move";
    setSelectedTileId(tileId);
  }

  function handleRackDragEnd() {
    draggedTileIdRef.current = null;
  }

  function handleBoardDragOver(event, row, column) {
    if (!selfPlayer || !isMyTurn || !roomState?.started || roomState.finished || exchangeMode) {
      return;
    }
    if (roomState.board[row][column]) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleBoardDrop(event, row, column) {
    event.preventDefault();
    const droppedTileId = event.dataTransfer.getData("text/plain") || draggedTileIdRef.current;
    placeTileOnBoard(droppedTileId, row, column);
    draggedTileIdRef.current = null;
  }

  function recallTiles() {
    setPendingPlacements([]);
    setSelectedTileId(null);
  }

  function placeTileInTray(tileId, slotIndex) {
    if (!selfPlayer || !tileId || slotIndex < 0 || slotIndex >= TRAY_SIZE) {
      return;
    }

    const tileExists = selfPlayer.rack.some((tile) => tile.id === tileId);
    if (!tileExists || pendingByTileId.has(tileId)) {
      return;
    }

    setTraySlots((current) => {
      const next = [...current];
      const currentIndex = next.indexOf(tileId);

      if (currentIndex === slotIndex) {
        return current;
      }

      if (currentIndex >= 0) {
        [next[currentIndex], next[slotIndex]] = [next[slotIndex], next[currentIndex]];
        return next;
      }

      next[slotIndex] = tileId;
      return next;
    });
  }

  function clearTray() {
    setTraySlots(Array.from({ length: TRAY_SIZE }, () => null));
  }

  function handleTrayDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleTrayDrop(event, slotIndex) {
    event.preventDefault();
    const droppedTileId = event.dataTransfer.getData("text/plain") || draggedTileIdRef.current;
    placeTileInTray(droppedTileId, slotIndex);
    draggedTileIdRef.current = null;
  }

  function toggleRackFloating() {
    setIsRackFloating((current) => !current);
    floatingDragRef.current = null;
  }

  function handleFloatingRackPointerDown(event) {
    if (!isRackFloating) {
      return;
    }

    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    floatingDragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
  }

  function updateRuleField(section, letter, rawValue) {
    setRulesDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [section]: {
          ...current[section],
          [letter]: Math.max(0, Number(rawValue || 0))
        }
      };
    });
  }

  function resetRulesDraft() {
    if (!roomState?.rules) {
      return;
    }

    setRulesDraft({
      letterDistribution: { ...roomState.rules.letterDistribution },
      letterValues: { ...roomState.rules.letterValues }
    });
  }

  async function saveRules() {
    if (!socketRef.current || !rulesDraft) {
      return;
    }

    setBusy(true);
    const response = await emitWithAck(socketRef.current, "room:update-config", {
      rules: rulesDraft
    });
    setBusy(false);

    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    setFeedback("הגדרות המשחק נשמרו.");
  }

  async function undoPreviousTurn() {
    if (!socketRef.current) {
      return;
    }

    setBusy(true);
    const response = await emitWithAck(socketRef.current, "game:undo-last-turn");
    setBusy(false);

    if (!response?.ok) {
      setFeedback(formatError(response?.error));
      return;
    }

    setPendingPlacements([]);
    setSelectedTileId(null);
    setExchangeMode(false);
    setExchangeTileIds([]);
    setFeedback("התור הקודם שוחזר.");
  }

  async function copyToClipboard(value, successMessage) {
    if (!value) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setFeedback(successMessage);
        return;
      }
    } catch {
      // Fall through to legacy copy method below.
    }

    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    helper.style.inset = "0";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();

    try {
      const copied = document.execCommand("copy");
      if (!copied) {
        throw new Error("copy_failed");
      }
      setFeedback(successMessage);
    } catch {
      setFeedback("לא הצלחנו להעתיק אוטומטית. אפשר לסמן ולהעתיק ידנית.");
    } finally {
      document.body.removeChild(helper);
    }
  }

  async function copyRoomCode() {
    if (!roomState?.id) {
      return;
    }

    await copyToClipboard(roomState.id, `קוד החדר ${roomState.id} הועתק.`);
  }

  async function copyInviteLink() {
    if (!roomState?.id) {
      return;
    }

    const inviteLink = `${window.location.origin}?room=${roomState.id}`;
    await copyToClipboard(inviteLink, "קישור ההזמנה הועתק.");
  }

  function renderLanding() {
    return (
      <section className="shell">
        <div className="hero-card">
          <div className="eyebrow">משחק מילים רב משתתפים בזמן אמת</div>
          <h1>סקרבלייב</h1>
          <p className="hero-copy">
            צרו חדר, שתפו קישור, ותנו לכולם להצטרף מהטלפון ללוח משותף אחד.
          </p>

          <div className="panel-grid">
            <div className="panel">
              <label className="field-label" htmlFor="playerName">
                שם שחקן
              </label>
              <input
                id="playerName"
                className="text-input"
                value={playerName}
                maxLength={24}
                onChange={(event) => setPlayerName(sanitizeNameInput(event.target.value))}
                placeholder="נועה"
              />
              <div className="actions">
                <button className="primary-button" disabled={busy || !connected} onClick={createRoom}>
                  יצירת חדר
                </button>
              </div>
            </div>

            <div className="panel">
              <label className="field-label" htmlFor="roomCode">
                הצטרפות לחדר
              </label>
              <input
                id="roomCode"
                className="text-input"
                value={roomCodeInput}
                maxLength={5}
                onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                placeholder="AB123"
              />
              <div className="actions">
                <button className="secondary-button" disabled={busy || !connected} onClick={() => joinRoom()}>
                  הצטרפות
                </button>
              </div>
            </div>
          </div>

          <div className="status-banner">{feedback}</div>

          <div className="assumption-card">
            <strong>הגדרות ברירת מחדל:</strong> לוח 15x15, ערכי אותיות בעברית, משחק מרובה משתתפים לפי חדרים ובונוסים רגילים.
          </div>
        </div>
      </section>
    );
  }

  function renderHeader(subtitle) {
    return (
      <section className="topbar">
        <div className="page-intro">
          <div className="eyebrow">חדר פעיל</div>
          <div className="title-row">
            <h1>סקרבלייב</h1>
            <div className="status-chip">{connected ? "מחובר" : "מתחבר מחדש"}</div>
          </div>
          <p className="hero-copy">{subtitle}</p>
        </div>
      </section>
    );
  }

  function renderRoomLobby() {
    return (
      <main className="game-shell">
        {renderHeader("ממתינים בלובי. אפשר לשתף את קוד החדר, לעבור להגדרות או להתחיל כשהכול מוכן.")}
        <section className="panel-grid">
          <div className="panel">
            <div className="panel-title">שיתוף החדר</div>
            <RoomShareCard roomId={roomState.id} onCopyCode={copyRoomCode} onCopyLink={copyInviteLink} />
            <div className="actions">
              <button className="secondary-button" onClick={() => navigateTo("/settings")}>
                הגדרות חדר
              </button>
              <button className="ghost-button" onClick={() => navigateTo("/game")}>
                תצוגת משחק
              </button>
              {selfPlayer?.isHost ? (
                <button className="primary-button" disabled={busy || roomState.players.length < 2} onClick={startGame}>
                  התחלת משחק
                </button>
              ) : null}
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">שחקנים</div>
            <PlayerSummary
              players={roomState.players}
              currentTurnPlayerId={roomState.currentTurnPlayerId}
              viewerId={playerId}
              finished={roomState.finished}
            />
          </div>
        </section>
        <div className="status-banner">{feedback}</div>
      </main>
    );
  }

  function renderSettingsScreen(totalConfiguredTiles) {
    return (
      <main className="game-shell">
        {renderHeader("כאן מגדירים את כמות האותיות והניקוד לפני תחילת המשחק.")}
        <section className="panel-grid">
          <div className="panel">
            <div className="panel-title">הגדרות אותיות</div>
            <div className="rules-summary">
              <div className="rules-summary-chip">סה"כ אותיות: {totalConfiguredTiles}</div>
              <div className="rules-summary-chip">החלפה מותרת גם בתור הראשון</div>
            </div>
            <div className="rules-grid-header">
              <span>אות</span>
              <span>כמות</span>
              <span>ניקוד</span>
            </div>
            <div className="rules-grid">
              {LETTER_ORDER.map((letter) => (
                <div className="rules-row" key={letter}>
                  <strong className="rules-letter">{LETTER_LABELS[letter]}</strong>
                  <input
                    className="rules-input"
                    type="number"
                    min="0"
                    value={rulesDraft?.letterDistribution?.[letter] ?? 0}
                    disabled={!selfPlayer?.isHost || busy || roomState.started}
                    onChange={(event) => updateRuleField("letterDistribution", letter, event.target.value)}
                  />
                  <input
                    className="rules-input"
                    type="number"
                    min="0"
                    value={rulesDraft?.letterValues?.[letter] ?? 0}
                    disabled={!selfPlayer?.isHost || busy || roomState.started || letter === BLANK_TILE}
                    onChange={(event) => updateRuleField("letterValues", letter, event.target.value)}
                  />
                </div>
              ))}
            </div>
            {selfPlayer?.isHost && !roomState.started ? (
              <div className="actions">
                <button className="primary-button" disabled={busy || !rulesDraft} onClick={saveRules}>
                  שמירת הגדרות
                </button>
                <button className="ghost-button" disabled={busy || !rulesDraft} onClick={resetRulesDraft}>
                  איפוס לשמור האחרון
                </button>
              </div>
            ) : (
              <p className="hint-text">
                {roomState.started ? "אחרי שהמשחק התחיל ההגדרות ננעלות." : "רק המארח יכול לערוך את ההגדרות."}
              </p>
            )}
          </div>
          <div className="panel">
            <div className="panel-title">חדר</div>
            <PlayerSummary
              players={roomState.players}
              currentTurnPlayerId={roomState.currentTurnPlayerId}
              viewerId={playerId}
              finished={roomState.finished}
            />
            <div className="actions">
              <button className="secondary-button" onClick={() => navigateTo("/")}>
                חזרה ללובי
              </button>
              <button className="ghost-button" onClick={() => navigateTo("/game")}>
                מעבר למשחק
              </button>
            </div>
            <div className="status-banner compact">{feedback}</div>
          </div>
        </section>
      </main>
    );
  }

  function renderBoard() {
    return (
      <div className="panel board-panel">
        <div className="board-scroll">
          <div className="board-header-row">
            <div className="corner-spacer" />
            {COLUMN_LABELS.map((label) => (
              <div className="axis-label" key={label}>
                {label}
              </div>
            ))}
          </div>

          {Array.from({ length: BOARD_SIZE }, (_, row) => (
            <div className="board-row" key={`row-${row}`}>
              <div className="axis-label">{row + 1}</div>
              {Array.from({ length: BOARD_SIZE }, (_, column) => {
                const lockedCell = roomState.board[row][column];
                const pendingPlacement = pendingBySquare.get(`${row}:${column}`);
                const pendingTile = pendingPlacement
                  ? selfPlayer?.rack.find((rackTile) => rackTile.id === pendingPlacement.tileId) || null
                  : null;
                const pendingCell =
                  pendingPlacement && pendingTile
                    ? {
                        tileId: pendingPlacement.tileId,
                        letter: pendingPlacement.letter,
                        value: pendingPlacement.value,
                        isBlank: pendingPlacement.isBlank
                      }
                    : null;
                const premium = BOARD_PREMIUMS[row][column];
                const tile = pendingCell || lockedCell;
                const premiumLabel = PREMIUM_LABELS[premium];
                const isSelectedPlacement = pendingPlacement?.tileId === selectedTileId;

                return (
                  <button
                    key={`${row}-${column}`}
                    className={[
                      "board-cell",
                      `premium-${premium.toLowerCase()}`,
                      tile ? "filled" : "",
                      pendingCell ? "pending" : "",
                      isSelectedPlacement ? "selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleBoardClick(row, column)}
                    onDragOver={(event) => handleBoardDragOver(event, row, column)}
                    onDrop={(event) => handleBoardDrop(event, row, column)}
                    title={tile ? tile.letter : premiumLabel || "משבצת לוח"}
                  >
                    {tile ? (
                      <>
                        <span className="tile-letter">{tile.letter}</span>
                        <span className="tile-score">{tile.value}</span>
                      </>
                    ) : (
                      <>
                        <span className="premium-text premium-text-full">{PREMIUM_FULL_LABELS[premium] || ""}</span>
                        <span className="premium-text premium-text-short">{PREMIUM_SHORT_LABELS[premium] || ""}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderGameScreen(winnerNames, canUndoPreviousTurn) {
    return (
      <main className="game-shell">
        {renderHeader(
          roomState.finished
            ? `המשחק הסתיים${winnerNames ? `: ${winnerNames}` : ""}.`
            : isMyTurn
              ? "התור שלך."
              : `התור של ${roomState.players.find((player) => player.id === roomState.currentTurnPlayerId)?.name || "שחקן אחר"}.`
        )}
        <section className="panel-grid game-layout">
          {renderBoard()}
          <div className="sidebar">
            <div className="panel">
              <div className="panel-title">שחקנים</div>
              <PlayerSummary
                players={roomState.players}
                currentTurnPlayerId={roomState.currentTurnPlayerId}
                viewerId={playerId}
                finished={roomState.finished}
              />
            </div>

            <div
              className={["panel", "rack-panel", isRackFloating ? "floating" : ""].filter(Boolean).join(" ")}
              style={isRackFloating ? { left: `${floatingRackPos.x}px`, top: `${floatingRackPos.y}px` } : undefined}
            >
              <div className="rack-drag-handle" onPointerDown={handleFloatingRackPointerDown}>
                גרור את המדף
              </div>
              <div className="rack-panel-header">
                <div className="panel-title">מדף אותיות</div>
                <button
                  className={isRackFloating ? "ghost-button rack-float-toggle active-button" : "ghost-button rack-float-toggle"}
                  onClick={toggleRackFloating}
                  type="button"
                >
                  {isRackFloating ? "סגירת Float" : "Float"}
                </button>
              </div>
              <div className="rack">
                {selfPlayer?.rack.map((tile) => {
                  const placed = pendingByTileId.has(tile.id);
                  const selected = selectedTileId === tile.id;
                  const markedForExchange = exchangeTileIds.includes(tile.id);

                  return (
                    <button
                      key={tile.id}
                      draggable={Boolean(roomState?.started && isMyTurn && !exchangeMode && !roomState.finished)}
                      className={[
                        "rack-tile",
                        selected ? "selected" : "",
                        placed ? "placed" : "",
                        markedForExchange ? "exchange" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleRackTileClick(tile.id)}
                      onDragStart={(event) => handleRackDragStart(event, tile.id)}
                      onDragEnd={handleRackDragEnd}
                    >
                      <span className="tile-letter">{tile.isBlank ? "ריק" : tile.letter}</span>
                      <span className="tile-score">{tile.value}</span>
                    </button>
                  );
                })}
              </div>

              <div className="tray-header">
                <strong>אזור סידור מילים</strong>
                <button className="ghost-button tray-clear-button" type="button" onClick={clearTray}>
                  ניקוי
                </button>
              </div>
              <div className="tray-grid">
                {Array.from({ length: TRAY_SIZE }, (_, slotIndex) => {
                  const tileId = traySlots[slotIndex];
                  const tile = tileId ? selfPlayer?.rack.find((rackTile) => rackTile.id === tileId) || null : null;

                  return (
                    <button
                      key={`tray-${slotIndex}`}
                      type="button"
                      className={["tray-slot", tile ? "filled" : ""].filter(Boolean).join(" ")}
                      onDragOver={handleTrayDragOver}
                      onDrop={(event) => handleTrayDrop(event, slotIndex)}
                    >
                      {tile ? (
                        <span
                          className="tray-tile"
                          draggable={Boolean(roomState?.started && isMyTurn && !exchangeMode && !roomState.finished)}
                          onDragStart={(event) => handleRackDragStart(event, tile.id)}
                          onDragEnd={handleRackDragEnd}
                          onClick={() => handleRackTileClick(tile.id)}
                          role="button"
                          tabIndex={0}
                        >
                          <span className="tile-letter">{tile.isBlank ? "ריק" : tile.letter}</span>
                          <span className="tile-score">{tile.value}</span>
                        </span>
                      ) : (
                        <span className="tray-placeholder">גרור לכאן</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="hint-text">אפשר לגרור אותיות לכאן כדי לנסות להרכיב מילים, וגם להעביר את המדף ב־Float קרוב ללוח.</p>
              <div className="turn-tools">
                <button
                  className={exchangeMode ? "secondary-button active-button" : "secondary-button"}
                  disabled={busy || !isMyTurn || roomState.finished}
                  onClick={() => {
                    setExchangeMode((current) => !current);
                    setExchangeTileIds([]);
                    setSelectedTileId(null);
                    setPendingPlacements([]);
                  }}
                >
                  {exchangeMode ? "ביטול החלפה" : "מצב החלפה"}
                </button>
                <button className="ghost-button" disabled={busy || pendingPlacements.length === 0} onClick={recallTiles}>
                  החזרת אותיות
                </button>
                <button className="ghost-button" disabled={busy || !canUndoPreviousTurn} onClick={undoPreviousTurn}>
                  החזרת תור לשחקן הקודם
                </button>
              </div>

              <div className="actions">
                {!exchangeMode ? (
                  <>
                    <button className="primary-button" disabled={busy || !isMyTurn || pendingPlacements.length === 0 || roomState.finished} onClick={submitMove}>
                      סיום מהלך
                    </button>
                    <button className="secondary-button" disabled={busy || !isMyTurn || roomState.finished} onClick={passMove}>
                      דילוג
                    </button>
                  </>
                ) : (
                  <button className="primary-button" disabled={busy || !isMyTurn || exchangeTileIds.length === 0 || roomState.finished} onClick={exchangeTiles}>
                    החלפה {exchangeTileIds.length || ""}
                  </button>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">מצב משחק</div>
              <div className="stat-line">
                <span>אותיות בשקית</span>
                <strong>{roomState.bagCount}</strong>
              </div>
              <div className="stat-line">
                <span>פעולה אחרונה</span>
                <strong>{roomState.lastAction || "עדיין אין מהלכים."}</strong>
              </div>
              <div className="stat-line">
                <span>מילים אחרונות</span>
                <strong>{roomState.lastWords.length ? roomState.lastWords.join(", ") : "אין"}</strong>
              </div>
              <div className="stat-line">
                <span>ניקוד אחרון</span>
                <strong>{roomState.lastScore}</strong>
              </div>
              {roomState.undo ? (
                <div className="status-banner compact undo-banner">
                  {roomState.undo.actorName} ביצע {roomState.undo.actionLabel}. אפשר להחזיר את התור אליו לפני שממשיכים.
                </div>
              ) : null}
              <div className="actions">
                <button className="ghost-button" onClick={() => navigateTo("/")}>
                  חזרה ללובי
                </button>
              </div>
              <div className="status-banner compact">{feedback}</div>
            </div>
          </div>
        </section>
        <section className="panel room-share-panel">
          <RoomShareCard roomId={roomState.id} onCopyCode={copyRoomCode} onCopyLink={copyInviteLink} compact />
        </section>
      </main>
    );
  }

  if (!roomState) {
    return renderLanding();
  }

  const winnerNames = roomState.winnerIds
    .map((winnerId) => roomState.players.find((player) => player.id === winnerId)?.name)
    .filter(Boolean)
    .join(", ");
  const totalConfiguredTiles = Object.values(rulesDraft?.letterDistribution || roomState.rules.letterDistribution).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
  const canUndoPreviousTurn = Boolean(roomState.undo && roomState.undo.availableToPlayerId === playerId && isMyTurn);

  if (view === "settings") {
    return renderSettingsScreen(totalConfiguredTiles);
  }

  if (view === "entry") {
    return renderRoomLobby();
  }

  return renderGameScreen(winnerNames, canUndoPreviousTurn);
}
