import type { ActionNotice } from "../types/app";

type ActionNoticeBarProps = {
  notice: ActionNotice;
  onDismiss: () => void;
};

export function ActionNoticeBar({ notice, onDismiss }: ActionNoticeBarProps) {
  return (
    <div className={`action-notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <div className="action-notice-body">{notice.message}</div>
      <button className="action-notice-close" onClick={onDismiss} aria-label="Dismiss notice">
        Dismiss
      </button>
    </div>
  );
}
