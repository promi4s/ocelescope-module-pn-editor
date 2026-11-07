import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationRequest, SimulationResult } from "../../api/ocpnEditor";
import {
  SimulationCancelled,
  type SimulationProgress,
  streamSimulation,
} from "../../lib/simulationStream";

/** Runs simulations one at a time; a new run or unmounting cancels the current one. */
export const useSimulation = () => {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async (request: SimulationRequest) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setResult(null);
    setProgress(null);
    try {
      setResult(
        await streamSimulation(request, setProgress, controller.signal),
      );
    } catch (error) {
      if (!(error instanceof SimulationCancelled)) {
        notifications.show({
          title: "Simulation failed",
          message:
            error instanceof Error
              ? error.message
              : "The simulation could not be run.",
          color: "red",
        });
      }
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setRunning(false);
      }
    }
  }, []);

  const cancel = useCallback(() => abort.current?.abort(), []);

  return { result, progress, running, run, cancel };
};
