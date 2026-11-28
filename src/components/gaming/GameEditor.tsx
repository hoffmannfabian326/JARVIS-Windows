import { useRef, useState, type ChangeEvent } from 'react';
import { GAMING_LAUNCHERS, launcherLabel, type GamingGame, type GamingLauncher } from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GamingModal } from './GamingUi';

interface Props {
  gaming: GamingState;
  game?: GamingGame;
  onClose: () => void;
}

const EMPTY = {
  name: '',
  launcher: 'manual' as GamingLauncher,
  exe: '',
  args: '',
  uri: '',
  process: '',
  genre: '',
  description: '',
  coverUrl: '',
  heroUrl: '',
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Die Bilddatei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

export default function GameEditor({ gaming, game, onClose }: Props) {
  const [form, setForm] = useState({
    ...EMPTY,
    name: game?.name ?? '',
    launcher: game?.launcher ?? 'manual',
    exe: game?.exe ?? '',
    args: game?.args ?? '',
    uri: game?.uri ?? '',
    process: game?.process ?? '',
    genre: game?.genre ?? '',
    description: game?.description ?? '',
    coverUrl: game?.coverUrl ?? '',
    heroUrl: game?.heroUrl ?? '',
  });
  const [cover, setCover] = useState(game?.customCover ?? '');
  const [hero, setHero] = useState(game?.customHero ?? '');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const coverInput = useRef<HTMLInputElement | null>(null);
  const heroInput = useRef<HTMLInputElement | null>(null);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const pickExecutable = async () => {
    const result = await gaming.pickFile('executable');
    if (result.ok && result.path) {
      setForm((current) => ({
        ...current,
        exe: result.path!,
        name: current.name || result.path!.split(/[\\/]/).pop()?.replace(/\.(exe|lnk)$/i, '') || '',
      }));
    }
  };

  const upload = async (file: File | undefined, kind: 'cover' | 'hero') => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setMessage('Bitte ein Bild unter 6 MB wählen.');
      return;
    }
    try {
      const dataUrl = await readFile(file);
      const result = await gaming.uploadAsset(dataUrl);
      if (!result.ok || !result.path) {
        setMessage(result.error || 'Das Bild konnte nicht gespeichert werden.');
        return;
      }
      if (kind === 'cover') setCover(result.path);
      else setHero(result.path);
      setMessage('Bild lokal gespeichert. Speichere das Spiel, um es zu übernehmen.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Das Bild konnte nicht gelesen werden.');
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      setMessage('Bitte einen Spielnamen angeben.');
      return;
    }
    if (!form.exe.trim() && !form.uri.trim()) {
      setMessage('Bitte eine EXE/LNK-Datei oder einen Launcher-Link hinterlegen.');
      return;
    }
    setSaving(true);
    setMessage('');
    if (game) {
      const result = await gaming.updateGame(game.id, {
        name: form.name,
        launcher: form.launcher,
        exe: form.exe,
        args: form.args,
        uri: form.uri,
        process: form.process,
        genre: form.genre,
        description: form.description,
        customCover: cover,
        customHero: hero,
      });
      setSaving(false);
      if (!result.ok) {
        setMessage(result.error || 'Das Spiel konnte nicht gespeichert werden.');
        return;
      }
      onClose();
      return;
    }
    const result = await gaming.addGame({
      name: form.name,
      launcher: form.launcher,
      exe: form.exe,
      args: form.args,
      uri: form.uri,
      process: form.process,
      genre: form.genre,
      description: form.description,
      coverUrl: form.coverUrl,
      heroUrl: form.heroUrl,
    });
    if (!result.ok || !result.game) {
      setSaving(false);
      setMessage(result.error || 'Das Spiel konnte nicht angelegt werden.');
      return;
    }
    if (cover || hero) {
      const assets = await gaming.updateGame(result.game.id, { customCover: cover, customHero: hero });
      if (!assets.ok) setMessage(assets.error || 'Das Spiel wurde gespeichert, die Bilder aber nicht übernommen.');
    }
    setSaving(false);
    onClose();
  };

  const remove = async () => {
    if (!game) return;
    if (!window.confirm(`„${game.name}“ aus der Bibliothek entfernen? Spielzeit und Sitzungen bleiben erhalten.`)) return;
    setSaving(true);
    const result = await gaming.removeGame(game.id);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error || 'Das Spiel konnte nicht entfernt werden.');
      return;
    }
    onClose();
  };

  return (
    <GamingModal
      title={game ? `${game.name} bearbeiten` : 'Spiel manuell hinzufügen'}
      hint="Nur lokale Startdateien und offizielle Launcher-Links. Keine Anti-Cheat-Umgehung, keine automatische Installation."
      onClose={onClose}
      wide
      footer={
        <>
          {game ? (
            <button type="button" className="gaming-button is-danger" onClick={() => void remove()} disabled={saving}>
              Aus Bibliothek entfernen
            </button>
          ) : null}
          <span className="gaming-spacer" />
          <button type="button" className="gaming-button is-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="gaming-button is-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Speichert …' : 'Speichern'}
          </button>
        </>
      }
    >
      <div className="gaming-form-grid">
        <label>
          <span>Name</span>
          <input {...field('name')} placeholder="z. B. World of Warcraft" maxLength={80} />
        </label>
        <label>
          <span>Launcher</span>
          <select {...field('launcher')}>
            {GAMING_LAUNCHERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="is-wide">
          <span>Startdatei (EXE oder LNK)</span>
          <div className="gaming-input-row">
            <input {...field('exe')} placeholder="C:\Spiele\Spiel\Spiel.exe" />
            <button type="button" className="gaming-button is-ghost" onClick={() => void pickExecutable()}>
              Durchsuchen
            </button>
          </div>
        </label>
        <label className="is-wide">
          <span>Launcher-Link (optional)</span>
          <input {...field('uri')} placeholder="steam://rungameid/… / com.epicgames.launcher://…" />
          <small>Nur offizielle Launcher-Schemata: steam, epic, battlenet, gog, uplay, ea.</small>
        </label>
        <label>
          <span>Prozessname (optional)</span>
          <input {...field('process')} placeholder="Wow.exe" />
        </label>
        <label>
          <span>Genre</span>
          <input {...field('genre')} placeholder="MMORPG, Shooter …" maxLength={40} />
        </label>
        <label className="is-wide">
          <span>Startparameter</span>
          <input {...field('args')} placeholder="-windowed -console" />
        </label>
        <label className="is-wide">
          <span>Beschreibung</span>
          <textarea {...field('description')} rows={3} maxLength={500} placeholder="Kurze Notiz zum Spiel" />
        </label>
        {!game ? (
          <>
            <label>
              <span>Cover-URL (optional)</span>
              <input {...field('coverUrl')} placeholder="https://…" />
            </label>
            <label>
              <span>Hero-URL (optional)</span>
              <input {...field('heroUrl')} placeholder="https://…" />
            </label>
          </>
        ) : null}
        <div className="is-wide gaming-asset-row">
          <div>
            <span>Eigenes Cover</span>
            <button type="button" className="gaming-button is-ghost" onClick={() => coverInput.current?.click()}>
              {cover ? 'Cover ersetzen' : 'Cover wählen'}
            </button>
            {cover ? <small>{cover}</small> : null}
          </div>
          <div>
            <span>Eigenes Hintergrundbild</span>
            <button type="button" className="gaming-button is-ghost" onClick={() => heroInput.current?.click()}>
              {hero ? 'Hintergrund ersetzen' : 'Hintergrund wählen'}
            </button>
            {hero ? <small>{hero}</small> : null}
          </div>
          <input
            ref={coverInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => void upload(event.target.files?.[0], 'cover')}
          />
          <input
            ref={heroInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => void upload(event.target.files?.[0], 'hero')}
          />
        </div>
      </div>
      {game ? (
        <p className="gaming-form-note">
          Quelle: {game.source === 'detected' ? 'automatisch erkannt' : 'manuell'} · Launcher: {launcherLabel(game.launcher)}
          {game.available === false ? ' · Startdatei derzeit nicht gefunden' : ''}
        </p>
      ) : null}
      {message ? <p className="gaming-form-message">{message}</p> : null}
    </GamingModal>
  );
}
