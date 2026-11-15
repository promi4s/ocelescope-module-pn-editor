// Settings for the binding object counts and object arrivals, which follow
// qel_simulation by Nina Graves (CC BY 4.0, https://github.com/ninagraves/qel_simulation).
import {
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
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
    <Stack gap="xs">
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

export const placeLabel = (net: ObjectCentricPetriNet, id: string) =>
  `${id} (${net.place_object_type[id] ?? "?"})`;

/** Arrival settings of one place: random (rate) or fixed interval. */
export const ArrivalEditor = ({
  arrival,
  unit,
  onChange,
  disabled,
}: {
  arrival: ArrivalConfig;
  unit: string;
  onChange: (arrival: ArrivalConfig) => void;
  disabled?: boolean;
}) => {
  const mode = arrival.mode ?? "rate";
  return (
    <Stack gap={4}>
      <Group gap="xs" grow wrap="nowrap">
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) =>
            onChange({ ...arrival, mode: v as ArrivalConfig["mode"] })
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
          onChange={(v) => onChange({ ...arrival, value: Number(v) || 1 })}
          rightSection={
            <Text size="xs" c="dimmed" pr={4}>
              {mode === "rate" ? `/${unit}` : unit}
            </Text>
          }
          rightSectionWidth={70}
          disabled={disabled}
        />
      </Group>
      <Text size="xs" c="dimmed">
        {mode === "rate"
          ? `On average ${arrival.value} per ${unit.replace(/s$/, "")}, at random times.`
          : `One every ${arrival.value} ${unit}.`}
      </Text>
    </Stack>
  );
};

export const setArrival = (
  config: SimulationConfig,
  place: string,
  arrival: ArrivalConfig | undefined,
): SimulationConfig => {
  const { [place]: _, ...rest } = config.arrivals ?? {};
  return { ...config, arrivals: arrival ? { ...rest, [place]: arrival } : rest };
};

