import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Settings',
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
