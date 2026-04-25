import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - My Activity',
};

export default function UserActivityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
