import { setRequestLocale } from 'next-intl/server';
import { ToastProvider } from '@/components/Toast';
import { IdleGuard } from '@/components/IdleGuard';

// Immersive lesson shell: no rail and no top bar — the lesson room draws its own
// header (leave · title · level · status), and the standalone board keeps its own
// toolbar «← Back». So the shell is just the providers + a full-bleed wrapper.
export default async function RoomLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { children } = props;
  const { locale } = await props.params;
  setRequestLocale(locale);
  return (
    <ToastProvider>
      <IdleGuard />
      <div className="room-shell">{children}</div>
    </ToastProvider>
  );
}
