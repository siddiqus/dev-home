import { apiClient } from "./config";

export interface FocusStateItem {
  itemId: string;
  pinnedAt: number | null;
  snoozedUntil: number | null;
}

export async function fetchFocusState(): Promise<FocusStateItem[]> {
  const { data } = await apiClient.get("/focus/state");
  return data.items as FocusStateItem[];
}

export async function setPin(itemId: string, pinned: boolean): Promise<void> {
  await apiClient.post("/focus/pin", { itemId, pinned });
}

export async function setSnooze(itemId: string, until: number | null): Promise<void> {
  await apiClient.post("/focus/snooze", { itemId, until });
}
