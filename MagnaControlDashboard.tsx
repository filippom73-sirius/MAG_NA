import React, { useEffect, useState } from "react";
import "./magnaControlDashboard.css";

const tabs = ["Oscillo", "Polare", "Twin 3D", "FEM 2D", "Sviluppo", "Report"];
const zSlices = [0, 6, 12, 18, 24];
const channels = [
  { key: "X", color: "#f06b68", label: "Radiale" },
  { key: "Y", color: "#55d6a2", label: "Tangenziale" },
  { key: "Z", color: "#71a9ff", label: "Assiale" },
  { key: "|V|", color: "#f4bd62", label: "Risultante" },
];

function wavePath(amplitude: number, phase: number, offset = 0) {
  return Array.from({ length: 73 }, (_, i) => {
    const x = (i / 72) * 600;
    const y = 95 + offset + Math.sin((i / 72) * Math.PI * 8 + phase) * amplitude
      + Math.sin((i / 72) * Math.PI * 19 + phase * 0.7) * 3;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export function MagnaControlDashboard() {
  const [tab, setTab] = useState("Oscillo");
  const [mode, setMode] = useState<"SIM" | "RMT">("SIM");
  const [running, setRunning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [rpm, setRpm] = useState(15);
  const [z, setZ] = useState(0);
  const [height, setHeight] = useState(24);
  const [slices, setSlices] = useState(5);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeChannels, setActiveChannels] = useState(["X", "Y", "Z"]);
  const [fail, setFail] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setAngle((value) => (value + 3) % 360), 160);
    return () => window.clearInterval(timer);
  }, [running]);

  const toggleChannel = (key: string) => {
    setActiveChannels((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

  return (
    <main className="magna-shell">
      <header className="magna-topbar">
        <div className="magna-brand">
          <div className="magna-mark"><span /><span /><span /></div>
          <div>
            <div className="magna-wordmark">MAG<span>.</span>NA <small>v1.2</small></div>
            <div className="magna-caption">ANALISI MAGNETICA ROTORE</div>
          </div>
        </div>
        <div className="magna-top-right">
          <div className="mode-switch" aria-label="Modalità">
            {(["SIM", "RMT"] as const).map((item) => (
              <button key={item} onClick={() => !running && setMode(item)} className={mode === item ? "selected" : ""}>{item}</button>
            ))}
          </div>
          <div className="angle-readout"><span>ANGOLO</span><strong>{String(Math.floor(angle)).padStart(3, "0")}<i>°</i></strong></div>
        </div>
      </header>

      <section className="magna-telemetry" aria-label="Stato acquisizione">
        <div className="telemetry-state"><span className={`state-led ${running ? "is-live" : ""}`} />{running ? "ACQUISIZIONE ATTIVA" : "SISTEMA PRONTO"}</div>
        <div className="telemetry-values">
          <div><span>VELOCITÀ</span><strong>{rpm.toFixed(2)} <small>RPM</small></strong></div>
          <div><span>QUOTA Z</span><strong>{z}<small> mm</small></strong></div>
          <div><span>SESSIONI</span><strong>{running ? "01" : "00"}<small> / {slices}</small></strong></div>
        </div>
      </section>

      <section className="magna-chart-card">
        <div className="chart-heading">
          <div>
            <div className="section-eyebrow"><span className="eyebrow-line" /> CANALI IN TEMPO REALE</div>
            <h1>{tab === "Oscillo" ? "Flussi lineari" : tab === "Polare" ? "Mappa polare" : tab}</h1>
            <p>Rotore · sezione Z {z} mm <span className="chart-separator">/</span> 360°</p>
          </div>
          <div className="chart-live-tag"><span className={running ? "live-pulse" : ""} />{running ? "LIVE" : "STANDBY"}</div>
        </div>

        <div className="wave-plot">
          <div className="plot-unit">µT</div>
          <svg viewBox="0 0 600 190" preserveAspectRatio="none" role="img" aria-label="Grafico dei flussi magnetici">
            <defs>
              <linearGradient id="magna-fill-x" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#f06b68" stopOpacity=".18" />
                <stop offset="100%" stopColor="#f06b68" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[20, 58, 96, 134, 172].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="600" y2={y} className="plot-grid" />)}
            {[0, 100, 200, 300, 400, 500, 600].map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="190" className="plot-grid vertical" />)}
            <path d={`${wavePath(28, 0, 0)} L600 180 L0 180 Z`} fill="url(#magna-fill-x)" />
            {activeChannels.includes("X") && <path d={wavePath(37, 0)} className="wave-line wave-x" />}
            {activeChannels.includes("Y") && <path d={wavePath(31, Math.PI / 2, 1)} className="wave-line wave-y" />}
            {activeChannels.includes("Z") && <path d={wavePath(20, Math.PI / 4, 2)} className="wave-line wave-z" />}
            {activeChannels.includes("|V|") && <path d={wavePath(12, -Math.PI / 3, -26)} className="wave-line wave-r" />}
            <line x1={angle / 360 * 600} y1="0" x2={angle / 360 * 600} y2="190" className="angle-marker" />
            <circle cx={angle / 360 * 600} cy={95 + Math.sin(angle / 360 * Math.PI * 8) * 37} r="4" className="angle-point" />
          </svg>
          <div className="plot-axis"><span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span></div>
        </div>

        <div className="channel-legend">
          {channels.map(({ key, color, label }) => (
            <button key={key} className={`channel-chip ${activeChannels.includes(key) ? "channel-on" : ""}`} onClick={() => toggleChannel(key)}>
              <span style={{ backgroundColor: activeChannels.includes(key) ? color : "#465363" }} />
              <b>{key}</b><small>{label}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="magna-sweep">
        <div className="sweep-head">
          <div><div className="section-eyebrow">PROFILO ASSIALE</div><strong>Quote di misura</strong></div>
          <button className="config-link" onClick={() => setConfigOpen((open) => !open)}>{configOpen ? "CHIUDI −" : "CONFIGURA +"}</button>
        </div>
        <div className="z-rail">
          {zSlices.slice(0, slices).map((step, index) => (
            <button key={`${step}-${index}`} onClick={() => setZ(step)} className={`z-point ${z === step ? "z-current" : ""}`}>
              <span className="z-point-dot" /><b>Z{index + 1}</b><small>{step}<i>mm</i></small>
            </button>
          ))}
          <div className="z-line" />
        </div>
        {configOpen && (
          <div className="config-drawer">
            <div className="config-control">
              <span>Pacco Z</span>
              <div className="compact-options">{[24, 30, 36, 41, 50].map((value) => <button key={value} className={height === value ? "option-active" : ""} onClick={() => setHeight(value)}>H{value}</button>)}</div>
            </div>
            <div className="config-control rpm-control">
              <span>RPM manuale</span>
              <div className="rpm-adjust"><button onClick={() => setRpm((value) => Math.max(0.01, value - 0.25))}>−</button><strong>{rpm.toFixed(2)}</strong><button onClick={() => setRpm((value) => Math.min(99.99, value + 0.25))}>+</button><small>RPM</small></div>
            </div>
            <div className="config-control">
              <span>Fette Z · {slices}</span>
              <input aria-label="Numero fette Z" type="range" min="1" max="5" value={slices} onChange={(event) => setSlices(Number(event.target.value))} />
            </div>
          </div>
        )}
      </section>

      <nav className="magna-tabs" aria-label="Viste analisi">
        {tabs.map((item, index) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "tab-current" : ""}><span>{["⌁", "◉", "◇", "◌", "⇄", "↓"][index]}</span>{item}</button>)}
      </nav>

      <footer className="magna-actionbar">
        <button className={`primary-action ${running ? "action-stop" : ""}`} onClick={() => setRunning((state) => !state)}>
          <span>{running ? "■" : "▶"}</span>{running ? "ARRESTA ACQUISIZIONE" : `AVVIA · Z ${z} MM`}
        </button>
        {running && mode === "SIM" && <button className={`fail-action ${fail ? "fail-on" : ""}`} onClick={() => setFail((value) => !value)}>FAIL<br /><b>{fail ? "61%" : "100%"}</b></button>}
        <button className="reset-action" aria-label="Azzera" onClick={() => { setRunning(false); setAngle(0); setFail(false); }}>↺</button>
      </footer>
      <div className="magna-footer-meta"><span>MAGNETIC ROTOR ANALYZER</span><span>BUILD 01.24 <i>●</i> READY</span></div>
    </main>
  );
}
