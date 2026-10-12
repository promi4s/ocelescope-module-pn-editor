import { Button, Modal, Stack } from "@mantine/core";
import { useState } from "react";
import { ResourceSelect } from "@ocelescope/resources";


const PETRI_NET_SCHEMA_HASH =
  "e8a4b93820f2f145136e404a06dceb73e074982534c39d64895eda58ab5b5dc1";

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

  return (
    <Modal opened={opened} onClose={onClose} title="Load from Session">
      <Stack>
        <ResourceSelect
          label="Model"
          description="Select a Petri Net to load into the editor"
          value={resourceId}
          type={PETRI_NET_SCHEMA_HASH}
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