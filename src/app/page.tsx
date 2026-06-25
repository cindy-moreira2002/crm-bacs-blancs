export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Les Matinées du Bac</h1>
          <p className="text-xl text-gray-600">Bacs blancs en visio avec coaching personnalisé</p>
        </div>

        {/* Two cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Espace élève */}
          <div className="bg-white rounded-2xl shadow-lg border-2 border-purple-200 p-8 text-center hover:shadow-xl transition-shadow">
            <div className="text-5xl mb-4">🎓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Mon espace élève</h2>
            <p className="text-gray-600 mb-6">
              Consulte tes bacs blancs à venir, rejoins ton salon visio, et télécharge tes corrections.
            </p>
            <a
              href="/espace-eleve"
              className="inline-block px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors"
            >
              Accéder →
            </a>
          </div>

          {/* Inscription */}
          <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-200 p-8 text-center hover:shadow-xl transition-shadow">
            <div className="text-5xl mb-4">✍️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">M'inscrire</h2>
            <p className="text-gray-600 mb-6">
              Remplis le formulaire pour t'inscrire à un bac blanc en visio et reçois ton lien de salon.
            </p>
            <a
              href="/inscription"
              className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              S'inscrire →
            </a>
          </div>
        </div>

        {/* Info */}
        <div className="mt-12 bg-purple-50 rounded-xl p-6 text-center">
          <p className="text-gray-700">
            <strong>Nouveau ?</strong> Inscris-toi d'abord, puis accède à ton espace pour voir tes bacs blancs et rejoindre les appels visio.
          </p>
        </div>
      </div>
    </div>
  );
}
