import { Button, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

export const SaveOCPNSession = ({
  opened,
  onClose,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const [saveCount, setSaveCount] = useState(0);
  const defaultName = `ocpn_editor_${saveCount}`;

  return (
    <Modal opened={opened} onClose={onClose} title="Save to Session">
      <Stack>
        <TextInput
          label="Name"
          placeholder={defaultName}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Button
          onClick={() => {
            onSave(name.trim() || defaultName);
            setSaveCount((c) => c + 1);
            setName("");
            onClose();
          }}
        >
          Save to Session
        </Button>
      </Stack>
    </Modal>
  );
};
