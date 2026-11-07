import { isAxiosError, isCancel } from "axios";
import type { SimulationRequest, SimulationResult } from "../api/ocpnEditor";
import { customFetch } from "./fetcher";

export type SimulationProgress = {
  /** Current simulation time and the configured duration, in the configured time unit. */
  clock: number;
  duration: number;
  /** Events recorded so far. */
  event_count: number;
};

// Messages of POST /simulation/stream, one JSON object per line (see run.py `stream_simulation`).
type StreamMessage =
  | ({ type: "progress" } & SimulationProgress)
  | { type: "done"; result: SimulationResult }
  | { type: "error"; detail: string };

export class SimulationCancelled extends Error {}

/** The message of a failed request: 400s carry a string, 422 validation errors a list of { msg }. */
const errorDetail = (error: unknown): string | undefined => {
  if (!isAxiosError(error))
    return error instanceof Error ? error.message : undefined;
  let data = error.response?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return undefined;
    }
  }
  const raw = data?.detail;
  const detail = Array.isArray(raw) ? raw[0]?.msg : raw;
  return typeof detail === "string" ? detail : undefined;
};

/**
 * Runs a simulation and reports its progress while it runs.
 * Resolves with the result, rejects with SimulationCancelled when `signal` aborts
 * and with an Error carrying the backend's message otherwise.
 */
export const streamSimulation = async (
  request: SimulationRequest,
  onProgress: (progress: SimulationProgress) => void,
  signal?: AbortSignal,
): Promise<SimulationResult> => {
  let consumed = 0; // characters of the response already split into lines
  let partialLine = "";
  let result: SimulationResult | undefined;
  let failure: string | undefined;

  const consume = (text: string) => {
    const lines = (partialLine + text.slice(consumed)).split("\n");
    consumed = text.length;
    partialLine = lines.pop() ?? "";

    let latest: SimulationProgress | undefined; // one update per chunk
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as StreamMessage;
      if (message.type === "progress") {
        const { clock, duration, event_count } = message;
        latest = { clock, duration, event_count };
      } else if (message.type === "done") {
        result = message.result;
      } else {
        failure = message.detail;
      }
    }
    if (latest) onProgress(latest);
  };

  let text: string;
  try {
    text = await customFetch<string>({
      url: "/api/external/modules/ocpnEditor/v1/simulation/stream",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: request,
      signal,
      responseType: "text",
      transformResponse: (data) => data, // NDJSON, not JSON
      onDownloadProgress: (event) => {
        // the browser (XHR) adapter exposes the response received so far
        const partial = (event.event?.target as XMLHttpRequest | undefined)
          ?.responseText;
        if (typeof partial === "string") consume(partial);
      },
    });
  } catch (error) {
    if (isCancel(error) || signal?.aborted) throw new SimulationCancelled();
    throw new Error(errorDetail(error) ?? "The simulation could not be run.");
  }

  consume(`${text}\n`); // whatever arrived after the last progress event
  if (failure) throw new Error(failure);
  if (!result) throw new Error("The simulation ended without a result.");
  return result;
};
