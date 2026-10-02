import React, { useEffect, useId } from 'react';

/**
 * Mobile-first pop-up. On phones it is a full-width sheet anchored to the bottom of the screen with a
 * sticky title bar and a large close button; on desktop it becomes a centered dialog. Escape and a tap on
 * the backdrop close it (unless `dismissible` is false, e.g. a screen that must be finished).
 */
export const Sheet: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  dismissible?: boolean;
  width?: 'normal' | 'wide';
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, dismissible = true, width = 'normal', footer, children }) => {
  const titleId = useId();
  const canClose = dismissible && !!onClose;

  useEffect(() => {
    if (!canClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canClose, onClose]);

  return (
    <div className="ui-sheet-backdrop" onClick={canClose ? onClose : undefined}>
      <div
        className={`ui-sheet${width === 'wide' ? ' ui-sheet-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-sheet-header">
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} className="ui-sheet-title">
              {title}
            </h2>
            {subtitle && <div className="ui-sheet-subtitle">{subtitle}</div>}
          </div>
          {canClose && (
            <button className="ui-sheet-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <div className="ui-sheet-body">{children}</div>
        {footer && <div className="ui-sheet-footer">{footer}</div>}
      </div>
    </div>
  );
};
