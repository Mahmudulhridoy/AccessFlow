import Logo from "./Logo";

const bands = [
  {
    top: "6%",
    height: "26%",
    rotate: -16,
    opacity: 0.85,
    bg: "linear-gradient(90deg,#3b0a8f,#d11fb0 40%,#ff3d8b 70%,#5b2bd6)",
  },
  {
    top: "26%",
    height: "24%",
    rotate: -11,
    opacity: 0.8,
    bg: "linear-gradient(90deg,#1e3a8a,#7c3aed 40%,#ec4899 80%)",
  },
  {
    top: "44%",
    height: "22%",
    rotate: -7,
    opacity: 0.7,
    bg: "linear-gradient(90deg,#0ea5e9,#6d28d9 50%,#be185d)",
  },
];

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <main className="flex min-h-screen bg-[#05030d] p-3 md:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col rounded-[32px] bg-white p-2 md:flex-row">
        <section className="relative flex min-h-[300px] flex-1 flex-col justify-between overflow-hidden rounded-[26px] bg-[#07040f] p-8 text-white md:min-h-[720px]">
          {bands.map((b) => (
            <div
              key={b.top}
              aria-hidden="true"
              className="absolute -left-[30%] w-[160%] rounded-full blur-[2px]"
              style={{
                top: b.top,
                height: b.height,
                background: b.bg,
                opacity: b.opacity,
                transform: `rotate(${b.rotate}deg)`,
              }}
            />
          ))}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg,rgba(7,4,15,0) 35%,rgba(7,4,15,.93) 80%)",
            }}
          />
          <div className="relative z-10">
            <Logo light />
          </div>
          <div className="relative z-10">
            <p className="max-w-md font-display text-5xl leading-[1.02] md:text-6xl">
              Make the Web More Accessible.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#e7e3fb]">
              Scan a public page, understand the issues that get in the way of
              real users, and decide what to fix first.
            </p>
          </div>
        </section>

        <section className="flex flex-1 flex-col items-center p-8">
          <Logo />
          <div className="my-auto w-full max-w-sm py-8">
            <h1 className="text-center font-display text-5xl">{title}</h1>
            <p className="mt-2 text-center text-muted">{subtitle}</p>
            {children}
          </div>
          <p className="text-muted">{footer}</p>
        </section>
      </div>
    </main>
  );
}
