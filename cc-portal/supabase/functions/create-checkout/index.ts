import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PRICE_ID = Deno.env.get('STRIPE_PRICE_ID')!  // price_1TRjlxLi9QmXRUEMBDZ7WBMz (sandbox)
const APP_URL = Deno.env.get('APP_URL')!            // https://app.creatorcoders.com

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user already has a Stripe customer ID
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('stripe_customer_id, is_paid, subscription_status')
      .eq('id', user.id)
      .single()

    let customerId = prefs?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: user.email!,
          metadata: JSON.stringify({ supabase_uid: user.id }),
        }),
      })
      const customer = await customerRes.json()
      customerId = customer.id

      // Save customer ID to user_preferences
      await supabase
        .from('user_preferences')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Create Stripe Checkout Session
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        'line_items[0][price]': PRICE_ID,
        'line_items[0][quantity]': '1',
        mode: 'subscription',
        subscription_data: JSON.stringify({ trial_period_days: 7 }),
        success_url: `${APP_URL}/dashboard?checkout=success`,
        cancel_url: `${APP_URL}/pricing?checkout=cancelled`,
        'metadata[supabase_uid]': user.id,
      }),
    })
    const session = await sessionRes.json()

    if (session.error) {
      throw new Error(session.error.message)
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
