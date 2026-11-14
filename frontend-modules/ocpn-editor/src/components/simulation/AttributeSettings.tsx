// Object attributes, transition conditions (guards) and attribute updates, which follow qel_simulation's object
// attributes, object guards and attribute updates by Nina Graves (CC BY 4.0, https://github.com/ninagraves/qel_simulation).
import {
  ActionIcon,
  Autocomplete,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AttributeCondition,
  AttributeOption,
  AttributeConditionOperator,
  AttributeUpdate,
  OcpnImportResponse as ObjectCentricPetriNet,
  ObjectAttributeConfig,
  ObjectAttributeConfigType,
  SimulationConfig,
} from "../../api/ocpnEditor";

type Value = boolean | number | string;

// the backend calls them text / number / boolean; numbers are entered as whole numbers here
const typeOptions = [
  { value: "text", label: "String" },
  { value: "boolean", label: "Boolean" },
  { value: "number", label: "Integer" },
];

const defaultValue = (type: ObjectAttributeConfigType | undefined): Value =>
  type === "number" ? 0 : type === "boolean" ? false : "";

export const formatValue = (value: Value | null | undefined) =>
  typeof value === "boolean"
    ? value
      ? "true"
      : "false"
    : typeof value === "string"
      ? `"${value}"`
      : String(value ?? "");

const attributesOf = (config: SimulationConfig, objectType: string) =>
  config.object_attributes?.[objectType] ?? [];

const findAttribute = (
  config: SimulationConfig,
  objectType: string,
  name: string,
) => attributesOf(config, objectType).find((a) => a.name === name);

/** Object types of the places before (`input`) or after (`output`) a transition. */
export const transitionTypes = (
  net: ObjectCentricPetriNet,
  transition: string,
  side: "input" | "output",
) => {
  const types = new Set<string>();
  for (const {
    nodes: [source, target],
  } of net.petri_net.arcs) {
    const place = side === "input" ? source : target;
    const other = side === "input" ? target : source;
    const type = net.place_object_type[place];
    if (other === transition && type) types.add(type);
  }
  return [...types].sort();
};

/** Input for an attribute value, shaped by the attribute's type. */
const ValueInput = ({
  type,
  value,
  onChange,
  suggestions = [],
  label,
  size = "xs",
  disabled,
}: {
  type: ObjectAttributeConfigType | undefined;
  value: Value | null | undefined;
  onChange: (value: Value) => void;
  /** offered values for text attributes */
  suggestions?: string[];
  label?: string;
  size?: "xs" | "sm";
  disabled?: boolean;
}) => {
  if (type === "number")
    return (
      <NumberInput
        size={size}
        label={label}
        allowDecimal={false}
        value={typeof value === "number" ? value : 0}
        onChange={(v) => onChange(Math.round(Number(v) || 0))}
        disabled={disabled}
      />
    );
  if (type === "boolean")
    return (
      <Select
        size={size}
        label={label}
        data={[
          { value: "true", label: "True" },
          { value: "false", label: "False" },
        ]}
        value={value === true ? "true" : "false"}
        onChange={(v) => onChange(v === "true")}
        allowDeselect={false}
        disabled={disabled}
      />
    );
  return (
    <Autocomplete
      size={size}
      label={label}
      data={[...new Set(suggestions)]}
      value={typeof value === "string" ? value : String(value ?? "")}
      onChange={onChange}
      disabled={disabled}
    />
  );
};

const RemoveButton = ({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Tooltip label={label} withArrow>
    <ActionIcon
      variant="subtle"
      color="gray"
      size="sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <X size={14} />
    </ActionIcon>
  </Tooltip>
);

const textSuggestions = (attribute: ObjectAttributeConfig | undefined) =>
  (attribute?.options ?? [])
    .map((o) => o.value)
    .concat(attribute?.value ?? [])
    .filter((v): v is string => typeof v === "string" && v !== "");

// ------------------------------------------------------------------ object attributes

type AttributeRef = { objectType: string; name: string };

/** Moves the conditions and updates that use an attribute along when it is renamed or moved to another type. */
const moveReferences = (
  config: SimulationConfig,
  from: AttributeRef,
  to: AttributeRef,
): SimulationConfig => {
  const move = <T extends { object_type: string; attribute: string }>(
    byTransition: Record<string, T[]> | undefined,
  ) =>
    Object.fromEntries(
      Object.entries(byTransition ?? {}).map(([t, items]) => [
        t,
        items.map((item) =>
          item.object_type === from.objectType && item.attribute === from.name
            ? { ...item, object_type: to.objectType, attribute: to.name }
            : item,
        ),
      ]),
    );
  return {
    ...config,
    guards: move(config.guards),
    attribute_updates: move(config.attribute_updates),
  };
};

/** Removes the conditions and updates that use an attribute, so no transition refers to a deleted one. */
const removeReferences = (config: SimulationConfig, ref: AttributeRef): SimulationConfig => {
  const remove = <T extends { object_type: string; attribute: string }>(
    byTransition: Record<string, T[]> | undefined,
  ) =>
    Object.fromEntries(
      Object.entries(byTransition ?? {})
        .map(([t, items]) => [
          t,
          items.filter((i) => !(i.object_type === ref.objectType && i.attribute === ref.name)),
        ] as const)
        .filter(([, items]) => items.length > 0),
    );
  return {
    ...config,
    guards: remove(config.guards),
    attribute_updates: remove(config.attribute_updates),
  };
};

type Source = "fixed" | "choice" | "uniform";

/** A value that is fixed, drawn from weighted options, or drawn from a whole-number range. */
type SourceState = {
  source: Source;
  value: Value;
  options: AttributeOption[];
  minimum: number;
  maximum: number;
};

const sourceValid = (s: SourceState) =>
  s.source === "choice" ? s.options.length > 0 : s.source === "uniform" ? s.maximum >= s.minimum : true;

/** Short text for a value source, e.g. `"a" 25% / "b" 75%` or `random 1–5`. */
const describeSource = (
  source: Source | undefined,
  value: Value | null | undefined,
  options: AttributeOption[] | undefined,
  minimum: number | undefined,
  maximum: number | undefined,
) => {
  if (source === "choice") {
    const pct = percentages(options ?? []);
    return (options ?? []).map((o, i) => `${formatValue(o.value)} ${pct[i]}%`).join(" / ");
  }
  if (source === "uniform") return `random ${minimum ?? 0}–${maximum ?? 1}`;
  return formatValue(value);
};

/** "Value" with Fixed / Random / Range (Range only for integers), used by the attribute and the update modal. */
const ValueSourceFields = ({
  type,
  state,
  onChange,
  hints,
  suggestions,
}: {
  type: ObjectAttributeConfigType | undefined;
  state: SourceState;
  onChange: (patch: Partial<SourceState>) => void;
  hints: Record<Source, string>;
  suggestions?: string[];
}) => {
  const pct = percentages(state.options);
  const setOption = (i: number, patch: Partial<AttributeOption>) =>
    onChange({ options: state.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Value
      </Text>
      <SegmentedControl
        fullWidth
        value={state.source}
        onChange={(v) => onChange({ source: v as Source })}
        data={[
          { label: "Fixed", value: "fixed" },
          { label: "Random", value: "choice" },
          ...(type === "number" ? [{ label: "Range", value: "uniform" }] : []),
        ]}
      />
      {state.source === "fixed" && (
        <ValueInput
          type={type}
          value={state.value}
          onChange={(value) => onChange({ value })}
          suggestions={suggestions}
          size="sm"
        />
      )}
      {state.source === "choice" && (
        <>
          {state.options.map((option, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <div style={{ flex: 1, minWidth: 0 }}>
                <ValueInput
                  type={type}
                  value={option.value}
                  onChange={(value) => setOption(i, { value })}
                  suggestions={suggestions}
                  label={i === 0 ? "Value" : undefined}
                  size="sm"
                />
              </div>
              <NumberInput
                label={i === 0 ? "Weight" : undefined}
                min={0.0001}
                w={80}
                value={option.weight ?? 1}
                onChange={(v) => setOption(i, { weight: Number(v) || 1 })}
                rightSection={
                  <Text size="xs" c="dimmed" pr={6}>
                    {`${pct[i]}%`}
                  </Text>
                }
                rightSectionWidth={40}
              />
              <RemoveButton
                label="Remove value"
                disabled={state.options.length === 1}
                onClick={() => onChange({ options: state.options.filter((_, j) => j !== i) })}
              />
            </Group>
          ))}
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Plus size={14} />}
            style={{ alignSelf: "flex-start" }}
            onClick={() =>
              onChange({ options: [...state.options, { value: defaultValue(type), weight: 1 }] })
            }
          >
            Add value
          </Button>
        </>
      )}
      {state.source === "uniform" && (
        <Group gap="xs" grow wrap="nowrap">
          <NumberInput
            label="Min"
            allowDecimal={false}
            value={state.minimum}
            onChange={(v) => onChange({ minimum: Math.round(Number(v) || 0) })}
          />
          <NumberInput
            label="Max"
            allowDecimal={false}
            value={state.maximum}
            error={state.maximum < state.minimum ? "Must not be below min" : undefined}
            onChange={(v) => onChange({ maximum: Math.round(Number(v) || 0) })}
          />
        </Group>
      )}
      <Text size="xs" c="dimmed">
        {hints[state.source]}
      </Text>
    </Stack>
  );
};

type Draft = SourceState & {
  objectType: string | null;
  name: string;
  type: ObjectAttributeConfigType;
};

const typeLabel = (type: ObjectAttributeConfigType | undefined) =>
  typeOptions.find((o) => o.value === (type ?? "text"))?.label ?? "String";

/** Starting options when switching to random values: both booleans, otherwise one empty value. */
const defaultOptions = (type: ObjectAttributeConfigType | undefined): AttributeOption[] =>
  type === "boolean"
    ? [
        { value: true, weight: 1 },
        { value: false, weight: 1 },
      ]
    : [{ value: defaultValue(type), weight: 1 }];

const emptyDraft = (objectType: string | null): Draft => ({
  objectType,
  name: "",
  type: "text",
  source: "fixed",
  value: "",
  options: defaultOptions("text"),
  minimum: 0,
  maximum: 10,
});

const percentages = (options: AttributeOption[]) => {
  const total = options.reduce((sum, o) => sum + (o.weight ?? 1), 0);
  return options.map((o) => (total > 0 ? Math.round(((o.weight ?? 1) / total) * 100) : 0));
};

/** How a new object gets its value, in a few words. */
export const describeInitial = (a: ObjectAttributeConfig) =>
  describeSource(a.initial, a.value, a.options, a.minimum, a.maximum);

/** Modal to add or edit one attribute: object type, name, type and how new objects get their value. */
const AttributeModal = ({
  opened,
  onClose,
  objectTypes,
  config,
  editing,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  objectTypes: string[];
  config: SimulationConfig;
  /** the attribute being edited, or null to add a new one */
  editing: AttributeRef | null;
  onSave: (objectType: string, attribute: ObjectAttributeConfig) => void;
}) => {
  const [draft, setDraft] = useState<Draft>(emptyDraft(null));

  // fill the form whenever the modal opens
  useEffect(() => {
    if (!opened) return;
    const current = editing ? findAttribute(config, editing.objectType, editing.name) : undefined;
    if (!editing || !current) {
      setDraft(emptyDraft(objectTypes[0] ?? null));
      return;
    }
    const type = current.type ?? "text";
    setDraft({
      objectType: editing.objectType,
      name: current.name,
      type,
      source: current.initial ?? "fixed",
      value: current.value ?? defaultValue(type),
      options: current.options?.length ? current.options : defaultOptions(type),
      minimum: current.minimum ?? 0,
      maximum: current.maximum ?? 10,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const name = draft.name.trim();
  const taken =
    !!draft.objectType &&
    attributesOf(config, draft.objectType).some(
      (a) =>
        a.name === name &&
        !(editing && editing.objectType === draft.objectType && editing.name === name),
    );
  const valid = !!draft.objectType && !!name && !taken && sourceValid(draft);

  const build = (): ObjectAttributeConfig => {
    if (draft.source === "choice")
      return { name, type: draft.type, initial: "choice", options: draft.options };
    if (draft.source === "uniform")
      return {
        name,
        type: "number",
        initial: "uniform",
        minimum: draft.minimum,
        maximum: draft.maximum,
        integer: true,
      };
    return { name, type: draft.type, initial: "fixed", value: draft.value };
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>{editing ? "Edit attribute" : "Add attribute"}</Text>}
    >
      <Stack gap="sm">
        <Select
          label="Object type"
          data={objectTypes}
          value={draft.objectType}
          onChange={(objectType) => setDraft({ ...draft, objectType })}
          allowDeselect={false}
          required
        />
        <TextInput
          label="Name"
          placeholder="e.g. amount"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
          error={taken ? `${draft.objectType} already has this attribute` : undefined}
          required
          data-autofocus
        />
        <Select
          label="Type"
          data={typeOptions}
          value={draft.type}
          onChange={(v) => {
            const type = (v ?? "text") as ObjectAttributeConfigType;
            // values of the old type do not fit the new one
            setDraft({
              ...draft,
              type,
              source: draft.source === "uniform" && type !== "number" ? "fixed" : draft.source,
              value: defaultValue(type),
              options: defaultOptions(type),
            });
          }}
          allowDeselect={false}
        />
        <ValueSourceFields
          type={draft.type}
          state={draft}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          hints={{
            fixed: "Every new object starts with this value.",
            choice: "Every new object gets one of these values at random; a higher weight makes it more likely.",
            uniform: "Every new object gets a random whole number from min to max, each equally likely.",
          }}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              if (!valid || !draft.objectType) return;
              onSave(draft.objectType, build());
              onClose();
            }}
          >
            {editing ? "Save" : "Add"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

/** General tab: all attributes of all object types as one list; adding and editing happens in a modal. */
export const ObjectAttributesSettings = ({
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
  const [modalOpened, setModalOpened] = useState(false);
  const [editing, setEditing] = useState<AttributeRef | null>(null);
  const objectTypes = Array.from(new Set(Object.values(net.place_object_type))).sort();
  // attributes of types that are no longer in the net stay in the config, but are not listed
  const rows = objectTypes.flatMap((objectType) =>
    attributesOf(config, objectType).map((attribute) => ({ objectType, attribute })),
  );

  const open = (ref: AttributeRef | null) => {
    setEditing(ref);
    setModalOpened(true);
  };

  const save = (objectType: string, attribute: ObjectAttributeConfig) => {
    const name = attribute.name;
    let next = config;
    const lists = { ...(config.object_attributes ?? {}) };
    if (editing) {
      lists[editing.objectType] = attributesOf(config, editing.objectType).filter(
        (a) => a.name !== editing.name,
      );
      // conditions and updates follow a renamed attribute; after a type change their values may need a look
      next = moveReferences(config, editing, { objectType, name });
    }
    const target = lists[objectType] ?? [];
    const index = editing && editing.objectType === objectType
      ? attributesOf(config, objectType).findIndex((a) => a.name === editing.name)
      : -1;
    lists[objectType] =
      index >= 0
        ? [...target.slice(0, index), attribute, ...target.slice(index)]
        : [...target, attribute];
    onChange({ ...next, object_attributes: lists });
  };

  const remove = (ref: AttributeRef) => {
    const next = removeReferences(config, ref);
    onChange({
      ...next,
      object_attributes: {
        ...(config.object_attributes ?? {}),
        [ref.objectType]: attributesOf(config, ref.objectType).filter((a) => a.name !== ref.name),
      },
    });
  };

  if (objectTypes.length === 0)
    return (
      <Text size="xs" c="dimmed">
        Add a place to create an object type.
      </Text>
    );

  return (
    <Stack gap="xs">
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed">
          No attributes yet.
        </Text>
      ) : (
        <Stack gap={2}>
          {rows.map(({ objectType, attribute }) => (
            <Group
              key={`${objectType}.${attribute.name}`}
              gap="xs"
              wrap="nowrap"
              justify="space-between"
            >
              <UnstyledButton
                onClick={() => open({ objectType, name: attribute.name })}
                disabled={disabled}
                style={{ minWidth: 0, flex: 1 }}
              >
                <Text size="xs" fw={500} truncate>
                  {`${objectType}.${attribute.name}`}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {`${typeLabel(attribute.type)} · ${describeInitial(attribute)}`}
                </Text>
              </UnstyledButton>
              <Group gap={2} wrap="nowrap">
                <Tooltip label="Edit attribute" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Edit attribute"
                    disabled={disabled}
                    onClick={() => open({ objectType, name: attribute.name })}
                  >
                    <Pencil size={14} />
                  </ActionIcon>
                </Tooltip>
                <RemoveButton
                  label="Remove attribute"
                  onClick={() => remove({ objectType, name: attribute.name })}
                  disabled={disabled}
                />
              </Group>
            </Group>
          ))}
        </Stack>
      )}
      <Button
        size="xs"
        variant="default"
        leftSection={<Plus size={14} />}
        onClick={() => open(null)}
        disabled={disabled}
      >
        Add attribute
      </Button>
      <AttributeModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        objectTypes={objectTypes}
        config={config}
        editing={editing}
        onSave={save}
      />
    </Stack>
  );
};

export const describeObjectAttributes = (
  net: ObjectCentricPetriNet,
  config: SimulationConfig,
) => {
  const objectTypes = Array.from(new Set(Object.values(net.place_object_type))).sort();
  if (objectTypes.length === 0) return "None yet";
  return objectTypes
    .map((t) => {
      const n = attributesOf(config, t).length;
      return n ? `${t} (${n})` : t;
    })
    .join(", ");
};

// ------------------------------------------------------------------ conditions and updates

const symbol: Record<string, string> = { "==": "=", "!=": "≠", "<=": "≤", ">=": "≥" };

export const describeCondition = (c: AttributeCondition) =>
  `${c.object_type}.${c.attribute} ${symbol[c.operator ?? "=="] ?? c.operator} ${formatValue(c.value)}`;

export const describeUpdate = (u: AttributeUpdate) =>
  `${u.object_type}.${u.attribute} ${(u.operation ?? "set") === "add" ? "+=" : ":="} ${describeSource(
    u.source,
    u.value,
    u.options,
    u.minimum,
    u.maximum,
  )}`;



const operatorsFor = (type: ObjectAttributeConfigType | undefined) =>
  (type === "number" ? ["==", "!=", "<", "<=", ">", ">="] : ["==", "!="]).map((op) => ({
    value: op,
    label: symbol[op] ?? op,
  }));

const operationsFor = (type: ObjectAttributeConfigType | undefined) => [
  { value: "set", label: "Set to" },
  ...(type === "number" ? [{ value: "add", label: "Add" }] : []),
];

/**
 * What conditions and updates have in common: an attribute of an object type, an operator and a value.
 * Updates can also draw their value at random (`source`, `options`, `minimum`, `maximum`).
 */
type Rule = SourceState & { object_type: string; attribute: string; op: string };

const ruleFor = (
  objectType: string,
  attribute: ObjectAttributeConfig,
  opsFor: (type: ObjectAttributeConfigType | undefined) => { value: string }[],
): Rule => ({
  object_type: objectType,
  attribute: attribute.name,
  op: opsFor(attribute.type)[0].value,
  source: "fixed",
  value: defaultValue(attribute.type),
  options: defaultOptions(attribute.type),
  minimum: 1,
  maximum: 5,
});

/** Modal to add or edit a condition or an attribute update, laid out like the attribute modal. */
const RuleModal = ({
  opened,
  onClose,
  title,
  config,
  types,
  editing,
  opLabel,
  opsFor,
  random,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  config: SimulationConfig;
  /** object types that can be chosen (only those with attributes) */
  types: string[];
  /** the rule being edited, or null to add a new one */
  editing: Rule | null;
  opLabel: string;
  opsFor: (type: ObjectAttributeConfigType | undefined) => { value: string; label: string }[];
  /** offer random values (Fixed / Random / Range), for updates */
  random?: boolean;
  onSave: (rule: Rule) => void;
}) => {
  const [draft, setDraft] = useState<Rule | null>(null);

  const fresh = (objectType: string): Rule | null => {
    const first = attributesOf(config, objectType)[0];
    return first ? ruleFor(objectType, first, opsFor) : null;
  };

  useEffect(() => {
    if (opened) setDraft(editing ?? (types[0] ? fresh(types[0]) : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const attribute = draft ? findAttribute(config, draft.object_type, draft.attribute) : undefined;
  const valid = !!attribute && !!draft && (!random || sourceValid(draft));

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{title}</Text>}>
      {draft && (
        <Stack gap="sm">
          <Select
            label="Object type"
            data={types}
            value={draft.object_type}
            onChange={(t) => t && setDraft(fresh(t) ?? draft)}
            allowDeselect={false}
          />
          <Select
            label="Attribute"
            data={attributesOf(config, draft.object_type).map((a) => ({
              value: a.name,
              label: `${a.name} (${typeLabel(a.type)})`,
            }))}
            value={draft.attribute}
            error={!attribute ? "This attribute no longer exists" : undefined}
            onChange={(name) => {
              const a = name ? findAttribute(config, draft.object_type, name) : undefined;
              if (a) setDraft(ruleFor(draft.object_type, a, opsFor));
            }}
            allowDeselect={false}
          />
          <Select
            label={opLabel}
            data={opsFor(attribute?.type)}
            value={draft.op}
            onChange={(op) => op && setDraft({ ...draft, op })}
            allowDeselect={false}
          />
          {random ? (
            <ValueSourceFields
              type={attribute?.type}
              state={draft}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
              suggestions={textSuggestions(attribute)}
              hints={{
                fixed: "Every object gets this value.",
                choice: "Every object gets one of these values at random; a higher weight makes it more likely.",
                uniform: "Every object gets its own random whole number from min to max.",
              }}
            />
          ) : (
            <ValueInput
              type={attribute?.type}
              value={draft.value}
              onChange={(value) => setDraft({ ...draft, value })}
              suggestions={textSuggestions(attribute)}
              label="Value"
              size="sm"
            />
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              {editing ? "Save" : "Add"}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
};

/** List of conditions or updates of a transition with edit/remove per row, and an Add button; editing opens RuleModal. */
const RuleList = ({
  config,
  types,
  rules,
  onChange,
  describe,
  joiner,
  addLabel,
  modalTitle,
  opLabel,
  opsFor,
  random,
  disabled,
}: {
  config: SimulationConfig;
  types: string[];
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  describe: (rule: Rule) => string;
  /** shown between rows, e.g. "and" */
  joiner?: string;
  addLabel: string;
  modalTitle: (editing: boolean) => string;
  opLabel: string;
  opsFor: (type: ObjectAttributeConfigType | undefined) => { value: string; label: string }[];
  random?: boolean;
  disabled?: boolean;
}) => {
  const [modalOpened, setModalOpened] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const usable = types.filter((t) => attributesOf(config, t).length > 0);
  const open = (index: number | null) => {
    setEditingIndex(index);
    setModalOpened(true);
  };

  return (
    <Stack gap="xs">
      {rules.length > 0 && (
        <Stack gap={2}>
          {rules.map((rule, i) => {
            const broken = !findAttribute(config, rule.object_type, rule.attribute);
            return (
              <Stack key={i} gap={2}>
                {i > 0 && joiner && (
                  <Text size="xs" c="dimmed">
                    {joiner}
                  </Text>
                )}
                <Group gap="xs" wrap="nowrap" justify="space-between">
                  <UnstyledButton
                    onClick={() => open(i)}
                    disabled={disabled}
                    style={{ minWidth: 0, flex: 1 }}
                  >
                    <Text size="xs" fw={500} truncate c={broken ? "red" : undefined}>
                      {describe(rule)}
                    </Text>
                  </UnstyledButton>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label="Edit" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Edit"
                        disabled={disabled}
                        onClick={() => open(i)}
                      >
                        <Pencil size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <RemoveButton
                      label="Remove"
                      onClick={() => onChange(rules.filter((_, j) => j !== i))}
                      disabled={disabled}
                    />
                  </Group>
                </Group>
              </Stack>
            );
          })}
        </Stack>
      )}
      {usable.length === 0 ? (
        <Text size="xs" c="dimmed">
          Add attributes to its object types under General → Object types first.
        </Text>
      ) : (
        <Button
          size="xs"
          variant="default"
          leftSection={<Plus size={14} />}
          disabled={disabled}
          onClick={() => open(null)}
        >
          {addLabel}
        </Button>
      )}
      <RuleModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title={modalTitle(editingIndex !== null)}
        config={config}
        types={usable}
        editing={editingIndex !== null ? rules[editingIndex] ?? null : null}
        opLabel={opLabel}
        opsFor={opsFor}
        random={random}
        onSave={(rule) =>
          onChange(
            editingIndex !== null
              ? rules.map((r, j) => (j === editingIndex ? rule : r))
              : [...rules, rule],
          )
        }
      />
    </Stack>
  );
};

type EditorProps = {
  net: ObjectCentricPetriNet;
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  transition: string;
  disabled?: boolean;
};

export const ConditionsEditor = ({ net, config, onChange, transition, disabled }: EditorProps) => {
  const conditions = config.guards?.[transition] ?? [];
  const set = (next: AttributeCondition[]) => {
    const { [transition]: _, ...rest } = config.guards ?? {};
    onChange({ ...config, guards: next.length ? { ...rest, [transition]: next } : rest });
  };
  const toRule = (c: AttributeCondition): Rule => ({
    ...c,
    op: c.operator ?? "==",
    source: "fixed",
    options: [],
    minimum: 0,
    maximum: 0,
  });
  const fromRule = (r: Rule): AttributeCondition => ({
    object_type: r.object_type,
    attribute: r.attribute,
    operator: r.op as AttributeConditionOperator,
    value: r.value,
  });

  return (
    <RuleList
      config={config}
      types={transitionTypes(net, transition, "input")}
      rules={conditions.map(toRule)}
      onChange={(rules) => set(rules.map(fromRule))}
      describe={(r) => describeCondition(fromRule(r))}
      joiner="and"
      addLabel="Add condition"
      modalTitle={(editing) => (editing ? "Edit condition" : "Add condition")}
      opLabel="Operator"
      opsFor={operatorsFor}
      disabled={disabled}
    />
  );
};

export const UpdatesEditor = ({ net, config, onChange, transition, disabled }: EditorProps) => {
  const updates = config.attribute_updates?.[transition] ?? [];
  const set = (next: AttributeUpdate[]) => {
    const { [transition]: _, ...rest } = config.attribute_updates ?? {};
    onChange({
      ...config,
      attribute_updates: next.length ? { ...rest, [transition]: next } : rest,
    });
  };
  const toRule = (u: AttributeUpdate): Rule => {
    const type = findAttribute(config, u.object_type, u.attribute)?.type;
    return {
      object_type: u.object_type,
      attribute: u.attribute,
      op: u.operation ?? "set",
      source: u.source ?? "fixed",
      value: u.value ?? defaultValue(type),
      options: u.options?.length ? u.options : defaultOptions(type),
      minimum: u.minimum ?? 1,
      maximum: u.maximum ?? 5,
    };
  };
  // only what the chosen source needs is sent
  const fromRule = (r: Rule): AttributeUpdate => ({
    object_type: r.object_type,
    attribute: r.attribute,
    operation: r.op === "add" ? "add" : "set",
    source: r.source,
    ...(r.source === "fixed" && { value: r.value }),
    ...(r.source === "choice" && { options: r.options }),
    ...(r.source === "uniform" && { minimum: r.minimum, maximum: r.maximum }),
  });
  const types = Array.from(
    new Set([
      ...transitionTypes(net, transition, "input"),
      ...transitionTypes(net, transition, "output"),
    ]),
  ).sort();

  return (
    <RuleList
      config={config}
      types={types}
      rules={updates.map(toRule)}
      onChange={(rules) => set(rules.map(fromRule))}
      describe={(r) => describeUpdate(fromRule(r))}
      addLabel="Add update"
      modalTitle={(editing) => (editing ? "Edit attribute update" : "Add attribute update")}
      opLabel="Operation"
      opsFor={operationsFor}
      random
      disabled={disabled}
    />
  );
};
