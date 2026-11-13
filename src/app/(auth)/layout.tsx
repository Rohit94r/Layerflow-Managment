import Link from "next/link";
import { Logo } from "@/components/ui";
import { CoastIllustration } from "@/components/illustration";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm py-10">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l border-line lg:block">
        <CoastIllustration className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-10 top-10 max-w-md">
          <p className="font-serif text-[1.65rem] leading-snug text-ink">
            Every product you&apos;ve shipped, started, or sworn you&apos;d finish — in one calm place.
          </p>
        </div>
      </div>
    </div>
  );
}
