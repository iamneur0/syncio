import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Syncio - Tasks',
};

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
