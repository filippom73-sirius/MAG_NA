# Istruzioni di progetto per GitHub Copilot

## Che cos'è MAGNA

MAGNA è un'app mobile per acquisire e analizzare il campo magnetico di un rotore lungo più quote Z. L'app può mostrare dati simulati oppure dati acquisiti dal magnetometro del telefono; la velocità/posizione angolare può essere alimentata da un encoder ottico via fotocamera o da un secondo telefono collegato in rete.

L'interfaccia è in italiano e in tema scuro. Le viste di analisi sono: Oscilloscopio, Mappa Polare, Digital Twin 3D, Analisi FEM 2D, Sviluppo 2D e Report.

## Prima di modificare il progetto

- Leggi `replit.md` per le decisioni architetturali, i comandi e le limitazioni note.
- Controlla il codice attuale prima di fidarti di questa descrizione: questo file documenta l'intento e i punti di attenzione, non sostituisce l'implementazione.
- Mantieni l'interfaccia in italiano e in tema scuro, salvo richiesta esplicita diversa.
- Non rimuovere o sostituire funzionalità MAGNA esistenti senza una richiesta esplicita.
- Non descrivere come verificata una funzione solo perché esiste un hook o un componente: controlla il flusso dei dati fino alle schermate e ai dati salvati.

## Struttura del codice

- `artifacts/magna/app/(tabs)/index.tsx` — schermata principale, controlli, selezione della modalità, selettore quote Z, navigazione tra le viste e layout a schermo intero.
- `artifacts/magna/context/AppContext.tsx` — stato condiviso, acquisizione, simulazione, gestione delle sessioni, sync degli impulsi e CSV.
- `artifacts/magna/hooks/useMagnetometer.ts` — sottoscrizione al sensore `expo-sensors`.
- `artifacts/magna/hooks/useCameraSync.ts` — lettura ottica dell'encoder con la fotocamera locale e rilevamento degli impulsi.
- `artifacts/magna/hooks/useRemoteSync.ts` — connessione WebSocket agli impulsi dell'encoder remoto.
- `artifacts/magna/components/CameraSyncOverlay.tsx` — interfaccia e calibrazione dell'encoder ottico locale.
- `artifacts/magna/components/RemoteSyncPanel.tsx` — collegamento e stato dell'encoder sul secondo telefono.
- `artifacts/magna/components/charts/` — visualizzazioni SVG: `LinearChart`, `PolarChart`, `DigitalTwin3D`, `Fem2D`, `Unrolled2D`.
- `artifacts/magna/components/ExportTab.tsx` — riepilogo delle sessioni, esportazione CSV e cancellazione dei dati.
- `artifacts/api-server/` — server condiviso e servizi di sincronizzazione.

## Stack e convenzioni

- Workspace pnpm, TypeScript, Expo SDK 54, React Native 0.81, `expo-router`.
- Le visualizzazioni sono realizzate con `react-native-svg`; non introdurre Canvas API nei grafici React Native.
- Lo stato di prodotto è centralizzato in `AppContext`; prima di aggiungere un secondo stato condiviso, verifica se il contesto è il posto appropriato.
- Per i loop animati, usa refs per i valori letti a ogni frame e mantieni aggiornamenti React ragionevoli: evitare di eseguire `setState` per ogni singolo frame senza necessità.
- Rispetta i tipi esistenti `DataPoint`, `Session`, `AppMode`, `RecordingPhase` e `TabId` prima di introdurne di equivalenti.
- Le dipendenze si gestiscono con pnpm nel pacchetto che le usa; non installare dipendenze al root senza una ragione di workspace.
- Non introdurre credenziali, chiavi API o segreti nel codice o nei file di istruzioni.

## Flusso di acquisizione e modalità

- `AppMode` ha due valori: `simulation` (SIM) e `remote` (RMT).
- L'acquisizione ha le fasi `idle`, `trigger_capture` e `sampling`.
- In SIM i valori X/Y/Z sono generati dal simulatore; il controllo FAIL deve essere visibile soltanto durante il campionamento SIM.
- In RMT il magnetometro viene attivato da `useMagnetometer` durante la registrazione, su dispositivi nativi. Il sensore non è supportato sul web.
- Il sistema usa gli impulsi dell'encoder remoto per stimare RPM e avanzamento angolare; i campioni del magnetometro sono distinti dagli impulsi che determinano l'angolo.
- L'encoder ottico locale usa la fotocamera, calibrazione scuro/bianco e rilevamento di transizioni luminose. L'encoder remoto comunica via WebSocket e mostra l'URL da aprire sul secondo telefono.
- Le sessioni sono associate a una quota Z; completata una nuova acquisizione sulla stessa quota, la sessione esistente viene sostituita.
- Le sessioni sono attualmente nello stato React in memoria. L'esportazione CSV è disponibile; non presumere che le misure sopravvivano alla chiusura dell'app.
- Il CSV contiene altezza del pacco, quota Z, angolo e componenti del campo X/Y/Z.

## Requisiti di prodotto già richiesti

- Se la modalità è RMT/non simulata, non mostrare il controllo FAIL e non contaminare i dati reali con dati sintetici.
- Rimuovere il controllo e la funzionalità visibile “DIFETTO SIM”; non ripristinarli senza richiesta esplicita.
- La modalità a schermo intero deve permettere di analizzare tutte e sei le viste: Oscilloscopio, Polare, Twin 3D, FEM 2D, Sviluppo e Report. Deve nascondere i controlli/configurazioni non pertinenti e lasciare disponibili le schede per cambiare vista e il comando per uscire dallo schermo intero.
- Le misure di più quote Z devono poter essere consultate nelle visualizzazioni e nel Report senza confondere dati SIM e RMT.

## Punti da controllare con particolare attenzione

Questi sono punti da verificare nel codice, non comportamenti garantiti:

1. In `AppContext.tsx`, il ramo RMT del loop di campionamento usa i valori correnti del magnetometro solo quando `magnetometerRef.current` non è `null`; altrimenti il percorso corrente chiama `getDataPoint()`, che genera dati simulati. Verificare e correggere questa commistione: in RMT i campioni mancanti devono essere gestiti esplicitamente (per esempio stato di sensore non pronto/errore o campione mancante), mai sostituiti silenziosamente con dati simulati.
2. L'angolo avanza tramite `requestAnimationFrame`, mentre il magnetometro produce callback asincrone e l'encoder produce impulsi. Verificare che i dati siano associati all'angolo/tempo corretto e che la perdita o il ritardo degli impulsi non crei campioni falsamente precisi.
3. `useCameraSync` usa la lunghezza della stringa base64 JPEG come proxy della luminosità e cattura circa ogni 140 ms. Non presentare questa tecnica come misura ottica ad alta frequenza o sincronizzazione hardware. Verificare la calibrazione, l'affidabilità e le limitazioni sui dispositivi reali.
4. Nell'interfaccia il controllo “DIFETTO SIM” è stato rimosso, ma il contesto contiene ancora stato e funzioni `simDefect*`. Non esporre nuovamente l'opzione; rimuovere il codice residuo solo controllando tutti i riferimenti e senza alterare involontariamente il simulatore.
5. Il pulsante FAIL compare nel ramo di campionamento solo se `mode === "simulation"`; verificare anche che la logica di degradazione dei dati sia inattiva in RMT, non soltanto nascosta nell'interfaccia.

Quando tocchi uno di questi flussi, verifica sia il rendering UI sia i dati effettivamente aggiunti a `dataRef`/`sessions` ed esportati. Evita fallback silenziosi che presentino dati inventati come misure reali.

## Schermo intero

`chartFullscreen` è gestito nella schermata principale. In questa modalità header, configurazione, selezione Z, controlli di acquisizione e opzioni di ciascuna vista vengono nascosti; la barra delle schede resta visibile per passare da una vista all'altra. Mantieni questo comportamento coerente per tutte e sei le schede e considera le aree sicure del dispositivo.

## Comandi di verifica

Esegui dal root del workspace:

```bash
pnpm --filter @workspace/magna run typecheck
```

Per il controllo TypeScript di tutto il workspace:

```bash
pnpm run typecheck
```

Quando modifichi il flusso di acquisizione, controlla SIM e RMT separatamente; quando modifichi il layout, controlla le sei viste in modalità normale e a schermo intero. La compilazione TypeScript da sola non dimostra che sensore, fotocamera, encoder remoto o sincronizzazione funzionino correttamente su un telefono reale.

