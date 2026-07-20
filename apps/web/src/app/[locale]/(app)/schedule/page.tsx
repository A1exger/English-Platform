import { setRequestLocale } from 'next-intl/server';
import { ScheduleView } from '@/components/ScheduleView';

// Render on each request instead of statically prerendering. A cached static
// build of this page can pin the browser to an old JS bundle (e.g. a superseded
// week-start), so we keep the HTML — and its chunk references — always fresh.
export const dynamic = 'force-dynamic';

export default function SchedulePage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <ScheduleView />;
}
