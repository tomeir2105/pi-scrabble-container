export default function RoomShareCard({ roomId, onCopyCode, onCopyLink, compact = false }) {
  return (
    <div className={`invite-box${compact ? " invite-box-compact" : ""}`}>
      <div className="room-code-card">
        <div className="room-code-label">קוד משחק</div>
        <div className="room-code-row">
          <div className="room-code-value" dir="ltr">
            {roomId}
          </div>
          <button className="room-code-copy" onClick={onCopyCode} type="button" aria-label="העתקת קוד" title="העתקת קוד">
            <span className="room-code-copy-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <rect x="8" y="8" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <rect x="5" y="5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
          </button>
        </div>
      </div>
      <button className="ghost-button" onClick={onCopyLink} type="button">
        העתקת קישור הזמנה
      </button>
    </div>
  );
}
