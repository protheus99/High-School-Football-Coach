import React, { useEffect, useState } from 'react';
import { Sheet } from './ui/Sheet';
import { SignInSheet } from './AccountPanels';
import { DUCAT_PACKS, DucatPackId, formatDucats } from '../data/ducats';
import { useAccount } from '../services/account';
import { buyDucats, CheckoutPhase, clearCheckout, refreshDucats, useDucats } from '../services/ducats';
import { sitePage } from '../utils/site';

// The ducat store (packs, bought through Stripe), the balance card on the Staff screen, and the sheet that says how
// a checkout went when the player comes back from Stripe.

const AMBER = { edge: '#F59E0B', bg: '#FFFBEB', line: '#FCD34D', text: '#B45309', dark: '#451A03' };

/** The ₾ coin: a pack's icon (bigger for bigger packs). */
const Coin: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <span
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      flex: '0 0 auto',
      borderRadius: '50%',
      background: '#FEF3C7',
      border: `2px solid ${AMBER.edge}`,
      boxShadow: 'inset 0 -3px 0 rgba(180,83,9,.18)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 900,
      color: AMBER.text,
      fontSize: Math.round(size * 0.42)
    }}
  >
    ₾
  </span>
);

export type DucatSheetKind = 'STORE' | 'SIGN_IN' | null;

/** The store or the sign-in sheet, whichever is open. */
export const DucatSheets: React.FC<{ sheet: DucatSheetKind; onChange: (sheet: DucatSheetKind) => void }> = ({ sheet, onChange }) =>
  sheet === 'STORE' ? <DucatStoreSheet onClose={() => onChange(null)} onSignIn={() => onChange('SIGN_IN')} /> : sheet === 'SIGN_IN' ? <SignInSheet onClose={() => onChange(null)} /> : null;

/** The Staff screen's ducat line: the balance and a way to get more, or (signed out) a way to sign in. */
export const DucatBalanceCard: React.FC<{ onOpen: (sheet: DucatSheetKind) => void }> = ({ onOpen }) => {
  const { user, options, ready } = useAccount();
  const { balance } = useDucats();
  useEffect(() => {
    if (user) void refreshDucats();
  }, [user]);
  if (!ready) return null;

  return (
    <section
      aria-label="Your ducats"
      style={{
        background: AMBER.bg,
        border: `1px solid ${AMBER.line}`,
        borderLeft: `6px solid ${AMBER.edge}`,
        borderRadius: '10px',
        padding: '10px 12px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}
    >
      <Coin size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {user ? (
          <>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Your ducats</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: balance !== null && balance < 0 ? '#B91C1C' : AMBER.text }}>{balance === null ? '…' : formatDucats(balance)}</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: '14px' }}>Ducat coaches (B to S+)</div>
            <div style={{ fontSize: '12px', color: '#475569' }}>Sign in to buy ducats and hire them.</div>
          </>
        )}
      </div>
      {user ? (
        options.ducats && (
          <button className="ui-btn" style={{ flex: '0 0 auto', background: AMBER.edge, borderColor: AMBER.edge, color: AMBER.dark, fontWeight: 800 }} onClick={() => onOpen('STORE')}>
            Get ducats
          </button>
        )
      ) : (
        <button className="ui-btn" style={{ flex: '0 0 auto', background: '#2563EB', borderColor: '#2563EB', color: '#fff', fontWeight: 800 }} onClick={() => onOpen('SIGN_IN')}>
          Sign in
        </button>
      )}
    </section>
  );
};

/** The packs: tap one to go to Stripe's checkout. Signed out, the packs show but buying needs a sign-in first. */
export const DucatStoreSheet: React.FC<{ onClose: () => void; onSignIn: () => void }> = ({ onClose, onSignIn }) => {
  const { user, options } = useAccount();
  const { balance } = useDucats();
  const [busy, setBusy] = useState<DucatPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = !!user && options.ducats;
  const best = DUCAT_PACKS[DUCAT_PACKS.length - 1].id;

  const buy = async (pack: DucatPackId) => {
    setBusy(pack);
    setError(null);
    const problem = await buyDucats(pack); // leaves the page when it works
    setBusy(null);
    if (problem) setError(problem);
  };

  return (
    <Sheet title="Ducat store" onClose={onClose}>
      <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.line}`, borderLeft: `6px solid ${AMBER.edge}`, borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
        <div style={{ fontSize: '12.5px', color: '#64748B' }}>Your ducats</div>
        <div style={{ fontSize: '26px', fontWeight: 900, color: AMBER.text }}>{user && balance !== null ? formatDucats(balance) : '—'}</div>
        <div style={{ fontSize: '12.5px', color: '#475569' }}>Hire B to S+ coaches. Ducats are kept on your account, for every career.</div>
      </div>

      {!user && (
        <div style={{ background: '#fff', border: '1px solid #BFDBFE', borderLeft: '6px solid #2563EB', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
          <div style={{ fontWeight: 900 }}>Sign in to buy ducats</div>
          <div style={{ fontSize: '12.5px', color: '#475569', margin: '2px 0 8px' }}>Your ducats are kept on your account, so they're safe if this browser's data is cleared.</div>
          <button className="ui-btn ui-btn-block" style={{ background: '#2563EB', borderColor: '#2563EB', color: '#fff', fontWeight: 800 }} onClick={onSignIn}>
            Sign in
          </button>
        </div>
      )}
      {user && !options.ducats && <p style={{ color: '#B45309', fontSize: '13.5px', margin: '0 0 10px' }}>Ducats aren't on sale right now. Try again later.</p>}

      {DUCAT_PACKS.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#fff',
            border: p.id === best ? `2px solid ${AMBER.edge}` : '1px solid #FDE68A',
            borderRadius: '12px',
            boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)',
            padding: '12px',
            marginBottom: '10px'
          }}
        >
          {p.id === best && (
            <span style={{ position: 'absolute', top: '-9px', right: '10px', background: AMBER.edge, color: AMBER.dark, fontSize: '11px', fontWeight: 900, borderRadius: '6px', padding: '1px 7px' }}>Best value</span>
          )}
          <Coin size={40 + DUCAT_PACKS.indexOf(p) * 2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '17px' }}>{formatDucats(p.ducats)}</div>
            <div style={{ fontSize: '12.5px', color: '#64748B' }}>
              {p.bonus ? (
                <>
                  <span style={{ color: '#15803D', fontWeight: 800 }}>+{formatDucats(p.bonus)} bonus</span> · {Math.round((p.bonus / (p.ducats - p.bonus)) * 100)}% more
                </>
              ) : (
                'Starter pack'
              )}
            </div>
          </div>
          <button
            className="ui-btn"
            disabled={!open || busy !== null}
            onClick={() => buy(p.id)}
            aria-label={`Buy ${formatDucats(p.ducats)} for $${p.cents / 100}`}
            style={{ flex: '0 0 auto', minWidth: '84px', minHeight: '42px', fontWeight: 900, fontSize: '15px', ...(open && { background: '#16A34A', borderColor: '#16A34A', color: '#fff' }) }}
          >
            {busy === p.id ? '…' : `$${p.cents / 100}`}
          </button>
        </div>
      ))}
      {error && <p style={{ color: '#B91C1C', fontSize: '13.5px', margin: '4px 2px 0' }}>{error}</p>}
      <p style={{ fontSize: '12.5px', color: '#64748B', margin: '8px 2px 0', lineHeight: 1.5 }}>
        US cards only. Under 18? Ask a parent before you buy.
        <br />
        Checkout is by Stripe; the game never sees your card. Unspent ducats can be refunded within 14 days (
        <a href={sitePage('/terms#ducats')} target="_blank" rel="noreferrer">
          terms
        </a>
        ).
      </p>
    </Sheet>
  );
};

const CHECKOUT_TEXT: Record<Exclude<CheckoutPhase, 'paid'>, { icon: string; title: string; body: string }> = {
  confirming: { icon: '⏳', title: 'Confirming your payment…', body: 'Ducats are added the moment Stripe confirms. This usually takes a few seconds.' },
  slow: { icon: '⏳', title: 'Still confirming', body: "Your ducats will show on the Staff screen as soon as Stripe confirms the payment. If they don't within a few minutes, contact us." },
  blocked: { icon: '↩️', title: 'Payment refunded', body: "Ducats can only be bought with a card from the US, so this payment was refunded in full. It can take 5 to 10 days to show on your statement." },
  cancelled: { icon: '✋', title: 'Checkout cancelled', body: "You weren't charged." }
};

/** How the trip to Stripe went, when the player is back (the game reopens on the Staff screen behind it). */
export const DucatCheckoutSheet: React.FC = () => {
  const { checkout, balance } = useDucats();
  if (!checkout) return null;
  const done = checkout.phase !== 'confirming';
  const close = done ? clearCheckout : undefined;
  const back = (
    <button className="ui-btn ui-btn-block" disabled={!done} onClick={clearCheckout} style={{ minHeight: '46px', fontWeight: 800, ...(done && { background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }) }}>
      Back to Staff
    </button>
  );

  if (checkout.phase === 'paid')
    return (
      <Sheet title="Ducats added" onClose={close} footer={back}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div
            aria-hidden="true"
            style={{ width: 72, height: 72, margin: '0 auto', borderRadius: '50%', background: '#DCFCE7', border: '3px solid #16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px', color: '#15803D', fontWeight: 900 }}
          >
            ✓
          </div>
          <div style={{ fontWeight: 900, fontSize: '20px', marginTop: '12px' }}>{formatDucats(checkout.added ?? 0)} added</div>
          {(() => {
            const bonus = DUCAT_PACKS.find((p) => p.ducats === checkout.added)?.bonus ?? 0;
            return bonus > 0 && <div style={{ fontSize: '13px', color: '#64748B' }}>Includes {formatDucats(bonus)} bonus</div>;
          })()}
          <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', border: '1px solid #FDE68A', borderRadius: '10px', padding: '10px 12px', margin: '16px 0 8px', fontSize: '14px' }}>
            <span style={{ color: '#64748B' }}>Your ducats</span>
            <strong style={{ color: AMBER.text }}>{balance === null ? '…' : formatDucats(balance)}</strong>
          </div>
          <div style={{ fontSize: '12.5px', color: '#64748B' }}>Stripe emails you a receipt.</div>
        </div>
      </Sheet>
    );

  const text = CHECKOUT_TEXT[checkout.phase];
  return (
    <Sheet title="Ducat store" onClose={close} footer={back}>
      <div role="status" style={{ textAlign: 'center', padding: '16px 4px 8px' }}>
        <div aria-hidden="true" style={{ fontSize: '40px' }}>
          {text.icon}
        </div>
        <div style={{ fontWeight: 900, fontSize: '17px', marginTop: '8px' }}>{text.title}</div>
        <p style={{ color: '#475569', fontSize: '14px', margin: '6px 0 0' }}>{text.body}</p>
      </div>
    </Sheet>
  );
};
