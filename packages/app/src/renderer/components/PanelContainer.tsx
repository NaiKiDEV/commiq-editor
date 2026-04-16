import { useLayoutEffect, useRef, useState, useCallback } from "react";
import { useAllPanels, useLayout } from "../hooks/use-workspace";
import { LayoutRenderer } from "./LayoutRenderer";
import { TerminalPanel } from "./TerminalPanel";
import { BrowserPanel } from "./BrowserPanel";
import { NotesPanel } from "./NotesPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { TimerPanel } from "./TimerPanel";
import { PortMonitorPanel } from "./PortMonitorPanel";
import { ProcessMonitorPanel } from "./ProcessMonitorPanel";
import { EnvVarsPanel } from "./EnvVarsPanel";
import { HttpClientPanel } from "./HttpClientPanel";
import { WhiteboardPanel } from "./WhiteboardPanel";
import { RegexPlaygroundPanel } from "./RegexPlaygroundPanel";
import { DataViewerPanel } from "./DataViewerPanel";
import { EncoderPanel } from "./EncoderPanel";
import { CronPanel } from "./CronPanel";
import { DiffViewerPanel } from "./DiffViewerPanel";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { EpochPanel } from "./EpochPanel";
import { UuidPanel } from "./UuidPanel";
import { NumberBasePanel } from "./NumberBasePanel";
import { IeeePanel } from "./IeeePanel";
import { HexDumpPanel } from "./HexDumpPanel";
import { EndianPanel } from "./EndianPanel";
import { BitFieldPanel } from "./BitFieldPanel";
import { SvgOptimizerPanel } from "./SvgOptimizerPanel";
import { KubernetesPanel } from "./kubernetes/KubernetesPanel";
import { WebSocketPanel } from "./websocket/WebSocketPanel";
import { SecretSharingPanel } from "./secrets/SecretSharingPanel";
import { DatabaseClientPanel } from "./DatabaseClientPanel";
import { DockerPanel } from "./docker/DockerPanel";
import { SslInspectorPanel } from "./SslInspectorPanel";
import { MockServerPanel } from "./MockServerPanel";
import { CodePlaygroundPanel } from "./CodePlaygroundPanel";
import { AutoBattlerPanel } from "./AutoBattlerPanel";
import { getVisiblePanelIds } from "../lib/layout";
import type { Panel } from "../stores/workspace";

type Bounds = { top: number; left: number; width: number; height: number };

function PanelContent({
  panel,
  bounds,
  visible,
}: {
  panel: Panel;
  bounds: Bounds | null;
  visible: boolean;
}) {
  // Always render — never return null — so React keeps the component mounted
  return (
    <div
      className="absolute"
      style={
        visible && bounds
          ? {
              top: bounds.top,
              left: bounds.left,
              width: bounds.width,
              height: bounds.height,
            }
          : { display: "none" }
      }
    >
      {panel.type === "terminal" && (
        <TerminalPanel sessionId={panel.id} panelId={panel.id} />
      )}
      {panel.type === "browser" && (
        <BrowserPanel
          sessionId={panel.id}
          panelId={panel.id}
          isActive={visible}
        />
      )}
      {panel.type === "notes" && <NotesPanel panelId={panel.id} />}
      {panel.type === "workflow" && <WorkflowPanel panelId={panel.id} />}
      {panel.type === "timer" && <TimerPanel panelId={panel.id} />}
      {panel.type === "ports" && <PortMonitorPanel panelId={panel.id} />}
      {panel.type === "process" && <ProcessMonitorPanel panelId={panel.id} />}
      {panel.type === "env" && <EnvVarsPanel panelId={panel.id} />}
      {panel.type === "http" && <HttpClientPanel panelId={panel.id} />}
      {panel.type === "whiteboard" && <WhiteboardPanel panelId={panel.id} />}
      {panel.type === "regex" && <RegexPlaygroundPanel panelId={panel.id} />}
      {panel.type === "data" && <DataViewerPanel panelId={panel.id} />}
      {panel.type === "encoder" && <EncoderPanel panelId={panel.id} />}
      {panel.type === "cron" && <CronPanel panelId={panel.id} />}
      {panel.type === "diff" && <DiffViewerPanel panelId={panel.id} />}
      {panel.type === "color" && <ColorPickerPanel panelId={panel.id} />}
      {panel.type === "epoch" && <EpochPanel panelId={panel.id} />}
      {panel.type === "uuid" && <UuidPanel panelId={panel.id} />}
      {panel.type === "numbase" && <NumberBasePanel panelId={panel.id} />}
      {panel.type === "ieee754" && <IeeePanel panelId={panel.id} />}
      {panel.type === "hexdump" && <HexDumpPanel panelId={panel.id} />}
      {panel.type === "endian" && <EndianPanel panelId={panel.id} />}
      {panel.type === "bitfield" && <BitFieldPanel panelId={panel.id} />}
      {panel.type === "svg" && <SvgOptimizerPanel panelId={panel.id} />}
      {panel.type === "k8s" && <KubernetesPanel panelId={panel.id} />}
      {panel.type === "ws" && <WebSocketPanel panelId={panel.id} />}
      {panel.type === "secrets" && <SecretSharingPanel panelId={panel.id} />}
      {panel.type === "db" && <DatabaseClientPanel panelId={panel.id} />}
      {panel.type === "docker" && <DockerPanel panelId={panel.id} />}
      {panel.type === "ssl" && <SslInspectorPanel panelId={panel.id} />}
      {panel.type === "mockserver" && <MockServerPanel panelId={panel.id} />}
      {panel.type === "playground" && <CodePlaygroundPanel panelId={panel.id} />}
      {panel.type === "autobattler" && <AutoBattlerPanel panelId={panel.id} />}
    </div>
  );
}

export function PanelContainer() {
  const allPanels = useAllPanels();
  const layout = useLayout();
  const containerRef = useRef<HTMLDivElement>(null);
  const [boundsMap, setBoundsMap] = useState<Map<string, Bounds>>(new Map());

  const visibleIds = getVisiblePanelIds(layout);

  const measureSlots = useCallback(() => {
    if (!containerRef.current) {
      setBoundsMap(new Map());
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const next = new Map<string, Bounds>();
    containerRef.current
      .querySelectorAll<HTMLDivElement>("[data-slot-panel]")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        next.set(el.dataset.slotPanel!, {
          top: r.top - containerRect.top,
          left: r.left - containerRect.left,
          width: r.width,
          height: r.height,
        });
      });
    setBoundsMap(next);
  }, []);

  useLayoutEffect(() => {
    measureSlots();
  }, [layout, measureSlots]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(measureSlots);
    ro.observe(containerRef.current);
    containerRef.current
      .querySelectorAll<HTMLDivElement>("[data-slot-panel]")
      .forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [layout, measureSlots]);

  const hasActiveLayout = layout && visibleIds.size > 0;

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden relative">
      {/* Layout slots for the active tab — or welcome screen */}
      {hasActiveLayout ? (
        <LayoutRenderer node={layout} />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center space-y-3">
            <p className="text-2xl font-semibold tracking-tight text-foreground/80">
              Developer Tools
            </p>
            <div className="space-y-1 text-sm">
              <p>
                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">
                  Ctrl+K
                </kbd>{" "}
                to open command palette
              </p>
              <p className="text-muted-foreground/60">
                or click + to open a new tab
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ALL panels always rendered — active tab's are positioned, rest are hidden */}
      {allPanels.map((panel) => (
        <PanelContent
          key={panel.id}
          panel={panel}
          bounds={boundsMap.get(panel.id) ?? null}
          visible={visibleIds.has(panel.id)}
        />
      ))}
    </div>
  );
}
