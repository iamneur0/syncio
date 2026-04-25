import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - User Home',
};

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
