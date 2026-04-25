import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - My Addons',
};

export default function UserAddonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
