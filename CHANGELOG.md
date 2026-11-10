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

## Phase 3 – Vollständiger Gebäudekatalog und zwei Karten

- 30 Gebäude in fünf Kategorien; neue Gebäude werden mit wachsender Einwohnerzahl freigeschaltet,
  einige erst mit einem Rathaus
- Wohnhaus-Stufen 4 (Bürgerhaus) und 5 (Patrizierhaus); Nachbarhäuser ab Stufe 4 wachsen zusammen
- Wohnlage: Grün, Plätze und Kirchen heben sie, Gerberei, Schmiede und Schenke senken sie;
  eingezwängte Häuser bekommen einen Abzug
- Handwerk: Weberei, Schmiede und Brauerei stellen Waren her, die Markthalle verteilt sie, das
  Zunfthaus verstärkt angrenzende Werkstätten; Überschuss wird verkauft
- Brände: Ein ungeschütztes Gebäude kann rußgeschwärzt werden und ist bis zur Reparatur außer
  Betrieb. Nichts wird zerstört, und in den ersten zwei Jahren brennt es nie.
- Kathedrale als Bauprojekt über acht Runden
- Ansichten für jede Versorgung und für die Wohnlage (Auswahlfeld oder Tasten 1–9, 0 für normal);
  beim Platzieren zeigt die Karte die Reichweite eines Dienstgebäudes
- Zweite Karte Carcassonne (411 Felder, doppelter Mauerring, Burg als festes Bauwerk)
- Drei Sterne-Ziele pro Stadt, Stadtauswahl, ein Spielstand pro Stadt; alte Spielstände werden
  übernommen
- Entscheidungen:
  - „Eingezwängt“ heißt: weniger als zwei offene Seiten. Der Plan sah „auf allen vier Seiten
    zugebaut“ vor, das kann aber kein Haus mit Weganschluss je sein.
  - Wohnlage zählt gleichartige Gebäude höchstens zweimal pro Feld, damit zehn Bäume kein
    Patrizierviertel ergeben.
  - Die Bäckerei erzeugt einfach zusätzliche Nahrung; die Zisterne hat nur eine große
    Reichweite und keinen eigenen Brandschutz-Bonus.
  - Waren sind stadtweit vorrätig; ein Haus braucht die Markthalle in Reichweite und genug
    Vorrat einer oder zweier Sorten.
  - Die Prognose bleibt in der Kopfleiste (Veränderung pro Runde neben jedem Wert) statt in
    einem eigenen Panel.
  - Die Ansicht „Wegdistanz“ ist durch die Reichweiten-Vorschau beim Platzieren ersetzt.
  - Zuschüsse des Landesherrn schmälern die Sterne noch nicht.

## Phase 4 – Grafik und Atmosphäre

- Alle Gebäude gezeichnet: Fenster, Türen, Fachwerk, Schornsteine, Türme mit Spitze und Kreuz;
  Wohnhäuser unterscheiden sich je nach Lage in Dachfarbe, Höhe und Firstrichtung
- Stadtmauer mit Zinnen und Steinlagen, Tore mit Bogen und Fahne, Burg mit Türmen
- Umland als Kulisse: Felder mit Furchen, Wälder, Wege vor den Toren, ein Fluss, der über den
  Kartenrand hinaus weiterfließt
- Vier Jahreszeiten: Blüte im Frühling, gelbe Felder im Sommer, buntes Laub und gepflügte Äcker
  im Herbst, Schnee und kahle Bäume im Winter; in Herbst und Winter leuchten die Fenster
- Rauch aus Schornsteinen, wehende Fahnen und Glitzern auf dem Wasser; bei „Bewegung
  reduzieren“ steht das Bild still
- Oberfläche in Holz und Pergament, Symbole für alle Ressourcen, Gebäudebilder im Baumenü
- Darstellung: Boden und Gebäude werden als zwei Bilder zwischengespeichert und nur bei
  Änderungen neu gezeichnet; nah herangezoomt werden stattdessen nur die sichtbaren Felder gezeichnet
- Entscheidungen:
  - Statt einzelner Sprites pro Gebäude werden ganze Ebenen zwischengespeichert. Das erfüllt
    denselben Zweck (kein Neuzeichnen pro Bild) und braucht kein Sprite-Raster.
  - Die Bildrate auf einem echten Mittelklasse-Handy ist nicht gemessen, nur im Testbrowser.
