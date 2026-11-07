// Settings for the binding object counts, activity priority and object arrivals, which follow
// qel_simulation by Nina Graves (CC BY 4.0, https://github.com/ninagraves/qel_simulation).
import {
  ActionIcon,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { X } from "lucide-react";
import type {
  ArrivalConfig,
  OcpnImportResponse as ObjectCentricPetriNet,
  ObjectCount,
  SimulationConfig,
} from "../../api/ocpnEditor";

type ObjectCountTarget = { objectType: string; direction: "take" | "create" };

/** Object types whose number a transition can take (variable input arc) or create (output-only type on a variable output arc). */
const objectCountTargets = (
  net: ObjectCentricPetriNet,
  transition: string,
): ObjectCountTarget[] => {
  const places = new Set(net.petri_net.places.map((p) => p.id));
  const mult = net.place_in_out_mult ?? {};
  const typeOf = (place: string) => net.place_object_type[place] ?? "?";
  // place -> transition arcs are stored in the place's outgoing map, transition -> place in its incoming map
  const incoming = net.petri_net.arcs
    .filter(
      ({ nodes: [source, target] }) =>
        target === transition && places.has(source),
    )
    .map(({ nodes: [place] }) => ({
      type: typeOf(place),
      variable: !!mult[place]?.[1]?.[transition],
    }));
  const outgoing = net.petri_net.arcs
    .filter(
      ({ nodes: [source, target] }) =>
        source === transition && places.has(target),
    )
    .map(({ nodes: [, place] }) => ({
      type: typeOf(place),
      variable: !!mult[place]?.[0]?.[transition],
    }));
  const inputTypes = new Set(incoming.map((arc) => arc.type));
  const take = new Set(
    incoming.filter((arc) => arc.variable).map((arc) => arc.type),
  );
  const create = new Set(
    outgoing
      .filter((arc) => arc.variable && !inputTypes.has(arc.type))
      .map((arc) => arc.type),
  );
  return [
    ...[...take].map((objectType) => ({
      objectType,
      direction: "take" as const,
    })),
    ...[...create].map((objectType) => ({
      objectType,
      direction: "create" as const,
    })),
  ];
};

export const describeObjectCounts = (
  counts: Record<string, ObjectCount>,
) =>
  Object.entries(counts)
    .map(([type, q]) =>
      q.exact != null
        ? `${type}: exactly ${q.exact}`
        : `${type}: ${q.minimum ?? 1}–${q.maximum ?? "all"}`,
    )
    .join(", ");

const ObjectCountRow = ({
  target,
  value,
  onChange,
  disabled,
}: {
  target: ObjectCountTarget;
  value: ObjectCount | undefined;
  onChange: (value: ObjectCount | undefined) => void;
  disabled?: boolean;
}) => {
  const mode =
    value == null ? "default" : value.exact != null ? "exact" : "range";
  const verb = target.direction === "take" ? "Takes" : "Creates";
  const defaultText =
    target.direction === "take"
      ? "all available (all related, if the inputs are related)"
      : "one new object";
  return (
    <Stack gap={4}>
      <Text size="xs" fw={500}>
        {`${verb} ${target.objectType}`}
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        disabled={disabled}
        onChange={(v) =>
          onChange(
            v === "default"
              ? undefined
              : v === "exact"
                ? { exact: 1 }
                : { minimum: 1, maximum: null },
          )
        }
        data={[
          { label: "Default", value: "default" },
          { label: "Exactly", value: "exact" },
          { label: "Range", value: "range" },
        ]}
      />
      {mode === "default" && (
        <Text size="xs" c="dimmed">
          {`Default: ${defaultText}.`}
        </Text>
      )}
      {mode === "exact" && (
        <NumberInput
          size="xs"
          min={1}
          value={value?.exact ?? 1}
          onChange={(v) => onChange({ exact: Math.max(1, Number(v) || 1) })}
          disabled={disabled}
        />
      )}
      {mode === "range" && (
        <Group gap="xs" grow>
          <NumberInput
            size="xs"
            label="Min"
            min={1}
            value={value?.minimum ?? 1}
            onChange={(v) =>
              onChange({ ...value, minimum: Math.max(1, Number(v) || 1) })
            }
            disabled={disabled}
          />
          <NumberInput
            size="xs"
            label="Max"
            placeholder={target.direction === "take" ? "all" : "= min"}
            min={value?.minimum ?? 1}
            value={value?.maximum ?? ""}
            onChange={(v) =>
              onChange({
                ...value,
                maximum: v === "" || v == null ? null : Number(v),
              })
            }
            disabled={disabled}
          />
        </Group>
      )}
      {mode !== "default" && target.direction === "take" && (
        <Text size="xs" c="dimmed">
          Waits until enough are available, then picks them at random.
        </Text>
      )}
    </Stack>
  );
};

export const ObjectCountEditor = ({
  net,
  transition,
  value,
  onChange,
  disabled,
}: {
  net: ObjectCentricPetriNet;
  transition: string;
  value: Record<string, ObjectCount> | undefined;
  onChange: (value: Record<string, ObjectCount> | undefined) => void;
  disabled?: boolean;
}) => {
  const targets = objectCountTargets(net, transition);
  const current = value ?? {};
  const setType = (
    objectType: string,
    count: ObjectCount | undefined,
  ) => {
    const { [objectType]: _, ...rest } = current;
    const next = count ? { ...rest, [objectType]: count } : rest;
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <Stack gap="xs" mt="xs">
      <Text size="xs" fw={500}>
        Number of objects
      </Text>
      {targets.length === 0 ? (
        <Text size="xs" c="dimmed">
          Only for variable arcs: how many objects the transition takes from a
          variable input arc, or creates on a variable output arc.
        </Text>
      ) : (
        targets.map((target) => (
          <ObjectCountRow
            key={`${target.direction}-${target.objectType}`}
            target={target}
            value={current[target.objectType]}
            onChange={(count) => setType(target.objectType, count)}
            disabled={disabled}
          />
        ))
      )}
    </Stack>
  );
};

export const PriorityCard = ({
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
  const transitionIds = new Set(net.petri_net.transitions.map((t) => t.id));
  const priority = (config.activity_priority ?? []).filter((id) =>
    transitionIds.has(id),
  );
  return (
    <Card withBorder radius="sm" padding="sm">
      <Text fw={600} size="sm">
        Activity Priority
      </Text>
      <Text size="xs" c="dimmed" mb="xs">
        When several transitions can fire, prefer these, highest first. Order =
        order of selection.
      </Text>
      <MultiSelect
        size="xs"
        placeholder={priority.length ? undefined : "No priority: random choice"}
        data={net.petri_net.transitions.map((t) => ({
          value: t.id,
          label: t.label || `${t.id} (silent)`,
        }))}
        value={priority}
        onChange={(ids) => onChange({ ...config, activity_priority: ids })}
        searchable
        clearable
        disabled={disabled}
      />
      {priority.length > 0 && (
        <NumberInput
          size="xs"
          mt="xs"
          label="Priority probability (%)"
          description="Chance that the highest enabled one is taken instead of a random transition."
          min={0}
          max={100}
          value={Math.round((config.priority_probability ?? 0.5) * 100)}
          onChange={(v) =>
            onChange({
              ...config,
              priority_probability:
                Math.min(100, Math.max(0, Number(v) || 0)) / 100,
            })
          }
          disabled={disabled}
        />
      )}
    </Card>
  );
};

export const ArrivalsCard = ({
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
  const arrivals = config.arrivals ?? {};
  const placeIds = net.petri_net.places.map((p) => p.id);
  const configured = placeIds.filter((id) => arrivals[id]);
  const placeLabel = (id: string) =>
    `${id} (${net.place_object_type[id] ?? "?"})`;
  const setArrival = (place: string, arrival: ArrivalConfig | undefined) => {
    const { [place]: _, ...rest } = arrivals;
    onChange({
      ...config,
      arrivals: arrival ? { ...rest, [place]: arrival } : rest,
    });
  };
  return (
    <Card withBorder radius="sm" padding="sm">
      <Text fw={600} size="sm">
        Object Arrivals
      </Text>
      <Text size="xs" c="dimmed" mb="xs">
        New objects arriving in a place during the simulation, the first at the
        start.
      </Text>
      <Stack gap="xs">
        {configured.map((place) => {
          const arrival = arrivals[place];
          return (
            <Stack key={place} gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" fw={500} truncate>
                  {placeLabel(place)}
                </Text>
                <Tooltip label="Remove arrivals" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Remove arrivals"
                    disabled={disabled}
                    onClick={() => setArrival(place, undefined)}
                  >
                    <X size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Group gap="xs" grow wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={arrival.mode ?? "rate"}
                  onChange={(v) =>
                    setArrival(place, {
                      ...arrival,
                      mode: v as ArrivalConfig["mode"],
                    })
                  }
                  data={[
                    { label: "Random", value: "rate" },
                    { label: "Every", value: "interval" },
                  ]}
                  disabled={disabled}
                />
                <NumberInput
                  size="xs"
                  min={0.0001}
                  step={0.5}
                  decimalScale={4}
                  value={arrival.value}
                  onChange={(v) =>
                    setArrival(place, { ...arrival, value: Number(v) || 1 })
                  }
                  rightSection={
                    <Text size="xs" c="dimmed" pr={4}>
                      {(arrival.mode ?? "rate") === "rate" ? `/${unit}` : unit}
                    </Text>
                  }
                  rightSectionWidth={70}
                  disabled={disabled}
                />
              </Group>
              <Text size="xs" c="dimmed">
                {(arrival.mode ?? "rate") === "rate"
                  ? `On average ${arrival.value} per ${unit.replace(/s$/, "")}, at random times.`
                  : `One every ${arrival.value} ${unit}.`}
              </Text>
            </Stack>
          );
        })}
        <Select
          size="xs"
          placeholder="Add arrivals to a place"
          data={placeIds
            .filter((id) => !arrivals[id])
            .map((id) => ({ value: id, label: placeLabel(id) }))}
          value={null}
          onChange={(place) =>
            place && setArrival(place, { mode: "rate", value: 1 })
          }
          searchable
          disabled={disabled}
        />
      </Stack>
    </Card>
  );
};
