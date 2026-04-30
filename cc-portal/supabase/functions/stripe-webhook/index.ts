import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(',').reduce((acc: Record<string, string>, part) => {
    const [k, v] = part.split('=')
    acc[k] = v
    return acc
  }, {})

  const timestamp = parts['t']
  const sig = parts['v1']
  if (!timestamp || !sig) return false

  const payload = `${timestamp}.${body}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expected === sig
}

serve(async (req) => {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  const valid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
  if (!valid) {
    return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(body)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const getUid = (obj: any): string | null =>
    obj?.metadata?.supabase_uid || null

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const uid = getUid(sub) || await uidFromCustomer(sub.customer)
      if (!uid) break
      const isPaid = ['active', 'trialing'].includes(sub.status)
      await supabase.from('user_preferences').update({
        is_paid: isPaid,
        subscription_status: sub.status,
        trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      }).eq('id', uid)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const uid = getUid(sub) || await uidFromCustomer(sub.customer)
      if (!uid) break
      await supabase.from('user_preferences').update({
        is_paid: false,
        subscription_status: 'cancelled',
      }).eq('id', uid)
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const uid = await uidFromCustomer(invoice.customer)
      if (!uid) break
      await supabase.from('user_preferences').update({
        is_paid: false,
        subscription_status: 'past_due',
      }).eq('id', uid)
      break
    }
    case 'checkout.session.completed': {
      const session = event.data.object
      const uid = getUid(session)
      if (!uid) break
      // Ensure stripe_customer_id is saved (in case it wasn't set during checkout creation)
      await supabase.from('user_preferences').update({
        stripe_customer_id: session.customer,
      }).eq('id', uid)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })

  async function uidFromCustomer(customerId: string): Promise<string | null> {
    const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    })
    const customer = await res.json()
    return customer?.metadata?.supabase_uid || null
  }
})
