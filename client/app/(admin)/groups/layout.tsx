import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Groups',
};

export default function GroupsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
