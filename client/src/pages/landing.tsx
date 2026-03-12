import { useLocation } from "wouter";
import { useRef, useEffect, useState, useCallback } from "react";
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import {
  PiFileTextBold,
  PiChatTextBold,
  PiChartBarBold,
  PiDownloadSimpleBold,
  PiCaretRightBold,
  PiArrowRightBold,
  PiShieldCheckBold,
  PiSealCheckBold,
  PiFlagBold,
  PiStarFourBold,
} from "react-icons/pi";
import { Button } from "@/components/ui/button";

/* ── SVG Wordmark Logo ── */
function LogoMark({ className = "", size = "default" }: { className?: string; size?: "sm" | "default" | "lg" }) {
  const sizes = { sm: "h-7", default: "h-9", lg: "h-14" };
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/images/logo-emblem.png"
        alt=""
        className={`${sizes[size]} w-auto object-contain`}
        style={{ filter: "drop-shadow(0 0 8px rgba(191, 155, 48, 0.3))" }}
      />
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-extrabold tracking-[0.08em] text-white uppercase ${
            size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base"
          }`}
        >
          VetClaim
        </span>
        <span
          className={`font-display font-medium tracking-[0.3em] uppercase ${
            size === "lg" ? "text-[11px]" : "text-[8px]"
          }`}
          style={{
            background: "linear-gradient(90deg, hsl(42 55% 55%), hsl(42 40% 72%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          PRO
        </span>
      </div>
    </div>
  );
}

const steps = [
  {
    icon: PiFileTextBold,
    num: "01",
    title: "Upload or Start Fresh",
    desc: "Upload your existing VA claim document or begin a guided interview from scratch.",
  },
  {
    icon: PiChatTextBold,
    num: "02",
    title: "Guided Interview",
    desc: "Answer targeted questions about each condition to capture what the VA rates on.",
  },
  {
    icon: PiChartBarBold,
    num: "03",
    title: "CFR Analysis",
    desc: "Every condition is compared against 38 CFR Part 4 rating criteria in real time.",
  },
  {
    icon: PiDownloadSimpleBold,
    num: "04",
    title: "Export Your Claim",
    desc: "Get a rewritten claim letter using proper VA language, ready to submit.",
  },
];

/* ── Hero video URL — swap in Higgsfield-generated video when ready ── */
const HERO_VIDEO_URL: string | null = "/images/hero-cinematic.mp4";

function HeroSection({ onNavigate }: { onNavigate: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  // Mouse-driven 3D parallax tilt
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [3, -3]), { stiffness: 80, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-3, 3]), { stiffness: 80, damping: 30 });
  const scale = useSpring(1.08, { stiffness: 80, damping: 30 });

  // Scroll-driven parallax
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const scrollY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const scrollOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  // Respect prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reducedMotion || !sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
      mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
      scale.set(1.1);
    },
    [reducedMotion, mouseX, mouseY, scale]
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
    scale.set(1.08);
  }, [mouseX, mouseY, scale]);

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ perspective: "1200px" }}
    >
      {/* 3D parallax background media */}
      <motion.div
        ref={mediaRef}
        className="absolute inset-[-5%]"
        style={{
          rotateX: reducedMotion ? 0 : rotateX,
          rotateY: reducedMotion ? 0 : rotateY,
          scale: reducedMotion ? 1 : scale,
          y: reducedMotion ? 0 : scrollY,
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {HERO_VIDEO_URL ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/images/hero-cinematic.png"
            className="w-full h-full object-cover"
          >
            <source src={HERO_VIDEO_URL} type="video/mp4" />
          </video>
        ) : (
          <img
            src="/images/hero-cinematic.png"
            alt="Veteran in distinguished office reviewing claim documents"
            className="w-full h-full object-cover"
            loading="eager"
          />
        )}
      </motion.div>

      {/* Multi-layer overlay for depth */}
      <motion.div className="absolute inset-0" style={{ opacity: scrollOpacity }}>
        <div className="absolute inset-0 bg-gradient-to-r from-navy-deep via-navy-deep/85 to-navy-deep/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-deep via-transparent to-navy-deep/30" />
        <div
          className="absolute inset-0 mix-blend-overlay opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
          }}
        />
      </motion.div>

      {/* Hero content */}
      <motion.div
        className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-20 w-full"
        style={{ opacity: scrollOpacity }}
      >
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <LogoMark size="lg" className="mb-10" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="h-px w-12 bg-gold/60" />
            <span className="text-gold-light text-xs font-display font-semibold uppercase tracking-[0.25em]">
              Built for those who served
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="font-display font-extrabold text-5xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tight text-white leading-[0.95] mb-8 uppercase"
          >
            Your claim,
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, hsl(42 55% 55%) 0%, hsl(42 40% 72%) 50%, hsl(42 55% 55%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              their language.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85 }}
            className="text-white/55 text-lg sm:text-xl max-w-xl mb-12 leading-relaxed font-light"
          >
            AI-powered analysis against 38 CFR Part 4. Every condition reviewed.
            Every statement rewritten in the exact language the VA rates on.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.05 }}
            className="flex flex-col sm:flex-row items-start gap-5"
          >
            <Button
              size="lg"
              onClick={onNavigate}
              data-testid="hero-start-btn"
              className="bg-gold hover:bg-gold-dark text-navy-deep font-display font-bold uppercase tracking-wide px-10 gap-3 text-sm h-14 rounded-xl shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 transition-all duration-300"
            >
              Start Your Claim
              <PiArrowRightBold className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-6 text-white/40 text-sm pt-3">
              <div className="flex items-center gap-2">
                <PiShieldCheckBold className="w-4 h-4 text-gold/50" />
                <span className="font-display tracking-wide">CFR Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <PiSealCheckBold className="w-4 h-4 text-gold/50" />
                <span className="font-display tracking-wide">AI-Powered</span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
      >
        <span className="text-white/25 text-[10px] font-display uppercase tracking-[0.3em]">Scroll</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-px h-8 bg-gradient-to-b from-white/30 to-transparent"
        />
      </motion.div>
    </section>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ── Floating Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-4 mt-3">
          <div className="max-w-6xl mx-auto bg-navy-deep/80 backdrop-blur-xl rounded-2xl border border-white/[0.06] px-5 h-14 flex items-center justify-between shadow-2xl">
            <LogoMark size="sm" />
            <Button
              size="sm"
              onClick={() => setLocation("/app")}
              data-testid="nav-start-btn"
              className="bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide text-xs rounded-full px-6 h-9"
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Full-bleed Hero with 3D Parallax + Video ── */}
      <HeroSection onNavigate={() => setLocation("/app")} />

      {/* ── Trust Metrics Bar ── */}
      <div className="bg-navy-deep border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { value: "38 CFR", label: "Part 4 Compliant", icon: PiShieldCheckBold },
            { value: "23%", label: "Avg. Clarity Improvement", icon: PiChartBarBold },
            { value: "100%", label: "AI-Powered Analysis", icon: PiSealCheckBold },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-gold" />
              </div>
              <div>
                <p className="text-white font-display font-bold text-lg tracking-tight">{item.value}</p>
                <p className="text-white/40 text-xs font-display uppercase tracking-wider">{item.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── How It Works ── */}
      <section className="relative bg-background">
        <div className="max-w-6xl mx-auto px-6 py-32">
          <div className="flex flex-col lg:flex-row gap-16 lg:gap-20">
            {/* Left: Section header + image */}
            <div className="lg:w-[380px] shrink-0">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px w-8 bg-gold" />
                  <span className="text-gold text-xs font-display font-semibold uppercase tracking-[0.2em]">Process</span>
                </div>
                <h2 className="font-display font-bold text-3xl lg:text-4xl uppercase tracking-tight mb-4 leading-[1.1]">
                  Four steps to a
                  <br />
                  <span className="text-gold">stronger claim</span>
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-8">
                  From upload to a VA-ready claim letter — every statement reviewed
                  against the exact criteria the VA uses to rate disabilities.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="relative rounded-2xl overflow-hidden shadow-xl hidden lg:block"
              >
                <img
                  src="/images/documents-desk.png"
                  alt="Official VA claim documents on desk"
                  className="w-full h-64 object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-deep/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-5 right-5">
                  <p className="text-white font-display font-bold text-sm uppercase tracking-tight">
                    Every word matters
                  </p>
                  <p className="text-white/50 text-xs mt-0.5">Precision language aligned to CFR criteria</p>
                </div>
              </motion.div>
            </div>

            {/* Right: Step cards */}
            <div className="flex-1 space-y-5">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="group relative bg-card border border-card-border rounded-2xl p-6 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer transition-all duration-300 overflow-hidden"
                >
                  {/* Hover accent */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold/0 group-hover:bg-gold transition-colors duration-300 rounded-l-2xl" />

                  <div className="flex items-start gap-5">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <span className="text-3xl font-display font-extrabold text-gold/20 group-hover:text-gold/40 transition-colors leading-none">
                        {step.num}
                      </span>
                      <div className="w-11 h-11 rounded-xl bg-navy-deep/[0.05] group-hover:bg-gold/10 flex items-center justify-center transition-colors">
                        <step.icon className="w-5 h-5 text-navy group-hover:text-gold transition-colors" />
                      </div>
                    </div>
                    <div className="pt-1">
                      <h3 className="font-display font-bold text-base uppercase tracking-tight mb-1.5 group-hover:text-gold transition-colors">
                        {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Veterans Image Band ── */}
      <section className="relative">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="relative h-[400px] lg:h-[500px] overflow-hidden"
        >
          <img
            src="/images/veterans-group.png"
            alt="Diverse group of confident military veterans"
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-deep/90 via-navy-deep/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-deep via-transparent to-navy-deep/20" />

          <div className="absolute inset-0 flex items-center">
            <div className="max-w-6xl mx-auto px-6 w-full">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="max-w-lg"
              >
                <PiStarFourBold className="w-8 h-8 text-gold mb-4" />
                <h2 className="font-display font-bold text-3xl lg:text-4xl uppercase tracking-tight text-white mb-4 leading-[1.1]">
                  Built by veterans,
                  <br />
                  for veterans.
                </h2>
                <p className="text-white/55 leading-relaxed mb-8">
                  We understand the frustration of navigating the VA claims process.
                  That's why every feature is designed around how the VA actually
                  evaluates disability ratings.
                </p>
                <Button
                  size="lg"
                  onClick={() => setLocation("/app")}
                  className="bg-gold hover:bg-gold-dark text-navy-deep font-display font-bold uppercase tracking-wide px-10 gap-3 text-sm h-13 rounded-xl shadow-lg shadow-gold/20"
                >
                  Start Your Claim
                  <PiCaretRightBold className="w-4 h-4" />
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-navy-deep relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, hsl(42 55% 55% / 0.15), transparent 50%), radial-gradient(circle at 80% 50%, hsl(42 55% 55% / 0.1), transparent 50%)",
          }}
        />
        <div className="max-w-3xl mx-auto px-6 py-28 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-8">
              <img
                src="/images/logo-emblem.png"
                alt=""
                className="h-10 w-auto object-contain"
                style={{ filter: "drop-shadow(0 0 6px rgba(191, 155, 48, 0.3))" }}
              />
            </div>
            <h2 className="font-display font-bold text-3xl lg:text-4xl uppercase tracking-tight text-white mb-4">
              Ready to strengthen
              <br />
              your claim?
            </h2>
            <p className="text-white/45 text-base mb-10 max-w-md mx-auto leading-relaxed">
              Every statement reviewed against the exact criteria the VA uses.
              Start in minutes.
            </p>
            <Button
              size="lg"
              onClick={() => setLocation("/app")}
              className="bg-gold hover:bg-gold-dark text-navy-deep font-display font-bold uppercase tracking-wide px-12 gap-3 text-sm h-14 rounded-xl shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 transition-all duration-300"
            >
              Get Started Now
              <PiArrowRightBold className="w-5 h-5" />
            </Button>
            <p className="text-white/20 text-xs mt-8 font-mono">
              For educational and organizational purposes only. Not legal or medical advice.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-navy-deep border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center justify-center mb-5">
            <LogoMark size="sm" />
          </div>
          <div className="flex items-center justify-center gap-6 mb-6">
            {[
              { icon: PiShieldCheckBold, text: "38 CFR Compliant" },
              { icon: PiSealCheckBold, text: "AI-Powered" },
              { icon: PiFlagBold, text: "Veteran-Focused" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-white/20">
                <item.icon className="w-3 h-3" />
                <span className="text-[10px] font-display uppercase tracking-wider">{item.text}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/15 max-w-2xl mx-auto text-center leading-relaxed">
            This tool is for educational and organizational purposes only. It is not a substitute
            for professional legal, medical, or VA-accredited advice. Consult a VSO or accredited
            attorney for personalized guidance.
          </p>
        </div>
      </footer>
    </div>
  );
}
