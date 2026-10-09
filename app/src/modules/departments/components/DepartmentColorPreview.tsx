export function DepartmentColorPreview({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 rounded-full border border-black/10"
      style={{ backgroundColor: color }}
    />
  );
}
