import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInteractiveStates } from './useInteractiveStates';

describe('useInteractiveStates', () => {
  describe('initial state', () => {
    it('should initialize with empty hover and focus states', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      expect(result.current.hoverStates).toEqual({});
      expect(result.current.focusStates).toEqual({});
    });

    it('should return isHovered false for any key', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      expect(result.current.isHovered('anyKey')).toBe(false);
    });

    it('should return isFocused false for any key', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      expect(result.current.isFocused('anyKey')).toBe(false);
    });
  });

  describe('setHover', () => {
    it('should set hover state to true', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn', true);
      });
      
      expect(result.current.isHovered('btn')).toBe(true);
      expect(result.current.hoverStates.btn).toBe(true);
    });

    it('should set hover state to false', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn', true);
      });
      act(() => {
        result.current.setHover('btn', false);
      });
      
      expect(result.current.isHovered('btn')).toBe(false);
    });

    it('should handle multiple keys independently', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn1', true);
        result.current.setHover('btn2', true);
      });
      
      expect(result.current.isHovered('btn1')).toBe(true);
      expect(result.current.isHovered('btn2')).toBe(true);
      
      act(() => {
        result.current.setHover('btn1', false);
      });
      
      expect(result.current.isHovered('btn1')).toBe(false);
      expect(result.current.isHovered('btn2')).toBe(true);
    });
  });

  describe('setFocus', () => {
    it('should set focus state to true', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setFocus('input', true);
      });
      
      expect(result.current.isFocused('input')).toBe(true);
    });

    it('should set focus state to false', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setFocus('input', true);
      });
      act(() => {
        result.current.setFocus('input', false);
      });
      
      expect(result.current.isFocused('input')).toBe(false);
    });
  });

  describe('computeStyle', () => {
    const baseStyles = {
      base: { backgroundColor: 'white', padding: 10 },
      hover: { backgroundColor: 'gray' },
      focus: { borderColor: 'blue' },
      active: { backgroundColor: 'darkgray' },
      disabled: { opacity: 0.5 },
    };

    it('should return base style when not hovered or focused', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      const style = result.current.computeStyle('btn', baseStyles);
      
      expect(style).toEqual({ backgroundColor: 'white', padding: 10 });
    });

    it('should merge hover style when hovered', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn', true);
      });
      
      const style = result.current.computeStyle('btn', baseStyles);
      
      expect(style).toEqual({ backgroundColor: 'gray', padding: 10 });
    });

    it('should merge focus style when focused', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setFocus('btn', true);
      });
      
      const style = result.current.computeStyle('btn', baseStyles);
      
      expect(style).toEqual({ backgroundColor: 'white', padding: 10, borderColor: 'blue' });
    });

    it('should combine hover and focus styles', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn', true);
        result.current.setFocus('btn', true);
      });
      
      const style = result.current.computeStyle('btn', baseStyles);
      
      expect(style).toEqual({ backgroundColor: 'gray', padding: 10, borderColor: 'blue' });
    });

    it('should apply active style over hover', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn', true);
      });
      
      const style = result.current.computeStyle('btn', baseStyles, { active: true });
      
      expect(style).toEqual({ backgroundColor: 'darkgray', padding: 10 });
    });

    it('should apply disabled style and ignore hover/active', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      act(() => {
        result.current.setHover('btn', true);
      });
      
      const style = result.current.computeStyle('btn', baseStyles, { disabled: true });
      
      expect(style).toEqual({ backgroundColor: 'white', padding: 10, opacity: 0.5 });
    });
  });

  describe('getProps', () => {
    const styles = {
      base: { backgroundColor: 'white' },
      hover: { backgroundColor: 'gray' },
    };

    it('should return style and mouse handlers', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      const props = result.current.getProps('btn', styles);
      
      expect(props.style).toEqual({ backgroundColor: 'white' });
      expect(typeof props.onMouseEnter).toBe('function');
      expect(typeof props.onMouseLeave).toBe('function');
      expect(props.onFocus).toBeUndefined();
      expect(props.onBlur).toBeUndefined();
    });

    it('should include focus handlers when includeFocus is true', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      const props = result.current.getProps('btn', styles, { includeFocus: true });
      
      expect(typeof props.onFocus).toBe('function');
      expect(typeof props.onBlur).toBe('function');
    });

    it('should update style when mouse handlers are called', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      // Get initial props
      let props = result.current.getProps('btn', styles);
      expect(props.style).toEqual({ backgroundColor: 'white' });
      
      // Simulate mouse enter
      act(() => {
        props.onMouseEnter();
      });
      
      // Get updated props
      props = result.current.getProps('btn', styles);
      expect(props.style).toEqual({ backgroundColor: 'gray' });
      
      // Simulate mouse leave
      act(() => {
        props.onMouseLeave();
      });
      
      // Get updated props
      props = result.current.getProps('btn', styles);
      expect(props.style).toEqual({ backgroundColor: 'white' });
    });
  });

  describe('getDynamicProps', () => {
    const styles = {
      base: { backgroundColor: 'white' },
      hover: { backgroundColor: 'gray' },
    };

    it('should generate unique keys from prefix and id', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      // Get props for different items
      const props1 = result.current.getDynamicProps('item', 0, styles);
      result.current.getDynamicProps('item', 1, styles); // Initialize item-1
      
      // Hover first item
      act(() => {
        props1.onMouseEnter();
      });
      
      // Check states are independent
      expect(result.current.isHovered('item-0')).toBe(true);
      expect(result.current.isHovered('item-1')).toBe(false);
    });

    it('should work with string ids', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      const props = result.current.getDynamicProps('user', 'abc123', styles);
      
      act(() => {
        props.onMouseEnter();
      });
      
      expect(result.current.isHovered('user-abc123')).toBe(true);
    });
  });

  describe('getFocusProps', () => {
    const styles = {
      base: { borderColor: 'gray' },
      focus: { borderColor: 'blue' },
    };

    it('should return focus-related props only', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      const props = result.current.getFocusProps('input', styles);
      
      expect(props.style).toEqual({ borderColor: 'gray' });
      expect(typeof props.onFocus).toBe('function');
      expect(typeof props.onBlur).toBe('function');
      // Should not have mouse handlers
      expect((props as Record<string, unknown>).onMouseEnter).toBeUndefined();
      expect((props as Record<string, unknown>).onMouseLeave).toBeUndefined();
    });

    it('should update style on focus/blur', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      let props = result.current.getFocusProps('input', styles);
      expect(props.style).toEqual({ borderColor: 'gray' });
      
      act(() => {
        props.onFocus!();
      });
      
      props = result.current.getFocusProps('input', styles);
      expect(props.style).toEqual({ borderColor: 'blue' });
      
      act(() => {
        props.onBlur!();
      });
      
      props = result.current.getFocusProps('input', styles);
      expect(props.style).toEqual({ borderColor: 'gray' });
    });
  });

  describe('clearAll', () => {
    it('should clear all hover and focus states', () => {
      const { result } = renderHook(() => useInteractiveStates());
      
      // Set some states
      act(() => {
        result.current.setHover('btn1', true);
        result.current.setHover('btn2', true);
        result.current.setFocus('input1', true);
      });
      
      // Verify states are set
      expect(result.current.isHovered('btn1')).toBe(true);
      expect(result.current.isHovered('btn2')).toBe(true);
      expect(result.current.isFocused('input1')).toBe(true);
      
      // Clear all
      act(() => {
        result.current.clearAll();
      });
      
      // Verify all cleared
      expect(result.current.hoverStates).toEqual({});
      expect(result.current.focusStates).toEqual({});
      expect(result.current.isHovered('btn1')).toBe(false);
      expect(result.current.isHovered('btn2')).toBe(false);
      expect(result.current.isFocused('input1')).toBe(false);
    });
  });
});
