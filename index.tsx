import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RemoteSyncPanel } from "@/components/RemoteSyncPanel";
import { ExportTab } from "@/components/ExportTab";
import { DigitalTwin3D } from "@/components/charts/DigitalTwin3D";
import { Fem2D } from "@/components/charts/Fem2D";
import { LinearChart } from "@/components/charts/LinearChart";
import { PolarChart } from "@/components/charts/PolarChart";
import { Unrolled2D } from "@/components/charts/Unrolled2D";
import { AppMode, TabId, useApp } from "@/context/AppContext";

const APP_VERSION = "v1.2";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "oscilloscope", label: "Oscillo", icon: "activity" },
  { id: "polar", label: "Polare", icon: "map" },
  { id: "heatmap", label: "Twin 3D", icon: "box" },
  { id: "fem2d", label: "FEM 2D", icon: "circle" },
  { id: "unrolled2d", label: "Sviluppo", icon: "sliders" },
  { id: "export", label: "Report", icon: "download" },
];

const PACCO_OPTIONS = [24, 30, 36, 41, 50];

// ── RPM digit roller ──────────────────────────────────────────────────────────
function RPMInput({ value, onChange, disabled }: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const safe = Math.max(0.01, Math.min(99.99, value));
  const tens = Math.floor(safe / 10) % 10;
  const units = Math.floor(safe) % 10;
  const tenths = Math.floor(safe * 10) % 10;
  const hundredths = Math.floor(safe * 100) % 10;

  const adjust = (place: 0 | 1 | 2 | 3, delta: number) => {
    if (disabled) return;
    const multiplier = [10, 1, 0.1, 0.01][place];
    const next = Math.max(0.01, Math.min(99.99, Math.round((safe + delta * multiplier) * 100) / 100));
    onChange(next);
  };

  const digits = [
    { val: tens, place: 0 as const, label: "×10" },
    { val: units, place: 1 as const, label: "×1" },
    { val: tenths, place: 2 as const, label: "×0.1" },
    { val: hundredths, place: 3 as const, label: "×0.01" },
  ];

  return (
    <View style={rpmStyles.wrap}>
      <Text style={rpmStyles.label}>RPM Manuale</Text>
      <View style={rpmStyles.row}>
        {digits.map((d, i) => (
          <React.Fragment key={i}>
            {i === 2 && <Text style={rpmStyles.dot}>.</Text>}
            <View style={rpmStyles.digit}>
              <Pressable onPress={() => adjust(d.place, 1)} style={[rpmStyles.btn, disabled && rpmStyles.btnDis]}>
                <Text style={rpmStyles.btnTxt}>▲</Text>
              </Pressable>
              <View style={rpmStyles.digitBox}>
                <Text style={rpmStyles.digitTxt}>{d.val}</Text>
              </View>
              <Pressable onPress={() => adjust(d.place, -1)} style={[rpmStyles.btn, disabled && rpmStyles.btnDis]}>
                <Text style={rpmStyles.btnTxt}>▼</Text>
              </Pressable>
            </View>
          </React.Fragment>
        ))}
        <Text style={rpmStyles.unit}>RPM</Text>
      </View>
    </View>
  );
}

const rpmStyles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { color: "#64748b", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  dot: { color: "#f1f5f9", fontSize: 20, fontWeight: "800", marginTop: -8, paddingHorizontal: 1 },
  digit: { alignItems: "center", gap: 2 },
  btn: { backgroundColor: "#334155", borderRadius: 4, width: 28, height: 18, alignItems: "center", justifyContent: "center" },
  btnDis: { opacity: 0.3 },
  btnTxt: { color: "#f1f5f9", fontSize: 8, fontWeight: "800" },
  digitBox: { backgroundColor: "#0f172a", borderRadius: 6, width: 28, height: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#334155" },
  digitTxt: { color: "#10b981", fontSize: 18, fontFamily: "monospace", fontWeight: "800" },
  unit: { color: "#64748b", fontSize: 10, fontWeight: "700", marginLeft: 4 },
});

// ── Axis toggle bar ───────────────────────────────────────────────────────────
function AxisToggles() {
  const { showAxisX, setShowAxisX, showAxisY, setShowAxisY, showAxisZ, setShowAxisZ, showResultant, setShowResultant } = useApp();
  return (
    <View style={axisStyles.row}>
      <Text style={axisStyles.label}>Canali:</Text>
      {[
        { key: "X", color: "#ef4444", active: showAxisX, toggle: () => setShowAxisX(!showAxisX) },
        { key: "Y", color: "#10b981", active: showAxisY, toggle: () => setShowAxisY(!showAxisY) },
        { key: "Z", color: "#3b82f6", active: showAxisZ, toggle: () => setShowAxisZ(!showAxisZ) },
        { key: "|V|", color: "#f59e0b", active: showResultant, toggle: () => setShowResultant(!showResultant) },
      ].map(({ key, color, active, toggle }) => (
        <Pressable
          key={key}
          onPress={toggle}
          style={[axisStyles.chip, active && { borderColor: color, backgroundColor: color + "22" }]}
        >
          <View style={[axisStyles.dot, { backgroundColor: active ? color : "#475569" }]} />
          <Text style={[axisStyles.chipTxt, active && { color }]}>{key}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const axisStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  label: { color: "#64748b", fontSize: 10, fontWeight: "700" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#0f172a" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { color: "#475569", fontSize: 10, fontWeight: "700", fontFamily: "monospace" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MainScreen() {
  const insets = useSafeAreaInsets();
  const {
    mode, setMode,
    activeTab, setActiveTab,
    isRecording, recordingPhase, currentAngle, failFactor,
    sessions, activeSteps, triggerRPM, triggerProgress,
    manualRPM, setManualRPM,
    useAutoTrigger, setUseAutoTrigger,
    triggerCapRotations, setTriggerCapRotations,
    liveRPM,
    paccoHeight, setPaccoHeight,
    fetteZ, setFetteZ,
    zOffset, setZOffset,
    selected2DStep, setSelected2DStep,
    targetRotations, setTargetRotations,
    showFluxLines, setShowFluxLines,
    show2DFluxLines, setShow2DFluxLines,
    femGain, setFemGain,
    zoomScale, setZoomScale,
    hiddenZSlices, toggleZSliceVisibility,
    handleStart, handleStop, handleReset,
    setFailPressed,
  } = useApp();

  const [configOpen, setConfigOpen] = useState(true);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const { width, height } = useWindowDimensions();
  const _isLandscape = width > height; // disponibile per future ottimizzazioni layout landscape
  const topPad = insets.top || 24;
  const bottomPad = insets.bottom || 16;

  const TRIGGER_MAX = triggerCapRotations * 360;
  const triggerPct = Math.min(100, (triggerProgress / TRIGGER_MAX) * 100);
  const completedRotations = Math.floor(triggerProgress / 360);

  // Control bar content depends on phase
  const renderControlBar = () => {
    if (recordingPhase === "trigger_capture") {
      return (
        <View style={styles.controlBar}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.phaseRow}>
              <View style={styles.calibBadge}>
                <Text style={styles.calibBadgeText}>
                  CALIBRAZIONE — giro {completedRotations}/{triggerCapRotations}
                </Text>
              </View>
              <Text style={styles.triggerAngle}>{Math.floor(triggerProgress)}° / {TRIGGER_MAX}°</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${triggerPct}%` }]} />
            </View>
          </View>

          {/* Mini display RPM live */}
          <View style={styles.liveRPMDisplay}>
            <Text style={styles.liveRPMLabel}>RPM{"\n"}LIVE</Text>
            <Text style={styles.liveRPMValue}>
              {liveRPM !== null ? liveRPM.toFixed(2) : "--.-"}
            </Text>
          </View>

          <Pressable onPress={handleStop} style={styles.btnStop}>
            <Text style={styles.btnText}>■</Text>
          </Pressable>
          <Pressable onPress={handleReset} style={styles.btnReset}>
            <Text style={styles.btnResetText}>↺</Text>
          </Pressable>
        </View>
      );
    }

    if (recordingPhase === "sampling") {
      const pct = Math.min(100, (currentAngle / (targetRotations * 360)) * 100);
      return (
        <View style={styles.controlBar}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.phaseRow}>
              <View style={styles.samplingBadge}>
                <View style={styles.recDotActive} />
                <Text style={styles.samplingBadgeText}>
                  ACQUISIZIONE {triggerRPM ? `— ${triggerRPM.toFixed(2)} RPM` : ""}
                </Text>
              </View>
              <Text style={styles.triggerAngle}>{Math.floor(currentAngle)}° / {targetRotations * 360}°</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFillBlue, { width: `${pct}%` }]} />
            </View>
          </View>
          {mode === "simulation" && (
            <Pressable
              onPressIn={() => setFailPressed(true)}
              onPressOut={() => setFailPressed(false)}
              style={[styles.btnFail, failFactor < 0.9 && styles.btnFailActive]}
            >
              <Text style={[styles.btnText, { fontSize: 9 }]}>
                FAIL{"\n"}{(failFactor * 100).toFixed(0)}%
              </Text>
            </Pressable>
          )}
          <Pressable onPress={handleStop} style={styles.btnStop}>
            <Text style={styles.btnText}>■ Stop</Text>
          </Pressable>
          <Pressable onPress={handleReset} style={styles.btnReset}>
            <Text style={styles.btnResetText}>↺</Text>
          </Pressable>
        </View>
      );
    }

    // Idle
    return (
      <View style={styles.controlBar}>
        {triggerRPM !== null && (
          <View style={styles.measuredRPMBadge}>
            <Text style={styles.measuredRPMLabel}>
              {mode === "remote" ? "Encoder" : "Misurato"}
            </Text>
            <Text style={styles.measuredRPMValue}>{triggerRPM.toFixed(2)}</Text>
            <Text style={styles.measuredRPMUnit}>RPM</Text>
          </View>
        )}
        <Pressable onPress={handleStart} style={styles.btnStart}>
          <Text style={styles.btnText}>▶ Avvia Z={zOffset}mm</Text>
        </Pressable>
        <Pressable onPress={handleReset} style={styles.btnReset}>
          <Text style={styles.btnResetText}>↺</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── HEADER + CONFIG + Z-ROW (nascosti in fullscreen) ── */}
      {!chartFullscreen && <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={styles.headerTitle}>MAG.NA</Text>
              <Text style={styles.headerVersion}>{APP_VERSION}</Text>
            </View>
            <Text style={styles.headerSub}>Analisi Magnetica Rotore</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.angleDisplay}>
            {recordingPhase === "trigger_capture"
              ? `CAL ${Math.floor(triggerProgress)}°`
              : `${Math.floor(currentAngle)}°`}
          </Text>
          {/* 2-way mode selector: SIM / RMT */}
          <View style={styles.modeSelectorRow}>
            {(["simulation", "remote"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => { if (!isRecording) setMode(m); }}
                style={[styles.modeSelectorChip, mode === m && styles.modeSelectorChipActive]}
              >
                <Text style={[styles.modeSelectorText, mode === m && styles.modeSelectorTextActive]}>
                  {m === "simulation" ? "SIM" : "RMT"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* ── CONFIG PANEL ── */}
      <Pressable onPress={() => setConfigOpen(!configOpen)} style={styles.configToggle}>
        <Text style={styles.configToggleLabel}>Configurazione</Text>
        <Text style={{ color: "#64748b", fontSize: 11 }}>{configOpen ? "▲" : "▼"}</Text>
      </Pressable>

      {configOpen && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.configScroll}
          contentContainerStyle={styles.configContent}
        >
          {/* Pacco */}
          <View style={styles.configItem}>
            <Text style={styles.configLabel}>Pacco Z</Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {PACCO_OPTIONS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => !isRecording && setPaccoHeight(h)}
                  style={[styles.optionChip, paccoHeight === h && styles.optionChipActive]}
                >
                  <Text style={[styles.optionText, paccoHeight === h && { color: "#fff" }]}>H{h}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Fette Z */}
          <View style={styles.configItem}>
            <Text style={styles.configLabel}>Fette Z</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => !isRecording && setFetteZ(Math.max(1, fetteZ - 1))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{fetteZ}</Text>
              <Pressable onPress={() => !isRecording && setFetteZ(Math.min(20, fetteZ + 1))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          {/* RPM */}
          <RPMInput value={manualRPM} onChange={setManualRPM} disabled={isRecording} />

          {/* Giri di trigger (solo in auto) */}
          {useAutoTrigger && (
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Giri trigger</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => !isRecording && setTriggerCapRotations(triggerCapRotations - 1)} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{triggerCapRotations}</Text>
                <Pressable onPress={() => !isRecording && setTriggerCapRotations(triggerCapRotations + 1)} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Modalità trigger */}
          <View style={styles.configItem}>
            <Text style={styles.configLabel}>Modalità avvio</Text>
            <View style={styles.triggerModeBox}>
              <Pressable
                onPress={() => !isRecording && setUseAutoTrigger(false)}
                style={[styles.triggerModeChip, !useAutoTrigger && styles.triggerModeChipActive]}
                disabled={isRecording}
              >
                <Text style={[styles.triggerModeText, !useAutoTrigger && { color: "#f59e0b" }]}>
                  RPM fisso
                </Text>
              </Pressable>
              <Pressable
                onPress={() => !isRecording && setUseAutoTrigger(true)}
                style={[styles.triggerModeChip, useAutoTrigger && styles.triggerModeChipActiveBlue]}
                disabled={isRecording}
              >
                <Text style={[styles.triggerModeText, useAutoTrigger && { color: "#3b82f6" }]}>
                  Auto trigger
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Giri oversampling */}
          <View style={styles.configItem}>
            <Text style={styles.configLabel}>Giri campion.</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => !isRecording && setTargetRotations(Math.max(1, targetRotations - 1))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{targetRotations}</Text>
              <Pressable onPress={() => !isRecording && setTargetRotations(Math.min(20, targetRotations + 1))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          {/* Sessions */}
          <View style={styles.configItem}>
            <Text style={styles.configLabel}>Sessioni</Text>
            <Text style={styles.sessionsCount}>{sessions.length}/{activeSteps.length}</Text>
          </View>

        </ScrollView>
      )}

      {/* ── Z STEP SELECTOR ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.zRow}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: "center" }}
      >
        {activeSteps.map((step, idx) => {
          const isSelected = Math.abs(zOffset - step) < 0.1;
          const isAcquired = sessions.some((s) => Math.abs(s.z - step) < 0.1);
          return (
            <Pressable
              key={idx}
              onPress={() => !isRecording && setZOffset(step)}
              style={[
                styles.zStep,
                isSelected && styles.zStepSelected,
                isAcquired && !isSelected && styles.zStepAcquired,
              ]}
            >
              <Text style={[styles.zStepLabel, isSelected && { color: "#fff" }]}>Z{idx + 1}</Text>
              <Text style={[styles.zStepValue, isSelected && { color: "#93c5fd" }]}>{step}mm</Text>
              {isAcquired && <View style={styles.zDot} />}
            </Pressable>
          );
        })}
      </ScrollView>

      </>}

      {/* ── TAB BAR (sempre visibile, con pulsante fullscreen) ── */}
      <View style={styles.tabBarRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 4, alignItems: "center" }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, activeTab === tab.id && { color: "#fff" }]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          onPress={() => setChartFullscreen((v) => !v)}
          style={styles.fullscreenBtn}
          hitSlop={8}
        >
          <Text style={{ color: "#64748b", fontSize: 16 }}>{chartFullscreen ? "⊡" : "⊞"}</Text>
        </Pressable>
      </View>

      {/* ── CONTROL BAR + REMOTE PANEL (nascosti in fullscreen) ── */}
      {!chartFullscreen && <>
        {renderControlBar()}
        {mode === "remote" && <RemoteSyncPanel />}
      </>}

      {/* ── TAB CONTENT ── */}
      <ScrollView
        style={[styles.content, chartFullscreen && styles.contentFullscreen]}
        contentContainerStyle={[styles.contentInner, { paddingBottom: (chartFullscreen ? 8 : bottomPad) + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* OSCILLOSCOPE */}
        {activeTab === "oscilloscope" && (
          <View style={styles.tabContent}>
            {!chartFullscreen && (
              <View style={styles.tabHeaderRow}>
                <View style={styles.tabHeaderLeft}>
                  <View style={[styles.recDot, isRecording && styles.recDotActive]} />
                  <Text style={styles.tabTitle}>Flussi Lineari — Z={zOffset}mm</Text>
                </View>
              </View>
            )}
            {!chartFullscreen && <AxisToggles />}
            <LinearChart />
            {!chartFullscreen && (
              <View style={styles.legend}>
                {[
                  { color: "#ef4444", label: "X Radiale" },
                  { color: "#10b981", label: "Y Tangenziale" },
                  { color: "#3b82f6", label: "Z Assiale" },
                  { color: "#f59e0b", label: "|V| Risultante" },
                ].map(({ color, label }) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* POLAR */}
        {activeTab === "polar" && (
          <View style={styles.tabContent}>
            {!chartFullscreen && (
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabTitle}>Mappa Polare — Z={zOffset}mm</Text>
              </View>
            )}
            {!chartFullscreen && <AxisToggles />}
            <PolarChart />
            {!chartFullscreen && (
              <Text style={styles.tabNote}>La mappa mostra la distribuzione angolare del flusso.</Text>
            )}
          </View>
        )}

        {/* HEATMAP / DIGITAL TWIN 3D */}
        {activeTab === "heatmap" && (
          <View style={styles.tabContent}>
            {!chartFullscreen && (
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabTitle}>Digital Twin 3D — H{paccoHeight}</Text>
                <View style={styles.zoomRow}>
                  <Pressable onPress={() => setZoomScale((p: number) => Math.max(1.0, Math.round((p - 0.25) * 100) / 100))} style={styles.zoomBtn}>
                    <Text style={styles.zoomBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.zoomLabel}>{Math.round(zoomScale * 100)}%</Text>
                  <Pressable onPress={() => setZoomScale((p: number) => Math.min(4.0, Math.round((p + 0.25) * 100) / 100))} style={styles.zoomBtn}>
                    <Text style={styles.zoomBtnText}>+</Text>
                  </Pressable>
                  <Pressable onPress={() => setZoomScale(2.5)} style={styles.zoomBtn}>
                    <Text style={[styles.zoomBtnText, { fontSize: 9 }]}>RST</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {!chartFullscreen && (
              <View style={styles.rowBetween}>
                <View style={styles.fluxToggle}>
                  <Text style={styles.fluxToggleLabel}>Campo 3D</Text>
                  <Switch
                    value={showFluxLines}
                    onValueChange={setShowFluxLines}
                    trackColor={{ false: "#334155", true: "#1d4ed8" }}
                    thumbColor={showFluxLines ? "#3b82f6" : "#64748b"}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                </View>
                <Text style={styles.tabNote}>Trascina per ruotare</Text>
              </View>
            )}

            {!chartFullscreen && (
              <View style={styles.zVisSection}>
                <Text style={styles.configLabel}>Quote Z visibili:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 5 }}>
                    {activeSteps.map((step, idx) => {
                      const hidden = hiddenZSlices.includes(step);
                      const isAcquired = sessions.some((s) => Math.abs(s.z - step) < 0.1);
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => toggleZSliceVisibility(step)}
                          style={[
                            styles.zVisChip,
                            !hidden && isAcquired && { borderColor: "#10b981", backgroundColor: "#052e16" },
                            !hidden && !isAcquired && { borderColor: "#334155", backgroundColor: "#0f172a" },
                            hidden && styles.zVisChipHidden,
                          ]}
                        >
                          <Text style={[styles.zVisChipText, hidden && { color: "#475569" }, !hidden && isAcquired && { color: "#10b981" }]}>
                            Z{idx + 1} {step}mm
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            <DigitalTwin3D />

            {!chartFullscreen && (
              <View style={styles.legendRow}>
                {[
                  { color: "#39ff14", label: "Non campionato" },
                  { color: "#ef4444", label: "Polo Nord" },
                  { color: "#3b82f6", label: "Polo Sud" },
                ].map(({ color, label }) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* FEM 2D */}
        {activeTab === "fem2d" && (
          <View style={styles.tabContent}>
            {!chartFullscreen && (
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabTitle}>Sezione FEM 2D</Text>
                <View style={styles.fluxToggle}>
                  <Text style={styles.fluxToggleLabel}>Linee</Text>
                  <Switch
                    value={show2DFluxLines}
                    onValueChange={setShow2DFluxLines}
                    trackColor={{ false: "#334155", true: "#1d4ed8" }}
                    thumbColor={show2DFluxLines ? "#3b82f6" : "#64748b"}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                </View>
              </View>
            )}
            {!chartFullscreen && (
              <View style={styles.fem2dQuota}>
                <Text style={styles.configLabel}>Quota Z:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {activeSteps.map((s, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setSelected2DStep(s)}
                      style={[styles.optionChip, Math.abs(selected2DStep - s) < 0.1 && styles.optionChipActive]}
                    >
                      <Text style={[styles.optionText, Math.abs(selected2DStep - s) < 0.1 && { color: "#fff" }]}>{s}mm</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {!chartFullscreen && (
              <View style={styles.gainRow}>
                <Text style={styles.configLabel}>Gain: {femGain} µT</Text>
                <View style={styles.gainBtns}>
                  {[500, 1000, 2000, 4000].map((g) => (
                    <Pressable key={g} onPress={() => setFemGain(g)} style={[styles.optionChip, femGain === g && styles.optionChipActive]}>
                      <Text style={[styles.optionText, femGain === g && { color: "#fff" }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <Fem2D />
            {!chartFullscreen && (
              <View style={styles.legendRow}>
                {[
                  { color: "#ef4444", label: "Polo Nord" },
                  { color: "#3b82f6", label: "Polo Sud" },
                  { color: "#39ff14", label: "Non campionato" },
                ].map(({ color, label }) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* UNROLLED 2D */}
        {activeTab === "unrolled2d" && (
          <View style={styles.tabContent}>
            {!chartFullscreen && <Text style={styles.tabTitle}>Sviluppo & Confronto</Text>}
            <Unrolled2D />
          </View>
        )}

        {/* EXPORT */}
        {activeTab === "export" && (
          <View style={styles.tabContent}>
            {!chartFullscreen && <Text style={styles.tabTitle}>Report & Esportazione</Text>}
            <ExportTab />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { backgroundColor: "#1e3a8a", padding: 8, borderRadius: 10 },
  headerTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  headerVersion: { color: "#3b82f6", fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  headerSub: { color: "#475569", fontSize: 9, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  angleDisplay: { color: "#10b981", fontFamily: "monospace", fontSize: 12, fontWeight: "700", backgroundColor: "#0f172a", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: "#1e293b" },
  modeToggle: { flexDirection: "row", alignItems: "center", gap: 3 },
  modeLabel: { color: "#475569", fontSize: 9, fontWeight: "700" },
  modeLabelActive: { color: "#3b82f6" },
  modeSelectorRow: { flexDirection: "row", gap: 3 },
  modeSelectorChip: { borderWidth: 1, borderColor: "#334155", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#0f172a" },
  modeSelectorChipActive: { backgroundColor: "#1e3a8a", borderColor: "#3b82f6" },
  modeSelectorText: { color: "#475569", fontSize: 9, fontWeight: "800" },
  modeSelectorTextActive: { color: "#93c5fd" },
  camBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#172554", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#1e3a8a" },
  camBadgeText: { color: "#60a5fa", fontSize: 8, fontWeight: "700" },

  // Config
  configToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#0f172a", borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  configToggleLabel: { color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  configScroll: { maxHeight: 100, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  configContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 16, alignItems: "center" },
  configItem: { gap: 4 },
  configLabel: { color: "#64748b", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  optionChip: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginRight: 4, backgroundColor: "#1e293b" },
  optionChipActive: { backgroundColor: "#1d4ed8", borderColor: "#3b82f6" },
  optionText: { color: "#94a3b8", fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { backgroundColor: "#334155", borderRadius: 6, width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: "#f1f5f9", fontSize: 14, fontWeight: "700" },
  stepValue: { color: "#f1f5f9", fontSize: 15, fontWeight: "800", fontFamily: "monospace", minWidth: 24, textAlign: "center" },
  sessionsCount: { color: "#10b981", fontSize: 18, fontWeight: "800", fontFamily: "monospace" },

  // Z Selector
  zRow: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  zStep: { borderWidth: 1, borderColor: "#1e293b", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center", backgroundColor: "#0f172a", minWidth: 48 },
  zStepSelected: { backgroundColor: "#172554", borderColor: "#3b82f6" },
  zStepAcquired: { borderColor: "#166534" },
  zStepLabel: { color: "#475569", fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  zStepValue: { color: "#94a3b8", fontSize: 10, fontFamily: "monospace", fontWeight: "700" },
  zDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#10b981", marginTop: 2 },

  // Tab Bar
  tabBarRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  tabBar: { flex: 1, maxHeight: 46 },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: "#1e293b" },
  tabLabel: { color: "#64748b", fontSize: 10, fontWeight: "700" },
  fullscreenBtn: { paddingHorizontal: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },

  // Control Bar
  controlBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#1e293b", backgroundColor: "#080f1e", gap: 7 },
  phaseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  calibBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#451a03", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#92400e" },
  calibBadgeText: { color: "#f59e0b", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  samplingBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  samplingBadgeText: { color: "#10b981", fontSize: 9, fontWeight: "700" },
  triggerAngle: { color: "#64748b", fontSize: 9, fontFamily: "monospace" },
  progressTrack: { height: 4, backgroundColor: "#1e293b", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#f59e0b", borderRadius: 2 },
  progressFillBlue: { height: 4, backgroundColor: "#3b82f6", borderRadius: 2 },
  measuredRPMBadge: { backgroundColor: "#052e16", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#166534", alignItems: "center" },
  measuredRPMLabel: { color: "#6ee7b7", fontSize: 7, fontWeight: "700", textTransform: "uppercase" },
  measuredRPMValue: { color: "#10b981", fontSize: 13, fontFamily: "monospace", fontWeight: "800" },
  measuredRPMUnit: { color: "#6ee7b7", fontSize: 7 },
  realBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#052e16", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#166534" },
  realBadgeText: { color: "#10b981", fontSize: 8, fontWeight: "700" },
  btnStart: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1d4ed8", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  btnStop: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#991b1b", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  btnFail: { backgroundColor: "#7f1d1d", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, alignItems: "center" },
  btnFailActive: { backgroundColor: "#dc2626", borderWidth: 2, borderColor: "#ef4444" },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  btnReset: { padding: 8, backgroundColor: "#1e293b", borderRadius: 8 },
  btnResetText: { color: "#94a3b8", fontSize: 16, fontWeight: "700" },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#334155" },
  recDotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },

  // Tab content
  content: { flex: 1 },
  contentFullscreen: { flex: 1 },
  contentInner: { padding: 12, gap: 0 },
  tabContent: { gap: 12 },
  tabHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tabHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabTitle: { color: "#f1f5f9", fontSize: 14, fontWeight: "700" },
  tabNote: { color: "#475569", fontSize: 10, fontStyle: "italic", textAlign: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  // Legend
  legend: { flexDirection: "row", justifyContent: "center", gap: 14, flexWrap: "wrap" },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: "#64748b", fontSize: 10, fontFamily: "monospace" },

  // 3D zoom
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  zoomBtn: { backgroundColor: "#1e293b", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  zoomBtnText: { color: "#f1f5f9", fontSize: 13, fontWeight: "700" },
  zoomLabel: { color: "#94a3b8", fontSize: 10, fontFamily: "monospace", minWidth: 36, textAlign: "center" },

  // Z visibility chips
  zVisSection: { gap: 6 },
  zVisChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#0f172a" },
  zVisChipHidden: { borderColor: "#1e293b", backgroundColor: "#0a0f1a", opacity: 0.5 },
  zVisChipText: { color: "#64748b", fontSize: 9, fontWeight: "700", fontFamily: "monospace" },

  // FEM
  fluxToggle: { flexDirection: "row", alignItems: "center", gap: 4 },
  fluxToggleLabel: { color: "#64748b", fontSize: 10 },
  fem2dQuota: { flexDirection: "row", alignItems: "center", gap: 8 },
  gainRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  gainBtns: { flexDirection: "row", gap: 4 },
  triggerModeBox: { flexDirection: "row", gap: 5 },
  triggerModeChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#0f172a" },
  triggerModeChipActive: { borderColor: "#92400e", backgroundColor: "#1c1007" },
  triggerModeChipActiveBlue: { borderColor: "#1d4ed8", backgroundColor: "#0c1a3a" },
  triggerModeText: { color: "#475569", fontSize: 9, fontWeight: "700" },
  liveRPMDisplay: { alignItems: "center", backgroundColor: "#0d1f0d", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#166534", minWidth: 62 },
  liveRPMLabel: { color: "#6ee7b7", fontSize: 7, fontWeight: "800", textAlign: "center", letterSpacing: 0.5 },
  liveRPMValue: { color: "#10b981", fontSize: 14, fontFamily: "monospace", fontWeight: "800", textAlign: "center" },
});
