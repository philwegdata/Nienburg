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

## Phase 5 – Ereignisse, Tutorial, Feinschliff

- Ereignisse: Jahrmarkt, Pilgerzug und reiche Ernte bringen sofort etwas; Gaukler, strenger
  Winter und ein versiegter Brunnen gelten für die kommende Jahreszeit. Höchstens eines pro
  Runde, keines in den ersten anderthalb Jahren, und der Rundenbericht kündigt es vorher an.
- Tutorial auf Nienburg in neun Schritten: Jeder Schritt erkennt selbst, wann er erledigt ist,
  und hebt die passenden Knöpfe hervor. Überspringbar, in den Einstellungen neu startbar.
- Einstellungen: Sprache, Animationen, Töne, Spielstand exportieren, importieren und neu beginnen
- Hilfe mit den Regeln in Kurzform, den Anforderungen aller Hausstufen und der Tastenbelegung
- Leise Töne beim Bauen, am Rundenende und bei einem Stern; standardmäßig aus
- Tastatur: Hat die Karte den Fokus, bewegen die Pfeiltasten eine Marke von Feld zu Feld,
  Eingabe baut oder wählt aus, Umschalt+Eingabe setzt den Anfang einer Reihe
- Spielstände aus Phase 3 und 4 werden übernommen
- Entscheidungen:
  - Ereignisse mit Folgen (strenger Winter, versiegter Brunnen) werden eine Runde im Voraus
    angekündigt, damit man reagieren kann. Der Schwelbrand bleibt die Brandregel aus Phase 3.
  - Wer schon eine Stadt begonnen hat, bekommt das Tutorial nicht ungefragt.
  - „Neu beginnen“ steht jetzt in den Einstellungen statt im Ziele-Dialog.
  - Kontraste sind nachgerechnet, nicht mit einem Werkzeug gemessen: helle Schrift auf Holz
    etwa 7:1, Grün und Rot auf Pergament etwa 4,6:1 und 5,9:1. Gesperrte Knöpfe sind weniger
    stark ausgegraut als zuvor.
  - Die Abnahme „eine Person ohne Vorwissen“ ist durch einen Test ersetzt, der genau das tut,
    was die Tutorial-Karten sagen, und so den ersten Stern erreicht. Ein Test mit einem
    echten Menschen steht aus.

## Phase 6 – Balancing

- `npm run sim`: Ein Bot plant aus einer Vorlage eine Stadt (Hauptstraße, Häuserzeilen mit Grün
  dahinter, Seitenstraße mit den großen Gebäuden) und baut sie so schnell, wie die Kasse es
  erlaubt. Ausgegeben werden die Runden bis zu jedem Stern, Einwohner, Hausstufen, Goldverlauf,
  Wartezeiten und die häufigsten Hinweise. Pro Stadt gibt es zwei verschiedene Grundrisse.
- Ergebnis über je drei Zufallswerte (Runden bis Stern 1 / 2 / 3):
  - Nienburg, Hauptstraße von Tor zu Tor: 17 / 51–61 / 61–76
  - Nienburg, Hauptstraße quer zum Fluss: 18–19 / 60–77 / 77–95
  - Carcassonne, Hauptstraße am Westtor: 31–39 / 67–83 / 90–107
  - Carcassonne, Hauptstraße im Norden: 41–47 / nicht erreicht / 103–119
- Geänderte Zahlen:
  - Steuern pro Kopf flacher: 0,20 / 0,24 / 0,27 / 0,27 / 0,28 statt 0,15 bis 0,90. Vorher
    häufte sich ab den Bürgerhäusern Gold ohne Ende an, während der Anfang knapp war.
  - Unterhalt der Grundversorgung gesenkt (Brunnen 1, Marktstand 3, Kapelle 5, Brandwache 4,
    Nachtwächter 4). Vorher konnte ein Dorf aus neun Lehmhäusern seine Kapelle nicht tragen
    und blieb stecken.
  - Wohnparzelle 15 Gold und 3 Material statt 10 und 2
  - Markthalle 220, Badehaus 150, Schule 180, Rathaus 320, Spital 260 Gold
  - Freischaltung der mittleren Gebäude ab 150 statt 120 Einwohnern, der späten ab 260 statt
    200, der Kathedrale ab 400 statt 350; Bauzeit der Kathedrale zwölf statt acht Runden
  - Warenbedarf pro Kopf fast halbiert (0,008): Eine Werkstatt je Sorte reicht jetzt für eine
    mittlere Stadt.
  - Carcassonne, erster Stern: 170 statt 300 Einwohner
- Neue Tests sichern das ab: jedes Gebäude ist mit den Baupunkten einer Runde und einem leeren
  Lager bezahlbar, die Kasse fällt nie unter null, eine verschuldete Stadt kommt durch Abriss
  und neue Häuser wieder auf die Beine, und die Bot-Läufe bleiben im Korridor.
- Entscheidungen und offene Punkte:
  - Der dritte Stern fällt nach 60 bis 120 Runden statt genau 120; Nienburg ist als
    Einstiegsstadt bewusst schneller.
  - Der nördliche Grundriss in Carcassonne hat nur 18 Hausparzellen und erreicht den zweiten
    Stern (20 Bürgerhäuser) deshalb nicht. Das liegt an der Vorlage des Bots, nicht an der Karte.
  - Nach dem dritten Stern sammelt sich weiterhin Gold an (im schnellsten Lauf rund 6000 nach
    160 Runden), weil es dann nichts Teures mehr zu bauen gibt.
  - Ein Durchspielen von Hand, wie im Plan vorgesehen, steht aus; die Abnahme stützt sich auf
    die Bot-Läufe.
