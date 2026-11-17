# Nienburg

Ein gemütlicher, rundenbasierter Mittelalter-Städtebauer für den Browser.
Der Platz innerhalb der Stadtmauer ist von Anfang an begrenzt – die Kunst liegt im klugen Verdichten.

**Spielen:** https://philwegdata.github.io/Nienburg/

Stand: zehn Städte aus aller Welt mit je drei Sterne-Zielen, fünf Rätsel, Sandbox, 39 Gebäude, fünf Wohnhaus-Stufen mit Aufstocken, Wohnen auf der Mauer, Umland mit Rohstoffen, Bank, Marktpreise, Bürgerwünsche, Jahreszeiten, Ereignisse und ein Tutorial. Die Ideenliste steht in `PLAN.md`; offen ist noch die Veröffentlichung als installierbare App (Phase 8).

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
