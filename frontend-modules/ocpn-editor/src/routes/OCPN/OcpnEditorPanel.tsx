import {
  ObjectCentricPetriNetWorkbench,
  ViewerConfigProvider,
  ViewerExportFrame,
} from "@r4pm/components";
import { wasmViz } from "@r4pm/components/viz/wasm";
import { useMemo } from "react";
import type { OcpnImportResponse as ObjectCentricPetriNet } from "../../api/ocpnEditor";
import { fromR4pmOcpn, toR4pmOcpn } from "../../util/OCPN/editor_functions";
import { HideToolbarButtons } from "../../util/OCPN/hideToolbar";

const OcpnEditorPanel = ({
  data,
  onNetChange,
}: {
  data: ObjectCentricPetriNet;
  onNetChange: (net: ObjectCentricPetriNet) => void;
}) => {
  const ocpn = useMemo(() => toR4pmOcpn(data), [data]);
  return (
    <ViewerConfigProvider value={{ viz: wasmViz }}>
      <ViewerExportFrame filename="ocpn" style={{ height: "100%" }}>
        <div style={{ position: "relative", height: "100%" }}>
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
