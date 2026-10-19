import {
  ObjectCentricPetriNetWorkbench,
  type ObjectCentricPetriNet,
  ViewerConfigProvider,
  ViewerExportFrame,
} from "@r4pm/components";
import { wasmLayout } from "@r4pm/components/rust-layout/wasm";
import { HideToolbarButtons } from "../../util/OCPN/hideToolbar";

const OcpnEditorPanel = ({
  data,
  onNetChange,
}: {
  data: ObjectCentricPetriNet;
  onNetChange: (net: ObjectCentricPetriNet) => void;
}) => {
  return (
    <ViewerConfigProvider value={{ layout: wasmLayout }}>
      <ViewerExportFrame filename="ocpn" style={{ height: "100%" }}>
        <div style={{ position: "relative", height: "100%" }}>
          <ObjectCentricPetriNetWorkbench
            data={data}
            initialMode="edit"
            onNetChange={onNetChange}
          />
          <HideToolbarButtons labels={["Place", "Transition", "Layout"]} />
        </div>
      </ViewerExportFrame>
    </ViewerConfigProvider>
  );
};

export default OcpnEditorPanel;
