# Changelog

## Phase 0 – Projektgerüst

- Vite + TypeScript (strict), ESLint, Prettier, Vitest
- Ordnerstruktur, seedbarer RNG, i18n-Grundgerüst (de/en)
- GitHub Actions: CI für Pull Requests, Deployment auf GitHub Pages bei Push auf `main`
- Entscheidungen: Lizenz MIT, Repo öffentlich

## Phase 1 – Karte, Kamera, Bauen

- Spielzustand, ASCII-Karten-Parser und Karten-Validierung
- Karte Nienburg (323 bebaubare Felder, Hafentor und Landtor)
- Isometrische Darstellung mit Platzhalter-Grafik, Kamera mit Verschieben und Zoom (Maus, Touch, Tastatur)
- Bauen und Abreißen: Gasse, Straße, Platz, Wohnparzelle, Brunnen, Kapelle
- Baumenü, Bauvorschau in Grün/Rot, Infopanel, Zähler für freie Felder
- Entscheidungen: Die Kapelle (1×2) ist aus Phase 3 vorgezogen, damit das Drehen von Gebäuden
  schon jetzt benutzbar ist. Baukosten stehen in den Daten, werden aber erst ab Phase 2 berechnet.
  Die Karte wird noch nicht gespeichert (Phase 2).

## Phase 2 – Runden, Wirtschaft, Wohnhäuser

- Rundenablauf: eine Runde ist eine Jahreszeit; Lieferungen, Verbrauch, Hausentwicklung, Zuzug,
  Steuern und Unterhalt in fester Reihenfolge
- Ressourcen Gold, Nahrung und Baumaterial; Lieferungen durch die Stadttore, begrenzt durch Lager
- Versorgung über das Wegenetz: Wegdistanz mit doppelten Kosten für Gassen
- Neue Gebäude: Marktstand, Kornspeicher, Brandwache, Lagerhaus
- Wohnhäuser mit drei Stufen (Hütte, Lehmhaus, Fachwerkhaus), Aufstieg und Abstieg mit Schonfrist
- Einwohner, Arbeitskräfte, Steuern, Unterhalt, Baupunkte pro Runde
- Kopfleiste mit Vorschau auf die nächste Runde, Rundenbericht mit anklickbaren Hinweisen
- Rückgängig innerhalb der Runde, automatisches Speichern im Browser, „Neu“ für eine neue Stadt
- Warnmarker über Gebäuden, die nicht arbeiten oder denen etwas fehlt
- Entscheidungen:
  - 20 Baupunkte pro Runde statt 3, dafür feiner abgestuft (Weg 1, Haus 2, Kapelle 8). Mit 3 wäre
    schon eine Hauptstraße eine Sache von vielen Runden gewesen.
  - Häuser steigen erst auf, wenn sie voll bewohnt sind. Ohne diese Regel waren Fachwerkhäuser
    schon nach vier Runden erreicht.
  - Der Marktstand steht neben einem Platz, nicht darauf.
  - Die Wohnqualität als Bedingung für das Fachwerkhaus folgt mit Phase 3; bis dahin genügen
    Glaube und Brandschutz.
  - Abriss gibt die Hälfte des Goldes zurück und kostet keine Baupunkte.
  - Ist die Stadtkasse leer, gleicht der Landesherr aus; das wird gezählt, hat aber noch keine Folgen.
  - Die Zahlen in `src/data/` sind ein erster Wurf; das eigentliche Balancing ist Phase 6.
