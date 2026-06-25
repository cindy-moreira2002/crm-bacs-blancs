CREATE TABLE IF NOT EXISTS "Lead" (
  id TEXT PRIMARY KEY NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'nouveau',
  "lastContactDate" TEXT,
  notes TEXT,
  source TEXT,
  "createdAt" TEXT NOT NULL DEFAULT NOW()::TEXT,
  "updatedAt" TEXT NOT NULL DEFAULT NOW()::TEXT
);
