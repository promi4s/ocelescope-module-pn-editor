// Object attributes, transition conditions (guards) and attribute updates, which follow qel_simulation's object
// attributes, object guards and attribute updates by Nina Graves (CC BY 4.0, https://github.com/ninagraves/qel_simulation).
import {
  ActionIcon,
  Autocomplete,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
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

type Draft = { objectType: string | null; name: string; type: ObjectAttributeConfigType; value: Value };

const typeLabel = (type: ObjectAttributeConfigType | undefined) =>
  typeOptions.find((o) => o.value === (type ?? "text"))?.label ?? "String";

/** Modal to add or edit one attribute: object type, name, type and value. */
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
  onSave: (draft: Required<Draft> & { objectType: string }) => void;
}) => {
  const [draft, setDraft] = useState<Draft>({
    objectType: null,
    name: "",
    type: "text",
    value: "",
  });

  // fill the form whenever the modal opens
  useEffect(() => {
    if (!opened) return;
    const current = editing ? findAttribute(config, editing.objectType, editing.name) : undefined;
    setDraft(
      editing && current
        ? {
            objectType: editing.objectType,
            name: current.name,
            type: current.type ?? "text",
            value: current.value ?? defaultValue(current.type),
          }
        : { objectType: objectTypes[0] ?? null, name: "", type: "text", value: "" },
    );
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
  const valid = !!draft.objectType && !!name && !taken;

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
            setDraft({ ...draft, type, value: defaultValue(type) });
          }}
          allowDeselect={false}
        />
        <ValueInput
          type={draft.type}
          value={draft.value}
          onChange={(value) => setDraft({ ...draft, value })}
          label="Value"
          size="sm"
        />
        <Text size="xs" c="dimmed">
          Every new object of this type starts with this value.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              if (!valid || !draft.objectType) return;
              onSave({ ...draft, objectType: draft.objectType, name });
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

  const save = ({ objectType, name, type, value }: Required<Draft> & { objectType: string }) => {
    const attribute: ObjectAttributeConfig = { name, type, initial: "fixed", value };
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
                  {`${typeLabel(attribute.type)} · ${
                    attribute.initial && attribute.initial !== "fixed"
                      ? "random"
                      : formatValue(attribute.value)
                  }`}
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

export const describeCondition = (c: AttributeCondition) =>
  `${c.object_type}.${c.attribute} ${c.operator ?? "=="} ${formatValue(c.value)}`;

export const describeUpdate = (u: AttributeUpdate) =>
  (u.operation ?? "set") === "add"
    ? `${u.object_type}.${u.attribute} += ${formatValue(u.value)}`
    : `${u.object_type}.${u.attribute} := ${formatValue(u.value)}`;

const operatorsFor = (type: ObjectAttributeConfigType | undefined) =>
  (type === "number" ? ["==", "!=", "<", "<=", ">", ">="] : ["==", "!="]).map(
    (op) => ({ value: op, label: op === "==" ? "=" : op === "!=" ? "≠" : op === "<=" ? "≤" : op === ">=" ? "≥" : op }),
  );

/** Object type + attribute pickers shared by conditions and updates. */
const AttributePicker = ({
  config,
  types,
  objectType,
  attribute,
  onChange,
  disabled,
}: {
  config: SimulationConfig;
  types: string[];
  objectType: string;
  attribute: string;
  onChange: (objectType: string, attribute: ObjectAttributeConfig) => void;
  disabled?: boolean;
}) => (
  <Group gap="xs" grow wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
    <Select
      size="xs"
      data={types.filter((t) => attributesOf(config, t).length > 0)}
      value={objectType}
      onChange={(t) => {
        const first = t ? attributesOf(config, t)[0] : undefined;
        if (t && first) onChange(t, first);
      }}
      allowDeselect={false}
      disabled={disabled}
    />
    <Select
      size="xs"
      data={attributesOf(config, objectType).map((a) => a.name)}
      value={attribute}
      error={!findAttribute(config, objectType, attribute) ? "Unknown" : undefined}
      onChange={(name) => {
        const found = name ? findAttribute(config, objectType, name) : undefined;
        if (found) onChange(objectType, found);
      }}
      allowDeselect={false}
      disabled={disabled}
    />
  </Group>
);

const NoAttributesHint = () => (
  <Text size="xs" c="dimmed">
    Add attributes to its object types under General → Object types first.
  </Text>
);

export const ConditionsEditor = ({
  net,
  config,
  onChange,
  transition,
  disabled,
}: {
  net: ObjectCentricPetriNet;
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  transition: string;
  disabled?: boolean;
}) => {
  const types = transitionTypes(net, transition, "input");
  const usable = types.filter((t) => attributesOf(config, t).length > 0);
  const conditions = config.guards?.[transition] ?? [];
  const set = (next: AttributeCondition[]) => {
    const { [transition]: _, ...rest } = config.guards ?? {};
    onChange({ ...config, guards: next.length ? { ...rest, [transition]: next } : rest });
  };

  return (
    <Stack gap="xs">
      {conditions.map((condition, i) => {
        const attribute = findAttribute(config, condition.object_type, condition.attribute);
        const update = (patch: Partial<AttributeCondition>) =>
          set(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)));
        return (
          <Stack key={i} gap={4}>
            {i > 0 && (
              <Text size="xs" c="dimmed" fw={500}>
                and
              </Text>
            )}
            <Group gap="xs" wrap="nowrap">
              <AttributePicker
                config={config}
                types={types}
                objectType={condition.object_type}
                attribute={condition.attribute}
                onChange={(object_type, a) =>
                  update({
                    object_type,
                    attribute: a.name,
                    operator: "==",
                    value: defaultValue(a.type),
                  })
                }
                disabled={disabled}
              />
              <RemoveButton
                label="Remove condition"
                onClick={() => set(conditions.filter((_, j) => j !== i))}
                disabled={disabled}
              />
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Select
                size="xs"
                w={64}
                data={operatorsFor(attribute?.type)}
                value={condition.operator ?? "=="}
                onChange={(op) => update({ operator: (op ?? "==") as AttributeConditionOperator })}
                allowDeselect={false}
                disabled={disabled}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <ValueInput
                  type={attribute?.type}
                  value={condition.value}
                  onChange={(value) => update({ value })}
                  suggestions={textSuggestions(attribute)}
                  disabled={disabled}
                />
              </div>
            </Group>
          </Stack>
        );
      })}
      {usable.length === 0 ? (
        <NoAttributesHint />
      ) : (
        <Button
          size="xs"
          variant="default"
          leftSection={<Plus size={14} />}
          disabled={disabled}
          onClick={() => {
            const first = attributesOf(config, usable[0])[0];
            set([
              ...conditions,
              {
                object_type: usable[0],
                attribute: first.name,
                operator: "==",
                value: defaultValue(first.type),
              },
            ]);
          }}
        >
          Add condition
        </Button>
      )}
    </Stack>
  );
};

export const UpdatesEditor = ({
  net,
  config,
  onChange,
  transition,
  disabled,
}: {
  net: ObjectCentricPetriNet;
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  transition: string;
  disabled?: boolean;
}) => {
  const types = Array.from(
    new Set([
      ...transitionTypes(net, transition, "input"),
      ...transitionTypes(net, transition, "output"),
    ]),
  ).sort();
  const usable = types.filter((t) => attributesOf(config, t).length > 0);
  const updates = config.attribute_updates?.[transition] ?? [];
  const set = (next: AttributeUpdate[]) => {
    const { [transition]: _, ...rest } = config.attribute_updates ?? {};
    onChange({
      ...config,
      attribute_updates: next.length ? { ...rest, [transition]: next } : rest,
    });
  };

  return (
    <Stack gap="xs">
      {updates.map((u, i) => {
        const attribute = findAttribute(config, u.object_type, u.attribute);
        const patch = (p: Partial<AttributeUpdate>) =>
          set(updates.map((x, j) => (j === i ? { ...x, ...p } : x)));
        return (
          <Stack key={i} gap={4}>
            {i > 0 && <Divider />}
            <Group gap="xs" wrap="nowrap">
              <AttributePicker
                config={config}
                types={types}
                objectType={u.object_type}
                attribute={u.attribute}
                onChange={(object_type, a) =>
                  patch({
                    object_type,
                    attribute: a.name,
                    operation: "set",
                    value: defaultValue(a.type),
                  })
                }
                disabled={disabled}
              />
              <RemoveButton
                label="Remove update"
                onClick={() => set(updates.filter((_, j) => j !== i))}
                disabled={disabled}
              />
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Select
                size="xs"
                w={84}
                data={[
                  { value: "set", label: "Set to" },
                  ...(attribute?.type === "number" ? [{ value: "add", label: "Add" }] : []),
                ]}
                value={u.operation ?? "set"}
                onChange={(op) => patch({ operation: op === "add" ? "add" : "set" })}
                allowDeselect={false}
                disabled={disabled}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <ValueInput
                  type={attribute?.type}
                  value={u.value}
                  onChange={(value) => patch({ value })}
                  suggestions={textSuggestions(attribute)}
                  disabled={disabled}
                />
              </div>
            </Group>
          </Stack>
        );
      })}
      {usable.length === 0 ? (
        <NoAttributesHint />
      ) : (
        <Button
          size="xs"
          variant="default"
          leftSection={<Plus size={14} />}
          disabled={disabled}
          onClick={() => {
            const first = attributesOf(config, usable[0])[0];
            set([
              ...updates,
              {
                object_type: usable[0],
                attribute: first.name,
                operation: "set",
                value: defaultValue(first.type),
              },
            ]);
          }}
        >
          Add update
        </Button>
      )}
    </Stack>
  );
};
