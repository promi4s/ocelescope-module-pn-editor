import { Button, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

export const SaveSessionModal = ({
  opened,
  onClose,
  onSave,
  title = "Save to Session",
  namePrefix = "ocpn_editor",
}: {
  opened: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  title?: string;
  /** default names are `<namePrefix>_<n>` */
  namePrefix?: string;
}) => {
  const [name, setName] = useState("");
  const [saveCount, setSaveCount] = useState(0);
  const defaultName = `${namePrefix}_${saveCount}`;

  return (
    <Modal opened={opened} onClose={onClose} title={title}>
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
          {title}
        </Button>
      </Stack>
    </Modal>
  );
};
