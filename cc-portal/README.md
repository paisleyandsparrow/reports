# CC Portal

React + Vite frontend for the Paisley & Sparrow Creator Connections portal.  
Auth, campaign catalog, earnings, and ad health — all backed by Supabase + Firebase Hosting.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- Access to the Supabase project (get `.env` values from Adam)

---

## Local Setup

```bash
cd cc-portal
npm install
```

Create a `.env` file in the `cc-portal/` directory (never commit this):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start the dev server:

```bash
npm run dev
```

App runs at `http://localhost:5173`

---

## Deploy to Firebase

### First-time only — log in and select the project

```bash
firebase login
firebase use paisleytest-fee48
```

### Every deploy

```bash
npm run build
firebase deploy --only hosting
```

Live URL: https://paisleytest-fee48.web.app

---

## Project Structure

```
src/
  components/
    AppHeader.jsx       # Sticky nav (shown on all pages)
    CampaignCard.jsx    # Shared campaign card + skeleton + helpers
    AuthGuard.jsx       # Redirects unauthenticated users
  pages/
    LoginPage.jsx
    OnboardingWizard.jsx
    DashboardPage.jsx
    CampaignCatalog.jsx
    EarningsPage.jsx
    AdHealthPage.jsx
    SettingsPage.jsx
  lib/
    supabase.js         # Supabase client
    parseEarningsCsv.js # CSV → Supabase row mapper
migrations/             # Supabase SQL migrations (run in order)
```

---

## Adding a New Deployer

To let someone else deploy to Firebase Hosting:

1. Go to [Firebase Console](https://console.firebase.google.com/) → project `paisleytest-fee48`
2. **Project Settings → Users and permissions → Add member**
3. Enter their Google account email
4. Set role to **Editor** (or **Viewer** if read-only is enough)

They then run `firebase login` on their machine with that Google account, and `firebase use paisleytest-fee48` to target the project. No extra steps needed.
