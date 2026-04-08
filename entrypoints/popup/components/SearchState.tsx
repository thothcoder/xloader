interface Props {
  username: string;
  onUsernameChange: (value: string) => void;
  onSearch: () => void;
}

export function SearchState({ username, onUsernameChange, onSearch }: Props) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") onSearch();
  };

  return (
    <div class="search-area">
      <div class="search-title">Download media from X</div>
      <div class="search-subtitle">
        Browse and download images, videos, and GIFs from any public account
      </div>
      <input
        class="search-input"
        type="text"
        placeholder="@username"
        value={username}
        onInput={(e) => onUsernameChange((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        autofocus
      />
      <button
        class="btn-primary"
        onClick={onSearch}
        disabled={!username.replace(/^@/, "").trim()}
      >
        Load Media
      </button>
      <div class="search-hint">
        Works with any public X account. You must be logged in to X.
      </div>
    </div>
  );
}
