import { readFileSync } from "fs";

export interface GoldenItem {
  query: string;
  expected_fact: string;
  language: string;
}

export function loadGoldenSet(path: string): GoldenItem[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldenItem);
}
