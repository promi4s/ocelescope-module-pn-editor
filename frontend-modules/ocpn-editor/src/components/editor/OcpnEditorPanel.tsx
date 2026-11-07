import {
  ObjectCentricPetriNetWorkbench,
  ViewerConfigProvider,
  ViewerExportFrame,
} from "@r4pm/components";
import { wasmViz } from "@r4pm/components/viz/wasm";
import { useEffect, useMemo, useRef } from "react";
import type { OcpnImportResponse as ObjectCentricPetriNet } from "../../api/ocpnEditor";
import { fromR4pmOcpn, toR4pmOcpn } from "../../lib/net";
import { HideToolbarButtons } from "./HideToolbarButtons";

const OcpnEditorPanel = ({
  data,
  onNetChange,
  onSelectionChange,
}: {
  data: ObjectCentricPetriNet;
  onNetChange: (net: ObjectCentricPetriNet) => void;
  onSelectionChange?: (nodeIds: string[]) => void;
}) => {
  const ocpn = useMemo(() => toR4pmOcpn(data), [data]);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let previous = "";
    const report = () => {
      const ids = Array.from(
        container.querySelectorAll<HTMLElement>(".react-flow__node.selected"),
      )
        .map((node) => node.dataset.id)
        .filter((id): id is string => !!id);
      const key = ids.join("|");
      if (key === previous) return;
      previous = key;
      onSelectionChangeRef.current?.(ids);
    };
    const observer = new MutationObserver(report);
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <ViewerConfigProvider value={{ viz: wasmViz }}>
      <ViewerExportFrame filename="ocpn" style={{ height: "100%" }}>
        <div ref={containerRef} style={{ position: "relative", height: "100%" }}>
          <ObjectCentricPetriNetWorkbench
            data={ocpn}
            initialMode="edit"
            onNetChange={(net) => onNetChange(fromR4pmOcpn(net))}
          />
          <HideToolbarButtons labels={["Place", "Transition", "Layout"]} />
        </div>
      </ViewerExportFrame>
    </ViewerConfigProvider>
  );
};

export default OcpnEditorPanel;
