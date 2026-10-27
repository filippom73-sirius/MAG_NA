# MAG.NA — Specifiche Tecniche del Progetto
**Magnetic Rotor Analysis Platform — v1.1**
Data documento: Giugno 2026

---

## 1. Descrizione del Progetto

MAG.NA è un'applicazione mobile Android per l'analisi del campo magnetico di rotori elettrici. Acquisisce, visualizza ed esporta le misurazioni del flusso magnetico lungo l'asse assiale del rotore, consentendo l'ispezione completa della distribuzione dei poli e il rilevamento di anomalie (squilibri di flusso, poli degradati).

L'applicazione è disponibile in due modalità operative:
- **SIM** — simulazione interna con segnale sintetico 8 poli + rumore, per sviluppo e test
- **REAL** — lettura diretta dal magnetometro fisico del dispositivo Android via `expo-sensors`

---

## 2. Stack Tecnologico

| Componente | Tecnologia | Versione |
|---|---|---|
| Runtime | Node.js | 24 |
| Linguaggio | TypeScript | 5.9 |
| Framework mobile | Expo | ~54 |
| Runtime nativo | React Native | 0.81.5 |
| Routing | expo-router | 6.x |
| Grafici | react-native-svg | 15.12.1 |
| Sensori | expo-sensors | ~15.0.8 |
| Export file | expo-file-system | ~19.0.22 |
| Condivisione | expo-sharing | ~14.0.8 |
| Gestione stato | React Context API | — |
| Package manager | pnpm workspaces | — |

> **Nota:** React Native non espone Canvas API. Tutti i rendering grafici (oscilloscopio, mappa polare, Digital Twin 3D, FEM 2D, Sviluppo 2D) sono implementati con elementi SVG tramite `react-native-svg`.

---

## 3. Architettura dell'Applicazione

### 3.1 Struttura del Progetto

```
artifacts/magna/
├── app/
│   ├── _layout.tsx              Root layout — AppProvider wrapper
│   └── (tabs)/
│       ├── _layout.tsx          Tab layout (tab bar nascosta, UI custom)
│       └── index.tsx            Schermata principale — UI completa
├── context/
│   └── AppContext.tsx           Stato globale, loop simulazione, logica trigger
├── hooks/
│   └── useMagnetometer.ts       Hook expo-sensors con Platform.OS guard
├── components/
│   ├── charts/
│   │   ├── LinearChart.tsx      Oscilloscopio — SVG polyline multi-asse
│   │   ├── PolarChart.tsx       Mappa Polare — SVG polar multi-asse
│   │   ├── DigitalTwin3D.tsx    Digital Twin 3D — software renderer SVG
│   │   ├── Fem2D.tsx            Sezione FEM 2D — SVG settori circolari
│   │   └── Unrolled2D.tsx       Sviluppo 2D — griglia SVG + confronto
│   └── ExportTab.tsx            Pannello Report ed export CSV
└── constants/
    └── colors.ts                Tema dark (slate-950)
```

### 3.2 Gestione dello Stato (AppContext)

Lo stato globale è gestito da un unico `AppContext` con pattern ref per il loop di animazione, per evitare stale closures in `requestAnimationFrame`.

**Refs critici nel loop:**
- `isRecordingRef` — stato acquisizione
- `recordingPhaseRef` — fase corrente (`idle | trigger_capture | sampling`)
- `manualRPMRef` — RPM impostato manualmente
- `measuredRPMRef` — RPM misurato dalla calibrazione
- `liveRPMRef` — RPM calcolato in tempo reale durante il trigger
- `rotationTimestampsRef` — timestamp a ogni giro completato (per media RPM)
- `failFactorRef` — fattore di degrado Fail Test
- `triggerCapRotationsRef` — numero giri fase di trigger

**Pattern di aggiornamento stato:**
```
dataRef.current → accumulo punti raw
setState ogni 4 frame → performance (60fps → ~15 aggiornamenti/s)
Fine acquisizione → media per grado → Session salvata
```

---

## 4. Funzionalità

### 4.1 Configurazione Rotore

| Parametro | Range | Default |
|---|---|---|
| Altezza pacco (H) | H24, H30, H36, H41, H50 mm | H24 |
| Fette Z | 1 – 20 | 5 |
| RPM manuale | 0.01 – 99.99 | 15.00 |
| Giri campionamento (oversampling) | 1 – 20 | 1 |
| Giri trigger (auto) | 1 – 10 | 2 |

### 4.2 Input RPM a Rulli Digitali

L'RPM è configurabile tramite 4 cifre indipendenti con pulsanti ▲/▼:
- **Decine** (×10): cifra delle decine
- **Unità** (×1): cifra delle unità
- **Decimi** (×0.1): prima cifra decimale
- **Centesimi** (×0.01): seconda cifra decimale

Visualizzazione: `XX.XX RPM` — range 0.01 → 99.99, step minimo 0.01.

### 4.3 Sistema di Trigger e Calibrazione

**Due modalità di avvio selezionabili:**

#### Modalità RPM Fisso 🔒
Il campionamento parte immediatamente all'RPM manuale dichiarato. Nessuna fase di calibrazione. Adatta quando la velocità del rotore è nota con precisione.

#### Modalità Auto Trigger 📡 (default)
Ciclo in due fasi automatiche:

**Fase 1 — CALIBRAZIONE**
- Durata: N giri configurabili (default: 2)
- Il motore gira a velocità approssimativa (RPM manuale come stima iniziale)
- A ogni giro completato viene registrato il timestamp
- L'RPM live viene calcolato come media degli intervalli tra giri:
  ```
  RPM_N = 60.000 / media(∆t_giro_1, ∆t_giro_2, ..., ∆t_giro_N)
  ```
- Display RPM LIVE aggiornato in tempo reale nel pannello di controllo
- Barra di avanzamento con contatore `giro X/N`

**Fase 2 — ACQUISIZIONE**
- Parte automaticamente al termine della calibrazione
- Usa l'RPM misurato (non l'RPM manuale) per il timing del campionamento
- Il badge mostra: `ACQUISIZIONE — XX.XX RPM`
- Progresso in gradi con barra blu

### 4.4 Acquisizione Dati

- Frequenza: ~60 fps (requestAnimationFrame)
- Dati acquisiti: `{ angle: number, x: number, y: number, z: number }` in µT
- Accumulo raw in `dataRef`, setState ogni 4 frame
- Fine acquisizione: media per grado (0°–359°) → salvataggio `Session`
- Sessioni multiple per quota Z: ogni quota Z ha la propria sessione indipendente

**Fail Test:** pressione prolungata del tasto FAIL degrada progressivamente `failFactor` (1.0 → 0.0), riducendo l'ampiezza del segnale simulato e aumentando il rumore. Simulazione di un polo degradato o di una perturbazione esterna.

### 4.5 Schede di Visualizzazione

#### Tab 1 — Oscilloscopio (Flussi Lineari)
- Grafico SVG polyline: angolo (°) su asse X, flusso (µT) su asse Y
- **4 canali selezionabili e combinabili:**
  - **X Radiale** (rosso)
  - **Y Tangenziale** (verde)
  - **Z Assiale** (blu)
  - **|V| Risultante vettoriale** `√(x²+y²+z²)` (ambra, tratteggiato)
- Griglia verticale per ogni giro completato
- Cursore giallo sulla posizione angolare corrente

#### Tab 2 — Mappa Polare
- Grafico SVG polare: angolo 0°–360°, raggio proporzionale al flusso
- Stessi 4 canali selezionabili dell'oscilloscopio
- Cerchi guida a 0%, 50%, 100% del range
- Cursore radiale sulla posizione corrente
- Dati live durante acquisizione, dati sessione a riposo

#### Tab 3 — Digital Twin 3D
- Software renderer 3D → output SVG Polygon (nessun WebGL/Canvas)
- Proiezione prospettica con funzione `project(x, y, z)`:
  ```
  Rotazione Y → rotazione X → divisione prospettica
  scale = 140 × zoomScale / (z + camDist)
  ```
- Ordinamento per profondità (Painter's Algorithm)
- 16 segmenti per sezione circolare (bilanciamento performance/qualità)
- Zoom: default 250%, range 100%–400%, step 25%
- Rotazione drag: PanResponder con snapshot rotX/rotY al touchstart
- **Toggle visibilità fette Z**: chip per ogni quota, fette nascoste → opacità 18%
- Linee di campo 3D attivabili/disattivabili
- Colori poli: rosso (Nord), blu (Sud), verde (non campionato)

#### Tab 4 — Analisi FEM 2D
- Sezione trasversale 2D a settori SVG (4° per bucket, 90 settori)
- Mappatura flusso → colore: rosso Polo Nord / blu Polo Sud
- Gain configurabile: 500, 1000, 2000, 4000 µT
- Linee di campo 2D attivabili
- Selezione quota Z indipendente

#### Tab 5 — Sviluppo 2D
- Griglia rettangolare SVG: angolo (36 bucket × 10°) su X, quota Z su Y
- Heatmap flusso per posizione angolare e quota
- Confronto overlay H0/H1 (due quote selezionabili)

#### Tab 6 — Report & Export
- Riepilogo sessioni acquisite per quota Z
- Export CSV con separatore `;`:
  ```
  Altezza Pacco;Quota Z;Angolo;Flusso X;Flusso Y;Flusso Z
  ```
- Export via `expo-file-system` + `expo-sharing` (solo Android)

---

## 5. Modello Dati

```typescript
type DataPoint = {
  angle: number;   // gradi 0–360
  x: number;       // µT asse radiale
  y: number;       // µT asse tangenziale
  z: number;       // µT asse assiale
};

type Session = {
  z: number;       // quota Z in mm
  data: DataPoint[]; // 360 punti (uno per grado, mediati)
};

type RecordingPhase = "idle" | "trigger_capture" | "sampling";
type AppMode = "simulation" | "real";
```

---

## 6. Parametri del Segnale Simulato

Il segnale di simulazione riproduce un rotore a **8 poli** con distribuzione sinusoidale:

```
X(θ) = sin(4θ) × 1750 µT × failFactor + rumore
Y(θ) = cos(4θ) × 1600 µT × failFactor + rumore
Z(θ) = sin(4θ + π/4) × 900 µT × failFactor + rumore
rumore = (rand - 0.5) × (15 + 45 × failFactor) µT
```

`failFactor` ∈ [0.0, 1.0]:
- **1.0** → segnale nominale
- **0.0** → segnale azzerato + massimo rumore

---

## 7. Magnetometro Reale (Modalità REAL)

```typescript
// useMagnetometer.ts
// Solo su Platform.OS !== 'web'
const { Magnetometer } = require('expo-sensors');
Magnetometer.setUpdateInterval(16); // ~60 Hz
subscription = Magnetometer.addListener(({ x, y, z }) => {
  callback({ x, y, z }); // µT dal chip fisico
});
```

I valori `{x, y, z}` del sensore sostituiscono i dati simulati mantenendo l'avanzamento angolare time-based calcolato dall'RPM misurato.

**Limitazioni web:** expo-sensors non è supportata su browser. La modalità REAL è disabilitata su web. L'export CSV è disabilitato su web.

---

## 8. Performance

| Metrica | Valore |
|---|---|
| Loop acquisizione | 60 fps (requestAnimationFrame) |
| Aggiornamenti setState | ogni 4 frame (~15/s) |
| Segmenti cilindro 3D | 16 (per perf.) |
| Punti per sessione | 360 (1 per grado, mediati) |
| Quote Z massime | 20 |
| Sessioni massime | 20 (una per quota Z) |

---

## 9. Flusso Operativo Tipico

```
1. Seleziona altezza pacco (H24–H50)
2. Imposta numero fette Z (1–20)
3. Imposta RPM manuale con i rulli digitali
4. Scegli modalità: Auto Trigger o RPM Fisso
5. Se Auto Trigger: imposta giri trigger (1–10)
6. Seleziona quota Z da acquisire (Z1, Z2, ...)
7. Premi AVVIA
   ├─ [Auto Trigger] → CALIBRAZIONE N giri (RPM LIVE visibile)
   │                 → auto-switch ACQUISIZIONE al termine
   └─ [RPM Fisso]   → ACQUISIZIONE immediata
8. Al termine: sessione salvata per quella quota Z
9. Ripeti dal punto 6 per ogni quota Z
10. Vai su tab Report → Esporta CSV
```

---

## 10. Versioni

| Versione | Data | Novità principali |
|---|---|---|
| v1.0 | Maggio 2026 | Primo rilascio. 6 tab, sim+real, Fail Test, export CSV |
| v1.1 | Giugno 2026 | RPM rulli digitali, Auto Trigger con calibrazione 2 giri, toggle assi X/Y/Z/\|V\|, zoom 3D 250% default (100–400%), toggle fette Z nel 3D, campo giri trigger configurabile (1–10), display RPM LIVE durante calibrazione, switch RPM Fisso / Auto Trigger, nome app MAG.NA |

---

## 11. Dipendenze Principali

```json
{
  "expo": "~54.0.0",
  "react-native": "0.81.5",
  "expo-router": "~6.0.0",
  "react-native-svg": "15.12.1",
  "expo-sensors": "~15.0.8",
  "expo-file-system": "~19.0.22",
  "expo-sharing": "~14.0.8",
  "@expo/vector-icons": "^14.0.0",
  "react-native-safe-area-context": "4.14.1"
}
```

---

## 12. Note di Compatibilità

- **Target platform:** Android (primario)
- **iOS:** compatibile (expo-sensors supportata), non testato
- **Web:** visualizzazione parziale — modalità REAL e export CSV disabilitati
- **Expo Go:** testabile via QR code dall'URL Metro (`exp://...`)
- **Build di produzione:** `eas build --platform android`

---

*Documento generato automaticamente — MAG.NA v1.1 — Giugno 2026*
