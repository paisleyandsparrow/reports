#!/usr/bin/env bash
# Deploy Edge Functions + hosting to STAGING
# Supabase project: qchdnaqyidtblrszqato (creator-coders-staging)
# Firebase site:   creator-coders-staging

set -euo pipefail

SUPABASE_PROJECT_REF="qchdnaqyidtblrszqato"
FIREBASE_SITE="creator-coders-staging"

echo "▶ Deploying to STAGING (${SUPABASE_PROJECT_REF})"
echo "  Firebase site: ${FIREBASE_SITE}"
echo ""

# 1. Deploy Supabase Edge Functions
echo "── Deploying Edge Functions..."
supabase functions deploy create-checkout \
  --project-ref "${SUPABASE_PROJECT_REF}"
supabase functions deploy create-portal-session \
  --project-ref "${SUPABASE_PROJECT_REF}"
supabase functions deploy stripe-webhook \
  --project-ref "${SUPABASE_PROJECT_REF}"

# 2. Build portal with staging env
echo "── Building portal (staging mode)..."
npm run build:staging

# 3. Deploy to Firebase
echo "── Deploying to Firebase hosting:staging..."
firebase deploy --only "hosting:staging"

echo ""
echo "✅ Staging deploy complete"
echo "   URL: https://creator-coders-staging.web.app"
