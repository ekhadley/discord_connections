import raw from "./words.txt?raw"

export const ACCEPTED = new Set(
  raw.toUpperCase().split(/\s+/).filter((w) => w.length === 5),
)
