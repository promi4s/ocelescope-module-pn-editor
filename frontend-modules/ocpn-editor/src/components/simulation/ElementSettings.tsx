import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  ArrowUpWideNarrow,
  Boxes,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ListChecks,
  LogIn,
  MousePointerClick,
  Plus,
  RotateCcw,
  Square,
  Timer,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  OcpnImportResponse as ObjectCentricPetriNet,
  SimulationConfig,
} from "../../api/ocpnEditor";
import {
  ArrivalEditor,
  describeObjectCounts,
  ObjectCountEditor,
  placeLabel,
  setArrival,
  setPrioritized,
} from "./SimulationOptions";
import {
  DelayInput,
  describeDelay,
  resetTransition,
  SettingsAccordion,
  SettingsSection,
  transitionName,
} from "./SimulationSettings";

const ICON = 16;

type Props = {
  net: ObjectCentricPetriNet;
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  disabled?: boolean;
};

const priorityOf = (net: ObjectCentricPetriNet, config: SimulationConfig) => {
  const ids = new Set(net.petri_net.transitions.map((t) => t.id));
  return (config.activity_priority ?? []).filter((id) => ids.has(id));
};

const describeArrival = (
  arrival: { mode?: "rate" | "interval"; value: number },
  unit: string,
) =>
  (arrival.mode ?? "rate") === "rate"
    ? `~${arrival.value} per ${unit.replace(/s$/, "")}`
    : `One every ${arrival.value} ${unit}`;

/** Name of the selected node above its settings. */
const NodeHeader = ({
  icon,
  kind,
  name,
  action,
}: {
  icon: ReactNode;
  kind: string;
  name: string;
  action?: ReactNode;
}) => (
  <Group justify="space-between" wrap="nowrap" px={4}>
    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
      {icon}
      <div style={{ minWidth: 0 }}>
        <Text fw={600} size="sm" truncate lh={1.2}>
          {name}
        </Text>
        <Text size="xs" c="dimmed">
          {kind}
        </Text>
      </div>
    </Group>
    {action}
  </Group>
);

const TransitionSettings = ({
  net,
  config,
  onChange,
  disabled,
  id,
}: Props & { id: string }) => {
  const unit = config.time_unit ?? "minutes";
  const priority = priorityOf(net, config);
  const rank = priority.indexOf(id);
  const delay = config.delays?.[id];
  const counts = config.object_counts?.[id];
  const move = (by: number) => {
    const next = [...priority];
    next.splice(rank, 1);
    next.splice(rank + by, 0, id);
    onChange({ ...config, activity_priority: next });
  };

  return (
    <Stack gap="xs">
      <NodeHeader
        icon={<Square size={ICON} />}
        kind="Transition"
        name={transitionName(net, id)}
        action={
          (delay || counts) && (
            <Tooltip label="Reset delay and object numbers" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Reset delay and object numbers"
                disabled={disabled}
                onClick={() => onChange(resetTransition(config, id))}
              >
                <RotateCcw size={14} />
              </ActionIcon>
            </Tooltip>
          )
        }
      />
      <SettingsAccordion key={id}>
        <SettingsSection
          value="delay"
          icon={<Timer size={ICON} />}
          title="Delay"
          summary={delay ? describeDelay(delay, unit) : "Default delay"}
        >
          <DelayInput
            value={delay}
            onChange={(d) => {
              const { [id]: _, ...rest } = config.delays ?? {};
              onChange({ ...config, delays: d ? { ...rest, [id]: d } : rest });
            }}
            allowDefault
            disabled={disabled}
          />
        </SettingsSection>

        <SettingsSection
          value="objects"
          icon={<Boxes size={ICON} />}
          title="Number of objects"
          summary={counts ? describeObjectCounts(counts) : "Default"}
        >
          <ObjectCountEditor
            net={net}
            transition={id}
            value={counts}
            onChange={(value) => {
              const { [id]: _, ...rest } = config.object_counts ?? {};
              onChange({
                ...config,
                object_counts: value ? { ...rest, [id]: value } : rest,
              });
            }}
            disabled={disabled}
          />
        </SettingsSection>

        <SettingsSection
          value="priority"
          icon={<ArrowUpWideNarrow size={ICON} />}
          title="Priority"
          summary={rank >= 0 ? `Rank ${rank + 1} of ${priority.length}` : "Not prioritized"}
        >
          <Switch
            size="sm"
            label="Prioritize"
            description="Prefer this transition when several can fire."
            checked={rank >= 0}
            disabled={disabled}
            onChange={(e) =>
              onChange(setPrioritized(config, id, e.currentTarget.checked))
            }
          />
          {rank >= 0 && (
            <Group gap={4}>
              <Badge variant="light" size="sm">
                {`Rank ${rank + 1} of ${priority.length}`}
              </Badge>
              <Tooltip label="Higher priority" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Higher priority"
                  disabled={disabled || rank === 0}
                  onClick={() => move(-1)}
                >
                  <ChevronUp size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Lower priority" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Lower priority"
                  disabled={disabled || rank === priority.length - 1}
                  onClick={() => move(1)}
                >
                  <ChevronDown size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </SettingsSection>
      </SettingsAccordion>
    </Stack>
  );
};

const PlaceSettings = ({
  net,
  config,
  onChange,
  disabled,
  id,
}: Props & { id: string }) => {
  const unit = config.time_unit ?? "minutes";
  const arrival = config.arrivals?.[id];
  return (
    <Stack gap="xs">
      <NodeHeader
        icon={<CircleDot size={ICON} />}
        kind={`Place · ${net.place_object_type[id] ?? "?"}`}
        name={id}
      />
      <SettingsAccordion key={id}>
        <SettingsSection
          value="arrivals"
          icon={<LogIn size={ICON} />}
          title="Object arrivals"
          summary={arrival ? describeArrival(arrival, unit) : "None"}
          description="New objects arriving in this place during the simulation, the first at the start."
        >
          {arrival ? (
            <>
              <ArrivalEditor
                arrival={arrival}
                unit={unit}
                onChange={(a) => onChange(setArrival(config, id, a))}
                disabled={disabled}
              />
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<X size={14} />}
                disabled={disabled}
                onClick={() => onChange(setArrival(config, id, undefined))}
              >
                Remove arrivals
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="default"
              leftSection={<Plus size={14} />}
              disabled={disabled}
              onClick={() =>
                onChange(setArrival(config, id, { mode: "rate", value: 1 }))
              }
            >
              Add arrivals
            </Button>
          )}
        </SettingsSection>
      </SettingsAccordion>
    </Stack>
  );
};

/** Shown when no node is selected: hint plus every node with its own settings. */
const CustomizedOverview = ({
  net,
  config,
  onFocus,
}: Props & { onFocus: (id: string) => void }) => {
  const unit = config.time_unit ?? "minutes";
  const priority = priorityOf(net, config);
  const transitions = net.petri_net.transitions
    .map((t) => t.id)
    .filter(
      (id) =>
        config.delays?.[id] || config.object_counts?.[id] || priority.includes(id),
    );
  const places = net.petri_net.places
    .map((p) => p.id)
    .filter((id) => config.arrivals?.[id]);
  const total = transitions.length + places.length;

  const row = (id: string, name: string, lines: (string | false | undefined)[]) => (
    <UnstyledButton key={id} onClick={() => onFocus(id)} style={{ minWidth: 0 }}>
      <Text size="xs" fw={500} truncate>
        {name}
      </Text>
      {lines.filter(Boolean).map((line) => (
        <Text key={line as string} size="xs" c="dimmed">
          {line}
        </Text>
      ))}
    </UnstyledButton>
  );

  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="nowrap" px={4}>
        <MousePointerClick size={ICON} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed">
          Select a transition or place in the net to edit its settings.
        </Text>
      </Group>
      <SettingsAccordion defaultValue={["customized"]}>
        <SettingsSection
          value="customized"
          icon={<ListChecks size={ICON} />}
          title="Customized nodes"
          summary={total ? `${total} node${total === 1 ? "" : "s"}` : "None"}
        >
          {total === 0 ? (
            <Text size="xs" c="dimmed">
              All nodes use the general settings.
            </Text>
          ) : (
            <Stack gap={6}>
              {transitions.map((id) =>
                row(id, transitionName(net, id), [
                  config.delays?.[id] && describeDelay(config.delays[id], unit),
                  config.object_counts?.[id] &&
                    describeObjectCounts(config.object_counts[id]),
                  priority.includes(id) &&
                    `Priority rank ${priority.indexOf(id) + 1}`,
                ]),
              )}
              {places.map((id) =>
                row(id, placeLabel(net, id), [
                  `Arrivals: ${describeArrival(config.arrivals![id], unit)}`,
                ]),
              )}
            </Stack>
          )}
        </SettingsSection>
      </SettingsAccordion>
    </Stack>
  );
};

/** Node tab: settings of the selected transition or place. */
export const ElementSettings = ({
  elementId,
  onFocus,
  ...props
}: Props & { elementId: string | null; onFocus: (id: string) => void }) => {
  const { net } = props;
  if (elementId && net.petri_net.transitions.some((t) => t.id === elementId))
    return <TransitionSettings {...props} id={elementId} />;
  if (elementId && net.petri_net.places.some((p) => p.id === elementId))
    return <PlaceSettings {...props} id={elementId} />;
  return <CustomizedOverview {...props} onFocus={onFocus} />;
};
