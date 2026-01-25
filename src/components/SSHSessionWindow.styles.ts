import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const sshWindowStyles = {
  window: {
    width: '100%',
    height: '100vh',
    background: tokens.colors.bg.primary,
    color: tokens.colors.text.primary,
    overflow: 'hidden',
  } as CSSProperties,
};
