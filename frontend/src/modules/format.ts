export const dateLabel = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const stamp = (value: string) => new Date(value).toLocaleString();
