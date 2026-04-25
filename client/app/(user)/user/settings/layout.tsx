import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - My Settings',
};

export default function UserSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
