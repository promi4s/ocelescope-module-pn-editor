import { Button, Modal, SegmentedControl, Stack } from "@mantine/core";
import { useState } from "react";
import { ResourceSelect } from "@ocelescope/resources";
import { useClassicSchemaHash, useOcpnSchemaHash } from "../../api/ocpnEditor";
import type { NetFormat } from "./format_menu";

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
  const [format, setFormat] = useState<NetFormat>("ocpn");
  const { data: ocpnSchemaHash } = useOcpnSchemaHash();
  const { data: classicSchemaHash } = useClassicSchemaHash();

  return (
    <Modal opened={opened} onClose={onClose} title="Load from Session">
      <Stack>
        <SegmentedControl
          value={format}
          onChange={(v) => {
            setFormat(v as NetFormat);
            setResourceId(null);
          }}
          data={[
            { label: "Object-Centric Petri Net", value: "ocpn" },
            { label: "Classic Petri Net", value: "classic" },
          ]}
        />
        <ResourceSelect
          label="Model"
          description={
            format === "classic"
              ? "A classic Petri net is loaded as an OCPN with a single object type"
              : "Select a Petri Net to load into the editor"
          }
          value={resourceId}
          type={format === "classic" ? classicSchemaHash : ocpnSchemaHash}
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
