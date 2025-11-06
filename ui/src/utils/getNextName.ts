export function getNextAvailableName(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name;

  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";

  let n = 1;
  let candidate = `${base} (${n})${ext}`;
  while (existing.includes(candidate)) {
    n++;
    candidate = `${base} (${n})${ext}`;
  }
  return candidate;
}
