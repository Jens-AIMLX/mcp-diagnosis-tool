Playwright: Browser-Aktionen aufzeichnen und als Skript speichern
Voraussetzungen

Node.js installiert
Playwright installiert

Shellnpm install -D @playwright/testnpx playwright installWeitere Zeilen anzeigen

Schritte zur Aufzeichnung

npx playwright codegen <URL>


Codegen starten

npx playwright codegen <URL>
Öffne den Browser und beginne die Aufzeichnung:
Shellnpx playwright codegen <URL>Weitere Zeilen anzeigen
Beispiel:
Shellnpx playwright codegen https://example.comWeitere Zeilen anzeigen


Interaktionen durchführen

Klicke, tippe, navigiere wie gewohnt.
Playwright generiert automatisch den entsprechenden Code.



Skript speichern

npx playwright codegen https://example.com --output script.spec.ts
Mit --output kannst du den Code direkt in eine Datei schreiben:
Shellnpx playwright codegen https://example.com --output script.spec.tsWeitere Zeilen anzeigen



Features

Unterstützt JavaScript, TypeScript, Python, Java, .NET.
Automatische Selektor-Erkennung.
Ideal für Testautomatisierung und wiederholbare Workflows.


Beispiel: Login-Test (TypeScript)
import { test, expect } from '@playwright/test';

test('Login-Seite', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.fill('#username', 'meinUser');
  await page.fill('#password', 'meinPasswort');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('https://example.com/dashboard');
});

✅ Tipp: Nutze npx playwright codegen für schnelle Skript-Erstellung und passe den Code anschließend für deine Tests an.

