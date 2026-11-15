// Settings for the binding object counts and object arrivals, which follow
// qel_simulation by Nina Graves (CC BY 4.0, https://github.com/ninagraves/qel_simulation).
import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
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


const arrivalModes = [
  { value: "fixed", label: "Fixed" },
  { value: "exponential", label: "Exponential" },
];

export const defaultArrival: ArrivalConfig = { mode: "exponential", value: 1 };

/** Short text for the arrivals of a place, e.g. "Every 2 minutes" or "Exponential, mean 2 minutes". */
export const describeArrival = (arrival: ArrivalConfig, unit: string) => {
  const mode = arrival.mode ?? "exponential";
  if (mode === "fixed") return `Every ${arrival.value} ${unit}`;
  return `Exponential, mean ${arrival.value} ${unit}`;
};

/** Arrival settings of one place: distribution of the time between two arrivals, and its (mean) value. */
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
  const mode = arrival.mode ?? "exponential";
  return (
    <Stack gap={4}>
      <Select
        size="xs"
        label="Time between arrivals"
        data={arrivalModes}
        value={mode}
        onChange={(v) =>
          onChange({ ...arrival, mode: (v ?? "exponential") as ArrivalConfig["mode"] })
        }
        allowDeselect={false}
        disabled={disabled}
      />
      <NumberInput
        size="xs"
        label={mode === "fixed" ? "Time" : "Mean"}
        min={0.0001}
        step={0.5}
        decimalScale={4}
        value={arrival.value}
        onChange={(v) => onChange({ ...arrival, value: Number(v) || 1 })}
        rightSection={
          <Text size="xs" c="dimmed" pr={4}>
            {unit}
          </Text>
        }
        rightSectionWidth={70}
        disabled={disabled}
      />
      <Text size="xs" c="dimmed">
        {mode === "fixed"
          ? `One object exactly every ${arrival.value} ${unit}.`
          : `One object at a time; the time until the next one is exponentially distributed with mean ${arrival.value} ${unit}.`}
        {" The first object arrives at the start."}
      </Text>
    </Stack>
  );
};

/** Modal to add or edit the arrivals of a place, with the same layout as the attribute modal. */
export const ArrivalModal = ({
  opened,
  onClose,
  place,
  arrival,
  unit,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  /** shown in the title */
  place: string;
  /** the current arrivals, or undefined to add new ones */
  arrival: ArrivalConfig | undefined;
  unit: string;
  onSave: (arrival: ArrivalConfig) => void;
}) => {
  const [draft, setDraft] = useState<ArrivalConfig>(defaultArrival);
  useEffect(() => {
    if (opened) setDraft(arrival ?? defaultArrival);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>{`${arrival ? "Edit" : "Add"} arrivals · ${place}`}</Text>}
    >
      <Stack gap="sm">
        <ArrivalEditor arrival={draft} unit={unit} onChange={setDraft} />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!(draft.value > 0)}
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            {arrival ? "Save" : "Add"}
          </Button>
        </Group>
      </Stack>
    </Modal>
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

