export default function ReviewTrackLoading() {
  return (
    <div>
      <section className="bg-gradient-to-br from-[#15803d] via-[#ca8a04] to-[#b45309] py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="h-6 w-48 animate-pulse rounded-full bg-white/25" />
          <div className="mt-3 h-10 w-72 animate-pulse rounded-2xl bg-white/30" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/20" />
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 h-16 w-full rounded-2xl skeleton" />
        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-40 rounded-2xl skeleton" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 w-full rounded-2xl skeleton" />
          ))}
        </div>
      </section>
    </div>
  );
}
