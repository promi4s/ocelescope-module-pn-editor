import {
  Badge,
  Accordion,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  ArrowUpWideNarrow,
  Boxes,
  Dices,
  Settings2,
  Hourglass,
  Timer,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  DelayConfig,
  DelayConfigDistribution,
  OcpnImportResponse as ObjectCentricPetriNet,
  SimulationConfig,
  SimulationConfigTimeUnit,
} from "../../api/ocpnEditor";
import { PrioritySettings } from "./SimulationOptions";

const current_day = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
};

export const defaultSimulationConfig: SimulationConfig = {
  duration: 500,
  default_delay: { distribution: "fixed", value: 0 },
  delays: {},
  default_duration: { distribution: "fixed", value: 1 },
  durations: {},
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

export const describeDelay = (delay: DelayConfig, unit: string) =>
  delay.distribution === "exponential"
    ? `Exponential, mean ${delay.value ?? 1} ${unit}`
    : `Fixed, ${delay.value ?? 1} ${unit}`;

export const transitionName = (net: ObjectCentricPetriNet, id: string) => {
  const transition = net.petri_net.transitions.find((t) => t.id === id);
  return transition?.label || `${id} (silent)`;
};

/** Removes the delay, duration and object counts of a transition. */
export const resetTransition = (
  config: SimulationConfig,
  transition: string,
): SimulationConfig => {
  const { [transition]: _delay, ...delays } = config.delays ?? {};
  const { [transition]: _duration, ...durations } = config.durations ?? {};
  const { [transition]: _count, ...object_counts } = config.object_counts ?? {};
  return { ...config, delays, durations, object_counts };
};

/** Group of collapsible settings sections; several can be open at once. */
export const SettingsAccordion = ({
  defaultValue,
  children,
}: {
  defaultValue?: string[];
  children: ReactNode;
}) => (
  <Accordion
    multiple
    variant="separated"
    radius="sm"
    defaultValue={defaultValue}
    styles={{
      control: { paddingBlock: 4 },
      content: { paddingTop: 0 },
    }}
  >
    {children}
  </Accordion>
);

/** One collapsible setting: title and current value in the header, inputs when opened. */
export const SettingsSection = ({
  value,
  icon,
  title,
  summary,
  description,
  children,
}: {
  value: string;
  icon: ReactNode;
  title: ReactNode;
  /** current value, shown in the header while collapsed */
  summary?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) => (
  <Accordion.Item value={value}>
    <Accordion.Control icon={icon}>
      <Text size="sm" fw={500}>
        {title}
      </Text>
      {summary && (
        <Text size="xs" c="dimmed" truncate>
          {summary}
        </Text>
      )}
    </Accordion.Control>
    <Accordion.Panel>
      <Stack gap="xs">
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        {children}
      </Stack>
    </Accordion.Panel>
  </Accordion.Item>
);

export const DelayInput = ({
  value,
  onChange,
  allowDefault = false,
  defaultLabel = "Default",
  disabled,
}: {
  value: DelayConfig | undefined;
  onChange: (delay: DelayConfig | undefined) => void;
  allowDefault?: boolean;
  /** label of the option that uses the general setting */
  defaultLabel?: string;
  disabled?: boolean;
}) => (
  <Stack gap={4}>
    <Select
      size="xs"
      disabled={disabled}
      data={
        allowDefault
          ? [{ value: "default", label: defaultLabel }, ...distributionOptions]
          : distributionOptions
      }
      value={value?.distribution ?? (allowDefault ? "default" : "fixed")}
      onChange={(v) =>
        onChange(
          !v || v === "default"
            ? undefined
            : { ...value, distribution: v as DelayConfigDistribution },
        )
      }
      allowDeselect={false}
    />
    {value && (
      <NumberInput
        size="xs"
        label={value.distribution === "exponential" ? "Mean" : "Time"}
        min={0}
        disabled={disabled}
        value={value.value ?? 1}
        onChange={(v) => onChange({ ...value, value: Number(v) || 0 })}
      />
    )}
  </Stack>
);

const ICON = 16;

/** General tab: object types and the settings that apply to the whole simulation. */
export const GeneralSettings = ({
  net,
  config,
  onChange,
  disabled,
}: {
  net: ObjectCentricPetriNet;
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  disabled?: boolean;
}) => {
  const unit = config.time_unit ?? "minutes";
  const defaultDelay = config.default_delay ?? { distribution: "fixed", value: 0 };
  const defaultDuration = config.default_duration ?? {
    distribution: "fixed",
    value: 1,
  };
  const objectTypes = Array.from(
    new Set(Object.values(net.place_object_type)),
  ).sort();
  const transitionIds = new Set(net.petri_net.transitions.map((t) => t.id));
  const prioritized = (config.activity_priority ?? []).filter((id) =>
    transitionIds.has(id),
  ).length;
  const startLabel = config.start_time
    ? config.start_time.replace("T", " ")
    : "";

  return (
    <SettingsAccordion>
      <SettingsSection
        value="object-types"
        icon={<Boxes size={ICON} />}
        title="Object types"
        summary={objectTypes.length ? objectTypes.join(", ") : "None yet"}
        description="Object attributes will be editable here."
      >
        {objectTypes.length === 0 ? (
          <Text size="xs" c="dimmed">
            Add a place to create an object type.
          </Text>
        ) : (
          <Group gap={4}>
            {objectTypes.map((type) => (
              <Badge key={type} variant="light" color="gray" tt="none">
                {type}
              </Badge>
            ))}
          </Group>
        )}
      </SettingsSection>

      <SettingsSection
        value="time"
        icon={<Settings2 size={ICON} />}
        title="Time"
        summary={`${startLabel} · ${config.duration ?? 500} ${unit}`}
      >
        <TextInput
          size="xs"
          type="datetime-local"
          label="Start"
          disabled={disabled}
          value={config.start_time ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              start_time: e.currentTarget.value || current_day(),
            })
          }
        />
        <Group gap="xs" grow wrap="nowrap">
          <Select
            size="xs"
            label="Time unit"
            data={timeUnitOptions}
            disabled={disabled}
            value={unit}
            onChange={(v) =>
              onChange({
                ...config,
                time_unit: (v ?? "minutes") as SimulationConfigTimeUnit,
              })
            }
            allowDeselect={false}
          />
          <NumberInput
            size="xs"
            label="Simulated time"
            min={0}
            disabled={disabled}
            value={config.duration ?? 500}
            onChange={(v) => onChange({ ...config, duration: Number(v) || 0 })}
          />
        </Group>
      </SettingsSection>

      <SettingsSection
        value="delay"
        icon={<Timer size={ICON} />}
        title="Default delay"
        summary={describeDelay(defaultDelay, unit)}
        description="How long a transition waits once it can fire, before it starts. Used by every transition without its own delay."
      >
        <DelayInput
          value={defaultDelay}
          onChange={(delay) =>
            onChange({
              ...config,
              default_delay: delay ?? { distribution: "fixed", value: 0 },
            })
          }
          disabled={disabled}
        />
      </SettingsSection>

      <SettingsSection
        value="duration"
        icon={<Hourglass size={ICON} />}
        title="Default duration"
        summary={describeDelay(defaultDuration, unit)}
        description="How long a transition takes from its start until its outputs are produced. Used by every transition without its own duration."
      >
        <DelayInput
          value={defaultDuration}
          onChange={(duration) =>
            onChange({
              ...config,
              default_duration: duration ?? { distribution: "fixed", value: 1 },
            })
          }
          disabled={disabled}
        />
      </SettingsSection>

      <SettingsSection
        value="priority"
        icon={<ArrowUpWideNarrow size={ICON} />}
        title="Activity priority"
        summary={
          prioritized
            ? `${prioritized} prioritized · ${Math.round((config.priority_probability ?? 0.5) * 100)} %`
            : "Random choice"
        }
        description="When several transitions can fire, prefer the prioritized ones, highest first."
      >
        <PrioritySettings
          net={net}
          config={config}
          onChange={onChange}
          disabled={disabled}
        />
      </SettingsSection>

      <SettingsSection
        value="seed"
        icon={<Dices size={ICON} />}
        title="Random seed"
        summary={config.seed != null ? "On" : "Off"}
      >
        <Checkbox
          size="xs"
          label="Use a seed"
          description="Every run returns the same result."
          disabled={disabled}
          checked={config.seed != null}
          onChange={(e) =>
            onChange({
              ...config,
              seed: e.currentTarget.checked ? FIXED_SEED : null,
            })
          }
        />
      </SettingsSection>
    </SettingsAccordion>
  );
};
