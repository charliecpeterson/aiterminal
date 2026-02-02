import { useState, useCallback, useMemo } from 'react';

/**
 * Style definitions for interactive elements (hover, focus, active, disabled states).
 * Reduces boilerplate for managing hover/focus state across many elements.
 */
export interface InteractiveStyles {
  base: React.CSSProperties;
  hover?: React.CSSProperties;
  focus?: React.CSSProperties;
  active?: React.CSSProperties;
  disabled?: React.CSSProperties;
}

/**
 * Props returned by getProps() to spread onto interactive elements.
 */
export interface InteractiveProps {
  style: React.CSSProperties;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Options for computing interactive element styles.
 */
export interface InteractiveOptions {
  disabled?: boolean;
  active?: boolean;
  /** Include focus handlers (onFocus/onBlur) */
  includeFocus?: boolean;
}

/**
 * Hook for managing hover and focus states across multiple interactive elements.
 * 
 * Replaces verbose patterns like:
 * ```tsx
 * const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
 * <button
 *   style={hoverStates.btn ? {...base, ...hover} : base}
 *   onMouseEnter={() => setHoverStates(p => ({...p, btn: true}))}
 *   onMouseLeave={() => setHoverStates(p => ({...p, btn: false}))}
 * />
 * ```
 * 
 * With:
 * ```tsx
 * const { getProps } = useInteractiveStates();
 * <button {...getProps('btn', { base: styles.btn, hover: styles.btnHover })} />
 * ```
 * 
 * @returns Object with methods to manage interactive states
 */
export function useInteractiveStates() {
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  const [focusStates, setFocusStates] = useState<Record<string, boolean>>({});

  /**
   * Set hover state for a key.
   */
  const setHover = useCallback((key: string, isHovered: boolean) => {
    setHoverStates(prev => {
      if (prev[key] === isHovered) return prev;
      return { ...prev, [key]: isHovered };
    });
  }, []);

  /**
   * Set focus state for a key.
   */
  const setFocus = useCallback((key: string, isFocused: boolean) => {
    setFocusStates(prev => {
      if (prev[key] === isFocused) return prev;
      return { ...prev, [key]: isFocused };
    });
  }, []);

  /**
   * Check if an element is currently hovered.
   */
  const isHovered = useCallback((key: string): boolean => {
    return !!hoverStates[key];
  }, [hoverStates]);

  /**
   * Check if an element is currently focused.
   */
  const isFocused = useCallback((key: string): boolean => {
    return !!focusStates[key];
  }, [focusStates]);

  /**
   * Compute the merged style for an interactive element.
   */
  const computeStyle = useCallback((
    key: string,
    styles: InteractiveStyles,
    options?: InteractiveOptions
  ): React.CSSProperties => {
    const { disabled, active } = options ?? {};
    const hovering = hoverStates[key];
    const focusing = focusStates[key];

    let computedStyle = { ...styles.base };

    if (disabled && styles.disabled) {
      // Disabled state takes precedence
      computedStyle = { ...computedStyle, ...styles.disabled };
    } else {
      // Active > Hover priority
      if (active && styles.active) {
        computedStyle = { ...computedStyle, ...styles.active };
      } else if (hovering && styles.hover) {
        computedStyle = { ...computedStyle, ...styles.hover };
      }
      // Focus can combine with hover/active
      if (focusing && styles.focus) {
        computedStyle = { ...computedStyle, ...styles.focus };
      }
    }

    return computedStyle;
  }, [hoverStates, focusStates]);

  /**
   * Get props to spread onto an interactive element.
   * Includes computed style and event handlers.
   * 
   * @param key - Unique identifier for this element
   * @param styles - Style definitions for different states
   * @param options - Optional settings (disabled, active, includeFocus)
   * @returns Props object to spread onto the element
   */
  const getProps = useCallback((
    key: string,
    styles: InteractiveStyles,
    options?: InteractiveOptions
  ): InteractiveProps => {
    const { includeFocus = false } = options ?? {};
    
    const props: InteractiveProps = {
      style: computeStyle(key, styles, options),
      onMouseEnter: () => setHover(key, true),
      onMouseLeave: () => setHover(key, false),
    };

    if (includeFocus) {
      props.onFocus = () => setFocus(key, true);
      props.onBlur = () => setFocus(key, false);
    }

    return props;
  }, [computeStyle, setHover, setFocus]);

  /**
   * Get props for elements in a dynamic list (e.g., map over items).
   * Generates unique keys using a prefix and item identifier.
   * 
   * @param prefix - Static prefix for the key type
   * @param id - Dynamic identifier (index, id, etc.)
   * @param styles - Style definitions
   * @param options - Optional settings
   * @returns Props object to spread onto the element
   */
  const getDynamicProps = useCallback((
    prefix: string,
    id: string | number,
    styles: InteractiveStyles,
    options?: InteractiveOptions
  ): InteractiveProps => {
    const key = `${prefix}-${id}`;
    return getProps(key, styles, options);
  }, [getProps]);

  /**
   * Get only focus-related props (for inputs without hover styling).
   */
  const getFocusProps = useCallback((
    key: string,
    styles: InteractiveStyles
  ): Pick<InteractiveProps, 'style' | 'onFocus' | 'onBlur'> => {
    const focusing = focusStates[key];
    let computedStyle = { ...styles.base };
    if (focusing && styles.focus) {
      computedStyle = { ...computedStyle, ...styles.focus };
    }

    return {
      style: computedStyle,
      onFocus: () => setFocus(key, true),
      onBlur: () => setFocus(key, false),
    };
  }, [focusStates, setFocus]);

  /**
   * Clear all hover/focus states (useful on modal close, etc.)
   */
  const clearAll = useCallback(() => {
    setHoverStates({});
    setFocusStates({});
  }, []);

  return useMemo(() => ({
    // State access
    hoverStates,
    focusStates,
    isHovered,
    isFocused,
    
    // State setters
    setHover,
    setFocus,
    
    // Props generators
    getProps,
    getDynamicProps,
    getFocusProps,
    computeStyle,
    
    // Utilities
    clearAll,
  }), [
    hoverStates,
    focusStates,
    isHovered,
    isFocused,
    setHover,
    setFocus,
    getProps,
    getDynamicProps,
    getFocusProps,
    computeStyle,
    clearAll,
  ]);
}

export default useInteractiveStates;
