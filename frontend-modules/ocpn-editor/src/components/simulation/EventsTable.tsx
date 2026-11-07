import { Card, Group, Pagination, Table, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import type { SimulatedEvent } from "../../api/ocpnEditor";

const PAGE_SIZE = 20;

export const EventsTable = ({ events }: { events: SimulatedEvent[] }) => {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [events]); // back to the start for every new result

  return (
    <Card withBorder radius="sm" padding="sm">
      <Text fw={600} size="sm" mb="xs">
        Events ({events.length})
      </Text>
      <Table striped withTableBorder fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th>Activity</Table.Th>
            <Table.Th>Objects</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {events
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map((event) => (
              <Table.Tr key={event.id} c={event.silent ? "dimmed" : undefined}>
                <Table.Td>
                  {new Date(event.timestamp).toLocaleString()}
                </Table.Td>
                <Table.Td>{event.activity}</Table.Td>
                <Table.Td>
                  {Object.values(event.objects).flat().join(", ")}
                </Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>
      {events.length > PAGE_SIZE && (
        <Group justify="center" mt="xs">
          <Pagination
            size="sm"
            total={Math.ceil(events.length / PAGE_SIZE)}
            value={page}
            onChange={setPage}
            siblings={0}
            boundaries={1}
          />
        </Group>
      )}
    </Card>
  );
};
