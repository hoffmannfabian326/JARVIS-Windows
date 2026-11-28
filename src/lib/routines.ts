import type { JarvisContext, JarvisReply } from './intents';
import { getWeatherReport } from './weather';

/**
 * Routinen bündeln mehrere Schritte unter einem Befehl. Sie laufen lokal in der
 * Befehl-Engine: kein Sprachmodell, keine Kosten, keine Netzabhängigkeit außer
 * beim Wetter. Jeder Schritt ist unabhängig — fällt einer aus, sprechen die
 * übrigen weiter und der Ausfall wird in einem kurzen Satz genannt. Kein Schritt
 * verändert etwas, deshalb gibt es nichts abzubrechen.
 */

export type RoutineId = 'morgen' | 'feierabend';

export interface RoutineStep {
  run: (ctx: JarvisContext) => Promise<{ speak: string; ok?: boolean }>;
}

export interface Routine {
  id: RoutineId;
  name: string;
  trigger: string;
  phrases: RegExp[];
  steps: RoutineStep[];
}

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long' });

/** Sprechbare Uhrzeit: "7 Uhr 42" statt "07:42", das liest jede Stimme falsch. */
function spokenTime(at: number): string {
  const date = new Date(at);
  const minute = date.getMinutes();
  return `${date.getHours()} Uhr${minute === 0 ? '' : ` ${minute}`}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function clip(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function activeTimers(ctx: JarvisContext) {
  const list = Array.isArray(ctx.timers) ? ctx.timers : [];
  return [...list].sort((a, b) => a.due - b.due);
}

const MORGEN: Routine = {
  id: 'morgen',
  name: 'Morgenroutine',
  trigger: 'Guten Morgen',
  phrases: [
    /^guten morgen$/,
    /^(starte |mach )?(die )?morgen ?routine$/,
    /^routine (für den |fuer den )?morgen$/,
    /^(starte|beginne) den tag$/,
  ],
  steps: [
    {
      async run() {
        const now = new Date();
        return {
          speak:
            `Guten Morgen. Es ist ${spokenTime(now.getTime())}. ` +
            `${WEEKDAY.format(now)}, der ${now.getDate()}. ${MONTH.format(now)}.`,
        };
      },
    },
    {
      async run(ctx) {
        const city = String(ctx.settings.city ?? '').trim();
        if (!city) {
          return {
            speak: 'Für das Wetter fehlt eine Stadt in den Einstellungen.',
            ok: false,
          };
        }
        try {
          return { speak: await getWeatherReport(city) };
        } catch {
          return { speak: 'Das Wetter konnte ich gerade nicht abrufen.', ok: false };
        }
      },
    },
    {
      async run(ctx) {
        const timers = activeTimers(ctx);
        if (!timers.length) return { speak: 'Keine Timer gestellt.' };
        const next = timers[0];
        const rest = timers.length - 1;
        return {
          speak:
            `Der nächste Zeitgeber: ${next.label} um ${spokenTime(next.due)}.` +
            (rest === 0 ? '' : rest === 1 ? ' Danach noch einer.' : ` Danach noch ${rest} weitere.`),
        };
      },
    },
    {
      async run(ctx) {
        if (!ctx.notes.length) return { speak: 'Die Notizliste ist leer.' };
        const latest = ctx.notes[ctx.notes.length - 1];
        return {
          speak:
            `${plural(ctx.notes.length, 'Notiz', 'Notizen')} auf der Liste. ` +
            `Zuletzt: ${clip(latest.text)}.`,
        };
      },
    },
    {
      async run(ctx) {
        if (!ctx.memory.count) return { speak: '' };
        return {
          speak: `Ich habe ${plural(ctx.memory.count, 'Erinnerung', 'Erinnerungen')} gespeichert.`,
        };
      },
    },
  ],
};

const FEIERABEND: Routine = {
  id: 'feierabend',
  name: 'Feierabendroutine',
  trigger: 'Feierabend',
  phrases: [
    /^feier ?abend$/,
    /^(starte |mach )?(die )?feierabend ?routine$/,
    /^routine (für den |fuer den )?feierabend$/,
    /^tag beenden$/,
    /^arbeitsende$/,
  ],
  steps: [
    {
      async run() {
        return { speak: `Feierabend. Es ist ${spokenTime(Date.now())}.` };
      },
    },
    {
      async run(ctx) {
        const timers = activeTimers(ctx);
        if (!timers.length) return { speak: 'Keine Timer mehr offen.' };
        const next = timers[0];
        return {
          speak:
            `${plural(timers.length, 'Timer läuft', 'Timer laufen')} noch. ` +
            `Der nächste: ${next.label} um ${spokenTime(next.due)}.`,
        };
      },
    },
    {
      async run(ctx) {
        if (!ctx.notes.length) return { speak: 'Die Notizliste ist leer.' };
        const latest = ctx.notes[ctx.notes.length - 1];
        const count = ctx.notes.length;
        return {
          speak:
            (count === 1
              ? 'Auf der Liste steht noch eine Notiz.'
              : `Auf der Liste stehen noch ${count} Notizen.`) + ` Zuletzt: ${clip(latest.text)}.`,
        };
      },
    },
    {
      async run(ctx) {
        const now = Date.now();
        const alarm = activeTimers(ctx).filter((timer) => timer.kind === 'alarm' && timer.due > now)[0];
        if (!alarm) return { speak: 'Für später ist kein Wecker gestellt.' };
        return { speak: `Der nächste Wecker steht auf ${spokenTime(alarm.due)}.` };
      },
    },
    {
      async run() {
        return { speak: 'Zum Sperren sage: Rechner sperren.' };
      },
    },
  ],
};

export const ROUTINES: Routine[] = [MORGEN, FEIERABEND];

/** Erkennt den Routine-Befehl. Gibt null zurück, wenn keiner passt. */
export function matchRoutine(raw: string): Routine | null {
  const text = raw
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return ROUTINES.find((routine) => routine.phrases.some((phrase) => phrase.test(text))) ?? null;
}

/** Führt alle Schritte der Reihe nach aus und fügt die Sätze zusammen. */
export async function runRoutine(routine: Routine, ctx: JarvisContext): Promise<JarvisReply> {
  const parts: string[] = [];
  for (const step of routine.steps) {
    try {
      const result = await step.run(ctx);
      if (result.speak) parts.push(result.speak);
    } catch {
      /* Ein Schritt darf die übrigen nicht mitreißen. */
    }
  }
  if (!parts.length) return { speak: 'Die Routine konnte nicht ausgeführt werden.' };
  return { speak: parts.join(' ') };
}
