import {
  Autocomplete,
  Button,
  Card,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useCurrentOcel } from "@ocelescope/core";
import { type KeyboardEvent, useState } from "react";
import {
  type OcpnImportResponse as ObjectCentricPetriNet,
  useEventActivities,
  useObjectTypes,
} from "../../api/ocpnEditor";
import { addArc, addPlace, addTransition } from "../../lib/net";

/** Runs `action` on Enter, so a form can be submitted from any of its inputs. */
const onEnter = (action: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    action();
  }
};

/** Sidebar of the Edit mode: forms to add places, transitions and arcs. */
export const EditSidebar = ({
  net,
  onEdit,
}: {
  net: ObjectCentricPetriNet;
  /** called with the net after a node or arc was added */
  onEdit: (net: ObjectCentricPetriNet) => void;
}) => {
  // object types and activities of the current OCEL are offered as suggestions
  const { id } = useCurrentOcel();
  const { data: objectTypes = [] } = useObjectTypes(id);
  const { data: eventActivities = [] } = useEventActivities(id);

  const [newPlaceObjectType, setNewPlaceObjectType] = useState("");
  const [newPlaceTokens, setNewPlaceTokens] = useState(0);
  const [newPlaceFinalTokens, setNewPlaceFinalTokens] = useState(0);
  const [addedTypes, setAddedTypes] = useState<string[]>([]);
  const knownObjectTypes = Array.from(new Set([...objectTypes, ...addedTypes]));

  const [newTransitionLabel, setNewTransitionLabel] = useState("");

  const [variableArc, setVariableArc] = useState(false);
  const [arcSource, setArcSource] = useState<string | null>(null);
  const [arcTarget, setArcTarget] = useState<string | null>(null);

  const handleAddPlace = () => {
    if (!newPlaceObjectType) return;
    onEdit(
      addPlace(net, newPlaceObjectType, newPlaceTokens, newPlaceFinalTokens),
    );
    setAddedTypes((prev) =>
      prev.includes(newPlaceObjectType) ? prev : [...prev, newPlaceObjectType],
    );
    setNewPlaceTokens(0);
    setNewPlaceFinalTokens(0);
  };

  const handleAddTransition = () => {
    onEdit(addTransition(net, newTransitionLabel));
  };

  const handleAddArc = () => {
    if (!arcSource || !arcTarget) return;
    onEdit(addArc(net, arcSource, arcTarget, variableArc));
    setArcSource(null);
    setArcTarget(null);
  };

  const placeOptions = net.petri_net.places.map((p) => ({
    value: p.id,
    label: p.id,
  }));
  const transitionOptions = net.petri_net.transitions.map((t) => ({
    value: t.id,
    label: t.label ?? t.id,
  }));
  const sourceOptions = [
    { group: "Places", items: placeOptions },
    { group: "Transitions", items: transitionOptions },
  ];
  // arcs connect a place and a transition, so the target is of the other kind
  const sourceIsPlace = net.petri_net.places.some((p) => p.id === arcSource);
  const targetOptions = arcSource
    ? sourceIsPlace
      ? transitionOptions
      : placeOptions
    : [];

  return (
    <Stack gap={0} p="md">
      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm">
          New Place
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          Set the object type, initial, and final marking.
        </Text>
        <Autocomplete
          size="sm"
          label="Object Type"
          mb="xs"
          value={newPlaceObjectType}
          onChange={setNewPlaceObjectType}
          data={knownObjectTypes}
          onKeyDown={onEnter(handleAddPlace)}
        />
        <NumberInput
          size="sm"
          label="Initial Tokens"
          mb="xs"
          value={newPlaceTokens}
          onChange={(v) => setNewPlaceTokens(Number(v) || 0)}
          onKeyDown={onEnter(handleAddPlace)}
        />
        <NumberInput
          size="sm"
          label="Final Tokens"
          mb="xs"
          value={newPlaceFinalTokens}
          onChange={(v) => setNewPlaceFinalTokens(Number(v) || 0)}
          onKeyDown={onEnter(handleAddPlace)}
        />
        <Button
          variant="default"
          disabled={!newPlaceObjectType}
          onClick={handleAddPlace}
        >
          Add Place
        </Button>
      </Card>

      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm">
          New Transition
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          Set the transition label.
        </Text>
        <Autocomplete
          label="Transition Label"
          mb="xs"
          value={newTransitionLabel}
          onChange={setNewTransitionLabel}
          data={eventActivities}
          onKeyDown={onEnter(handleAddTransition)}
        />
        <Button variant="default" onClick={handleAddTransition}>
          Add Transition
        </Button>
      </Card>

      <Card withBorder radius="sm" padding="sm">
        <Text fw={600} size="sm">
          New Arc
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          Select the source and target nodes.
        </Text>
        <SegmentedControl
          size="xs"
          value={variableArc ? "variable" : "normal"}
          onChange={(v) => setVariableArc(v === "variable")}
          data={[
            { label: "Normal", value: "normal" },
            { label: "Variable", value: "variable" },
          ]}
        />
        <Stack gap="xs" mb="xs">
          <Select
            label="From"
            placeholder="Select source"
            data={sourceOptions}
            value={arcSource}
            onChange={(value) => {
              setArcSource(value);
              setArcTarget(null);
            }}
            clearable
            searchable
          />
          <Select
            label="To"
            placeholder="Select target"
            data={targetOptions}
            value={arcTarget}
            onChange={setArcTarget}
            disabled={!arcSource}
            clearable
            searchable
          />
        </Stack>
        <Button
          variant="default"
          disabled={!arcSource || !arcTarget}
          onClick={handleAddArc}
        >
          Add Arc
        </Button>
      </Card>
    </Stack>
  );
};
