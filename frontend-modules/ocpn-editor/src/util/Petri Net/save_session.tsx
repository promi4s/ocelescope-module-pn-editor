import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";


export const SaveClassicSession = ({
    opened, onClose, onSave
 }:{  
    opened: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const [saveCount, setSaveCount] = useState(0);
  const defaultName = `petri_net_${saveCount}`;


  return (
    <Modal opened={opened} onClose={onClose} title="Save to session" centered>
      <Stack>
        <TextInput
          label="Name"
          placeholder={defaultName}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
            <Button onClick={
            () => {
            onSave(name.trim() || defaultName);  
            setSaveCount((c) => c + 1);
            setName("");
            onClose();
            }}>
            Save
            </Button>
      </Stack>
    </Modal>
  );
};