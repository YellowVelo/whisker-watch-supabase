import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ConfirmDeleteDialog's one-step vs two-step choice (spec 0081 whole-branch
// review). Vitest runs in plain Node, so this renders to an HTML string.
// The Radix dialog is stubbed to render its children only while open,
// since its portal doesn't render on the server.
vi.mock('@/components/ui/dialog', () => {
  const pass = ({ children }) => createElement('div', null, children);
  return {
    Dialog: ({ open, children }) => (open ? createElement('section', { 'data-dialog': 'open' }, children) : null),
    DialogContent: pass,
    DialogHeader: pass,
    DialogTitle: pass,
    DialogDescription: pass,
    DialogFooter: pass,
  };
});
vi.mock('@/components/ui/input', () => ({
  Input: (props) => createElement('input', { 'data-confirm-input': 'yes', placeholder: props.placeholder }),
}));
/** @type {any} */ (globalThis).React = React;

const { default: ConfirmDeleteDialog } = await import('../ConfirmDeleteDialog.jsx');

const render = (props) =>
  renderToStaticMarkup(
    createElement(ConfirmDeleteDialog, {
      onOpenChange: () => {},
      onConfirm: () => {},
      title: 'Delete pet',
      warning: createElement('p', null, 'WARNING'),
      confirmLabel: 'Delete forever',
      ...props,
    }),
  );

describe('ConfirmDeleteDialog', () => {
  it('still takes two taps (Continue, then Confirm) when confirmText is an empty string, with nothing to type since it already matches', () => {
    const first = render({ step: 1, confirmText: '' });
    expect(first).toContain('Continue');
    expect(first).not.toContain('Delete forever');

    const second = render({ step: 2, confirmText: '' });
    expect(second).toContain('Confirm Deletion');
    expect(second).toContain('to confirm.');
    expect(second).toContain('data-confirm-input');
  });

  it('asks for the name to be typed when confirmText is given', () => {
    expect(render({ step: 1, confirmText: 'Biscuit' })).toContain('Continue');
    expect(render({ step: 2, confirmText: 'Biscuit' })).toContain('data-confirm-input');
  });

  it('is one step only when confirmText is left out', () => {
    const first = render({ step: 1 });
    expect(first).toContain('Delete forever');
    expect(first).not.toContain('Continue');
    expect(render({ step: 2 })).toBe('');
  });
});
