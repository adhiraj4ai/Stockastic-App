import { NotificationProvider } from '@/components/notifications/NotificationProvider';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
    return <NotificationProvider>{children}</NotificationProvider>;
}
