import type { OcpnImportResponse as ObjectCentricPetriNet } from "../../api/ocpnEditor";
import {
  ActionIcon,
  Card,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DelayConfig,
  DelayConfigDistribution,
  ObjectCount,
  SimulationConfig,
  SimulationConfigTimeUnit,
} from "../../api/ocpnEditor";
import {
  ArrivalsCard,
  PriorityCard,
  ObjectCountEditor,
  describeObjectCounts,
} from "./simulation_options";

const current_day = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
};

export const defaultSimulationConfig: SimulationConfig = {
  duration: 500,
  default_delay: { distribution: "fixed", value: 1 },
  delays: {},
  seed: null,
  start_time: current_day(),
  time_unit: "minutes",
};

/** One-line overview of the settings, shown next to the Settings button. */
export const describeSettings = (
  config: SimulationConfig,
  net: ObjectCentricPetriNet,
) => {
  const unit = config.time_unit ?? "minutes";
  const transitions = new Set(net.petri_net.transitions.map((t) => t.id));
  const places = new Set(net.petri_net.places.map((p) => p.id));
  const delay = config.default_delay ?? { distribution: "fixed", value: 1 };
  const customized = new Set(
    [
      ...Object.keys(config.delays ?? {}),
      ...Object.keys(config.object_counts ?? {}),
    ].filter((id) => transitions.has(id)),
  ).size;
  const prioritized = (config.activity_priority ?? []).filter((id) =>
    transitions.has(id),
  ).length;
  const arrivals = Object.keys(config.arrivals ?? {}).filter((id) =>
    places.has(id),
  ).length;
  return [
    `${config.duration ?? 500} ${unit}`,
    `default delay ${delay.distribution === "exponential" ? "~" : ""}${delay.value ?? 1}`,
    customized && `${customized} customized transition${customized > 1 ? "s" : ""}`,
    prioritized && `${prioritized} prioritized`,
    arrivals && `arrivals in ${arrivals} place${arrivals > 1 ? "s" : ""}`,
    config.seed != null && "seeded",
  ]
    .filter(Boolean)
    .join(" · ");
};

const timeUnitOptions = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

const FIXED_SEED = 42;

const distributionOptions = [
  { value: "fixed", label: "Fixed" },
  { value: "exponential", label: "Exponential" },
];

const describeDelay = (delay: DelayConfig, unit: string) =>
  delay.distribution === "exponential"
    ? `Exponential, mean ${delay.value ?? 1} ${unit}`
    : `Fixed, ${delay.value ?? 1} ${unit}`;

const DelayInput = ({
  value,
  onChange,
  allowDefault = false,
  disabled,
}: {
  value: DelayConfig | undefined;
  onChange: (delay: DelayConfig | undefined) => void;
  allowDefault?: boolean;
  disabled?: boolean;
}) => {
  const number = (key: keyof DelayConfig, label: string, fallback: number) => (
    <NumberInput
      size="xs"
      label={label}
      min={0}
      disabled={disabled}
      value={(value?.[key] as number | undefined) ?? fallback}
      onChange={(v) => onChange({ ...value, [key]: Number(v) || 0 })}
      style={{ flex: 1 }}
    />
  );

  return (
    <Stack gap={4}>
      <Select
        size="xs"
        disabled={disabled}
        data={allowDefault ? [{ value: "default", label: "Default delay" }, ...distributionOptions] : distributionOptions}
        value={value?.distribution ?? (allowDefault ? "default" : "fixed")}
        onChange={(v) =>
          onChange(!v || v === "default" ? undefined : { ...value, distribution: v as DelayConfigDistribution })
        }
        allowDeselect={false}
      />
      {value?.distribution === "fixed" && <Group gap="xs">{number("value", "Delay", 1)}</Group>}
      {value?.distribution === "exponential" && <Group gap="xs">{number("value", "Mean", 1)}</Group>}
    </Stack>
  );
};

export const SimulationSettings = ({
  net,
  config,
  onChange,
  selectedTransition,
  disabled,
}: {
  net: ObjectCentricPetriNet;
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  selectedTransition: string | null;
  disabled?: boolean;
}) => {
  const delays = config.delays ?? {};
  const transitionName = (id: string) => {
    const transition = net.petri_net.transitions.find((t) => t.id === id);
    return transition?.label || `${id} (silent)`;
  };
  const setDelay = (transition: string, delay: DelayConfig | undefined) => {
    const { [transition]: _, ...rest } = delays;
    onChange({ ...config, delays: delay ? { ...rest, [transition]: delay } : rest });
  };

  const timeUnit = config.time_unit ?? "minutes";
  const transitionIds = new Set(net.petri_net.transitions.map((t) => t.id));
  const transitionOptions = net.petri_net.transitions.map((t) => ({
    value: t.id,
    label: transitionName(t.id),
  }));
  const counts = config.object_counts ?? {};
  const setObjectCounts = (
    transition: string,
    value: Record<string, ObjectCount> | undefined,
  ) => {
    const { [transition]: _, ...rest } = counts;
    onChange({ ...config, object_counts: value ? { ...rest, [transition]: value } : rest });
  };
  const resetTransition = (transition: string) => {
    const { [transition]: _delay, ...otherDelays } = delays;
    const { [transition]: _count, ...otherCounts } = counts;
    onChange({ ...config, delays: otherDelays, object_counts: otherCounts });
  };
  // Settings of deleted transitions are kept in the config but not shown.
  const customized = net.petri_net.transitions
    .map((t) => t.id)
    .filter((id) => delays[id] || counts[id]);

  const [pickedTransition, setPickedTransition] = useState<string | null>(null);
  useEffect(() => {
    if (selectedTransition) setPickedTransition(selectedTransition);
  }, [selectedTransition]);

  return (
    <Tabs defaultValue={selectedTransition ? "transitions" : "general"}>
      <Tabs.List grow>
        <Tabs.Tab value="general">General</Tabs.Tab>
        <Tabs.Tab value="transitions">Transitions</Tabs.Tab>
        <Tabs.Tab value="priority">Priority</Tabs.Tab>
        <Tabs.Tab value="arrivals">Arrivals</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="general" pt="sm">
        <Stack gap="xs">
      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm" mb="xs">
          General
        </Text>
          <TextInput
            size="xs"
            type="datetime-local"
            label="Start"
            disabled={disabled}
            value={config.start_time ?? ""}
            onChange={(e) => onChange({ ...config, start_time: e.currentTarget.value || current_day() })}
            style={{ flex: 2 }}
          />
          <Select
            size="xs"
            label="Time unit"
            data={timeUnitOptions}
            disabled={disabled}
            value={config.time_unit ?? "minutes"}
            onChange={(v) => onChange({ ...config, time_unit: (v ?? "minutes") as SimulationConfigTimeUnit })}
            allowDeselect={false}
            style={{ flex: 1 }}
          />

        <NumberInput
          size="xs"
          label={`Duration (${config.time_unit ?? "minutes"})`}
          description="Stop the simulation when the duration is reached."
          min={0}
          mb="xs"
          disabled={disabled}
          value={config.duration ?? 500}
          onChange={(v) => onChange({ ...config, duration: Number(v) || 0 })}
        />
        <Checkbox
          size="xs"
          label="Use a seed"
          description="Every run returns the same result."
          disabled={disabled}
          checked={config.seed != null}
          onChange={(e) => onChange({ ...config, seed: e.currentTarget.checked ? FIXED_SEED : null })}
        />
      </Card>

      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm">
          {`Default Delay (${config.time_unit ?? "minutes"})`}
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          Set a default delay for all transitions.
        </Text>
        <DelayInput
          value={config.default_delay}
          onChange={(delay) => onChange({ ...config, default_delay: delay ?? { distribution: "fixed", value: 1 } })}
          disabled={disabled}
        />
      </Card>

        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="transitions" pt="sm">
      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm">
          Transition Settings
        </Text>
        <Text size="xs" c={"dimmed"} mb={"xs"}>
          Pick a transition here, or select it in the net before opening the settings.
        </Text>
        <Select
          size="xs"
          placeholder="Select transition"
          data={transitionOptions}
          value={pickedTransition}
          onChange={setPickedTransition}
          disabled={disabled}
          searchable
          clearable
          mb="xs"
        />
        {pickedTransition && transitionIds.has(pickedTransition) && (
          <>
            <Text size="xs" fw={500} mb={4}>
              {`Delay (${timeUnit})`}
            </Text>
            <DelayInput
              value={delays[pickedTransition]}
              onChange={(delay) => setDelay(pickedTransition, delay)}
              allowDefault
              disabled={disabled}
            />
            <ObjectCountEditor
              net={net}
              transition={pickedTransition}
              value={counts[pickedTransition]}
              onChange={(value) => setObjectCounts(pickedTransition, value)}
              disabled={disabled}
            />
          </>
        )}

        <Divider my="sm" />
        <Text size="xs" fw={500} mb={4}>
          Customized transitions
        </Text>
        {customized.length === 0 ? (
          <Text size="xs" c="dimmed">
            All transitions use the default delay and object numbers.
          </Text>
        ) : (
          <Stack gap={2}>
            {customized.map((id) => (
              <Group key={id} gap="xs" wrap="nowrap" justify="space-between">
                <UnstyledButton
                  onClick={() => setPickedTransition(id)}
                  style={{ minWidth: 0, flex: 1 }}
                >
                  <Text size="xs" truncate fw={id === pickedTransition ? 600 : 400}>
                    {transitionName(id)}
                  </Text>
                  {delays[id] && (
                    <Text size="xs" c="dimmed">
                      {describeDelay(delays[id], timeUnit)}
                    </Text>
                  )}
                  {counts[id] && (
                    <Text size="xs" c="dimmed">
                      {describeObjectCounts(counts[id])}
                    </Text>
                  )}
                </UnstyledButton>
                <Tooltip label="Reset to defaults" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Reset to defaults"
                    disabled={disabled}
                    onClick={() => resetTransition(id)}
                  >
                    <X size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ))}
          </Stack>
        )}
      </Card>

      </Tabs.Panel>
      <Tabs.Panel value="priority" pt="sm">
      <PriorityCard net={net} config={config} onChange={onChange} disabled={disabled} />
      </Tabs.Panel>
      <Tabs.Panel value="arrivals" pt="sm">
      <ArrivalsCard net={net} config={config} onChange={onChange} disabled={disabled} />
      </Tabs.Panel>
    </Tabs>
  );
};
