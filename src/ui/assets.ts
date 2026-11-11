import { BUILD_MENU, BUILDINGS } from '../data/buildings';
import type { Strings } from '../data/i18n';
import { buildingIcon } from '../render/renderer';

/** Shows every building drawing large, side by side, in two seasons. */
export function showAssetSheet(t: Strings): void {
  const sheet = document.createElement('div');
  sheet.className = 'asset-sheet';
  const add = (label: string, ...pictures: HTMLCanvasElement[]) => {
    const cell = document.createElement('figure');
    for (const picture of pictures) cell.append(picture);
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    cell.append(caption);
    sheet.append(cell);
  };
  const house = BUILDINGS.house!;
  t.houseLevel.forEach((name, i) => {
    add(name, buildingIcon(house, 150, 130, { level: i + 1 }));
  });
  add(`${t.houseLevel[3]} ×2`, buildingIcon(house, 190, 130, { level: 4, merged: true }));
  add(`${t.houseLevel[4]} ×2`, buildingIcon(house, 190, 130, { level: 5, merged: true }));
  add(
    `${t.houseLevel[2]} (${t.season.winter})`,
    buildingIcon(house, 150, 130, { level: 3, season: 3 }),
  );
  for (const id of BUILD_MENU) {
    if (id === 'house') continue;
    const def = BUILDINGS[id]!;
    const big = def.size.w * def.size.h > 6;
    add(t.building[id], buildingIcon(def, big ? 300 : 190, big ? 240 : 150));
  }
  document.body.replaceChildren(sheet);
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';
}
