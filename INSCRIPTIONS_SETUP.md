# Système Inscriptions Bac Blanc — Setup Complet

## ✅ Ce qui est fait

### 1. Supabase
- Table `inscriptions` créée avec colonnes: id, email, nom, telephone, matiere, created_at
- Clés Supabase ajoutées en `.env`

### 2. Next.js
- Composant `FormInscription.tsx` — formulaire React avec validation
- Route API `/api/inscriptions` — POST insère dans Supabase

### 3. Google Apps Script
- Code prêt à copier-coller pour auto-clôture et emails profs

---

## 🚀 SETUP ZAPIER (Supabase → Google Sheets)

### Étape 1: Créer Zap
1. Va sur https://zapier.com
2. Clique **Create Zap**
3. Trigger: **Supabase** > New Row
4. Compte: Connecte avec `orpbfnmdlvxmkvyrpvtj.supabase.co`
5. Table: `inscriptions`

### Étape 2: Action Google Sheets
6. Action: **Google Sheets** > Create Spreadsheet Row
7. Drive Folder: Choisis dossier
8. Spreadsheet: **"Bac Blanc Inscriptions"** (Zapier crée)
9. Worksheet: **"Inscriptions"**
10. Map columns:
    - Col A (email): `email`
    - Col B (nom): `nom`
    - Col C (telephone): `telephone`
    - Col D (matiere): `matiere`
    - Col E (created_at): `created_at`

### Étape 3: Test & Activate
11. Test la connexion
12. Activate Zap

**Résultat:** Chaque inscription Supabase → nouvelle ligne Google Sheets

---

## 📧 SETUP GOOGLE APPS SCRIPT (Emails aux Profs)

### Étape 1: Ouvrir Google Sheets
1. Ouvre Google Sheets créé par Zapier: **"Bac Blanc Inscriptions"**

### Étape 2: Code Apps Script
2. Extensions > Apps Script
3. Supprime le code par défaut
4. Copie-colle le code depuis `GOOGLE_APPS_SCRIPT.js`
5. **Modifie `PROFS` dict avec les vrais emails profs**

### Étape 3: Trigger Auto
6. Gauche: Clique l'icône **🕐 Triggers**
7. **+ Create new trigger**
   - Function: `doAutoCloturation`
   - Type: Time-driven
   - Frequency: **Daily** (vendredi 18h)
8. Authorize
9. Done

### Étape 4: Test
- Clique **Run** > `testAutoCloturation()`
- Profs reçoivent email avec liste participants

---

## 🔗 INTÉGRATION FRONT (Où mettre le formulaire)

### Option 1: Page dédiée
```bash
# Crée page /inscriptions
src/app/inscriptions/page.tsx
```

```tsx
import { FormInscription } from '@/components/FormInscription';

export default function InscriptionsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto">
        <FormInscription />
      </div>
    </div>
  );
}
```

### Option 2: Ajouter à page existante
```tsx
import { FormInscription } from '@/components/FormInscription';

// Dans page.tsx ou autre
<FormInscription />
```

---

## 🧪 TESTER END-TO-END

1. **Lance Next.js**
   ```bash
   npm run dev
   ```

2. **Visite** http://localhost:3000/inscriptions (ou page où formulaire est)

3. **Remplis formulaire**
   - Nom: Test
   - Email: test@example.com
   - Tel: 0123456789
   - Matière: Français

4. **Vérifie Supabase**
   - https://app.supabase.com > Data Editor > inscriptions
   - Doit voir la nouvelle ligne

5. **Vérifie Google Sheets** (attendre Zapier, ~1-2 min)
   - Nouvelle ligne doit apparaître dans Sheets

6. **Test Email Profs** (sur Google Sheets)
   - Apps Script > Run `testAutoCloturation()`
   - Regarde console (Ctrl+Enter)
   - Profs reçoivent email

---

## 🎯 FLUX COMPLET

```
1. Élève remplit formulaire (NextJS)
   ↓
2. POST /api/inscriptions → insert Supabase
   ↓
3. Zapier détecte nouvelle row → crée ligne Google Sheets
   ↓
4. Vendredi 18h: Apps Script s'exécute
   ↓
5. Groupe par matière → envoie email profs
   ↓
6. Profs reçoivent liste participants
```

---

## 🔐 Sécurité

- **Clé Supabase anon**: Publique (OK, accès lecture/écriture limités par Row Level Security si nécessaire)
- **Emails profs**: À mettre en variables d'environnement si sensible
- **Rate limiting**: À ajouter si spam risk

---

## 📝 Config à Customizer

**`GOOGLE_APPS_SCRIPT.js`**
```js
const CLOTURATION_HOUR = 18;  // Heure (0-23)
const CLOTURATION_DAY = 5;    // Jour semaine (0=dim, 5=ven)
const PROFS = { ... }         // Email profs
```

**`FormInscription.tsx`**
```tsx
const MATIERES: Matiere[] = [...] // Ajoute/retire matières
```

---

## ❓ FAQ

**Q: Formulaire ne save pas?**
- Vérifie `.env` Supabase URL + Key
- Ouvre DevTools Console (F12) → voir erreur
- Teste route API directement: `curl -X POST http://localhost:3000/api/inscriptions -H "Content-Type: application/json" -d '{"nom":"Test","email":"test@test.com","telephone":"0123456789","matiere":"Français"}'`

**Q: Google Sheets pas synced?**
- Vérifie Zapier dashboard → Active?
- Regarde Zap logs pour erreurs
- Test manuel: crée row Supabase directement

**Q: Emails profs pas envoyés?**
- Test manuellement Apps Script: Run `testAutoCloturation()`
- Regarde Sheets > Extensions > Apps Script > Exécutions
- Regarde logs (Ctrl+Entrée)

---

**Besoin d'aide?** Contacte support ou debug via logs.
