import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Users',
};

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
