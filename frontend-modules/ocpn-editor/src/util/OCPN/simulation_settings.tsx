import type { ObjectCentricPetriNet } from "@r4pm/components";
import { Card, Checkbox, Group, NumberInput, Select, Stack, Text, TextInput } from "@mantine/core";
import type { DelayConfig, DelayConfigDistribution, SimulationConfig, SimulationConfigTimeUnit } from "../../api/ocpnEditor";

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

  return (
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

      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm">
          {`Custom Transition Delay (${config.time_unit ?? "minutes"})`}
        </Text>
        <Text size="xs" c={"dimmed"} mb={"xs"}>
          Set delays for individual transitions.
        </Text>
        {selectedTransition ? (
          <Stack gap={2}>
            <Text size="xs" fw={500}>
              {transitionName(selectedTransition)}
            </Text>
            <DelayInput
              value={delays[selectedTransition]}
              onChange={(delay) => setDelay(selectedTransition, delay)}
              allowDefault
              disabled={disabled}
            />
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            Select a transition to set its own delay.
          </Text>
        )}
      </Card>
    </Stack>
  );
};
