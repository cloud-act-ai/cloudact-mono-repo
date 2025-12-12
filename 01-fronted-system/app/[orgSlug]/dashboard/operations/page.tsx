export default async function OperationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  await params

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Operations</h1>
        <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">Monitor and manage operations</p>
      </div>

      <div className="health-card">
        <div className="mb-4">
          <h2 className="text-[17px] font-semibold text-black">Operations Dashboard</h2>
          <p className="text-[13px] text-[#8E8E93] mt-0.5">Coming soon</p>
        </div>
        <div>
          <p className="text-[15px] text-[#3C3C43]">Operations management features will be available here.</p>
        </div>
      </div>
    </div>
  )
}
