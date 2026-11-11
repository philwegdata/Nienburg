# Nienburg – Umsetzungsplan

Ein gemütlicher, rundenbasierter Mittelalter-Städtebauer für den Browser.
Kernidee: **Der Platz innerhalb der Stadtmauer ist von Anfang an fest begrenzt.**
Die Herausforderung ist nicht Expansion, sondern kluges Verdichten – wie in Carcassonne,
wo sich Häuser, Gassen, Markt und Kirche auf einem Hügel drängen.

Dieses Dokument ist so geschrieben, dass eine KI (oder ein Mensch) es Phase für Phase
abarbeiten kann. Jede Phase endet mit einem spielbaren, deploybaren Stand und hat
überprüfbare Abnahmekriterien.

---

## 1. Leitplanken (gelten für alle Phasen)

| Thema     | Entscheidung                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genre     | Städtebau mit Versorgungs-/Wohnhaus-Aufstiegs-Mechanik, eigenständiges Spiel (keine Nachbildung eines bestehenden Titels: eigene Grafik, eigene Namen, eigene Regeln) |
| Stimmung  | Cozy. Kein Krieg, keine Gegner, kein Game Over. Rückschläge sind mild und reparierbar.                                                                                |
| Zeit      | Rundenbasiert: 1 Runde = 1 Jahreszeit, 4 Runden = 1 Jahr                                                                                                              |
| Platz     | Feste Stadtmaske pro Karte, nicht erweiterbar. Wachstum nur durch Umbau, Aufstocken, bessere Anordnung.                                                               |
| Plattform | Browser (Desktop + Tablet/Handy), rein statisch, kein Backend                                                                                                         |
| Hosting   | GitHub Pages, automatisches Deployment per GitHub Actions                                                                                                             |
| Sprache   | Deutsch und Englisch (i18n von Anfang an), Code und Kommentare auf Englisch                                                                                           |
| Grafik    | Selbst gezeichnet per Code (Canvas), keine fremden Assets → keine Lizenzfragen                                                                                        |
| Speichern | `localStorage` (Autosave pro Runde) + Export/Import als JSON-Datei                                                                                                    |

### Tech-Stack

- **TypeScript** (strict) + **Vite** als Build-Tool
- **Canvas 2D** für die Karte (isometrische 2:1-Ansicht), **HTML/CSS** für das gesamte UI (Panels, Menüs, Tooltips)
- **Kein Framework, keine Game-Engine.** Das Spiel ist rundenbasiert und klein; Abhängigkeiten nur für Build und Test.
- **Vitest** für Unit-Tests der Spiellogik, **Playwright** für einen Smoke-Test (Spiel lädt, eine Runde lässt sich spielen)
- **ESLint + Prettier**

### Architekturprinzip: Simulation strikt von Darstellung trennen

```
src/
  core/            # reine Spiellogik, KEIN DOM, KEIN Canvas, deterministisch
    types.ts       # GameState, Tile, Building, ...
    rng.ts         # seedbarer Zufallsgenerator (mulberry32)
    grid.ts        # Rasterhilfen, Nachbarn, Flood-Fill, Wegdistanz
    actions.ts     # placeBuilding, demolish, upgrade, endTurn → (state, action) => state
    sim/
      coverage.ts  # Versorgungsreichweiten über das Wegenetz
      economy.ts   # Produktion, Verbrauch, Steuern
      housing.ts   # Aufstieg/Abstieg der Wohnhäuser
      appeal.ts    # Wohnqualität (Enge, Gestank, Grün)
      events.ts    # milde Zufallsereignisse
      goals.ts     # Kartenziele/Meilensteine
    forecast.ts    # Vorschau: was passiert bei "Runde beenden"?
    save.ts        # Serialisierung + Versionsmigration
  data/
    buildings.ts   # alle Gebäudedefinitionen (datengetrieben)
    housing.ts     # Wohnhaus-Stufen und Anforderungen
    cities/        # eine Datei pro Stadtgrundriss
    i18n/de.ts, en.ts
  render/          # Canvas: Kamera, Iso-Projektion, Sprites, Overlays
    sprites/       # prozedural gezeichnete Gebäude (auf Offscreen-Canvas gecacht)
  ui/              # HTML-UI: Baumenü, Infopanel, Rundenbericht, Stadtauswahl
  main.ts
tests/
```

Regeln dazu:

1. `core/` importiert nie aus `render/` oder `ui/`.
2. Der gesamte Spielstand ist **ein serialisierbares Objekt** (`GameState`). Keine Klasseninstanzen, keine Funktionen im State.
3. Jede Zustandsänderung läuft über `actions.ts`. Das macht Undo, Speichern und Tests trivial.
4. Zufall nur über den seedbaren RNG im State → gleiche Eingaben ergeben gleiche Ergebnisse.
5. Alle Balancing-Zahlen stehen in `data/`, nie verstreut in der Logik.

---

## 2. Spieldesign

### 2.1 Rundenablauf

1. **Planungsphase** (Spieler): Bauen, Abreißen, Umbauen. Begrenzt durch
   - **Gold** (Baukosten, Unterhalt) und
   - **Baupunkte** pro Runde (Start: 3, wächst mit Zimmerleuten/Bauhütte). Abriss und Wege kosten wenig, große Gebäude mehr.
   - Innerhalb der Runde ist alles per **Undo** rücknehmbar.
2. **Vorschau**: Ein Panel zeigt jederzeit die Prognose für das Rundenende (Einnahmen, Nahrung, welche Häuser auf-/absteigen und warum). Keine versteckten Regeln.
3. **Runde beenden** → Simulation in fester Reihenfolge:
   1. Produktion & Warenlieferung durch die Tore
   2. Versorgungsreichweiten berechnen
   3. Verbrauch (Nahrung, Brennholz im Winter)
   4. Wohnqualität und Hausaufstieg/-abstieg
   5. Zuzug/Wegzug von Einwohnern
   6. Steuern, Unterhalt
   7. Ereignis der Jahreszeit
   8. Ziele prüfen, Autosave
4. **Rundenbericht**: kurze, freundliche Zusammenfassung mit klickbaren Hinweisen („3 Häuser in der Webergasse haben keinen Brunnen").

### 2.2 Ressourcen (bewusst wenige)

| Ressource                                | Quelle                                           | Verwendung                |
| ---------------------------------------- | ------------------------------------------------ | ------------------------- |
| Gold                                     | Steuern, Markt, Handel                           | Bau, Unterhalt            |
| Nahrung                                  | Lieferung durch Tore (Umland), Bäckerei veredelt | Einwohner                 |
| Baumaterial (Holz/Stein zusammengefasst) | Lieferung durch Tore, Lagerhaus                  | Bau, Aufstocken           |
| Waren (Tuch, Werkzeug, Bier)             | Werkstätten                                      | höhere Hausstufen, Handel |
| Einwohner / Arbeitskräfte                | Wohnhäuser                                       | Betrieb aller Gebäude     |

Das **Umland ist abstrahiert**: Felder und Wälder liegen außerhalb der Mauer und werden nicht bebaut.
Jedes **Stadttor** hat eine Lieferkapazität pro Runde; Lagerhäuser und Kornspeicher in Tornähe
erhöhen, wie viel davon in der Stadt ankommt. Damit bleibt der gesamte Bauplatz-Konflikt innerhalb der Mauer.

### 2.3 Versorgung über das Wegenetz

Statt umherlaufender Figuren (schwer vorhersagbar) gilt eine **deterministische Wegdistanz**:
Ein Dienstgebäude versorgt alle Gebäude, die über Wege innerhalb von _n_ Schritten erreichbar sind.

- **Gasse** (1 Feld, billig): zählt als Weg, aber Feuerwehr/Markt-Reichweite durch Gassen kostet doppelt.
- **Straße** (1 Feld, teurer, gepflastert): volle Reichweite, leichter Bonus auf Wohnqualität.
- **Platz** (frei pflasterbare Fläche): zählt als Weg, starker Wohnqualitätsbonus, Voraussetzung für Markt und Feste.
- Jedes Gebäude braucht mindestens ein angrenzendes Wegfeld.

Der Kernkonflikt: Wege kosten wertvollen Platz, aber ohne Wege keine Versorgung.

### 2.4 Gebäude (erste Fassung, datengetrieben in `data/buildings.ts`)

| Kategorie  | Gebäude                           | Größe | Wirkung                                                  |
| ---------- | --------------------------------- | ----- | -------------------------------------------------------- |
| Wohnen     | Wohnparzelle                      | 1×1   | entwickelt sich selbst über Stufen (s. 2.5)              |
| Wasser     | Brunnen                           | 1×1   | Wasser, kleine Reichweite                                |
| Wasser     | Zisterne                          | 2×2   | Wasser, große Reichweite, stärkt Brandschutz             |
| Nahrung    | Marktstand                        | 1×1   | verteilt Nahrung, kleine Reichweite; nur auf Platz       |
| Nahrung    | Markthalle                        | 3×2   | verteilt Nahrung + Waren, große Reichweite               |
| Nahrung    | Bäckerei                          | 1×2   | macht aus Nahrung mehr Nahrung, leichte Brandgefahr      |
| Nahrung    | Kornspeicher                      | 2×2   | Nahrungsvorrat für den Winter                            |
| Sicherheit | Brandwache                        | 1×1   | senkt Brandrisiko in Reichweite                          |
| Sicherheit | Nachtwächterhaus                  | 1×1   | Ordnung, Voraussetzung für höhere Hausstufen             |
| Glaube     | Kapelle                           | 1×2   | Glaube, kleine Reichweite                                |
| Glaube     | Pfarrkirche                       | 2×3   | Glaube, große Reichweite                                 |
| Glaube     | Kathedrale                        | 4×5   | stadtweit, Mehrrunden-Bauprojekt, Endziel mancher Karten |
| Gesundheit | Badehaus                          | 2×2   | Gesundheit, braucht Wasser                               |
| Gesundheit | Spital                            | 2×3   | Gesundheit, große Reichweite                             |
| Kultur     | Schenke                           | 1×2   | Unterhaltung, etwas Lärm                                 |
| Kultur     | Schule                            | 2×2   | Bildung                                                  |
| Handwerk   | Weberei, Schmiede, Brauerei       | 2×2   | produzieren Waren                                        |
| Handwerk   | Gerberei                          | 2×2   | viel Gold, starker Gestank (Malus Wohnqualität)          |
| Handwerk   | Zunfthaus                         | 2×3   | verstärkt angrenzende Werkstätten                        |
| Verwaltung | Rathaus                           | 3×3   | 1× pro Stadt, Steuern, schaltet Gebäude frei             |
| Verwaltung | Lagerhaus                         | 2×2   | Tor-Lieferungen, Materiallager                           |
| Verwaltung | Bauhütte                          | 2×2   | +Baupunkte                                               |
| Grün       | Garten, Baum, Stadtbrunnen (Zier) | 1×1   | Wohnqualität                                             |

Gebäude werden **über Meilensteine freigeschaltet** (Einwohnerzahl), damit der Einstieg überschaubar bleibt.

### 2.5 Wohnhäuser – das Herz des Spiels

Wohnparzellen steigen automatisch auf, wenn Anforderungen erfüllt sind, und ab, wenn sie zwei Runden lang fehlen (Schonfrist = cozy).

| Stufe | Name          | Einw. | Braucht                                                   |
| ----- | ------------- | ----- | --------------------------------------------------------- |
| 1     | Hütte         | 4     | Weganschluss                                              |
| 2     | Lehmhaus      | 7     | + Wasser, Nahrung                                         |
| 3     | Fachwerkhaus  | 11    | + Glaube, Brandschutz, Wohnqualität ≥ mittel              |
| 4     | Bürgerhaus    | 16    | + Unterhaltung, Gesundheit, Waren (1 Sorte)               |
| 5     | Patrizierhaus | 22    | + Bildung, Ordnung, Waren (2 Sorten), Wohnqualität ≥ hoch |

Besonderheiten, die das „Enge"-Thema tragen:

- **Aufstocken statt Ausbreiten:** Höhere Stufen sind sichtbar höhere Häuser (mehr Stockwerke, Erker) auf derselben Fläche.
- **Zusammenwachsen:** Zwei benachbarte Parzellen gleicher Stufe ≥ 4 können zu einem 2×1-Haus verschmelzen (mehr Einwohner als die Summe).
- **Wohnqualität** pro Feld = Summe aus Grün/Plätzen/Kirchennähe (+) und Gestank/Lärm/zu wenig Licht (−). „Licht": Ein Haus, das auf allen vier Seiten zugebaut ist, bekommt einen Malus – winzige Höfe und Gassen lohnen sich.

### 2.6 Ereignisse (mild, max. eines pro Runde, nie zerstörerisch)

- **Jahreszeiten:** Winter erhöht Nahrungs-/Holzbedarf, Herbst bringt Erntebonus, Sommer erhöht Brandrisiko.
- **Positiv:** Jahrmarkt, wandernde Gaukler, Pilgerzug (Gold bei Kirche), gute Ernte.
- **Neutral/leicht negativ:** Schwelbrand (Gebäude „rußgeschwärzt": inaktiv bis repariert, wird nie zerstört), strenger Winter, Brunnen versiegt für eine Runde.
- Jedes Ereignis wird im Rundenbericht erklärt und hat eine klare Gegenmaßnahme.

### 2.7 Ziele und Fortschritt

- Jede Stadt hat **3 Sterne-Ziele** (z. B. „300 Einwohner", „Kathedrale vollendet", „10 Patrizierhäuser") – ohne Zeitlimit.
- Kein Scheitern: Bei Goldmangel gibt es einen kleinen Zuschuss des Landesherrn (begrenzt die Sterne, nicht das Weiterspielen).
- **Freies Spiel** nach Erreichen der Ziele.
- Statistik am Ende: Einwohner pro Feld („Dichte") als Highscore zum Selbstvergleich.

### 2.8 Stadtgrundrisse

Jede Karte ist eine stilisierte, vom realen Ort **inspirierte** Maske (kein exakter Stadtplan).
Format: ASCII-Raster in einer TS-Datei plus Metadaten.

```ts
export const carcassonne: CityDef = {
  id: 'carcassonne',
  name: { de: 'Carcassonne', en: 'Carcassonne' },
  region: 'Okzitanien, Frankreich',
  difficulty: 2,
  blurb: { de: 'Ovale Hügelfestung mit doppeltem Mauerring.', en: '...' },
  legend: { '#': 'wall', 'T': 'tower', 'G': 'gate', '.': 'buildable',
            '~': 'water', '^': 'rock', ' ': 'outside', 'C': 'landmark:castle' },
  map: [
    '      ##T####T##      ',
    '   ###..........###   ',
    // ...
  ],
  goals: [...],
  modifiers: { gateCapacity: 1.0, wells: 'scarce' },
};
```

Ein Validierungstest prüft jede Karte: rechteckig, mind. 1 Tor, alle baubaren Felder vom Tor erreichbar, Feldanzahl im Zielbereich.

| #   | Stadt                              | Besonderheit des Grundrisses                                                          | Baubare Felder (Ziel) |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------- | --------------------- |
| 1   | **Nienburg** (Weser, Deutschland)  | Tutorial-Karte: kompakte Stadt am Fluss, ein Flussufer als Grenze, 2 Tore, Hafenbonus | ~350                  |
| 2   | **Carcassonne** (Frankreich)       | Oval auf dem Hügel, Burg als festes Landmark nimmt Platz weg, 2 Tore                  | ~420                  |
| 3   | **Dubrovnik** (Kroatien)           | Lange Hauptachse, Meer auf drei Seiten, Hafentor mit viel Handel                      | ~400                  |
| 4   | **Mont-Saint-Michel** (Frankreich) | Winzig, kreisförmig, Höhenstufen; Abtei in der Mitte vorgegeben, 1 Tor                | ~220                  |
| 5   | **Brügge** (Belgien)               | Kanäle zerschneiden die Fläche; Brücken als eigenes Bauteil                           | ~450                  |
| 6   | **San Gimignano** (Italien)        | Schmaler Grat; Sonderbau Geschlechterturm (1×1, sehr hoch)                            | ~300                  |
| 7   | **Fès** (Marokko)                  | Verwinkelte Medina, unregelmäßige Form, Gerberviertel als Thema                       | ~480                  |
| 8   | **Pingyao** (China)                | Fast quadratische Mauer, strenges Raster, 6 Tore                                      | ~500                  |
| 9   | **Bhaktapur** (Nepal)              | Mehrere vorgegebene Tempelplätze, die nicht überbaut werden dürfen                    | ~380                  |
| 10  | **Cusco** (Peru)                   | Hanglage mit Terrassen, zwei Flüsse als Begrenzung                                    | ~400                  |

Phase 3 liefert Karten 1–2, Phase 7 den Rest. Regionale Karten bekommen eine eigene Farbpalette
(Dachfarbe, Mauerstein, Boden) und 1–2 umbenannte/optisch angepasste Gebäude (z. B. Tempel statt Kirche),
ohne die Regeln zu ändern.

### 2.9 Bedienung und UI

- **Karte:** Ziehen = verschieben, Mausrad/Pinch = Zoom, Klick = auswählen/bauen, `R` = drehen, Rechtsklick/Esc = abbrechen.
- **Unten:** Baumenü nach Kategorien, mit Kosten und Kurzbeschreibung.
- **Oben:** Gold, Nahrung, Material, Einwohner, Baupunkte, Jahr/Jahreszeit, „Runde beenden".
- **Rechts:** Infopanel zum gewählten Feld/Gebäude: Was fehlt diesem Haus zum Aufstieg?
- **Overlays** (Taste 1–6): Wasser, Nahrung, Brandschutz, Glaube, Wohnqualität, Wegdistanz. Beim Platzieren eines Dienstgebäudes wird dessen Reichweite live angezeigt.
- **Touch:** alle Aktionen ohne Hover erreichbar, Mindestgröße der Buttons 44 px.
- **Barrierearmut:** Overlays nutzen Farbe + Muster, UI per Tastatur bedienbar, `prefers-reduced-motion` respektieren.

### 2.10 Look & Feel

- Isometrische 2:1-Ansicht, warme gedeckte Palette (Ziegelrot, Ocker, Moosgrün, Schiefergrau).
- Gebäude werden per Code aus einfachen Formen gezeichnet (Wände, Satteldach, Fachwerkbalken, Fenster, Schornstein) und auf Offscreen-Canvas gecacht. Varianten per Seed, damit keine zwei Häuser identisch aussehen.
- Kleine Lebenszeichen: Rauch aus Schornsteinen, Fahnen, Jahreszeiten-Tönung (Schnee auf Dächern im Winter), Lichter in Fenstern.
- Ton (spät, optional): leise Umgebungsgeräusche per WebAudio, standardmäßig aus bis zum ersten Klick, Stummschalter.

---

## 3. Phasen

Jede Phase: umsetzen → Tests grün → `npm run build` ohne Fehler → committen → kurz in `CHANGELOG.md` notieren.
Nicht mit der nächsten Phase beginnen, bevor die Abnahmekriterien erfüllt sind.

### Phase 0 – Projektgerüst und Deployment

- [x] Vite + TypeScript (strict) aufsetzen, ESLint, Prettier, Vitest
- [x] Ordnerstruktur aus Abschnitt 1 anlegen
- [x] `vite.config.ts` mit `base: '/Nienburg/'` (Repo-Name!)
- [x] `.github/workflows/deploy.yml`: bei Push auf `main` → `npm ci`, lint, test, build, Deployment mit `actions/upload-pages-artifact` + `actions/deploy-pages`
- [x] `.github/workflows/ci.yml`: lint + test + build für Pull Requests
- [x] `README.md` (Was ist das, lokal starten, Link zum Spiel), `CLAUDE.md` (Architekturregeln aus Abschnitt 1, Befehle), `LICENSE`
- [x] Startseite zeigt Titel „Nienburg" und ein leeres Canvas

**Abnahme:** `npm run dev`, `npm test`, `npm run build` laufen. Nach Merge auf `main` ist die Seite unter `https://<user>.github.io/Nienburg/` erreichbar.
**Manueller Schritt für den Repo-Besitzer:** Settings → Pages → Source: „GitHub Actions". (GitHub Pages für private Repos erfordert einen bezahlten Plan; sonst Repo öffentlich machen.)

### Phase 1 – Karte, Kamera, Bauen

- [x] `GameState`, `CityDef`, ASCII-Karten-Parser, Karten-Validierung (+Tests)
- [x] Testkarte Nienburg (vorläufige Maske)
- [x] Iso-Projektion, Kamera (Pan/Zoom, Maus + Touch), Feld-Picking (+Tests für Projektion hin/zurück)
- [x] Rendering von Boden, Mauer, Türmen, Toren, Wasser mit Platzhalter-Grafik; korrekte Zeichenreihenfolge
- [x] Aktionen `placeBuilding`, `demolish` mit Prüfungen (in Maske, frei, Größe, Drehung) (+Tests)
- [x] Bauen von Gasse, Straße, Platz (Ziehen für Linien/Flächen), Wohnparzelle, Brunnen
- [x] Baumenü, Bauvorschau (grün/rot), Infopanel-Grundgerüst

**Abnahme:** Man kann auf der Nienburg-Karte Wege und Gebäude platzieren und abreißen; außerhalb der Mauer geht nichts. Bedienung funktioniert mit Maus und Touch.

### Phase 2 – Runden, Wirtschaft, Wohnhäuser

- [x] Seedbarer RNG, `endTurn`-Pipeline in der Reihenfolge aus 2.1
- [x] Wegdistanz-Berechnung (BFS über Wegfelder, Gasse = doppelte Kosten) und Versorgungsabdeckung (+Tests)
- [x] Ressourcen, Tor-Lieferungen, Lagerhaus, Kornspeicher, Marktstand
- [x] Wohnhaus-Stufen 1–3 mit Auf-/Abstieg und Schonfrist (+Tests)
- [x] Einwohner, Arbeitskräfte, Steuern, Unterhalt, Baupunkte
- [x] Kopfleiste, „Runde beenden", Rundenbericht
- [x] Undo innerhalb der Runde
- [x] Speichern/Laden (`localStorage`, Versionsfeld, Migrationsgerüst) (+Roundtrip-Test)

**Abnahme:** Eine Stadt lässt sich über 20+ Runden von Hütten zu Fachwerkhäusern entwickeln. Ein automatisierter Test spielt mit festem Seed ein Skript von 20 Runden und prüft das Endergebnis (Determinismus).

### Phase 3 – Vollständiger Gebäudekatalog und zwei Karten

- [x] Alle Gebäude aus 2.4, Freischaltung über Meilensteine
- [x] Wohnhaus-Stufen 4–5, Zusammenwachsen von Parzellen
- [x] Wohnqualität inkl. Gestank, Lärm, Licht-Regel (+Tests)
- [x] Warenproduktion und -verteilung, Zunfthaus-Bonus
- [x] Brandrisiko, „rußgeschwärzt", Reparatur
- [x] Mehrrunden-Bauprojekt Kathedrale
- [x] Overlays 1–6 und Live-Reichweite beim Platzieren
- [x] Prognose-Panel (`forecast.ts` nutzt dieselbe Logik wie `endTurn`, auf einer Kopie des States)
- [x] Karten Nienburg (final) und Carcassonne, Sterne-Ziele, Stadtauswahl-Bildschirm

**Abnahme:** Beide Karten sind bis zu 3 Sternen durchspielbar. Für jedes Haus zeigt das Infopanel exakt, was zum Aufstieg fehlt.

### Phase 4 – Grafik und Atmosphäre

- [x] Prozedurale Gebäude-Sprites für alle Gebäude und Hausstufen, Varianten per Seed, Sprite-Cache
- [x] Mauern, Türme, Tore, Wasser, Umland außerhalb der Mauer (Felder, Wald – nur Kulisse)
- [x] Jahreszeiten-Paletten, Rauch, Fahnen, Fensterlichter (mit `prefers-reduced-motion`-Abschaltung)
- [x] Einheitliches UI-Design (Pergament-/Holz-Anmutung per CSS), Icons als Inline-SVG
- [x] Rendering-Performance: nur sichtbare Felder zeichnen, statische Ebene cachen; Ziel 60 fps auf Mittelklasse-Handy

**Abnahme:** Screenshots beider Karten in allen vier Jahreszeiten sehen stimmig aus; kein Platzhalter mehr sichtbar.

### Phase 5 – Ereignisse, Tutorial, Feinschliff

- [x] Ereignissystem aus 2.6
- [x] Geführtes Tutorial auf Nienburg (ca. 8 Schritte, überspringbar)
- [x] i18n vollständig (de/en), Sprachumschalter, Erkennung der Browsersprache
- [x] Einstellungen: Sprache, Ton, Animationen, Spielstand exportieren/importieren/löschen
- [x] Hilfeseite/Glossar im Spiel
- [x] Tastaturbedienung, Fokus-Stile, Kontrastprüfung

**Abnahme:** Eine Person ohne Vorwissen kommt allein mit dem Tutorial zum ersten Stern.

### Phase 6 – Balancing

- [ ] Headless-Simulationsskript (`npm run sim`): spielt Karten mit einfachen Bot-Strategien durch und gibt Kennzahlen aus (Runden bis Stern 1/2/3, Goldverlauf, Engpässe)
- [ ] Zahlen in `data/` justieren: Stern 1 in ~30 Runden, Stern 3 in ~120 Runden erreichbar
- [ ] Sicherstellen, dass es keine Sackgassen gibt (Zuschuss-Mechanik greift, Abriss erstattet Teilkosten)
- [ ] Mehrere tragfähige Stadtlayouts pro Karte (nicht nur eine optimale Lösung)

**Abnahme:** Bot-Läufe liegen im Zielkorridor; manueller Durchlauf von Karte 1 und 2 fühlt sich nie festgefahren an.

### Phase 7 – Weitere Städte

- [ ] Karten 3–10 aus 2.8, je mit Maske, Palette, Zielen, Modifikatoren
- [ ] Kartenspezifische Bauteile: Brücke (Brügge), Geschlechterturm (San Gimignano), Höhenstufen (Mont-Saint-Michel, Cusco), feste Tempelplätze (Bhaktapur)
- [ ] Regionale Umbenennung/Optik einzelner Gebäude
- [ ] Stadtauswahl als Weltkarte mit Sterne-Fortschritt

**Abnahme:** Alle Karten bestehen den Validierungstest und einen Bot-Durchlauf bis Stern 1.

### Phase 8 – Veröffentlichung

- [ ] PWA: Manifest, Service Worker (offline spielbar), Icons
- [ ] Meta-Tags, Social-Preview-Bild, Favicon
- [ ] Playwright-Smoke-Test in CI
- [ ] Ladegröße prüfen (Ziel < 500 kB gzip), Lighthouse ≥ 90
- [ ] README mit Screenshots, Mitmach-Hinweise, Anleitung „eigene Stadt hinzufügen"

**Abnahme:** Version 1.0 getaggt, live auf GitHub Pages, auf Handy installierbar.

### Ideen für später (nicht Teil von 1.0)

Karteneditor im Browser · Teilen von Städten per Link (State im URL-Hash) · tägliche Herausforderung mit festem Seed ·
Fotomodus · weitere Städte aus der Community · Musik.

---

## 4. Arbeitsanweisung für die ausführende KI

1. Lies zuerst dieses Dokument vollständig und danach `CLAUDE.md` (ab Phase 0 vorhanden).
2. Arbeite **eine Phase pro Sitzung/Pull Request** ab. Hake erledigte Punkte in diesem Dokument ab.
3. Schreibe für jede Regel in `core/` zuerst einen Test. Die Simulation muss ohne Browser testbar sein.
4. Prüfe sichtbare Änderungen im echten Browser (Playwright-Screenshot), nicht nur per Unit-Test.
5. Neue Balancing-Zahlen gehören in `data/`, neue Texte in beide Sprachdateien.
6. Wenn eine Designfrage offen ist, nimm die Vorgabe aus Abschnitt 5 und notiere die Entscheidung im `CHANGELOG.md`, statt anzuhalten.
7. Nichts einbauen, was dem Cozy-Grundsatz widerspricht: kein Kampf, kein Zeitdruck, kein endgültiger Verlust.
8. Keine fremden Grafiken, Namen oder Texte aus bestehenden Spielen übernehmen.

## 5. Offene Fragen mit Vorgabewerten

Solange der Besitzer nichts anderes entscheidet, gilt die Vorgabe.

| Frage                                           | Vorgabe                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| Isometrisch oder Draufsicht?                    | Isometrisch 2:1; `render/` ist austauschbar gekapselt                     |
| Baupunkte pro Runde als Limit?                  | Ja, Start 3. Falls es sich im Test zäh anfühlt: nur Gold als Limit        |
| Lizenz                                          | MIT                                                                       |
| Repo öffentlich (für kostenloses GitHub Pages)? | Ja                                                                        |
| Ton/Musik                                       | Erst nach 1.0, nur dezente Geräusche in Phase 5 optional                  |
| Kirche auf nicht-europäischen Karten            | Neutrale Kategorie „Glaube" mit regionalem Gebäudenamen und eigener Optik |
