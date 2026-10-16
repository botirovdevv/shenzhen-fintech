import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Animated, View } from 'react-native';

import { LogoMark, Wordmark } from '@/components/Logo';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

// Launch intro: the native splash shows the empty green tile; here the F draws itself and the coin
// drops in, then the app routes on. The splash background colours match (app.json), so it's seamless.
export default function Index() {
  const { token, hydrated } = useSession();
  const { dark } = useTheme();
  const [played, setPlayed] = useState(false);
  const [word] = useState(() => new Animated.Value(0));

  if (hydrated && played) return <Redirect href={token ? '/(tabs)' : '/login'} />;

  return (
    <View style={{ flex: 1, backgroundColor: dark ? '#000000' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <LogoMark
        size={120}
        animated
        keepTile
        onDone={() =>
          Animated.timing(word, { toValue: 1, duration: 260, useNativeDriver: true }).start(() => setTimeout(() => setPlayed(true), 220))
        }
      />
      {/* Absolutely placed so the mark stays exactly where the native splash drew the tile. */}
      <Animated.View
        style={{
          position: 'absolute',
          top: '50%',
          marginTop: 60 + 22,
          opacity: word,
          transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }}
      >
        <Wordmark size={34} dark={dark} />
      </Animated.View>
    </View>
  );
}
