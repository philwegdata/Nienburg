# Nienburg

Ein gemütlicher, rundenbasierter Mittelalter-Städtebauer für den Browser.
Der Platz innerhalb der Stadtmauer ist von Anfang an begrenzt – die Kunst liegt im klugen Verdichten.

**Spielen:** https://philwegdata.github.io/Nienburg/

Stand: Phase 6 – zwei Städte (Nienburg und Carcassonne), 32 Gebäude, fünf Wohnhaus-Stufen, Jahreszeiten, Ereignisse, Tutorial und ein mit automatischen Probeläufen abgestimmtes Balancing. Als Nächstes folgen weitere Städte (Phase 7).

## Lokal starten

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests
npm run lint     # ESLint + Prettier
npm run build    # Produktions-Build nach dist/
npm run sim      # Probeläufe: ein Bot spielt jede Stadt durch und gibt Kennzahlen aus
```

## Deployment

Jeder Push auf `main` baut das Spiel und veröffentlicht es über GitHub Actions auf GitHub Pages.

## Lizenz

MIT
