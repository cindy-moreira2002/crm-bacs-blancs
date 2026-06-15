"use client";

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  nouveau: { label: "Nouveau", bg: "bg-blue-100", text: "text-blue-800" },
  "contacté": { label: "Contacté", bg: "bg-yellow-100", text: "text-yellow-800" },
  "intéressé": { label: "Intéressé", bg: "bg-purple-100", text: "text-purple-800" },
  converti: { label: "Converti", bg: "bg-green-100", text: "text-green-800" },
  perdu: { label: "Perdu", bg: "bg-red-100", text: "text-red-800" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, bg: "bg-gray-100", text: "text-gray-800" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
