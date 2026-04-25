/**
 * Public layout without sidebar
 * 
 * Used for public-facing pages like invite flows that don't require authentication.
 * No sidebar, no admin navigation - just the content.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      {children}
    </div>
  );
}
