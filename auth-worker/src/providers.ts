// Google, Facebook and the sign-in email: the outside services the sign-in server talks to.

export type Provider = 'google' | 'facebook';
export const PROVIDERS: Provider[] = ['google', 'facebook'];

/** Who signed in, as the provider tells it. */
export interface ProviderProfile {
  id: string;
  email: string | null; // only an email the provider has verified
  name: string | null;
}

export interface ProviderEnv {
  APP_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_GRAPH_VERSION?: string;
}

export const callbackUrl = (env: ProviderEnv, provider: Provider) => `${env.APP_URL}/api/auth/callback/${provider}`;
const graph = (env: ProviderEnv) => `https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION || 'v23.0'}`;

/** Whether a provider has its keys (a missing one is simply not offered). */
export function configured(env: ProviderEnv, provider: Provider): boolean {
  return provider === 'google' ? !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) : !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
}

/** Where to send the player to sign in. */
export function authorizeUrl(env: ProviderEnv, provider: Provider, state: string, codeChallenge: string | null): string {
  if (provider === 'google') {
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl(env, 'google'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      ...(codeChallenge && { code_challenge: codeChallenge, code_challenge_method: 'S256' })
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({ client_id: env.FACEBOOK_APP_ID!, redirect_uri: callbackUrl(env, 'facebook'), response_type: 'code', scope: 'email,public_profile', state });
  return `https://www.facebook.com/${env.FACEBOOK_GRAPH_VERSION || 'v23.0'}/dialog/oauth?${q}`;
}

/** Trades the code from the callback for the player's profile. Throws when the provider refuses. */
export async function fetchProfile(env: ProviderEnv, provider: Provider, code: string, codeVerifier: string | null): Promise<ProviderProfile> {
  if (provider === 'google') {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: callbackUrl(env, 'google'),
        grant_type: 'authorization_code',
        ...(codeVerifier && { code_verifier: codeVerifier })
      })
    });
    if (!tokenRes.ok) throw new Error(`Google token ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) throw new Error('Google token missing');
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!infoRes.ok) throw new Error(`Google userinfo ${infoRes.status}`);
    const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; given_name?: string };
    if (!info.sub) throw new Error('Google profile missing');
    return { id: info.sub, email: info.email && info.email_verified ? info.email.toLowerCase() : null, name: info.given_name || info.name || null };
  }
  const q = new URLSearchParams({ client_id: env.FACEBOOK_APP_ID!, client_secret: env.FACEBOOK_APP_SECRET!, redirect_uri: callbackUrl(env, 'facebook'), code });
  const tokenRes = await fetch(`${graph(env)}/oauth/access_token?${q}`);
  if (!tokenRes.ok) throw new Error(`Facebook token ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error('Facebook token missing');
  const meRes = await fetch(`${graph(env)}/me?${new URLSearchParams({ fields: 'id,first_name,name,email', access_token })}`);
  if (!meRes.ok) throw new Error(`Facebook profile ${meRes.status}`);
  const me = (await meRes.json()) as { id?: string; first_name?: string; name?: string; email?: string };
  if (!me.id) throw new Error('Facebook profile missing');
  // Facebook only returns an email the account has confirmed
  return { id: me.id, email: me.email ? me.email.toLowerCase() : null, name: me.first_name || me.name || null };
}

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
}

/** Sends the sign-in link through Resend. Throws when Resend refuses. */
export async function sendSignInEmail(env: EmailEnv, to: string, link: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('Email is not configured');
  const text = `Tap the link below to sign in to Football Coach High School Edition. It works once, for 15 minutes.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
  <h2 style="margin:0 0 12px">Sign in to Football Coach</h2>
  <p>Tap the button to sign in. It works once, for 15 minutes.</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#2563EB;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in</a></p>
  <p style="color:#64748B;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
</div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: 'Your Football Coach sign-in link', html, text })
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}
