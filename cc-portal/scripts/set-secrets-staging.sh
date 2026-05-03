#!/usr/bin/env bash
# Set Supabase Edge Function secrets for STAGING
# Supabase project: qchdnaqyidtblrszqato (creator-coders-staging)
# Usage: bash scripts/set-secrets-staging.sh
#
# BEFORE RUNNING: Add the staging webhook in Stripe Dashboard (test mode):
#   URL: https://qchdnaqyidtblrszqato.supabase.co/functions/v1/stripe-webhook
#   Events: checkout.session.completed, customer.subscription.created,
#            customer.subscription.updated, customer.subscription.deleted,
#            invoice.payment_failed
#   Then paste the whsec_... signing secret into STRIPE_WEBHOOK_SECRET below.

set -euo pipefail

SUPABASE_PROJECT_REF="qchdnaqyidtblrszqato"

# ── UPDATE THIS after creating the staging webhook in Stripe ──────────────────
STAGING_WEBHOOK_SECRET="REPLACE_WITH_STAGING_WHSEC"
# ─────────────────────────────────────────────────────────────────────────────

if [[ "${STAGING_WEBHOOK_SECRET}" == "REPLACE_WITH_STAGING_WHSEC" ]]; then
  echo "❌ Set STAGING_WEBHOOK_SECRET first (see comments above)"
  exit 1
fi

echo "▶ Setting secrets on STAGING (${SUPABASE_PROJECT_REF})"

supabase secrets set \
  STRIPE_SECRET_KEY="REPLACE_WITH_STRIPE_SECRET_KEY" \
  STRIPE_PRICE_ID="price_1TRjlxLi9QmXRUEMBDZ7WBMz" \
  STRIPE_WEBHOOK_SECRET="${STAGING_WEBHOOK_SECRET}" \
  APP_URL="https://creator-coders-staging.web.app" \
  --project-ref "${SUPABASE_PROJECT_REF}"

echo "✅ Staging secrets set"
