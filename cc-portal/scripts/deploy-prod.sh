#!/usr/bin/env bash
# Deploy Edge Functions + hosting to PRODUCTION
# Supabase project: wzmtzpcqbaisqwjiigdx (engaging-jubilee)
# Firebase site:   creator-coders

set -euo pipefail

# Always run from cc-portal root regardless of where script is invoked from
cd "$(dirname "$0")/.."

SUPABASE_PROJECT_REF="wzmtzpcqbaisqwjiigdx"
FIREBASE_SITE="creator-coders"

echo "▶ Deploying to PRODUCTION (${SUPABASE_PROJECT_REF})"
echo "  Firebase site: ${FIREBASE_SITE}"
echo ""

# 1. Deploy Supabase Edge Functions
echo "── Deploying Edge Functions..."
npx supabase functions deploy create-checkout \
  --project-ref "${SUPABASE_PROJECT_REF}"
npx supabase functions deploy create-portal-session \
  --project-ref "${SUPABASE_PROJECT_REF}"
npx supabase functions deploy stripe-webhook \
  --project-ref "${SUPABASE_PROJECT_REF}"

# 2. Build portal with prod env
echo "── Building portal (production mode)..."
npm run build

# 3. Deploy to Firebase
echo "── Deploying to Firebase hosting:production..."
firebase deploy --only "hosting:production"

echo ""
echo "✅ Production deploy complete"
echo "   URL: https://portal.creatorcoders.com"
