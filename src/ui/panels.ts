import type { Lang, Rules } from '../core/types';
import { fill, type Strings } from '../data/i18n';
import { button, node } from './dom';
import { motionOff, soundOn, storeLang, storeMotionOff, storeSoundOn } from './prefs';

export interface SettingsActions {
  exportSave(): void;
  /** Loads a save from the text of a file; returns false if it is not usable. */
  importSave(text: string): boolean;
  restart(): void;
  restartTutorial(): void;
  /** Called when a preference that affects drawing has changed. */
  changed(): void;
}

function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = node('label', undefined, 'option');
  const box = node('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  row.append(box, node('span', label));
  return row;
}

export function showSettings(
  dialog: HTMLDialogElement,
  t: Strings,
  lang: Lang,
  actions: SettingsActions,
): void {
  const language = node('label', undefined, 'option');
  const select = node('select');
  for (const [value, name] of [
    ['de', 'Deutsch'],
    ['en', 'English'],
  ] as const) {
    const option = node('option', name);
    option.value = value;
    select.append(option);
  }
  select.value = lang;
  select.addEventListener('change', () => {
    storeLang(select.value as Lang);
    // Every text on the page changes, so start afresh; the game itself is saved.
    window.location.reload();
  });
  language.append(node('span', t.language), select);

  const file = node('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.hidden = true;
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    void chosen.text().then((text) => {
      if (actions.importSave(text)) dialog.close();
      else window.alert(t.importFailed);
      file.value = '';
    });
  });

  const saves = node('div', undefined, 'actions start');
  saves.append(
    button(t.exportSave, actions.exportSave),
    button(t.importSave, () => file.click()),
    button(t.restart, () => {
      if (!window.confirm(t.restartConfirm)) return;
      dialog.close();
      actions.restart();
    }),
    file,
  );

  const footer = node('div', undefined, 'actions');
  footer.append(
    button(t.tutorialRestart, () => {
      dialog.close();
      actions.restartTutorial();
    }),
    button(t.close, () => dialog.close(), 'primary'),
  );

  dialog.replaceChildren(
    node('h2', t.settings),
    language,
    checkbox(t.animations, !motionOff(), (on) => {
      storeMotionOff(!on);
      actions.changed();
    }),
    checkbox(t.sound, soundOn(), storeSoundOn),
    node('h3', t.saveGame),
    saves,
    footer,
  );
  dialog.showModal();
}

export function showHelp(dialog: HTMLDialogElement, t: Strings, rules: Rules): void {
  dialog.replaceChildren(node('h2', t.help));
  for (const [heading, text] of t.helpText) {
    dialog.append(node('h3', heading), node('p', text));
  }

  // What each housing level asks for, straight from the rules.
  dialog.append(node('h3', t.helpLevels));
  const levels = node('dl', undefined, 'glossary');
  let known = new Set<string>();
  rules.housing.forEach((level, i) => {
    const added = level.needs.filter((n) => !known.has(n));
    known = new Set(level.needs);
    const needs = added.map((n) => t.need[n]).join(', ');
    levels.append(
      node('dt', `${t.houseLevel[i] ?? level.level} (${level.capacity} ${t.inhabitants})`),
      node('dd', i === 0 ? needs : `+ ${needs}`),
    );
  });
  dialog.append(levels);

  dialog.append(node('h3', t.helpKeys));
  const keys = node('dl', undefined, 'glossary keys');
  for (const [key, what] of t.keys) keys.append(node('dt', key), node('dd', what));
  dialog.append(keys);

  const footer = node('div', undefined, 'actions');
  const close = button(t.close, () => dialog.close(), 'primary');
  footer.append(close);
  dialog.append(footer);
  dialog.showModal();
  dialog.scrollTop = 0;
}

export function stepLabel(t: Strings, index: number, total: number): string {
  return fill(t.stepOf, { a: index + 1, b: total });
}
