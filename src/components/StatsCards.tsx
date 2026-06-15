type Stats = {
  total: number;
  nouveau: number;
  contacte: number;
  interesse: number;
  converti: number;
  perdu: number;
};

const cards = [
  { key: "total" as const, label: "Total leads", color: "bg-gray-50 border-gray-200", icon: "👥" },
  { key: "nouveau" as const, label: "Nouveaux", color: "bg-blue-50 border-blue-200", icon: "🆕" },
  { key: "contacte" as const, label: "Contactés", color: "bg-yellow-50 border-yellow-200", icon: "📞" },
  { key: "interesse" as const, label: "Intéressés", color: "bg-purple-50 border-purple-200", icon: "⭐" },
  { key: "converti" as const, label: "Convertis", color: "bg-green-50 border-green-200", icon: "✅" },
  { key: "perdu" as const, label: "Perdus", color: "bg-red-50 border-red-200", icon: "❌" },
];

export default function StatsCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`${card.color} border rounded-xl p-4 text-center`}
        >
          <div className="text-2xl mb-1">{card.icon}</div>
          <div className="text-2xl font-bold text-gray-900">{stats[card.key]}</div>
          <div className="text-xs text-gray-500 mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
