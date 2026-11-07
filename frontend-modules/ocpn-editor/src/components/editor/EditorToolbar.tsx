import { ActionIcon, Divider, Group, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  DatabaseArrowDown,
  DatabaseArrowUp,
  DownloadIcon,
  PlayIcon,
  Upload,
} from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import {
  type OcpnImportResponse as ObjectCentricPetriNet,
  useExportOCPN,
  useExportPnml,
  useImportOCPN,
  useImportPnml,
  useLoadSession,
  useSaveSession,
} from "../../api/ocpnEditor";
import { downloadFile } from "../../lib/download";
import type { NetFormat } from "../../lib/net";
import { FormatMenu } from "./FormatMenu";
import { LoadSessionModal } from "./LoadSessionModal";
import { SaveSessionModal } from "./SaveSessionModal";

/** Header of the editor: title, loading/saving the net (session, file) and the layout button. */
export const EditorToolbar = ({
  net,
  onLoad,
  onRunLayout,
}: {
  net: ObjectCentricPetriNet;
  /** called with a net loaded from a file or the session */
  onLoad: (net: ObjectCentricPetriNet) => void;
  onRunLayout: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveModalOpened, setSaveModalOpened] = useState(false);
  const [loadModalOpened, setLoadModalOpened] = useState(false);
  const [saveFormat, setSaveFormat] = useState<NetFormat>("ocpn");

  const { mutateAsync: exportOcpn } = useExportOCPN();
  const { mutateAsync: exportPnml } = useExportPnml();
  const { mutateAsync: importOcpn } = useImportOCPN();
  const { mutateAsync: importPnml } = useImportPnml();
  const { mutateAsync: saveSession } = useSaveSession();
  const { mutateAsync: loadSession } = useLoadSession();

  const handleDownload = async (format: NetFormat) => {
    if (format === "classic") {
      const pnml = await exportPnml({ data: net });
      downloadFile("petri-net.pnml", pnml as string, "application/xml");
    } else {
      const result = await exportOcpn({ data: net });
      downloadFile(
        "ocpn.ocelescope",
        JSON.stringify(result, null, 2),
        "application/json",
      );
    }
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imported = file.name.toLowerCase().endsWith(".pnml")
      ? await importPnml({ data: { file } })
      : await importOcpn({ data: { file } });
    onLoad(imported as ObjectCentricPetriNet);
    e.target.value = ""; // allow selecting the same file again
  };

  return (
    <>
      <Group
        pb="xs"
        pl="xs"
        pr="xs"
        wrap="nowrap"
        justify="space-between"
        style={{
          borderBottom: "2px solid var(--mantine-color-default-border)",
        }}
      >
        <Text fw={600} size="md">
          Object-Centric Petri-Net Editor
        </Text>
        <Group
          gap={4}
          p={4}
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".ocelescope,.pnml"
            style={{ display: "none" }}
            onChange={handleFileSelected}
          />
          <Tooltip label="Load from session" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              aria-label="load from session"
              onClick={() => setLoadModalOpened(true)}
            >
              <DatabaseArrowUp size={16} />
            </ActionIcon>
          </Tooltip>

          <Divider orientation="vertical" />

          <FormatMenu
            label="Save to session"
            icon={<DatabaseArrowDown size={16} />}
            net={net}
            ocpnLabel="As Object-Centric Petri Net"
            classicLabel="As Classic Petri Net"
            onSelect={(format) => {
              setSaveFormat(format);
              setSaveModalOpened(true);
            }}
          />

          <Divider orientation="vertical" />

          <Tooltip label="Upload Petri net (.ocelescope or .pnml)" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              aria-label="Upload Petri net"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
            </ActionIcon>
          </Tooltip>

          <Divider orientation="vertical" />

          <FormatMenu
            label="Download Petri net"
            icon={<DownloadIcon size={16} />}
            net={net}
            ocpnLabel="Object-Centric Petri Net (.ocelescope)"
            classicLabel="Classic Petri Net (.pnml)"
            onSelect={handleDownload}
          />

          <Divider orientation="vertical" />

          <Tooltip label="Run Layout" withArrow>
            <ActionIcon
              variant="filled"
              color="blue"
              size="md"
              radius="md"
              aria-label="Run Layout"
              onClick={onRunLayout}
            >
              <PlayIcon size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <SaveSessionModal
        opened={saveModalOpened}
        onClose={() => setSaveModalOpened(false)}
        onSave={(name) => {
          saveSession({ data: net, params: { name, format: saveFormat } });
          notifications.show({
            title: "Saved to session",
            message:
              saveFormat === "classic"
                ? "Classic Petri net has been saved to session"
                : "OCPN has been saved to session",
          });
        }}
      />
      <LoadSessionModal
        opened={loadModalOpened}
        onClose={() => setLoadModalOpened(false)}
        onLoad={async (resourceId) => {
          const result = await loadSession({
            params: { resource_id: resourceId },
          });
          onLoad(result as ObjectCentricPetriNet);
        }}
      />
    </>
  );
};
