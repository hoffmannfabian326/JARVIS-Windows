import { useMemo, useState } from 'react';
import {
  WOW_CATEGORIES,
  articleTimestamp,
  type GamingArticle,
  type GamingGuide,
  type GamingSource,
  type GamingSourceKind,
} from '../../lib/gaming';
import type { GamingState } from '../../hooks/useGaming';
import { GamingEmpty, GamingModal } from './GamingUi';

const KIND_LABEL: Record<GamingSourceKind, string> = {
  news: 'News',
  patch: 'Patchnotes',
  raid: 'Raid',
  dungeon: 'Dungeon',
  class: 'Klasse',
  general: 'Allgemein',
};

function formatDate(value: number): string {
  if (!value) return 'ohne Datum';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function SourceEditor({
  gaming,
  scope,
  source,
  onClose,
}: {
  gaming: GamingState;
  scope: 'general' | 'wow';
  source?: GamingSource;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    id: source?.id ?? '',
    name: source?.name ?? '',
    url: source?.url ?? '',
    kind: source?.kind ?? ('news' as GamingSourceKind),
    game: source?.game ?? scope,
    enabled: source?.enabled ?? true,
  });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.name.trim() || !draft.url.trim()) {
      setMessage('Name und Feed-Adresse sind erforderlich.');
      return;
    }
    setSaving(true);
    const result = await gaming.saveSource(draft);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error || 'Die Quelle konnte nicht gespeichert werden.');
      return;
    }
    onClose();
  };

  return (
    <GamingModal
      title={source ? 'Quelle bearbeiten' : 'Informationsquelle hinzufügen'}
      hint="RSS- oder Atom-Feed einer offiziellen oder von dir gewählten Seite. Der Hub lädt nur http(s)-Adressen."
      onClose={onClose}
      footer={
        <>
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
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="z. B. WoW Forever News" />
        </label>
        <label>
          <span>Kategorie</span>
          <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as GamingSourceKind })}>
            {WOW_CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="is-wide">
          <span>Feed-Adresse</span>
          <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com/feed.xml" />
        </label>
        <label>
          <span>Bereich</span>
          <select value={draft.game} onChange={(event) => setDraft({ ...draft, game: event.target.value as 'general' | 'wow' })}>
            <option value="general">Gaming allgemein</option>
            <option value="wow">WoW Forever</option>
          </select>
        </label>
        <label className="gaming-check">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          <span>Quelle aktiv</span>
        </label>
      </div>
      {message ? <p className="gaming-form-message">{message}</p> : null}
    </GamingModal>
  );
}

export function GamingNews({ gaming, scope = 'general' }: { gaming: GamingState; scope?: 'general' | 'wow' }) {
  const snapshot = gaming.snapshot;
  const [editing, setEditing] = useState<GamingSource | 'new' | null>(null);
  const sources = snapshot.sources.filter((source) => source.game === scope);
  const articles = snapshot.articles.filter((article) =>
    scope === 'wow' ? article.game === 'wow' : article.game !== 'wow',
  );
  const [kind, setKind] = useState<'all' | GamingSourceKind>('all');
  const filtered = kind === 'all' ? articles : articles.filter((article) => article.kind === kind);

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">{scope === 'wow' ? 'WOW FOREVER · NEWS' : 'GAMING INTELLIGENCE · NEWS'}</span>
          <h2>{scope === 'wow' ? 'WoW-Neuigkeiten' : 'Gaming News'}</h2>
          <p>
            {articles.length
              ? `${articles.length} ${articles.length === 1 ? 'Meldung' : 'Meldungen'} aus ${
                  sources.filter((source) => source.enabled).length
                } ${sources.filter((source) => source.enabled).length === 1 ? 'aktiver Quelle' : 'aktiven Quellen'}.`
              : 'Konfiguriere RSS-Quellen, um Meldungen zu laden. Es werden keine Inhalte erfunden.'}
          </p>
        </div>
        <div className="gaming-head-actions">
          <button type="button" className="gaming-button is-ghost" onClick={() => setEditing('new')}>
            + Quelle
          </button>
          <button
            type="button"
            className="gaming-button is-primary"
            onClick={() => void gaming.refreshNews()}
            disabled={!sources.length || gaming.busy === 'news'}
          >
            {gaming.busy === 'news' ? 'Lädt …' : 'News aktualisieren'}
          </button>
        </div>
      </header>

      {sources.length ? (
        <div className="gaming-source-strip">
          {sources.map((source) => (
            <div key={source.id} className={`gaming-source-chip ${source.enabled ? '' : 'is-off'}`}>
              <button
                type="button"
                className="gaming-source-toggle"
                title={source.enabled ? 'Quelle deaktivieren' : 'Quelle aktivieren'}
                onClick={() => void gaming.saveSource({ ...source, enabled: !source.enabled })}
              >
                <span />
              </button>
              <span>{source.name}</span>
              <small>{KIND_LABEL[source.kind]}</small>
              <button type="button" className="gaming-source-edit" onClick={() => setEditing(source)} aria-label={`${source.name} bearbeiten`}>
                ✎
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="gaming-inline-warning">
          <strong>Noch keine Informationsquelle</strong>
          <span>Füge einen RSS-Feed hinzu — zum Beispiel die offizielle News-Seite deines Servers. Die Quelle wird lokal gespeichert.</span>
        </div>
      )}

      {articles.length ? (
        <div className="gaming-filter-row">
          <button type="button" className={kind === 'all' ? 'is-active' : ''} onClick={() => setKind('all')}>
            Alle
          </button>
          {WOW_CATEGORIES.map((entry) => (
            <button key={entry.id} type="button" className={kind === entry.id ? 'is-active' : ''} onClick={() => setKind(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length ? (
        <div className="gaming-articles">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} onOpen={() => void gaming.openGuide(article.url)} />
          ))}
        </div>
      ) : (
        <GamingEmpty
          title={sources.length ? 'Keine Meldungen' : 'News noch nicht konfiguriert'}
          text={
            sources.length
              ? 'Aktualisiere die Quellen oder prüfe, ob der Feed erreichbar ist.'
              : 'Der Hub nutzt ausschließlich Quellen, die du selbst hinterlegst.'
          }
          action={
            sources.length ? (
              <button type="button" className="gaming-button is-primary" onClick={() => void gaming.refreshNews()} disabled={gaming.busy === 'news'}>
                Jetzt laden
              </button>
            ) : (
              <button type="button" className="gaming-button is-primary" onClick={() => setEditing('new')}>
                Quelle hinzufügen
              </button>
            )
          }
        />
      )}

      {editing ? (
        <SourceEditor gaming={gaming} scope={scope} source={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

function ArticleCard({ article, onOpen }: { article: GamingArticle; onOpen: () => void }) {
  return (
    <article className="gaming-article">
      <div className="gaming-article-meta">
        <span>{article.sourceName}</span>
        <small>
          {KIND_LABEL[article.kind]} · {formatDate(articleTimestamp(article))}
        </small>
      </div>
      <button type="button" className="gaming-article-title" onClick={onOpen}>
        {article.title}
      </button>
      {article.summary ? <p>{article.summary}</p> : null}
      <div className="gaming-article-footer">
        <span className="gaming-muted">Vollständigen Beitrag im Browser öffnen</span>
        <button type="button" className="gaming-button is-ghost is-small" onClick={onOpen}>
          Öffnen ↗
        </button>
      </div>
    </article>
  );
}

function GuideEditor({
  gaming,
  scope,
  guide,
  onClose,
}: {
  gaming: GamingState;
  scope: 'general' | 'wow';
  guide?: GamingGuide;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    id: guide?.id ?? '',
    title: guide?.title ?? '',
    url: guide?.url ?? '',
    category: guide?.category ?? ('general' as GamingSourceKind),
    game: guide?.game ?? scope,
    summary: guide?.summary ?? '',
  });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!draft.title.trim() || !draft.url.trim()) {
      setMessage('Titel und Adresse sind erforderlich.');
      return;
    }
    setSaving(true);
    const result = await gaming.saveGuide(draft);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error || 'Der Guide konnte nicht gespeichert werden.');
      return;
    }
    onClose();
  };

  return (
    <GamingModal
      title={guide ? 'Guide bearbeiten' : 'Guide hinzufügen'}
      hint="Ein Link zu einem Guide, einer Patchnote oder einer offiziellen Seite. Inhalte werden lokal gespeichert, nicht automatisch kopiert."
      onClose={onClose}
      footer={
        <>
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
        <label className="is-wide">
          <span>Titel</span>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="z. B. Raid-Guide: Der nächste Progression-Raid" />
        </label>
        <label className="is-wide">
          <span>Adresse</span>
          <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://…" />
        </label>
        <label>
          <span>Kategorie</span>
          <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as GamingSourceKind })}>
            {WOW_CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Bereich</span>
          <select value={draft.game} onChange={(event) => setDraft({ ...draft, game: event.target.value })}>
            <option value="general">Gaming allgemein</option>
            <option value="wow">WoW Forever</option>
            {gaming.snapshot.games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </label>
        <label className="is-wide">
          <span>Kurzbeschreibung</span>
          <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} rows={3} maxLength={400} />
        </label>
      </div>
      {message ? <p className="gaming-form-message">{message}</p> : null}
    </GamingModal>
  );
}

export function GamingGuides({ gaming, scope = 'general' }: { gaming: GamingState; scope?: 'general' | 'wow' }) {
  const snapshot = gaming.snapshot;
  const [editing, setEditing] = useState<GamingGuide | 'new' | null>(null);
  const [category, setCategory] = useState<'all' | GamingSourceKind>('all');
  const [search, setSearch] = useState('');
  const gameName = (id: string) => snapshot.games.find((game) => game.id === id)?.name ?? (id === 'wow' ? 'WoW Forever' : 'Allgemein');
  const guides = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return snapshot.guides
      .filter((guide) => (scope === 'wow' ? guide.game === 'wow' : guide.game !== 'wow'))
      .filter((guide) => (category === 'all' ? true : guide.category === category))
      .filter((guide) => (!needle ? true : `${guide.title} ${guide.summary} ${gameName(guide.game)}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [snapshot.guides, scope, category, search, snapshot.games]);

  const remove = async (guide: GamingGuide) => {
    if (!window.confirm(`Guide „${guide.title}“ löschen?`)) return;
    await gaming.removeGuide(guide.id);
  };

  return (
    <section className="gaming-view">
      <header className="gaming-view-head">
        <div>
          <span className="gaming-eyebrow">{scope === 'wow' ? 'WOW FOREVER · WISSEN' : 'GAMING · WISSEN'}</span>
          <h2>{scope === 'wow' ? 'WoW-Guides' : 'Guides & Wissen'}</h2>
          <p>Raid-, Dungeon- und Klassen-Guides sowie Patchnotes als lokale Sammlung nützlicher Quellen.</p>
        </div>
        <button type="button" className="gaming-button is-primary" onClick={() => setEditing('new')}>
          + Guide hinzufügen
        </button>
      </header>

      <div className="gaming-toolbar">
        <label className="gaming-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Guides durchsuchen" />
        </label>
        <div className="gaming-filter-row">
          <button type="button" className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>
            Alle
          </button>
          {WOW_CATEGORIES.filter((entry) => entry.id !== 'news').map((entry) => (
            <button key={entry.id} type="button" className={category === entry.id ? 'is-active' : ''} onClick={() => setCategory(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {guides.length ? (
        <div className="gaming-guides">
          {guides.map((guide) => (
            <article key={guide.id} className="gaming-guide-card">
              <div className="gaming-guide-top">
                <span className={`gaming-kind kind-${guide.category}`}>{KIND_LABEL[guide.category]}</span>
                <button type="button" className="gaming-icon-button" onClick={() => setEditing(guide)} aria-label="Guide bearbeiten">
                  ✎
                </button>
              </div>
              <h3>{guide.title}</h3>
              <small>{gameName(guide.game)}</small>
              <p>{guide.summary || 'Keine Kurzbeschreibung hinterlegt.'}</p>
              <div className="gaming-guide-actions">
                <button type="button" className="gaming-button is-primary is-small" onClick={() => void gaming.openGuide(guide.url)}>
                  Öffnen ↗
                </button>
                <button type="button" className="gaming-button is-ghost is-small" onClick={() => void remove(guide)}>
                  Löschen
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <GamingEmpty
          title="Noch keine Guides"
          text="Füge Links zu Raid-, Dungeon- oder Klassen-Guides hinzu. Du kannst später Profile und Spiele damit verknüpfen."
          action={
            <button type="button" className="gaming-button is-primary" onClick={() => setEditing('new')}>
              Ersten Guide anlegen
            </button>
          }
        />
      )}

      {editing ? (
        <GuideEditor gaming={gaming} scope={scope} guide={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}
