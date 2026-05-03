#!/usr/bin/env bash
# Set Supabase Edge Function secrets for PRODUCTION
# Supabase project: wzmtzpcqbaisqwjiigdx (engaging-jubilee)
# Usage: bash scripts/set-secrets-prod.sh

set -euo pipefail

SUPABASE_PROJECT_REF="wzmtzpcqbaisqwjiigdx"

echo "▶ Setting secrets on PRODUCTION (${SUPABASE_PROJECT_REF})"

supabase secrets set \
  STRIPE_SECRET_KEY="REPLACE_WITH_STRIPE_SECRET_KEY" \
  STRIPE_PRICE_ID="price_1TRjlxLi9QmXRUEMBDZ7WBMz" \
  STRIPE_WEBHOOK_SECRET="REPLACE_WITH_PROD_WEBHOOK_SECRET" \
  APP_URL="https://app.creatorcoders.com" \
  --project-ref "${SUPABASE_PROJECT_REF}"

echo "✅ Production secrets set"
