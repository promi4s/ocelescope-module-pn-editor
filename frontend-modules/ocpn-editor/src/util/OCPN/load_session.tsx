import { Button, Modal, Stack } from "@mantine/core";
import { useState } from "react";
import { ResourceSelect } from "@ocelescope/resources";
import {useOcpnSchemaHash} from "../../api/ocpnEditor"

export const LoadOCPNSession = ({
  opened,
  onClose,
  onLoad,
}: {
  opened: boolean;
  onClose: () => void;
  onLoad: (resourceId: string) => void;
}) => {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const { data: petriNetSchemaHash } = useOcpnSchemaHash();

  return (
    <Modal opened={opened} onClose={onClose} title="Load from Session">
      <Stack>
        <ResourceSelect
          label="Model"
          description="Select a Petri Net to load into the editor"
          value={resourceId}
          type={petriNetSchemaHash}
          onChange={(newResourceId) => setResourceId(newResourceId as string)}
        />
        <Button
          disabled={!resourceId}
          onClick={() => {
            if (!resourceId) return;
            onLoad(resourceId);
            onClose();
          }}
        >
          Load from Session
        </Button>
      </Stack>
    </Modal>
  );
};
