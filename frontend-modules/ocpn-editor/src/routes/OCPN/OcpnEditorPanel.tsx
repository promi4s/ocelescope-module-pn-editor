import "@r4pm/components/styles.css";
import { ObjectCentricPetriNetWorkbench, type ObjectCentricPetriNet, ViewerConfigProvider, ViewerExportFrame } from "@r4pm/components";
import { wasmLayout } from "@r4pm/components/rust-layout/wasm";
import { useEffect, useRef } from "react";
import {HideToolbarButtons} from "../../util/OCPN/hideToolbar";

const OcpnEditorPanel = ({
  data,
  onNetChange,
  onSelectionChange,
}: {
  data: ObjectCentricPetriNet;
  onNetChange: (net: ObjectCentricPetriNet) => void;
  onSelectionChange?: (nodeIds: string[]) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let previous = "";
    const report = () => {
      const ids = Array.from(container.querySelectorAll<HTMLElement>(".react-flow__node.selected"))
        .map((node) => node.dataset.id)
        .filter((id): id is string => !!id);
      const key = ids.join("|");
      if (key === previous) return;
      previous = key;
      onSelectionChangeRef.current?.(ids);
    };
    const observer = new MutationObserver(report);
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <ViewerConfigProvider value={{ layout: wasmLayout }}>
      <ViewerExportFrame filename="ocpn" style={{ height: "100%" }}>
          <div ref={containerRef} style={{ position: "relative", height: "100%" }}>
            <ObjectCentricPetriNetWorkbench data={data} initialMode="edit" onNetChange={onNetChange} />
            <HideToolbarButtons labels={["Place", "Transition", "Layout"]} />
          </div>
      </ViewerExportFrame>
    </ViewerConfigProvider>
  );
};

export default OcpnEditorPanel;
