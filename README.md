# Nienburg

Ein gemütlicher, rundenbasierter Mittelalter-Städtebauer für den Browser.
Der Platz innerhalb der Stadtmauer ist von Anfang an begrenzt – die Kunst liegt im klugen Verdichten.

**Spielen:** https://philwegdata.github.io/Nienburg/

Stand: Phase 3 – zwei Städte (Nienburg und Carcassonne) mit je drei Sterne-Zielen, der vollständige Gebäudekatalog, fünf Wohnhaus-Stufen, Wohnlage, Handwerk und Waren. Die Grafik ist noch Platzhalter (Phase 4).

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
