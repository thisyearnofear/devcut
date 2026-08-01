import type { DevCutDoorId } from "@/lib/devcut";
import { truncateBrief } from "@/lib/cut-share";

const KEY = "devcut-last-job";

export type LastJob = {
  id: string;
  title: string;
  video: string;
  mode: DevCutDoorId | string;
  brief: string;
  still?: string;
  at: number;
};

export function saveLastJob(job: Omit<LastJob, "id" | "at"> & { id?: string }): LastJob {
  const record: LastJob = {
    id: job.id || `job_${Date.now().toString(36)}`,
    title: job.title.slice(0, 120),
    video: job.video,
    mode: job.mode,
    brief: truncateBrief(job.brief, 4000),
    still: job.still,
    at: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* quota / private mode */
  }
  return record;
}

export function readLastJob(): LastJob | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LastJob;
    if (!data?.video || !data?.title) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearLastJob(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function lastJobRemixHref(job: LastJob): string {
  const mode = job.mode === "submit" || job.mode === "agent" ? job.mode : "challenge";
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("remix", "1");
  if (job.brief.trim()) params.set("brief", job.brief.trim());
  return `/director?${params.toString()}`;
}
