# Nienburg

Ein gemütlicher, rundenbasierter Mittelalter-Städtebauer für den Browser.
Der Platz innerhalb der Stadtmauer ist von Anfang an begrenzt – die Kunst liegt im klugen Verdichten.

**Spielen:** https://philwegdata.github.io/Nienburg/

Stand: Phase 4 – zwei Städte (Nienburg und Carcassonne) mit je drei Sterne-Zielen, 30 Gebäude, fünf Wohnhaus-Stufen, gezeichnete Gebäude mit Jahreszeiten, Rauch und Fahnen. Als Nächstes folgen Ereignisse und ein Tutorial (Phase 5).

## Lokal starten

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests
npm run lint     # ESLint + Prettier
npm run build    # Produktions-Build nach dist/
```

## Deployment

Jeder Push auf `main` baut das Spiel und veröffentlicht es über GitHub Actions auf GitHub Pages.

## Lizenz

MIT
