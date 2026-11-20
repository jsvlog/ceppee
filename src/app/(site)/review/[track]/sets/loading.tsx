export default function SetsLoading() {
  return (
    <div>
      <section className="bg-gradient-to-br from-[#15803d] to-[#ca8a04] py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="h-5 w-56 animate-pulse rounded-full bg-white/25" />
          <div className="mt-3 h-9 w-64 animate-pulse rounded-2xl bg-white/30" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 h-16 w-full rounded-2xl skeleton" />
        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 w-36 rounded-2xl skeleton" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 w-full rounded-2xl skeleton" />
          ))}
        </div>
      </section>
    </div>
  );
}
