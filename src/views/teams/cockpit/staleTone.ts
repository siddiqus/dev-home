export function staleTone(days: number): string {
  return days > 4 ? "#dc3545" : "#e0a458";
}
