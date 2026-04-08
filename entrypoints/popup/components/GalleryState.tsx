import { useState, useMemo, useCallback, useRef } from "preact/hooks";
import type { MediaItem, MediaType, UserProfile } from "../../../src/types";

interface Props {
  user: UserProfile;
  items: MediaItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDownload: () => void;
  onBack: () => void;
}

type FilterType = "all" | MediaType;

function itemKey(item: MediaItem): string {
  return `${item.tweetId}_${item.index}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function GalleryState({
  user,
  items,
  selectedIds,
  onSelectionChange,
  onDownload,
  onBack,
}: Props) {
  const [filter, setFilter] = useState<FilterType>("all");
  const lastClickedIndex = useRef<number>(-1);

  const counts = useMemo(() => {
    const c = { all: items.length, photo: 0, video: 0, animated_gif: 0 };
    for (const item of items) c[item.type]++;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.type === filter)),
    [items, filter],
  );

  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(itemKey(i)));

  const handleToggle = useCallback(
    (item: MediaItem, index: number, shiftKey: boolean) => {
      const key = itemKey(item);
      const next = new Set(selectedIds);

      if (shiftKey && lastClickedIndex.current >= 0) {
        // Range selection
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        for (let i = start; i <= end; i++) {
          next.add(itemKey(filtered[i]));
        }
      } else {
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }

      lastClickedIndex.current = index;
      onSelectionChange(next);
    },
    [selectedIds, filtered, onSelectionChange],
  );

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      const next = new Set(selectedIds);
      for (const item of filtered) next.delete(itemKey(item));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const item of filtered) next.add(itemKey(item));
      onSelectionChange(next);
    }
  }, [allSelected, selectedIds, filtered, onSelectionChange]);

  const selectedCount = selectedIds.size;

  return (
    <>
      <div class="account-bar">
        <button class="back-btn" onClick={onBack}>
          ←
        </button>
        <img class="avatar" src={user.profileImageUrl} alt="" />
        <div class="account-info">
          <div class="account-name">{user.name}</div>
          <div class="account-handle">
            @{user.screenName} · {items.length.toLocaleString()} media
          </div>
        </div>
      </div>

      <div class="filters">
        <button
          class={`filter-pill ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({counts.all})
        </button>
        <button
          class={`filter-pill ${filter === "photo" ? "active" : ""}`}
          onClick={() => setFilter("photo")}
        >
          Images ({counts.photo})
        </button>
        <button
          class={`filter-pill ${filter === "video" ? "active" : ""}`}
          onClick={() => setFilter("video")}
        >
          Video ({counts.video})
        </button>
        <button
          class={`filter-pill ${filter === "animated_gif" ? "active" : ""}`}
          onClick={() => setFilter("animated_gif")}
        >
          GIF ({counts.animated_gif})
        </button>
        <button class="select-all" onClick={handleSelectAll}>
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div class="gallery">
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "#71767b" }}>
            No media found for @{user.screenName}
          </div>
        )}
        {filtered.map((item, i) => (
          <div
            key={itemKey(item)}
            class={`gallery-item ${selectedIds.has(itemKey(item)) ? "selected" : ""}`}
            onClick={(e) => handleToggle(item, i, e.shiftKey)}
          >
            <img src={item.thumbnailUrl} alt="" loading="lazy" />
            <div class="checkbox" />
            {item.type === "video" && item.durationMs && (
              <div class="badge">{formatDuration(item.durationMs)}</div>
            )}
            {item.type === "animated_gif" && <div class="badge">GIF</div>}
          </div>
        ))}
      </div>

      <div class="download-bar">
        <div class="download-info">
          <div class="download-count">{selectedCount} selected</div>
        </div>
        <button
          class="download-btn"
          onClick={onDownload}
          disabled={selectedCount === 0}
        >
          Download ZIP
        </button>
      </div>
    </>
  );
}
