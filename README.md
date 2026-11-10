# Nienburg

Ein gemütlicher, rundenbasierter Mittelalter-Städtebauer für den Browser.
Der Platz innerhalb der Stadtmauer ist von Anfang an begrenzt – die Kunst liegt im klugen Verdichten.

**Spielen:** https://philwegdata.github.io/Nienburg/

Stand: Phase 0 (Projektgerüst). Der vollständige Fahrplan steht in [PLAN.md](PLAN.md).

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
