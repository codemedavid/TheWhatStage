import Card from "./Card";

export default function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-5">
      <p className="text-3xl font-light tracking-tight text-[var(--ws-text-primary)]">
        {value}
      </p>
      <p className="mt-1 text-sm text-[var(--ws-text-tertiary)]">{label}</p>
    </Card>
  );
}
