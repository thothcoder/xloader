import type { DownloadProgress, UserProfile } from "../../../src/types";

interface Props {
  user: UserProfile | null;
  progress: DownloadProgress | null;
  onCancel: () => void;
}

export function DownloadState({ user, progress, onCancel }: Props) {
  const pct = progress
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <>
      {user && (
        <div class="account-bar">
          <img class="avatar" src={user.profileImageUrl} alt="" />
          <div class="account-info">
            <div class="account-name">{user.name}</div>
            <div class="account-handle">@{user.screenName}</div>
          </div>
        </div>
      )}
      <div class="progress-area">
        <div style={{ fontSize: "15px", fontWeight: 600 }}>Downloading...</div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div class="progress-text">
          {progress
            ? `${progress.completed} of ${progress.total} items`
            : "Starting..."}
        </div>
        {progress?.currentFile && (
          <div style={{ fontSize: "12px", color: "#71767b" }}>
            {progress.currentFile}
          </div>
        )}
        <button class="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}
