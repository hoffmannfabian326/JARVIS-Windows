import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_GAMING_SNAPSHOT,
  type GamingGame,
  type GamingProfile,
  type GamingReport,
  type GamingResult,
  type GamingSettings,
  type GamingSnapshot,
} from '../lib/gaming';
import { getDesktop, type GamingGameInput } from '../lib/desktop';

interface Options {
  onNotice?: (text: string) => void;
}

export interface GamingState {
  supported: boolean;
  snapshot: GamingSnapshot;
  loading: boolean;
  error: string;
  notice: string;
  busy: string;
  report: GamingReport | null;
  artwork: Record<string, string>;
  dismissNotice: () => void;
  requestArtwork: (gameId: string, kind: 'cover' | 'hero') => void;
  refresh: () => Promise<void>;
  detect: () => Promise<GamingResult>;
  launch: (id: string) => Promise<GamingResult>;
  stop: () => Promise<GamingResult>;
  select: (id: string) => Promise<GamingResult>;
  updateSettings: (patch: Partial<GamingSettings>) => Promise<GamingResult>;
  addGame: (input: GamingGameInput) => Promise<GamingResult>;
  updateGame: (id: string, patch: Record<string, unknown>) => Promise<GamingResult>;
  removeGame: (id: string) => Promise<GamingResult>;
  saveProfile: (profile: GamingProfile) => Promise<GamingResult>;
  deleteProfile: (id: string) => Promise<GamingResult>;
  uploadAsset: (dataUrl: string) => Promise<GamingResult>;
  saveSource: (source: Record<string, unknown>) => Promise<GamingResult>;
  removeSource: (id: string) => Promise<GamingResult>;
  refreshNews: (id?: string) => Promise<GamingResult>;
  saveGuide: (guide: Record<string, unknown>) => Promise<GamingResult>;
  removeGuide: (id: string) => Promise<GamingResult>;
  openGuide: (url: string) => Promise<GamingResult>;
  saveWow: (patch: Record<string, unknown>) => Promise<GamingResult>;
  launchWow: () => Promise<GamingResult>;
  deleteSession: (id: string) => Promise<GamingResult>;
  clearSessions: () => Promise<GamingResult>;
  openCompanion: () => Promise<void>;
  closeCompanion: () => Promise<void>;
  disableCompanion: () => Promise<void>;
  companionAction: (action: 'chat' | 'voice' | 'hub') => Promise<void>;
  pickFile: (kind?: 'executable' | 'folder') => Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
}

const ARTWORK_TTL = 60_000;

export function useGaming({ onNotice }: Options = {}): GamingState {
  const desktop = getDesktop();
  const supported = Boolean(desktop?.gamingState);
  const [snapshot, setSnapshot] = useState<GamingSnapshot>(EMPTY_GAMING_SNAPSHOT);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<GamingReport | null>(null);
  const [artwork, setArtwork] = useState<Record<string, string>>({});
  const artworkRef = useRef(new Map<string, { url: string; at: number }>());
  const artworkPending = useRef(new Set<string>());
  const artworkEpoch = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const flash = useCallback(
    (text: string) => {
      setNotice(text);
      onNotice?.(text);
      window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 6000);
    },
    [onNotice],
  );

  const apply = useCallback((next: unknown) => {
    if (!next || typeof next !== 'object') return;
    const candidate = next as Partial<GamingSnapshot>;
    if (!candidate.settings || !Array.isArray(candidate.games) || !candidate.detection) return;
    setSnapshot({
      ...EMPTY_GAMING_SNAPSHOT,
      ...candidate,
      supported: candidate.supported !== false,
    });
    setLoading(false);
    setError('');
  }, []);

  useEffect(() => {
    if (!desktop?.gamingState) {
      // Im Browser ist der Hub bewusst eingeschränkt; das ist kein Fehler.
      setLoading(false);
      return undefined;
    }
    let alive = true;
    void desktop
      .gamingState()
      .then((result) => {
        if (!alive) return;
        if (result?.snapshot) apply(result.snapshot);
        if (result?.ok === false) setError(result.error || 'Der Gaming-Dienst antwortet nicht.');
      })
      .catch(() => {
        if (!alive) return;
        setError('Der Gaming-Dienst antwortet nicht.');
        setLoading(false);
      });
    const offState = desktop.onGamingState?.((state) => apply(state));
    const offReport = desktop.onGamingReport?.((payload) => {
      if (payload?.summary) {
        setReport(payload as GamingReport);
        flash(`Sitzungsbericht: ${payload.summary}`);
      }
      void desktop.gamingState?.().then((result) => {
        if (result?.snapshot && alive) apply(result.snapshot);
      });
    });
    const offNotify = desktop.onGamingNotify?.((payload) => {
      if (payload?.body) flash(`${payload.title}: ${payload.body}`);
    });
    return () => {
      alive = false;
      offState?.();
      offReport?.();
      offNotify?.();
    };
  }, [apply, desktop, flash]);

  const refresh = useCallback(async () => {
    if (!desktop?.gamingState) return;
    try {
      const result = await desktop.gamingState();
      if (result?.snapshot) apply(result.snapshot);
      if (result?.ok === false) setError(result.error || 'Der Gaming-Dienst antwortet nicht.');
    } catch {
      setError('Der Gaming-Dienst antwortet nicht.');
    }
  }, [apply, desktop]);

  const run = useCallback(
    async (key: string, task: () => Promise<GamingResult>): Promise<GamingResult> => {
      setBusy(key);
      setError('');
      try {
        const result = await task();
        if (result?.snapshot) apply(result.snapshot);
        else if (result?.ok) await refresh();
        if (result?.ok === false) setError(result.error || result.message || 'Die Aktion ist fehlgeschlagen.');
        return result ?? { ok: false, error: 'Keine Antwort vom Gaming-Dienst.' };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Die Aktion ist fehlgeschlagen.';
        setError(message);
        return { ok: false, error: message };
      } finally {
        if (mounted.current) setBusy('');
      }
    },
    [apply, refresh],
  );

  const detect = useCallback(
    () => (desktop?.gamingDetect ? run('detect', () => desktop.gamingDetect!()) : Promise.resolve({ ok: false, error: 'Erkennung nur in der Desktop-App.' })),
    [desktop, run],
  );

  const launch = useCallback(
    (id: string) =>
      desktop?.gamingLaunch
        ? run('launch', () => desktop.gamingLaunch!(id))
        : Promise.resolve({ ok: false, error: 'Spiele lassen sich nur in der Desktop-App starten.' }),
    [desktop, run],
  );

  const stop = useCallback(
    () => (desktop?.gamingStop ? run('stop', () => desktop.gamingStop!()) : Promise.resolve({ ok: false })),
    [desktop, run],
  );

  const select = useCallback(
    (id: string) => (desktop?.gamingSelect ? run('select', () => desktop.gamingSelect!(id)) : Promise.resolve({ ok: false })),
    [desktop, run],
  );

  const updateSettings = useCallback(
    (patch: Partial<GamingSettings>) =>
      desktop?.gamingSettings
        ? run('settings', () => desktop.gamingSettings!(patch))
        : Promise.resolve({ ok: false, error: 'Einstellungen nur in der Desktop-App.' }),
    [desktop, run],
  );

  const addGame = useCallback(
    (input: GamingGameInput) =>
      desktop?.gamingAddGame
        ? run('addGame', () => desktop.gamingAddGame!(input))
        : Promise.resolve({ ok: false, error: 'Die Bibliothek ist nur in der Desktop-App verfügbar.' }),
    [desktop, run],
  );

  const invalidateArtwork = useCallback((gameId?: string) => {
    artworkEpoch.current += 1;
    const prefix = gameId ? `${gameId}:` : '';
    for (const key of artworkPending.current) {
      if (!prefix || key.startsWith(prefix)) artworkPending.current.delete(key);
    }
    if (gameId) {
      artworkRef.current.delete(`${gameId}:cover`);
      artworkRef.current.delete(`${gameId}:hero`);
      setArtwork((current) => {
        const next = { ...current };
        delete next[`${gameId}:cover`];
        delete next[`${gameId}:hero`];
        return next;
      });
    } else {
      artworkRef.current.clear();
      setArtwork({});
    }
  }, []);

  const updateGame = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      desktop?.gamingUpdateGame
        ? run('updateGame', async () => {
            const result = await desktop.gamingUpdateGame!(id, patch);
            invalidateArtwork(id);
            return result;
          })
        : Promise.resolve({ ok: false, error: 'Die Bibliothek ist nur in der Desktop-App verfügbar.' }),
    [desktop, run],
  );

  const removeGame = useCallback(
    (id: string) =>
      desktop?.gamingRemoveGame
        ? run('removeGame', async () => {
            const result = await desktop.gamingRemoveGame!(id);
            invalidateArtwork(id);
            return result;
          })
        : Promise.resolve({ ok: false }),
    [desktop, run],
  );

  const saveProfile = useCallback(
    (profile: GamingProfile) =>
      desktop?.gamingProfileSave
        ? run('profile', async () => {
            const result = await desktop.gamingProfileSave!(profile as unknown as Record<string, unknown>);
            invalidateArtwork(profile.gameId);
            return result;
          })
        : Promise.resolve({ ok: false, error: 'Profile nur in der Desktop-App.' }),
    [desktop, run],
  );

  const deleteProfile = useCallback(
    (id: string) =>
      desktop?.gamingProfileDelete
        ? run('profile', async () => {
            const profile = snapshot.profiles.find((entry) => entry.id === id);
            const result = await desktop.gamingProfileDelete!(id);
            if (profile) invalidateArtwork(profile.gameId);
            return result;
          })
        : Promise.resolve({ ok: false }),
    [desktop, run, snapshot.profiles],
  );

  const uploadAsset = useCallback(
    (dataUrl: string) =>
      desktop?.gamingAssetUpload
        ? run('upload', () => desktop.gamingAssetUpload!(dataUrl))
        : Promise.resolve({ ok: false, error: 'Bilder nur in der Desktop-App.' }),
    [desktop, run],
  );

  const saveSource = useCallback(
    (source: Record<string, unknown>) =>
      desktop?.gamingSourceSave ? run('source', () => desktop.gamingSourceSave!(source)) : Promise.resolve({ ok: false }),
    [desktop, run],
  );

  const removeSource = useCallback(
    (id: string) =>
      desktop?.gamingSourceRemove ? run('source', () => desktop.gamingSourceRemove!(id)) : Promise.resolve({ ok: false }),
    [desktop, run],
  );

  const refreshNews = useCallback(
    (id?: string) =>
      desktop?.gamingNewsRefresh
        ? run('news', async () => {
            const result = await desktop.gamingNewsRefresh!(id);
            if (result.articles?.length) flash(`${result.articles.length} Meldungen geladen.`);
            return result;
          })
        : Promise.resolve({ ok: false, error: 'News nur in der Desktop-App.' }),
    [desktop, flash, run],
  );

  const saveGuide = useCallback(
    (guide: Record<string, unknown>) =>
      desktop?.gamingGuideSave ? run('guide', () => desktop.gamingGuideSave!(guide)) : Promise.resolve({ ok: false }),
    [desktop, run],
  );

  const removeGuide = useCallback(
    (id: string) => (desktop?.gamingGuideRemove ? run('guide', () => desktop.gamingGuideRemove!(id)) : Promise.resolve({ ok: false })),
    [desktop, run],
  );

  const openGuide = useCallback(
    (url: string) =>
      desktop?.gamingGuideOpen
        ? run('open', () => desktop.gamingGuideOpen!(url))
        : Promise.resolve({ ok: false, error: 'Links nur in der Desktop-App.' }),
    [desktop, run],
  );

  const saveWow = useCallback(
    (patch: Record<string, unknown>) =>
      desktop?.gamingWowSave ? run('wow', () => desktop.gamingWowSave!(patch)) : Promise.resolve({ ok: false }),
    [desktop, run],
  );

  const launchWow = useCallback(
    () => (desktop?.gamingWowLaunch ? run('wowLaunch', () => desktop.gamingWowLaunch!()) : Promise.resolve({ ok: false })),
    [desktop, run],
  );

  const deleteSession = useCallback(
    (id: string) =>
      desktop?.gamingSessionDelete ? run('session', () => desktop.gamingSessionDelete!(id)) : Promise.resolve({ ok: false }),
    [desktop, run],
  );

  const clearSessions = useCallback(
    () => (desktop?.gamingSessionsClear ? run('session', () => desktop.gamingSessionsClear!()) : Promise.resolve({ ok: false })),
    [desktop, run],
  );

  const openCompanion = useCallback(async () => {
    if (!desktop?.gamingCompanion) return;
    await desktop.gamingSettings?.({ companionEnabled: true });
    await desktop.gamingCompanion(true);
    await refresh();
  }, [desktop, refresh]);

  const closeCompanion = useCallback(async () => {
    if (!desktop?.gamingCompanion) return;
    await desktop.gamingCompanion(false);
    await refresh();
  }, [desktop, refresh]);

  const disableCompanion = useCallback(async () => {
    if (!desktop) return;
    await desktop.gamingSettings?.({ companionEnabled: false, companionAutoShow: false });
    await desktop.gamingCompanion?.(false);
    await refresh();
  }, [desktop, refresh]);

  const companionAction = useCallback(
    async (action: 'chat' | 'voice' | 'hub') => {
      await desktop?.gamingCompanionAction?.(action);
    },
    [desktop],
  );

  const pickFile = useCallback(
    async (kind: 'executable' | 'folder' = 'executable') => {
      const result = await desktop?.gamingPickFile?.(kind);
      return result ?? { ok: false };
    },
    [desktop],
  );

  const requestArtwork = useCallback(
    (gameId: string, kind: 'cover' | 'hero') => {
      const key = `${gameId}:${kind}`;
      const cached = artworkRef.current.get(key);
      if (cached && Date.now() - cached.at < ARTWORK_TTL) {
        if (!artwork[key]) setArtwork((current) => ({ ...current, [key]: cached.url }));
        return;
      }
      if (artworkPending.current.has(key) || !desktop?.gamingArtwork) return;
      artworkPending.current.add(key);
      const epoch = artworkEpoch.current;
      void desktop
        .gamingArtwork(gameId, kind)
        .then((result) => {
          if (epoch !== artworkEpoch.current || !mounted.current) return;
          if (result?.artwork) {
            artworkRef.current.set(key, { url: result.artwork, at: Date.now() });
            setArtwork((current) => ({ ...current, [key]: result.artwork! }));
          }
        })
        .catch(() => {
          /* Ein fehlendes Artwork ist kein Fehler. */
        })
        .finally(() => {
          artworkPending.current.delete(key);
        });
    },
    [desktop, artwork],
  );

  return useMemo(
    () => ({
      supported,
      snapshot,
      loading,
      error,
      notice,
      busy,
      report,
      artwork,
      dismissNotice: () => setNotice(''),
      requestArtwork,
      refresh,
      detect,
      launch,
      stop,
      select,
      updateSettings,
      addGame,
      updateGame,
      removeGame,
      saveProfile,
      deleteProfile,
      uploadAsset,
      saveSource,
      removeSource,
      refreshNews,
      saveGuide,
      removeGuide,
      openGuide,
      saveWow,
      launchWow,
      deleteSession,
      clearSessions,
      openCompanion,
      closeCompanion,
      disableCompanion,
      companionAction,
      pickFile,
    }),
    [
      supported,
      snapshot,
      loading,
      error,
      notice,
      busy,
      report,
      artwork,
      requestArtwork,
      refresh,
      detect,
      launch,
      stop,
      select,
      updateSettings,
      addGame,
      updateGame,
      removeGame,
      saveProfile,
      deleteProfile,
      uploadAsset,
      saveSource,
      removeSource,
      refreshNews,
      saveGuide,
      removeGuide,
      openGuide,
      saveWow,
      launchWow,
      deleteSession,
      clearSessions,
      openCompanion,
      closeCompanion,
      disableCompanion,
      companionAction,
      pickFile,
    ],
  );
}

export function profileFor(snapshot: GamingSnapshot, gameId: string): GamingProfile | undefined {
  return snapshot.profiles.find((profile) => profile.gameId === gameId);
}

export function gameById(snapshot: GamingSnapshot, id: string): GamingGame | undefined {
  return snapshot.games.find((game) => game.id === id);
}
