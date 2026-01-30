export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6">
        {children}
      </div>
    </main>
  )
}
