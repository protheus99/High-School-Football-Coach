import React, { useEffect, useState } from 'react';
import { pageScrollTop, scrollPageTo, scroller } from '../../utils/pageScroll';

/** A round "back to top" button that appears once a page has been scrolled about a screen and a half down. */
export const BackToTop: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = scroller();
    const onScroll = () => setShow(pageScrollTop() > window.innerHeight * 1.5);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button className="ui-back-to-top" aria-label="Back to top" title="Back to top" onClick={() => scrollPageTo(0)}>
      ↑
    </button>
  );
};
