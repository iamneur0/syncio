import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Login',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
