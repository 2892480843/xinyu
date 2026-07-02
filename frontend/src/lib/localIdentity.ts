const STORAGE_KEY = "xinyu.localIdentity";
export const DEFAULT_NICKNAME = "岛屿访客";

export interface LocalIdentity {
  user_id: string;
  nickname: string;
}

function cleanNickname(nickname: string): string {
  return nickname.trim().replace(/\s+/g, " ").slice(0, 24);
}

function createUserId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadIdentity(): LocalIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalIdentity>;
    if (!parsed.user_id || !parsed.nickname) return null;
    return {
      user_id: String(parsed.user_id),
      nickname: cleanNickname(String(parsed.nickname)),
    };
  } catch {
    return null;
  }
}

export function createIdentity(nickname: string): LocalIdentity {
  const identity = {
    user_id: createUserId(),
    nickname: cleanNickname(nickname) || DEFAULT_NICKNAME,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function clearIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}
