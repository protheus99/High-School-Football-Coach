import React, { useEffect, useState } from 'react';

/** A round "back to top" button that appears once a page has been scrolled about a screen and a half down. */
export const BackToTop: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 1.5);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button className="ui-back-to-top" aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0 })}>
      ↑
    </button>
  );
};
