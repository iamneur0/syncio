import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Invitations',
};

export default function InvitationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
