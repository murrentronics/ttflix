import { Link } from "react-router-dom";
import { Check, Tv, Download, Users } from "lucide-react";
import { PLANS } from "@/lib/supabase";
import heroBg from "@/assets/landing-hero.jpg";

export function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        <img src={heroBg} alt="" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-background" />
        <div className="relative">
          <header className="flex items-center justify-between px-4 py-5 sm:px-10">
            <span className="text-3xl font-extrabold text-primary">TT<span className="text-foreground">FLIX</span></span>
            <Link to="/auth" className="rounded bg-primary px-5 py-2 font-semibold text-primary-foreground transition hover:bg-primary/85">Sign In</Link>
          </header>
          <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:py-36">
            <h1 className="text-balance text-4xl font-extrabold leading-tight sm:text-6xl">Unlimited movies, TV shows & cartoons.</h1>
            <p className="mt-4 text-xl">Watch anywhere. Cancel anytime.</p>
            <p className="mt-6 text-base text-foreground/80">Ready to watch? Create your account to start streaming.<br /><span className="text-sm text-muted-foreground">Available in Trinidad & Tobago.</span></p>
            <Link to="/auth?mode=signup" className="mt-6 inline-block rounded-md bg-primary px-8 py-4 text-lg font-bold text-primary-foreground shadow-[var(--shadow-red)] transition hover:bg-primary/85">Get Started</Link>
          </div>
        </div>
      </div>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:grid-cols-3">
        {[
          { icon: Tv, title: "Watch on any device", desc: "Stream on your phone, tablet, laptop and TV." },
          { icon: Users, title: "Profiles for everyone", desc: "Up to 5 simultaneous screens with Premium." },
          { icon: Download, title: "Trailers & HD streaming", desc: "Preview with trailers, then watch in HD." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6">
            <f.icon className="h-8 w-8 text-primary" />
            <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-24">
        <h2 className="text-center text-3xl font-extrabold">Choose your plan</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {Object.values(PLANS).map((plan) => (
            <div key={plan.id} className="flex flex-col rounded-xl border border-border bg-card p-7 transition hover:border-primary">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="mt-2 text-3xl font-extrabold text-primary">TT${plan.price}<span className="text-base font-normal text-muted-foreground">/{plan.annual ? "year" : "month"}</span></p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {plan.screens} screens at the same time</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {plan.quality}</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Unlimited movies, TV & cartoons</li>
              </ul>
              <Link to="/auth?mode=signup" className="mt-7 rounded-md bg-primary py-3 text-center font-semibold text-primary-foreground transition hover:bg-primary/85">Choose {plan.name}</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
