import raw from "./words.txt?raw"
import answersRaw from "./answers.txt?raw"

export const ACCEPTED = new Set(
  raw.toUpperCase().split(/\s+/).filter((w) => w.length === 5),
)

export const ANSWERS = new Set(
  answersRaw.toUpperCase().split(/\s+/).filter((w) => w.length === 5),
)
