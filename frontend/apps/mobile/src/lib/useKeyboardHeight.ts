import { useEffect, useState } from 'react';
import { AccessibilityInfo, Keyboard, LayoutAnimation, Platform } from 'react-native';

// Keyboard height in px, 0 when hidden. Android apps are edge-to-edge from SDK 54, so the window no
// longer shrinks for the keyboard and screens have to make room themselves; iOS gets the "will"
// events so the layout moves together with the keyboard.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let reduceMotion = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion = v));
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animate = (duration?: number) => {
      if (reduceMotion) return;
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          Platform.OS === 'ios' ? (duration ?? 250) : 200,
          Platform.OS === 'ios' ? 'keyboard' : 'easeInEaseOut',
          'opacity',
        ),
      );
    };
    const show = Keyboard.addListener(showEvt, (e) => {
      animate(e.duration);
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvt, (e) => {
      animate(e?.duration);
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
