export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen relative bg-gradient-to-b from-[#90FCA6]/[0.03] via-white to-white">
      {/* Ultra-premium top gradient glow - Apple Health pattern */}
      <div
        className="absolute inset-x-0 top-0 h-80 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(144, 252, 166, 0.08), transparent 70%)"
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10">
        {children}
      </div>
    </main>
  )
}
