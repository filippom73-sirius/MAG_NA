# MAGNA — Magnetic Rotor Analysis Platform

App Android per analisi magnetica di rotori, adattata da MagnoScan Pro. Acquisisce e visualizza il campo magnetico di un rotore su 6 tab interattive, con modalità simulazione e lettura magnetometro reale.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (porta 5000)
- `pnpm --filter @workspace/magna run dev` — Expo dev server MAGNA
- `pnpm run typecheck` — typecheck completo su tutti i pacchetti
- `pnpm run build` — typecheck + build

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo ~54, React Native 0.81.5, expo-router
- Grafici: react-native-svg (tutti i rendering SVG, no Canvas API)
- Sensori: expo-sensors (Magnetometer, con Platform.OS check per web)
- Export: expo-file-system + expo-sharing
- Stato: React Context (AppContext)
- API: Express 5 (api-server separato)

## Where things live

```
artifacts/magna/
├── app/(tabs)/index.tsx    — Schermata principale (layout + UI)
├── app/_layout.tsx         — Root layout con AppProvider
├── context/AppContext.tsx  — Tutto lo stato, loop simulazione, export CSV
├── hooks/useMagnetometer.ts — Hook per expo-sensors con Platform check
├── components/
│   ├── charts/
│   │   ├── LinearChart.tsx   — Oscilloscopio (SVG polyline)
│   │   ├── PolarChart.tsx    — Mappa Polare (SVG polar)
│   │   ├── DigitalTwin3D.tsx — Twin 3D (software renderer → SVG Polygon)
│   │   ├── Fem2D.tsx         — Sezione FEM 2D (SVG settori)
│   │   └── Unrolled2D.tsx    — Sviluppo 2D + confronto H0/H1
│   └── ExportTab.tsx         — Report e export CSV
└── constants/colors.ts     — Tema dark (slate-950 base)
```

## Architecture decisions

- **Canvas → SVG**: React Native non ha Canvas API. Tutti i rendering (incluso Digital Twin 3D e FEM 2D) usano react-native-svg con algoritmi identici all'originale.
- **Digital Twin 3D**: Software renderer identico all'HTML originale (funzione project() con proiezione prospettica), output come SVG Polygon elements ordinati per depth (painter's algorithm), 16 segmenti per performance.
- **Loop simulazione**: requestAnimationFrame con ref pattern per evitare stale closures (isRecordingRef, failFactorRef, modeRef, ecc.).
- **Dati live**: dataRef accumula tutti i punti raw; setState aggiornato ogni 4 frame per performance. Fine acquisizione → media per grado → Session.
- **Magnetometro reale**: require('expo-sensors').Magnetometer dentro useEffect con Platform.OS !== 'web'. I valori {x,y,z} in µT sostituiscono i dati simulati mantenendo l'avanzamento angolare time-based.
- **Export CSV**: expo-file-system scrive in documentDirectory, expo-sharing apre il dialog di condivisione Android.

## Product (v1.1)

- 6 tab: Oscilloscopio, Mappa Polare, Digital Twin 3D, Analisi FEM 2D, Sviluppo 2D, Report
- Configurazione: altezza pacco (H24-H50), fette Z (1-20), giri di oversampling
- **RPM manuale a rulli**: decine/unità/decimi/centesimi indipendenti (0.01–99.99 RPM)
- **Fase trigger/calibrazione**: 2 giri per misura RPM reale → poi campionamento con RPM misurato
  - Barra progresso CALIBRAZIONE (0°–720°), badge ACQUISIZIONE con RPM misurato live
- **Assi selezionabili** su Oscilloscopio e Mappa Polare: X / Y / Z + risultante vettoriale |V|
- Selezione quota Z con indicatore acquisito/non acquisito
- **Digital Twin 3D zoom 250% default**, range 100%–400% (passo 25%)
- **Toggle visibilità fette Z** nel 3D: esclusione singola o multipla per quota
- Modalità SIM (simulazione automatica) / REAL (magnetometro dispositivo)
- Fail Test: pressione prolungata degrada il flusso simulato progressivamente
- Export CSV con tutti i dati per sessione Z

## User preferences

- App always in dark mode
- Italian language for all labels
- Keep all original MagnoScan Pro functionality intact

## Gotchas

- expo-sensors, expo-file-system, expo-sharing devono essere alle versioni ~15.0.8, ~19.0.22, ~14.0.8 (compatibili con expo 54)
- PanResponder per rotazione 3D: dragStart cattura rotX/rotY snapshot al momento del touch — fondamentale per evitare rotazione cumulativa errata
- Su web: modalità REAL non disponibile (expo-sensors non supportata), export CSV disabilitato

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `expo` skill for Expo/React Native guidelines
