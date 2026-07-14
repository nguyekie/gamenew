export interface Profile {
  id: string;
  displayName: string;
  mmr: number;
  wins: number;
  losses: number;
}

export interface Session {
  token: string;
  profile: Profile;
}

export interface MatchInfo {
  id: string;
  roomCode: string;
  playerIds: [string, string];
  winnerId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

const API_URL =
  window.location.port === "5173"
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : `${window.location.origin}/api`;

export const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = localStorage.getItem("aetherion-auth-token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Không thể kết nối máy chủ");
  return body;
};

export const authenticate = async (
  mode: "login" | "register",
  displayName: string,
  password: string
) => {
  const session = await apiRequest<Session>(`/auth/${mode}`, {
    method: "POST",
    body: JSON.stringify({ displayName, password })
  });
  localStorage.setItem("aetherion-auth-token", session.token);
  localStorage.setItem("aetherion-profile", JSON.stringify(session.profile));
  return session;
};

export const loadLocalProfile = (): Profile | null => {
  try {
    const value = localStorage.getItem("aetherion-profile");
    return value ? (JSON.parse(value) as Profile) : null;
  } catch {
    return null;
  }
};
