import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode, type Ref } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { useKeyboardHeight } from '@/lib/useKeyboardHeight';

const RevealContext = createContext<() => void>(() => undefined);

// Call from a TextInput's onFocus so the field scrolls above the keyboard when you move between fields.
export const useRevealFocused = () => useContext(RevealContext);

// A scrollable form screen that keeps the focused input visible above the keyboard on iOS and Android.
export function KeyboardScreen({
  children,
  style,
  contentContainerStyle,
  bounces,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bounces?: boolean;
}) {
  const kb = useKeyboardHeight();
  const scroll = useRef<ScrollView>(null);
  // measureLayout needs a native view ref (New Architecture), so the content sits in its own View.
  const content = useRef<View>(null);
  const viewHeight = useRef(0);
  const offset = useRef(0);
  const kbRef = useRef(0);

  const reveal = useCallback(() => {
    // Wait a frame so the keyboard padding is laid out before measuring.
    setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput();
      const inner = content.current;
      if (!input || !inner || !kbRef.current) return;
      input.measureLayout(
        inner,
        (_x, y, _w, h) => {
          const visibleBottom = offset.current + viewHeight.current - kbRef.current;
          const needed = y + h + 24 - visibleBottom;
          if (needed > 0) scroll.current?.scrollTo({ y: offset.current + needed, animated: true });
        },
        () => undefined,
      );
    }, 60);
  }, []);

  useEffect(() => {
    kbRef.current = kb;
    if (kb > 0) reveal();
  }, [kb, reveal]);

  const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
  const basePadding = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 0;

  return (
    <RevealContext.Provider value={reveal}>
      <View style={[{ flex: 1 }, style]} onLayout={(e) => (viewHeight.current = e.nativeEvent.layout.height)}>
        <ScrollView
          ref={scroll}
          bounces={bounces}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View ref={content} style={[{ flexGrow: 1 }, contentContainerStyle, { paddingBottom: basePadding + kb }]}>
            {children}
          </View>
        </ScrollView>
      </View>
    </RevealContext.Provider>
  );
}

// A TextInput that scrolls itself above the keyboard when focused (also when moving between fields).
export function KeyboardInput({ ref, onFocus, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  const reveal = useRevealFocused();
  return (
    <TextInput
      ref={ref}
      {...props}
      onFocus={(e) => {
        onFocus?.(e);
        reveal();
      }}
    />
  );
}

// Re-export for screens that want the raw height (e.g. to collapse a hero while typing).
export { useKeyboardHeight };
