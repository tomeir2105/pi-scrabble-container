export default function RoomShareCard({ roomId, onCopyCode, onCopyLink, compact = false }) {
  return (
    <div className={`invite-box${compact ? " invite-box-compact" : ""}`}>
      <div className="room-code-card">
        <div className="room-code-label">קוד משחק</div>
        <div className="room-code-value" dir="ltr">
          {roomId}
        </div>
        <button className="room-code-copy" onClick={onCopyCode} type="button" aria-label="העתקת קוד" title="העתקת קוד">
          <span className="room-code-copy-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M9 9h10v12H9z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 3h10v12" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
        </button>
      </div>
      <button className="ghost-button" onClick={onCopyLink} type="button">
        העתקת קישור הזמנה
      </button>
    </div>
  );
}
