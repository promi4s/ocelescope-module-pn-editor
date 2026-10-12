import { lazy, Suspense, useState } from "react";
import { Center, Loader } from "@mantine/core";
import { useCurrentOcel } from "@ocelescope/core";
import { useObjectTypes, useEventActivities } from "../api/ocpnEditor";
import { ResourceSelect } from "@ocelescope/resources";



const PetriNetEditor = lazy(() => import("./PN/PNEditor"));
const OcpnEditor = lazy(() => import("./OCPN/OCPNEditor"));

export type EditorMode = "classic" | "ocpn";

const Editor = () => {
  const [mode, setMode] = useState<EditorMode>("ocpn");
  const {id} = useCurrentOcel();
  const {data: objectTypes = []} = useObjectTypes(id)
  const {data: eventActivities = []} = useEventActivities(id)

  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      {mode === "classic" ? (
        <PetriNetEditor mode={mode} onModeChange={setMode} />
      ) : (
        <OcpnEditor mode={mode} onModeChange={setMode} objectTypes={objectTypes} eventActivities={eventActivities} />
      )}
    </Suspense>
  );
};

export default Editor