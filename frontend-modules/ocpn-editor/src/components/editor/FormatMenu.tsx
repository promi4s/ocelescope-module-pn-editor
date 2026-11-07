import type { OcpnImportResponse as ObjectCentricPetriNet } from "../../api/ocpnEditor";
import { ActionIcon, Menu, Text, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import {
  hasSingleObjectType,
  hasVariableArcs,
  type NetFormat,
} from "../../lib/net";

export const FormatMenu = ({
  label,
  icon,
  net,
  ocpnLabel,
  classicLabel,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  net: ObjectCentricPetriNet;
  ocpnLabel: string;
  classicLabel: string;
  onSelect: (format: NetFormat) => void;
}) => {
  if (!hasSingleObjectType(net)) {
    return (
      <Tooltip label={label} withArrow>
        <ActionIcon variant="subtle" color="gray" size="md" aria-label={label} onClick={() => onSelect("ocpn")}>
          {icon}
        </ActionIcon>
      </Tooltip>
    );
  }

  const variableArcs = hasVariableArcs(net);
  return (
    <Menu position="bottom-end" withArrow shadow="md">
      <Tooltip label={label} withArrow>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="md" aria-label={label}>
            {icon}
          </ActionIcon>
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        <Menu.Label>{label}</Menu.Label>
        <Menu.Item onClick={() => onSelect("ocpn")}>{ocpnLabel}</Menu.Item>
        <Menu.Item disabled={variableArcs} onClick={() => onSelect("classic")}>
          {classicLabel}
          {variableArcs && (
            <Text size="xs" c="dimmed">
              Not possible: the net has variable arcs
            </Text>
          )}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
