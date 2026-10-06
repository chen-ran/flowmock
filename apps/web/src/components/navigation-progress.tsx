// Ported from Floway apps/web/src/components/navigation-progress.tsx (MIT). See NOTICE.md.
import { useNavigation } from 'react-router';

export function NavigationProgress() {
  const navigation = useNavigation();
  return <div aria-hidden="true" className="flowmock-navigation-progress" data-active={navigation.state !== 'idle'} />;
}
