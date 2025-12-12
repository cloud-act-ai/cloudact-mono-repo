export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  await params

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Settings</h1>
        <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">Manage your settings</p>
      </div>

      <div className="health-card">
        <div className="mb-4">
          <h2 className="text-[17px] font-semibold text-black">Organization Settings</h2>
          <p className="text-[13px] text-[#8E8E93] mt-0.5">Configure your workspace</p>
        </div>
        <div>
          <p className="text-[15px] text-[#3C3C43]">Organization settings will be available here.</p>
        </div>
      </div>
    </div>
  )
}
