use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};
pub type Result<T> = std::result::Result<T, String>;
fn db_error(_: rusqlite::Error) -> String {
    "Lokale Datenbankoperation fehlgeschlagen. Datenverzeichnis und freien Speicher prüfen.".into()
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Entry {
    #[serde(default)]
    pub id: i64,
    pub title: String,
    pub body: String,
    pub category: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
    #[serde(default)]
    pub updated: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Source {
    pub label: String,
    pub entry_id: i64,
    pub title: String,
    pub source: String,
    pub start_char: usize,
    pub end_char: usize,
    pub text: String,
    pub updated: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}
#[derive(Serialize)]
pub struct MemoryStats {
    pub entries: i64,
    pub documents: i64,
    pub chunks: i64,
    pub database_bytes: u64,
    pub chats: i64,
}
#[derive(Serialize, Deserialize)]
pub struct Export {
    pub schema_version: u32,
    pub entries: Vec<Entry>,
}
pub trait KnowledgeSearch {
    fn search(&self, query: &str, limit: usize) -> Result<Vec<Source>>;
}
pub struct Memory {
    pub connection: Connection,
}
pub fn chunk_text(text: &str) -> Vec<(usize, usize, String)> {
    let chars: Vec<char> = text.chars().collect();
    let mut result = vec![];
    let mut start = 0;
    while start < chars.len() {
        let mut end = (start + 1200).min(chars.len());
        if end < chars.len() {
            if let Some(index) = (start + 600..end).rev().find(|&i| chars[i] == '\n') {
                end = index + 1;
            } else if let Some(index) = (start + 600..end).rev().find(|&i| chars[i].is_whitespace())
            {
                end = index + 1;
            }
        }
        let value: String = chars[start..end].iter().collect();
        if !value.trim().is_empty() {
            result.push((start, end, value));
        }
        if end == chars.len() {
            break;
        }
        start = (end.saturating_sub(120)).max(start + 1);
    }
    result
}
fn validate(entry: &Entry) -> Result<()> {
    if entry.title.trim().is_empty()
        || entry.title.chars().count() > 240
        || entry.body.trim().is_empty()
        || entry.body.chars().count() > 500_000
        || entry.source.len() > 1024
        || entry.metadata.len() > 16
        || entry
            .metadata
            .iter()
            .any(|(k, v)| k.len() > 50 || v.len() > 500)
    {
        return Err("Titel, Inhalt oder Metadaten ungültig (maximal 500.000 Textzeichen).".into());
    }
    if ![
        "Projekt",
        "Technik",
        "Präferenz",
        "Dokumentation",
        "WoW Forever",
        "Wissen",
        "Chat",
    ]
    .contains(&entry.category.as_str())
    {
        return Err("Unbekannte Wissenskategorie.".into());
    }
    Ok(())
}
impl Memory {
    pub fn open(path: &Path) -> Result<Self> {
        Self::from_connection(Connection::open(path).map_err(db_error)?)
    }
    pub fn from_connection(connection: Connection) -> Result<Self> {
        connection
            .busy_timeout(std::time::Duration::from_secs(3))
            .map_err(db_error)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(db_error)?;
        if version > 1 {
            return Err(
                "Datenbank stammt aus einer neueren Version; keine Änderungen vorgenommen.".into(),
            );
        }
        connection
            .execute_batch("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;")
            .map_err(db_error)?;
        if version == 0 {
            connection.execute_batch("BEGIN IMMEDIATE;
          CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE entries(id INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,category TEXT NOT NULL,source TEXT NOT NULL,metadata TEXT NOT NULL,updated TEXT NOT NULL);
          CREATE TABLE chunks(id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,start_char INTEGER NOT NULL,end_char INTEGER NOT NULL,text TEXT NOT NULL);
          CREATE VIRTUAL TABLE chunks_fts USING fts5(text,tokenize='unicode61 remove_diacritics 2');
          CREATE TABLE chats(id INTEGER PRIMARY KEY,question TEXT NOT NULL,answer TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
          PRAGMA user_version=1; COMMIT;").map_err(db_error)?;
        }
        Ok(Self { connection })
    }
    pub fn setting<T: for<'a> Deserialize<'a>>(&self, key: &str, default: T) -> Result<T> {
        use rusqlite::OptionalExtension;
        let raw: Option<String> = self
            .connection
            .query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(db_error)?;
        raw.map(|s| {
            serde_json::from_str(&s).map_err(|_| "Lokale Einstellung beschädigt.".to_owned())
        })
        .unwrap_or(Ok(default))
    }
    pub fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let raw = serde_json::to_string(value).map_err(|_| "Einstellung ungültig.")?;
        self.connection.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,raw]).map_err(db_error)?;
        Ok(())
    }
    pub fn list(&self, query: &str) -> Result<Vec<Entry>> {
        let mut stmt=self.connection.prepare("SELECT id,title,body,category,source,metadata,updated FROM entries WHERE instr(lower(title||' '||body||' '||metadata),lower(?))>0 ORDER BY id DESC LIMIT 1000").map_err(db_error)?;
        let result = stmt
            .query_map([query], |r| {
                Ok(Entry {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    body: r.get(2)?,
                    category: r.get(3)?,
                    source: r.get(4)?,
                    metadata: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
                    updated: r.get(6)?,
                })
            })
            .map_err(db_error)?;
        result
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)
    }
    fn write_entry(connection: &Connection, entry: &Entry, preserve_date: bool) -> Result<i64> {
        validate(entry)?;
        let metadata =
            serde_json::to_string(&entry.metadata).map_err(|_| "Ungültige Metadaten.")?;
        let id = if entry.id > 0 {
            let count=connection.execute("UPDATE entries SET title=?,body=?,category=?,source=?,metadata=?,updated=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?",params![entry.title,entry.body,entry.category,entry.source,metadata,entry.id]).map_err(db_error)?;
            if count == 0 {
                return Err("Eintrag existiert nicht mehr.".into());
            }
            entry.id
        } else {
            connection.execute("INSERT INTO entries(title,body,category,source,metadata,updated) VALUES(?,?,?,?,?,CASE WHEN ?<>'' THEN ? ELSE strftime('%Y-%m-%dT%H:%M:%SZ','now') END)",params![entry.title,entry.body,entry.category,entry.source,metadata,if preserve_date {&entry.updated}else{""},entry.updated]).map_err(db_error)?;
            connection.last_insert_rowid()
        };
        connection
            .execute(
                "DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE entry_id=?)",
                [id],
            )
            .map_err(db_error)?;
        connection
            .execute("DELETE FROM chunks WHERE entry_id=?", [id])
            .map_err(db_error)?;
        for (start, end, text) in chunk_text(&entry.body) {
            connection
                .execute(
                    "INSERT INTO chunks(entry_id,start_char,end_char,text) VALUES(?,?,?,?)",
                    params![id, start as i64, end as i64, text],
                )
                .map_err(db_error)?;
            connection
                .execute(
                    "INSERT INTO chunks_fts(rowid,text) VALUES(?,?)",
                    params![
                        connection.last_insert_rowid(),
                        format!(
                            "{}\n{}\n{}\n{}",
                            entry.title, entry.category, metadata, text
                        )
                    ],
                )
                .map_err(db_error)?;
        }
        Ok(id)
    }
    pub fn save(&mut self, entry: &Entry) -> Result<i64> {
        let tx = self.connection.transaction().map_err(db_error)?;
        let id = Self::write_entry(&tx, entry, false)?;
        tx.commit().map_err(db_error)?;
        Ok(id)
    }
    pub fn delete(&mut self, id: i64) -> Result<()> {
        let tx = self.connection.transaction().map_err(db_error)?;
        tx.execute(
            "DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE entry_id=?)",
            [id],
        )
        .map_err(db_error)?;
        tx.execute("DELETE FROM entries WHERE id=?", [id])
            .map_err(db_error)?;
        tx.commit().map_err(db_error)
    }
    pub fn export(&self) -> Result<String> {
        // Export every entry, not the 1,000-row browsing window.
        let mut entries = vec![];
        let mut stmt = self
            .connection
            .prepare(
                "SELECT id,title,body,category,source,metadata,updated FROM entries ORDER BY id",
            )
            .map_err(db_error)?;
        let mut rows = stmt.query([]).map_err(db_error)?;
        while let Some(r) = rows.next().map_err(db_error)? {
            entries.push(Entry {
                id: r.get(0).map_err(db_error)?,
                title: r.get(1).map_err(db_error)?,
                body: r.get(2).map_err(db_error)?,
                category: r.get(3).map_err(db_error)?,
                source: r.get(4).map_err(db_error)?,
                metadata: serde_json::from_str(&r.get::<_, String>(5).map_err(db_error)?)
                    .map_err(|_| "Metadaten beschädigt.")?,
                updated: r.get(6).map_err(db_error)?,
            });
        }
        serde_json::to_string_pretty(&Export {
            schema_version: 1,
            entries,
        })
        .map_err(|_| "Export fehlgeschlagen.".into())
    }
    pub fn import(&mut self, json: &str) -> Result<usize> {
        if json.len() > 10_000_000 {
            return Err("Import auf 10 MB begrenzt.".into());
        }
        let mut data: Export =
            serde_json::from_str(json).map_err(|_| "Ungültiges Gedächtnis-JSON.")?;
        if data.schema_version != 1 || data.entries.len() > 2000 {
            return Err("Unbekannte Exportversion oder zu viele Einträge.".into());
        }
        for entry in &mut data.entries {
            entry.id = 0;
            validate(entry)?;
            if entry.updated.len() > 40 {
                return Err("Ungültiger Zeitstempel.".into());
            }
        }
        let tx = self.connection.transaction().map_err(db_error)?;
        for entry in &data.entries {
            Self::write_entry(&tx, entry, true)?;
        }
        tx.commit().map_err(db_error)?;
        Ok(data.entries.len())
    }
    pub fn clear(&mut self, confirmation: &str) -> Result<()> {
        if confirmation != "ALLES LÖSCHEN" {
            return Err("Bitte ALLES LÖSCHEN bestätigen.".into());
        }
        self.connection.execute_batch("BEGIN IMMEDIATE; DROP TABLE chunks_fts; CREATE VIRTUAL TABLE chunks_fts USING fts5(text,tokenize='unicode61 remove_diacritics 2'); DELETE FROM chunks; DELETE FROM entries; DELETE FROM chats; COMMIT; VACUUM;").map_err(db_error)
    }
    pub fn stats(&self) -> Result<MemoryStats> {
        let count = |sql| {
            self.connection
                .query_row(sql, [], |r| r.get::<_, i64>(0))
                .map_err(db_error)
        };
        Ok(MemoryStats {
            entries: count("SELECT count(*) FROM entries")?,
            documents: count("SELECT count(*) FROM entries WHERE source<>''")?,
            chunks: count("SELECT count(*) FROM chunks")?,
            chats: count("SELECT count(*) FROM chats")?,
            database_bytes: (count("PRAGMA page_count")? * count("PRAGMA page_size")?) as u64,
        })
    }
    pub fn save_chat(
        &self,
        question: &str,
        answer: &str,
        provider: &str,
        model: &str,
    ) -> Result<()> {
        self.connection
            .execute(
                "INSERT INTO chats(question,answer,provider,model) VALUES(?,?,?,?)",
                params![question, answer, provider, model],
            )
            .map_err(db_error)?;
        Ok(())
    }
    pub fn chats(&self) -> Result<Vec<serde_json::Value>> {
        let mut stmt = self
            .connection
            .prepare("SELECT id,question,answer,provider,model,created FROM chats ORDER BY id DESC")
            .map_err(db_error)?;
        let result=stmt.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,i64>(0)?,"question":r.get::<_,String>(1)?,"answer":r.get::<_,String>(2)?,"provider":r.get::<_,String>(3)?,"model":r.get::<_,String>(4)?,"created":r.get::<_,String>(5)?}))).map_err(db_error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(db_error);
        result
    }
}
impl KnowledgeSearch for Memory {
    fn search(&self, query: &str, limit: usize) -> Result<Vec<Source>> {
        let terms: Vec<String> = query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| {
                !s.is_empty()
                    && ![
                        "und", "oder", "die", "der", "das", "ein", "eine", "ist", "sind", "wie",
                        "was", "wo", "im", "in", "am", "an", "für", "mit", "zu", "von", "auf",
                        "ich", "du", "mir", "bitte", "kann", "kannst", "man", "es", "den", "dem",
                        "des",
                    ]
                    .contains(&s.to_lowercase().as_str())
            })
            .take(24)
            .map(|s| format!("\"{}\"", s))
            .collect();
        if terms.is_empty() {
            return Ok(vec![]);
        }
        let mut statement=self.connection.prepare("SELECT e.id,e.title,e.source,c.start_char,c.end_char,c.text,e.updated,e.metadata FROM chunks_fts f JOIN chunks c ON c.id=f.rowid JOIN entries e ON e.id=c.entry_id WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?").map_err(db_error)?;
        let rows = statement
            .query_map(params![terms.join(" OR "), limit.min(5) as i64], |r| {
                Ok(Source {
                    label: String::new(),
                    entry_id: r.get(0)?,
                    title: r.get(1)?,
                    source: r.get(2)?,
                    start_char: r.get::<_, i64>(3)? as usize,
                    end_char: r.get::<_, i64>(4)? as usize,
                    text: r.get(5)?,
                    updated: r.get(6)?,
                    metadata: serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or_default(),
                })
            })
            .map_err(db_error)?;
        let mut results = rows
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)?;
        for (i, result) in results.iter_mut().enumerate() {
            result.label = format!("S{}", i + 1);
        }
        Ok(results)
    }
}
pub fn extract(name: &str, bytes: &[u8]) -> Result<String> {
    if bytes.is_empty() || bytes.len() > 10_000_000 {
        return Err("Datei muss zwischen 1 Byte und 10 MB groß sein.".into());
    }
    let text=match name.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "txt"|"md"|"markdown"=>String::from_utf8(bytes.to_vec()).map_err(|_|"Textdatei muss UTF-8 kodiert sein.")?,
        "pdf"=>pdf_extract::extract_text_from_mem(bytes).map_err(|_|"PDF-Text konnte nicht extrahiert werden (verschlüsselt, beschädigt oder nicht unterstützt).")?,
        _=>return Err("Nur TXT, Markdown und PDF werden unterstützt.".into()),
    };
    if text.trim().is_empty() {
        return Err("Keine extrahierbaren Texte; Bild-/Scan-PDFs benötigen vorher OCR.".into());
    }
    if text.chars().count() > 500_000 {
        return Err("Extrahierter Text übersteigt 500.000 Zeichen.".into());
    }
    Ok(text.trim_start_matches('\u{feff}').to_owned())
}
