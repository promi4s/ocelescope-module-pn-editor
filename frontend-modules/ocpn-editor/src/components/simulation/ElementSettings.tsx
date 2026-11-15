import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  Boxes,
  CircleDot,
  Funnel,
  ListChecks,
  LogIn,
  MousePointerClick,
  PenLine,
  Plus,
  RotateCcw,
  Split,
  Square,
  Hourglass,
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
} from "./SimulationOptions";
import {
  ConditionsEditor,
  describeCondition,
  describeUpdate,
  UpdatesEditor,
} from "./AttributeSettings";
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

/** Transitions that take objects from at least one of the same input places, i.e. that can compete for them. */
const competitorsOf = (net: ObjectCentricPetriNet, transition: string) => {
  const places = new Set(net.petri_net.places.map((p) => p.id));
  const inputs = new Set(
    net.petri_net.arcs
      .filter(({ nodes: [source, target] }) => target === transition && places.has(source))
      .map(({ nodes: [source] }) => source),
  );
  return [
    ...new Set(
      net.petri_net.arcs
        .filter(({ nodes: [source, target] }) => inputs.has(source) && target !== transition)
        .map(({ nodes: [, target] }) => target),
    ),
  ];
};

const weightOf = (config: SimulationConfig, transition: string) => config.weights?.[transition] ?? 1;

/** Routing weight of a transition and the resulting split against the transitions it competes with. */
const RoutingWeight = ({ net, config, onChange, disabled, id }: Props & { id: string }) => {
  const competitors = competitorsOf(net, id);
  const all = [id, ...competitors];
  const total = all.reduce((sum, t) => sum + weightOf(config, t), 0);
  const share = (t: string) => Math.round((weightOf(config, t) / total) * 100);
  return (
    <Stack gap="xs">
      <NumberInput
        size="xs"
        label="Weight"
        min={0.01}
        step={1}
        decimalScale={2}
        value={weightOf(config, id)}
        onChange={(v) => {
          const weight = Number(v);
          const { [id]: _, ...rest } = config.weights ?? {};
          // the default weight 1 is not stored
          onChange({ ...config, weights: weight > 0 && weight !== 1 ? { ...rest, [id]: weight } : rest });
        }}
        disabled={disabled}
      />
      {competitors.length === 0 ? (
        <Text size="xs" c="dimmed">
          No other transition takes objects from the same places, so the weight has no effect here.
        </Text>
      ) : (
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            When these can fire at the same time and compete for the same objects, they are chosen this often:
          </Text>
          {all.map((t) => (
            <Group key={t} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="xs" fw={t === id ? 600 : 400} truncate>
                {transitionName(net, t)}
              </Text>
              <Text size="xs" fw={t === id ? 600 : 400}>
                {`${share(t)}%`}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

const TransitionSettings = ({
  net,
  config,
  onChange,
  disabled,
  id,
}: Props & { id: string }) => {
  const unit = config.time_unit ?? "minutes";
  const delay = config.delays?.[id];
  const duration = config.durations?.[id];
  // silent transitions take no time unless it is set for them explicitly
  const silent = !net.petri_net.transitions.find((t) => t.id === id)?.label;
  const counts = config.object_counts?.[id];
  const conditions = config.guards?.[id] ?? [];
  const updates = config.attribute_updates?.[id] ?? [];
  const customized = !!(
    delay ||
    duration ||
    counts ||
    conditions.length ||
    updates.length ||
    config.weights?.[id]
  );

  return (
    <Stack gap="xs">
      <NodeHeader
        icon={<Square size={ICON} />}
        kind="Transition"
        name={transitionName(net, id)}
        action={
          customized && (
            <Tooltip label="Reset this transition's settings" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Reset this transition's settings"
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
          summary={
            delay ? describeDelay(delay, unit) : silent ? "None (silent)" : "Default delay"
          }
          description="How long the transition waits once it can fire, before it starts."
        >
          <DelayInput
            value={delay}
            onChange={(d) => {
              const { [id]: _, ...rest } = config.delays ?? {};
              onChange({ ...config, delays: d ? { ...rest, [id]: d } : rest });
            }}
            allowDefault
            defaultLabel={silent ? "None (silent)" : "Default delay"}
            disabled={disabled}
          />
        </SettingsSection>

        <SettingsSection
          value="duration"
          icon={<Hourglass size={ICON} />}
          title="Duration"
          summary={
            duration
              ? describeDelay(duration, unit)
              : silent
                ? "None (silent)"
                : "Default duration"
          }
          description="How long the transition takes from its start until its outputs are produced."
        >
          <DelayInput
            value={duration}
            onChange={(d) => {
              const { [id]: _, ...rest } = config.durations ?? {};
              onChange({ ...config, durations: d ? { ...rest, [id]: d } : rest });
            }}
            allowDefault
            defaultLabel={silent ? "None (silent)" : "Default duration"}
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
          value="conditions"
          icon={<Funnel size={ICON} />}
          title="Conditions"
          summary={conditions.length ? conditions.map(describeCondition).join(" and ") : "None"}
          description="Fires only with input objects whose attributes meet all conditions."
        >
          <ConditionsEditor
            net={net}
            config={config}
            onChange={onChange}
            transition={id}
            disabled={disabled}
          />
        </SettingsSection>

        <SettingsSection
          value="updates"
          icon={<PenLine size={ICON} />}
          title="Attribute updates"
          summary={updates.length ? updates.map(describeUpdate).join(", ") : "None"}
          description="Changes attributes of its input and created objects when an event starts."
        >
          <UpdatesEditor
            net={net}
            config={config}
            onChange={onChange}
            transition={id}
            disabled={disabled}
          />
        </SettingsSection>

        <SettingsSection
          value="weight"
          icon={<Split size={ICON} />}
          title="Routing weight"
          summary={
            weightOf(config, id) === 1 ? "Default (1)" : `Weight ${weightOf(config, id)}`
          }
          description="How likely this transition is chosen over others that want the same objects."
        >
          <RoutingWeight net={net} config={config} onChange={onChange} disabled={disabled} id={id} />
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
  const transitions = net.petri_net.transitions
    .map((t) => t.id)
    .filter(
      (id) =>
        config.delays?.[id] ||
        config.durations?.[id] ||
        config.object_counts?.[id] ||
        config.guards?.[id]?.length ||
        config.attribute_updates?.[id]?.length ||
        config.weights?.[id],
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
                  config.delays?.[id] && `Delay: ${describeDelay(config.delays[id], unit)}`,
                  config.durations?.[id] &&
                    `Duration: ${describeDelay(config.durations[id], unit)}`,
                  config.object_counts?.[id] &&
                    describeObjectCounts(config.object_counts[id]),
                  !!config.guards?.[id]?.length &&
                    `If ${config.guards[id].map(describeCondition).join(" and ")}`,
                  !!config.attribute_updates?.[id]?.length &&
                    config.attribute_updates[id].map(describeUpdate).join(", "),
                  !!config.weights?.[id] && `Routing weight ${config.weights[id]}`,
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
