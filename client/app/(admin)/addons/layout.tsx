import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Addons',
};

export default function AddonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
