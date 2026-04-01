export default function PlayerSummary({ players, currentTurnPlayerId, viewerId, finished = false }) {
  return (
    <div className="player-summary">
      <div className="player-summary-header">
        <span>שחקן</span>
        <span>מצב</span>
        <span>אותיות</span>
        <span>ניקוד</span>
      </div>
      <div className="player-list">
        {players.map((player) => (
          <div
            className={[
              "player-row",
              player.id === currentTurnPlayerId && !finished ? "active" : "",
              player.id === viewerId ? "self" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            key={player.id}
          >
            <div className="player-main">
              <strong className="player-name">{player.name}</strong>
              <div className="player-tags">
                {player.isHost ? <span className="player-badge">מארח</span> : null}
                {player.id === viewerId ? <span className="player-badge">אני</span> : null}
                {player.id === currentTurnPlayerId && !finished ? <span className="player-badge player-badge-turn">בתור</span> : null}
              </div>
            </div>
            <div className="player-stats">
              <div className="player-stat">
                <span className="player-stat-label">מצב</span>
                <strong>{player.connected ? "מחובר" : "מנותק"}</strong>
              </div>
              <div className="player-stat">
                <span className="player-stat-label">אותיות</span>
                <strong>{player.rackCount}</strong>
              </div>
              <div className="player-stat">
                <span className="player-stat-label">ניקוד</span>
                <strong>{player.score}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
