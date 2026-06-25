type Stats = {
  total: number;
  nouveau: number;
  contacte: number;
  interesse: number;
  converti: number;
  perdu: number;
};

const cards = [
  { key: "total" as const, label: "Total", color: "border-gray-300 bg-white", textColor: "text-gray-900" },
  { key: "nouveau" as const, label: "Nouveaux", color: "border-blue-300 bg-blue-50", textColor: "text-blue-700" },
  { key: "contacte" as const, label: "Contactés", color: "border-yellow-300 bg-yellow-50", textColor: "text-yellow-700" },
  { key: "interesse" as const, label: "Intéressés", color: "border-purple-300 bg-purple-50", textColor: "text-purple-700" },
  { key: "converti" as const, label: "Convertis", color: "border-green-300 bg-green-50", textColor: "text-green-700" },
  { key: "perdu" as const, label: "Perdus", color: "border-red-300 bg-red-50", textColor: "text-red-700" },
];

export default function StatsCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`${card.color} border rounded-xl px-4 py-3 flex items-center gap-3`}
        >
          <div className={`text-2xl font-bold ${card.textColor}`}>{stats[card.key]}</div>
          <div className="text-xs text-gray-500 leading-tight">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
