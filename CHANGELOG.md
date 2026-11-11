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

## Handel: Handelskontor und Tuchmanufaktur

- **Handelskontor** (2×2, ab 150 Einwohnern): Händler verkaufen pro Runde bis zu 8 Waren für je
  5 Gold durch das Tor. Sie lassen den Häusern den Bedarf von drei Runden im Lager und greifen
  zuerst in das vollste Lager. Braucht Arbeitskräfte und einen Weg zu einem Stadttor.
- **Tuchmanufaktur** (3×2, ab 260 Einwohnern): stellt 9 Tuch pro Runde her, mehr als doppelt so
  viel wie eine Weberei; ein angrenzendes Zunfthaus verstärkt auch sie.
- Zusammen bringen eine Manufaktur und ein Kontor 40 Gold pro Runde bei 12 Gold Unterhalt.
  Ohne Kontor wird weiterhin nur verkauft, was nicht mehr ins Lager passt, für 2 Gold das Stück.
- Der Rundenbericht nennt die verkauften Waren; die kleine Zahl neben jedem Warenvorrat zeigt
  jetzt genau, wie er sich in der nächsten Runde ändert.
- Entscheidungen:
  - Kein neuer Rohstoff: Die Manufaktur ist eine große Werkstatt für Tuch, das Kontor macht aus
    den vorhandenen Waren Gold. So bleibt es bei einer einzigen, kurzen Kette.
  - Der Bot baut beide Gebäude nicht; die Probeläufe aus Phase 6 sind deshalb unverändert.
    Mit Handel sammelt sich im späten Spiel noch mehr Gold an als ohnehin schon.

## Phase 7 – Weitere Städte

- Acht neue Städte, jede mit eigenem Grundriss, eigenen Zielen und einer Besonderheit:
  - **Dubrovnik** (344 Felder): lang gestreckt am Meer; Händler erzielen 40 % höhere Preise
  - **Mont-Saint-Michel** (213 Felder): Insel mit der Abtei auf dem Gipfel, einem Felsring und
    nur einem Tor, durch das dafür doppelt so viel hereinkommt; die Abtei hebt die Wohnlage
  - **Brügge** (419 Felder): Kanäle teilen die Stadt in Viertel; nur hier gibt es Brücken
  - **San Gimignano** (271 Felder): schmaler Bergrücken; nur hier gibt es den Geschlechterturm
  - **Fès** (459 Felder): unregelmäßige Medina; Gerbereien bringen 40 statt 25 Gold
  - **Pingyao** (481 Felder): fast quadratisch mit sechs Toren, durch die je nur halb so viel kommt
  - **Bhaktapur** (377 Felder): drei feste Tempelplätze, die die Wohnlage ringsum heben
  - **Cusco** (342 Felder): Terrassen zwischen zwei Flüssen, durch Felsbänder getrennt
- Neu in den Regeln: Kanäle (nur Brücken, zählen als freie Seite eines Hauses), Brücke,
  Geschlechterturm, Ziele mit Stückzahl („3× Gerberei“), Besonderheiten pro Stadt
- Regionales Aussehen: eigene Farben für Mauern, Dächer, Putz und Boden; trockenes oder mildes
  Klima mit wenig oder keinem Schnee; Kuppeln, Pagoden oder schlichte Dächer statt Kirchturmspitzen;
  eigene Namen (Moschee, Tempel, Teehaus, Hammam, Wechselstube)
- Stadtauswahl mit Weltkarte und vergrößertem Ausschnitt für Europa; Stecknadeln zeigen, wo
  man gerade spielt und wo alle drei Sterne erreicht sind
- Der Bot hat für jede neue Stadt einen passenden Grundriss und erreicht überall den ersten Stern
- Entscheidungen:
  - Höhenstufen (Mont-Saint-Michel, Cusco) sind als Felsbänder umgesetzt, die den Baugrund in
    Terrassen teilen, nicht als echte Höhen mit Treppen. Das hätte Darstellung und Bedienung der
    ganzen Karte verändert.
  - Die Weltkarte ist aus wenigen Punkten von Hand gezeichnet: Sie zeigt, wo eine Stadt liegt,
    mehr nicht.
  - Die ersten Ziele von Mont-Saint-Michel (70 Einwohner) und Brügge (170) sind so gewählt,
    dass der Bot sie mit seiner einfachen Vorlage erreicht; er baut keine Brücken.
  - Die zweiten und dritten Ziele der neuen Städte sind nicht mit dem Bot durchgespielt, außer in
    Fès und Pingyao (dort fällt der dritte Stern nach rund 70 Runden).
  - Hinweise im Rundenbericht sprechen jetzt von einem „Ort des Glaubens“ und „Unterhaltung“
    statt von Kapelle und Schenke.

## Neue Gebäudegrafik

- Jedes Gebäude hat jetzt eine eigene Gestalt statt eines Kastens mit Dach:
  - Wohnhäuser: Strohhütte, Lehmhaus mit Giebel, Fachwerkhaus mit vorkragendem Obergeschoss und
    Fensterläden, Bürgerhaus mit zwei Fachwerkgeschossen und Gaube, Patrizierhaus aus Stein mit
    Treppengiebel und Bogenfenstern. Putzfarbe, Läden und Firstrichtung wechseln von Haus zu Haus.
  - Kapelle, Pfarrkirche und Kathedrale mit Langhaus, Seitenschiffen, Querhaus, Türmen,
    Rosette und Portal; die Turmbekrönung richtet sich weiter nach der Region.
  - Markthalle, Zunfthaus und Rathaus mit Arkaden; Rathaus mit Uhrturm, Kontor mit
    Treppengiebel und Lastenaufzug, Geschlechterturm mit Zinnen
  - Werkstätten mit erkennbarem Gewerbe: glühende Esse, Fässer, Bottiche und aufgespannte Häute,
    trocknende Tuchbahnen, hohe Schornsteine
  - Brunnen mit rundem Steinkranz und Dach, Zierbrunnen mit Wasserschale, Marktstand mit
    gestreifter Markise, Badehaus mit Kuppeln, Bauhütte mit Zaun, Holzstapel und Kran
- Zeichenstil: feine dunkle Konturen, Giebeldächer mit Ziegelreihen und Traufe, Fensterrahmen,
  Mauerwerk-, Bretter- und Ziegelstruktur, Schatten unter dem Dachüberstand
- Schatten am Boden sind kürzer und weicher; Zinnen und Bäume haben Konturen bekommen
- Die Bilder im Baumenü passen sich jetzt selbst an die Größe des Gebäudes an
- Neue Übersichtsseite aller Gebäude zum Beurteilen der Grafik: die Adresse des Spiels mit
  `?assets` am Ende aufrufen
- Entscheidung: Mauern, Tore, Boden und Umland sind bewusst nur leicht angepasst; der Schwerpunkt
  lag auf den Gebäuden.

## Achteckige Wege, Kanäle, neues Land und Leben auf den Straßen

- **Wege im Achteck-Stil:** Straßen, Gassen, Plätze und Kanäle werden mit abgeschrägten Ecken
  gezeichnet. Ein einzelnes Feld ist ein Achteck, ein Straßenende hat zwei schräge Ecken, eine
  Biegung eine abgeschrägte Außenecke, und Flächen wie Plätze haben schräge Außenecken. Brücken
  richten sich nach dem Weg, den sie tragen, und haben Geländer.
- **Kanäle:** Unter „Versorgung“ lässt sich ein Kanal graben (8 Gold pro Feld). Er führt Wasser,
  sobald er an die Stadtmauer, ein Tor oder einen anderen fließenden Kanal anschließt, und
  versorgt alles im Umkreis von zwei Feldern – ganz ohne Wege. Trockene Stücke zeigt der
  Rundenbericht an. Auch die Kanäle in Brügge versorgen jetzt ihre Ufer.
- **Brücken** gibt es in jeder Stadt. Über einem gegrabenen Kanal ersetzt die Brücke das
  Kanalstück, das Wasser fließt darunter weiter; wird sie abgerissen, ist der Kanal wieder da.
- **Land kaufen:** Mit dem neuen Werkzeug lässt sich Umland vor einem Tor oder neben schon
  gekauftem Land erwerben und bebauen. Das erste Feld kostet 80 Gold, jedes weitere 12 mehr.
  Stadttore gelten als Weg, damit eine Vorstadt über das Tor versorgt werden kann.
- **Leben auf den Straßen:** Bewohner gehen zur Arbeit und zurück, Händler kommen mit
  Handkarren durch die Tore. Die Figuren sind reine Zierde und verschwinden hinter Häusern und
  Mauern, die vor ihnen stehen. Bei „Bewegung reduzieren“ gibt es sie nicht.
- Spielstände werden übernommen.
- Entscheidungen:
  - Das Raster bleibt quadratisch. Regelmäßige Achtecke lassen sich nicht lückenlos
    aneinanderlegen; ein echtes Achteck-Raster (Achtecke mit kleinen Quadraten dazwischen) hätte
    Karten, Gebäudegrößen, Regeln und den Bot von Grund auf geändert. Umgesetzt ist die
    achteckige Formensprache für alles, was flach auf dem Boden liegt.
  - Kanäle werden von der Mauer aus gespeist, nicht von einem Fluss: Viele Städte haben keinen,
    und so gilt überall dieselbe einfache Regel.
  - Das Verdecken der Figuren ist eine Näherung: Wer auf einem Feld direkt hinter einem hohen
    Gebäude geht, wird nicht gezeichnet. Auf Straßen mit Häusern auf der Vorderseite sieht man
    deshalb weniger Leute.
  - Gekauftes Land liegt außerhalb der Mauer und bekommt keine eigene Befestigung.
  - Der Bot nutzt weder Kanäle noch Landkauf; die Probeläufe sind davon unberührt.
