export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white relative">
      {/* Premium gradient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[400px] -right-[200px] w-[800px] h-[800px] rounded-full bg-gradient-to-br from-[#90FCA6]/8 via-transparent to-transparent blur-3xl" />
        <div className="absolute -bottom-[300px] -left-[200px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#FF6C5E]/5 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Main Content Area */}
      <main className="relative min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  )
}
