import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  PiShieldStarBold,
  PiUploadSimpleBold,
  PiFileTextBold,
  PiChatTextBold,
  PiPaperPlaneRightBold,
  PiCaretLeftBold,
  PiCaretRightBold,
  PiCheckCircleBold,
  PiXCircleBold,
  PiWarningCircleBold,
  PiCircleNotchBold,
  PiDownloadSimpleBold,
  PiArrowLeftBold,
  PiCrosshairSimpleBold,
  PiChartBarBold,
  PiMedalBold,
  PiTargetBold,
  PiNotePencilBold,
  PiUserCircleBold,
  PiFlagBold,
  PiMagnifyingGlassBold,
  PiClipboardTextBold,
  PiFilePlusBold,
  PiStarBold,
  PiLinkBold,
  PiListChecksBold,
  PiTrashBold,
} from "react-icons/pi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import type { Session, ClaimCondition, ServiceHistory, DiscoveredCondition } from "@shared/schema";

type AppStep = "service-history" | "discovery-upload" | "discovery-review" | "upload" | "review" | "interview" | "export";

const STEP_LABELS: { key: AppStep; label: string; icon: React.ElementType }[] = [
  { key: "service-history", label: "Service", icon: PiFlagBold },
  { key: "discovery-upload", label: "Records", icon: PiFilePlusBold },
  { key: "discovery-review", label: "Discovery", icon: PiMagnifyingGlassBold },
  { key: "review", label: "Review", icon: PiFileTextBold },
  { key: "interview", label: "Interview", icon: PiChatTextBold },
  { key: "export", label: "Export", icon: PiDownloadSimpleBold },
];

const SERVICE_ERAS = [
  { value: "post-911", label: "Post-9/11 (2001–Present)", desc: "PACT Act, burn pits, GWOT" },
  { value: "gulf-war", label: "Gulf War (1990–2001)", desc: "Gulf War Syndrome presumptives" },
  { value: "cold-war", label: "Cold War (1975–1990)", desc: "Camp Lejeune, nuclear testing" },
  { value: "vietnam", label: "Vietnam Era (1962–1975)", desc: "Agent Orange presumptives" },
  { value: "korean-war", label: "Korean War (1950–1953)", desc: "Cold injury, POW presumptives" },
  { value: "pre-korean", label: "WWII / Pre-Korean", desc: "POW, radiation exposure" },
] as const;

const BRANCHES = ["Army", "Navy", "Air Force", "Marines", "Coast Guard", "Space Force"];

const COMMON_EXPOSURES = [
  "Burn Pits", "Agent Orange / Herbicides", "Depleted Uranium", "Radiation / Nuclear Testing",
  "Camp Lejeune Water", "Asbestos", "PFAS / PFOS", "Oil Well Fires",
  "Chemical Warfare Agents", "Noise (Weapons/Machinery/Aircraft)",
];

export default function AppPage() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<AppStep>("service-history");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeConditionIndex, setActiveConditionIndex] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [exportData, setExportData] = useState<any>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const discoveryFileInputRef = useRef<HTMLInputElement>(null);

  // Service history form state
  const [serviceForm, setServiceForm] = useState<ServiceHistory>({
    branch: "",
    rank: "",
    mos: "",
    serviceStart: "",
    serviceEnd: "",
    serviceEra: undefined,
    deployments: [],
    exposures: [],
    combatService: false,
  });
  const [deploymentInput, setDeploymentInput] = useState("");
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryStage, setDiscoveryStage] = useState(0);
  const [discoveryElapsed, setDiscoveryElapsed] = useState(0);
  const discoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadingRecords, setUploadingRecords] = useState(false);

  useEffect(() => {
    async function init() {
      const res = await apiRequest("POST", "/api/session");
      const data = await res.json();
      setSession(data);
    }
    init();
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", session.id);

      const res = await fetch(
        ("__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__") + "/api/parse-claim",
        { method: "POST", body: formData }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Upload failed");
      }

      const data = await res.json();
      setSession(data);
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Failed to upload and parse claim");
    } finally {
      setLoading(false);
    }
  };

  const startConditionInterview = async (index: number) => {
    if (!session) return;
    const condition = session.conditions[index];
    if (!condition) return;

    setActiveConditionIndex(index);
    setStep("interview");
    setChatLoading(true);

    try {
      const res = await apiRequest("POST", "/api/interview/start", {
        sessionId: session.id,
        conditionId: condition.id,
      });
      const data = await res.json();

      setSession(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.conditions = [...updated.conditions];
        updated.conditions[index] = data.condition;
        return updated;
      });
      scrollToBottom();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChatLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !session || chatLoading) return;
    const condition = session.conditions[activeConditionIndex];
    if (!condition) return;

    const message = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    setSession(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      updated.conditions = [...updated.conditions];
      const c = { ...updated.conditions[activeConditionIndex] };
      c.interviewMessages = [...c.interviewMessages, { role: "user" as const, content: message }];
      updated.conditions[activeConditionIndex] = c;
      return updated;
    });
    scrollToBottom();

    try {
      const res = await apiRequest("POST", "/api/interview", {
        sessionId: session.id,
        conditionId: condition.id,
        userMessage: message,
      });
      const data = await res.json();

      setSession(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.conditions = [...updated.conditions];
        updated.conditions[activeConditionIndex] = data.condition;
        return updated;
      });

      if (data.interviewComplete) {
        // Auto-analyze this condition
        analyzeCondition(activeConditionIndex);

        // Auto-advance to the next incomplete condition after a brief delay
        scrollToBottom();
        const nextIncomplete = session.conditions.findIndex(
          (c, idx) => idx > activeConditionIndex && !c.interviewComplete
        );
        if (nextIncomplete !== -1) {
          setTimeout(() => {
            startConditionInterview(nextIncomplete);
          }, 3000); // 3 second delay so veteran sees the completion summary
        }
      }

      scrollToBottom();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChatLoading(false);
    }
  };

  const analyzeCondition = async (index: number) => {
    if (!session) return;
    const condition = session.conditions[index];
    if (!condition) return;

    setAnalyzing(true);
    try {
      const res = await apiRequest("POST", "/api/analyze", {
        sessionId: session.id,
        conditionId: condition.id,
      });
      const data = await res.json();
      setSession(data.session);
    } catch (err: any) {
      console.error("Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const nextCondition = () => {
    if (!session) return;
    if (activeConditionIndex < session.conditions.length - 1) {
      startConditionInterview(activeConditionIndex + 1);
    }
  };

  const prevCondition = () => {
    if (activeConditionIndex > 0) {
      startConditionInterview(activeConditionIndex - 1);
    }
  };

  const handleExport = async () => {
    if (!session) return;
    setExportLoading(true);
    setStep("export");

    try {
      await apiRequest("POST", "/api/analyze-all", { sessionId: session.id });
      const res = await apiRequest("POST", "/api/export", { sessionId: session.id });
      const data = await res.json();
      setExportData(data);

      const sessionRes = await apiRequest("GET", `/api/session/${session.id}`);
      const updatedSession = await sessionRes.json();
      setSession(updatedSession);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const downloadDocument = () => {
    if (!exportData?.document) return;
    const blob = new Blob([exportData.document], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "VA_Claim_Rewritten.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Discovery Pipeline Handlers ───

  const saveServiceHistory = async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/service-history", {
        sessionId: session.id,
        serviceHistory: serviceForm,
      });
      const data = await res.json();
      setSession(data);
      setStep("discovery-upload");
    } catch (err: any) {
      setError(err.message || "Failed to save service history");
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoveryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !session) return;

    setUploadingRecords(true);
    setError("");

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("sessionId", session.id);

      const res = await fetch(
        ("__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__") + "/api/discovery/upload",
        { method: "POST", body: formData }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Upload failed");
      }

      const data = await res.json();
      setSession(data.session);
    } catch (err: any) {
      setError(err.message || "Failed to upload records");
    } finally {
      setUploadingRecords(false);
      if (discoveryFileInputRef.current) discoveryFileInputRef.current.value = "";
    }
  };

  const analyzeRecords = async () => {
    if (!session) return;
    setDiscoveryLoading(true);
    setDiscoveryStage(0);
    setDiscoveryElapsed(0);
    setError("");

    // Start elapsed timer
    const startTime = Date.now();
    discoveryTimerRef.current = setInterval(() => {
      setDiscoveryElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Advance through stages on timers to show progress
    const stageTimers = [
      setTimeout(() => setDiscoveryStage(1), 3000),   // Extracting text
      setTimeout(() => setDiscoveryStage(2), 8000),   // Identifying conditions
      setTimeout(() => setDiscoveryStage(3), 15000),  // Cross-referencing CFR
      setTimeout(() => setDiscoveryStage(4), 25000),  // Mapping secondary chains
      setTimeout(() => setDiscoveryStage(5), 40000),  // Checking presumptives
    ];

    try {
      const res = await apiRequest("POST", "/api/discovery/analyze", {
        sessionId: session.id,
      });
      const data = await res.json();
      setSession(data.session);
      setStep("discovery-review");
    } catch (err: any) {
      setError(err.message || "Failed to analyze records");
    } finally {
      setDiscoveryLoading(false);
      setDiscoveryStage(0);
      setDiscoveryElapsed(0);
      if (discoveryTimerRef.current) clearInterval(discoveryTimerRef.current);
      stageTimers.forEach(t => clearTimeout(t));
    }
  };

  const toggleDiscoveredCondition = async (conditionId: string) => {
    if (!session) return;
    try {
      const res = await apiRequest("POST", "/api/discovery/toggle", {
        sessionId: session.id,
        conditionId,
      });
      const data = await res.json();
      setSession(data.session);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const confirmDiscovery = async () => {
    if (!session) return;
    setLoading(true);
    setError("");

    const selectedIds = (session.discoveredConditions || [])
      .filter(dc => dc.selected)
      .map(dc => dc.id);

    try {
      const res = await apiRequest("POST", "/api/discovery/confirm", {
        sessionId: session.id,
        selectedConditionIds: selectedIds,
      });
      const data = await res.json();
      setSession(data);
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Failed to confirm conditions");
    } finally {
      setLoading(false);
    }
  };

  const removeRecord = (recordId: string) => {
    if (!session) return;
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        medicalRecords: (prev.medicalRecords || []).filter(r => r.id !== recordId),
      };
    });
  };

  const activeCondition = session?.conditions[activeConditionIndex];

  const calculateCombinedRating = (conditions: ClaimCondition[]) => {
    const ratings = conditions
      .map(c => c.cfrAnalysis?.estimatedRating || 0)
      .filter(r => r > 0)
      .sort((a, b) => b - a);

    if (ratings.length === 0) return 0;

    let combined = 0;
    for (const rating of ratings) {
      combined = combined + (rating / 100) * (100 - combined);
    }
    return Math.round(combined / 10) * 10;
  };

  const stepIndex = STEP_LABELS.findIndex(s => s.key === step);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top nav */}
      <nav className="bg-navy-deep sticky top-0 z-50 shrink-0">
        <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            data-testid="back-home"
          >
            <img
              src="/images/logo-emblem.png"
              alt=""
              className="h-6 w-auto object-contain"
              style={{ filter: "drop-shadow(0 0 6px rgba(191, 155, 48, 0.3))" }}
            />
            <div className="flex flex-col leading-none">
              <span className="font-display font-extrabold text-sm tracking-[0.08em] text-white uppercase">
                VetClaim
              </span>
              <span
                className="font-display font-medium text-[7px] tracking-[0.3em] uppercase"
                style={{
                  background: "linear-gradient(90deg, hsl(42 55% 55%), hsl(42 40% 72%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                PRO
              </span>
            </div>
          </button>

          {/* Step progress */}
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((s, i) => {
              const isActive = step === s.key;
              const isPast = stepIndex > i;
              return (
                <div key={s.key} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${
                    isActive
                      ? "bg-gold/15"
                      : ""
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-display font-bold ${
                      isActive
                        ? "bg-gold text-navy-deep"
                        : isPast
                        ? "bg-olive/80 text-white"
                        : "bg-white/10 text-white/30"
                    }`}>
                      {isPast ? (
                        <PiCheckCircleBold className="w-3 h-3" />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </div>
                    <span className={`text-xs font-display font-medium uppercase tracking-wider hidden sm:inline ${
                      isActive ? "text-gold" : isPast ? "text-white/50" : "text-white/25"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={`w-4 h-px mx-0.5 hidden sm:block ${
                      isPast ? "bg-olive/50" : "bg-white/10"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="gold-stripe" />
      </nav>

      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs text-destructive text-center flex items-center justify-center gap-2 mx-4 mt-2 rounded-xl">
          <PiWarningCircleBold className="w-3.5 h-3.5" />
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">

        {/* ──── Service History Step ──── */}
        {step === "service-history" && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-14 h-14 rounded-2xl bg-navy-deep/[0.06] flex items-center justify-center mx-auto mb-4">
                  <PiFlagBold className="w-7 h-7 text-navy" />
                </div>
                <h1 className="font-display font-bold text-2xl uppercase tracking-tight mb-2">
                  Your Service History
                </h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Tell us about your military service. This helps identify presumptive conditions
                  and service-era-specific benefits you may qualify for.
                </p>
              </div>

              <div className="space-y-6">
                {/* Service Era — the most important field */}
                <Card className="p-5 rounded-2xl border-gold/20 accent-bar-gold">
                  <label className="block text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    Service Era
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SERVICE_ERAS.map(era => (
                      <button
                        key={era.value}
                        onClick={() => setServiceForm(prev => ({ ...prev, serviceEra: era.value as any }))}
                        className={`text-left p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                          serviceForm.serviceEra === era.value
                            ? "border-gold bg-gold/5 shadow-sm"
                            : "border-border hover:border-gold/30 hover:bg-card"
                        }`}
                      >
                        <p className="text-sm font-display font-semibold">{era.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{era.desc}</p>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Basic service info */}
                <Card className="p-5 rounded-2xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Branch
                      </label>
                      <select
                        value={serviceForm.branch || ""}
                        onChange={e => setServiceForm(prev => ({ ...prev, branch: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold outline-none"
                      >
                        <option value="">Select branch</option>
                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Rank at Separation
                      </label>
                      <input
                        type="text"
                        value={serviceForm.rank || ""}
                        onChange={e => setServiceForm(prev => ({ ...prev, rank: e.target.value }))}
                        placeholder="e.g., E-5, O-3"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        MOS / Rate / AFSC
                      </label>
                      <input
                        type="text"
                        value={serviceForm.mos || ""}
                        onChange={e => setServiceForm(prev => ({ ...prev, mos: e.target.value }))}
                        placeholder="e.g., 11B, 0311, 2A3X1"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold outline-none"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer py-2">
                        <input
                          type="checkbox"
                          checked={serviceForm.combatService}
                          onChange={e => setServiceForm(prev => ({ ...prev, combatService: e.target.checked }))}
                          className="w-4 h-4 rounded border-border accent-gold"
                        />
                        <span className="text-sm">Combat service / imminent danger pay</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-[11px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Service Start
                      </label>
                      <input
                        type="date"
                        value={serviceForm.serviceStart || ""}
                        onChange={e => setServiceForm(prev => ({ ...prev, serviceStart: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Service End
                      </label>
                      <input
                        type="date"
                        value={serviceForm.serviceEnd || ""}
                        onChange={e => setServiceForm(prev => ({ ...prev, serviceEnd: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold outline-none"
                      />
                    </div>
                  </div>
                </Card>

                {/* Deployments */}
                <Card className="p-5 rounded-2xl">
                  <label className="block text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    Deployments
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={deploymentInput}
                      onChange={e => setDeploymentInput(e.target.value)}
                      placeholder="e.g., Iraq 2005-2006, Afghanistan 2010"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold outline-none"
                      onKeyDown={e => {
                        if (e.key === "Enter" && deploymentInput.trim()) {
                          e.preventDefault();
                          setServiceForm(prev => ({
                            ...prev,
                            deployments: [...prev.deployments, { location: deploymentInput.trim() }],
                          }));
                          setDeploymentInput("");
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (deploymentInput.trim()) {
                          setServiceForm(prev => ({
                            ...prev,
                            deployments: [...prev.deployments, { location: deploymentInput.trim() }],
                          }));
                          setDeploymentInput("");
                        }
                      }}
                      className="rounded-xl text-xs font-display uppercase"
                    >
                      Add
                    </Button>
                  </div>
                  {serviceForm.deployments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {serviceForm.deployments.map((d, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[11px] cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                          onClick={() => setServiceForm(prev => ({
                            ...prev,
                            deployments: prev.deployments.filter((_, idx) => idx !== i),
                          }))}
                        >
                          {d.location} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Exposures */}
                <Card className="p-5 rounded-2xl">
                  <label className="block text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    Known Exposures
                  </label>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Select any toxic exposures during your service. This is critical for presumptive conditions.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {COMMON_EXPOSURES.map(exp => (
                      <label
                        key={exp}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                          serviceForm.exposures.includes(exp)
                            ? "border-gold bg-gold/5"
                            : "border-border hover:border-gold/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={serviceForm.exposures.includes(exp)}
                          onChange={() => {
                            setServiceForm(prev => ({
                              ...prev,
                              exposures: prev.exposures.includes(exp)
                                ? prev.exposures.filter(e => e !== exp)
                                : [...prev.exposures, exp],
                            }));
                          }}
                          className="w-3.5 h-3.5 rounded accent-gold"
                        />
                        <span className="text-xs">{exp}</span>
                      </label>
                    ))}
                  </div>
                </Card>

                {/* Continue */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs font-display uppercase tracking-wide"
                    onClick={() => {
                      // Skip service history, go straight to upload
                      setStep("upload");
                    }}
                  >
                    Skip — I have a written claim
                  </Button>
                  <Button
                    onClick={saveServiceHistory}
                    disabled={loading || !serviceForm.serviceEra}
                    className="gap-2 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide text-xs"
                  >
                    {loading ? (
                      <PiCircleNotchBold className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Continue to Records Upload
                        <PiCaretRightBold className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──── Discovery Upload Step ──── */}
        {step === "discovery-upload" && session && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-14 h-14 rounded-2xl bg-navy-deep/[0.06] flex items-center justify-center mx-auto mb-4">
                  <PiFilePlusBold className="w-7 h-7 text-navy" />
                </div>
                <h1 className="font-display font-bold text-2xl uppercase tracking-tight mb-2">
                  Upload Medical Records
                </h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Upload your STRs, VA medical records, GENESIS files, or private treatment records.
                  Our AI will analyze them to find every claimable condition.
                </p>
              </div>

              {/* Upload zone */}
              <Card
                className="p-8 text-center cursor-pointer border-2 border-dashed border-border hover:border-gold/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 rounded-2xl group mb-6"
                onClick={() => discoveryFileInputRef.current?.click()}
              >
                {uploadingRecords ? (
                  <div className="flex flex-col items-center gap-3">
                    <PiCircleNotchBold className="w-8 h-8 animate-spin text-gold" />
                    <p className="text-sm text-muted-foreground">Processing your records...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-gold/15 transition-colors">
                      <PiUploadSimpleBold className="w-6 h-6 text-gold-dark" />
                    </div>
                    <p className="text-sm font-display font-semibold uppercase tracking-tight mb-1">
                      Drop files or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX, or TXT — upload multiple files at once
                    </p>
                    <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                      {["HAIMS", "GENESIS", "STRs", "Private Records", "VA Forms"].map(t => (
                        <Badge key={t} variant="outline" className="text-[10px] font-display uppercase tracking-wider">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
                <input
                  ref={discoveryFileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt"
                  multiple
                  onChange={handleDiscoveryUpload}
                />
              </Card>

              {/* Uploaded records list */}
              {(session.medicalRecords || []).length > 0 && (
                <div className="space-y-2 mb-6">
                  <p className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground">
                    {session.medicalRecords!.length} Record{session.medicalRecords!.length !== 1 ? "s" : ""} Uploaded
                  </p>
                  {session.medicalRecords!.map(record => (
                    <Card key={record.id} className="p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          record.status === "analyzed" ? "bg-olive/10" :
                          record.status === "error" ? "bg-destructive/10" :
                          "bg-gold/10"
                        }`}>
                          {record.status === "analyzed" ? (
                            <PiCheckCircleBold className="w-4 h-4 text-olive" />
                          ) : record.status === "error" ? (
                            <PiXCircleBold className="w-4 h-4 text-destructive" />
                          ) : (
                            <PiCircleNotchBold className="w-4 h-4 animate-spin text-gold" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-display font-semibold truncate">{record.fileName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                              {record.fileType.replace("_", " ")}
                            </Badge>
                            {record.pageCount > 0 && (
                              <span className="text-[10px] text-muted-foreground">{record.pageCount} pages</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeRecord(record.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      >
                        <PiTrashBold className="w-3.5 h-3.5" />
                      </button>
                    </Card>
                  ))}
                </div>
              )}

              {/* Analysis progress or actions */}
              {discoveryLoading ? (
                <Card className="p-6 rounded-2xl border-gold/20 accent-bar-gold">
                  {(() => {
                    const stages = [
                      { label: "Preparing records for analysis", icon: PiFileTextBold },
                      { label: "Extracting medical text from documents", icon: PiClipboardTextBold },
                      { label: "Identifying diagnoses and conditions", icon: PiMagnifyingGlassBold },
                      { label: "Cross-referencing against 38 CFR Part 4", icon: PiTargetBold },
                      { label: "Mapping secondary condition chains", icon: PiLinkBold },
                      { label: "Checking presumptive conditions for your service era", icon: PiStarBold },
                    ];
                    const recordCount = (session.medicalRecords || []).filter(r => r.status === "analyzed").length;
                    const totalPages = (session.medicalRecords || []).reduce((sum, r) => sum + (r.pageCount || 0), 0);

                    return (
                      <div>
                        <div className="flex items-center gap-3 mb-5">
                          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                            <PiCircleNotchBold className="w-5 h-5 animate-spin text-gold" />
                          </div>
                          <div>
                            <p className="text-sm font-display font-semibold uppercase tracking-tight">
                              Analyzing {recordCount} record{recordCount !== 1 ? "s" : ""}
                              {totalPages > 0 ? ` (${totalPages} pages)` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Elapsed: {Math.floor(discoveryElapsed / 60)}:{String(discoveryElapsed % 60).padStart(2, "0")}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {stages.map((stage, i) => {
                            const Icon = stage.icon;
                            const isComplete = discoveryStage > i;
                            const isCurrent = discoveryStage === i;
                            return (
                              <div
                                key={i}
                                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-500 ${
                                  isCurrent ? "bg-gold/[0.07]" : ""
                                }`}
                              >
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                                  isComplete ? "bg-olive/15" :
                                  isCurrent ? "bg-gold/15" :
                                  "bg-muted/30"
                                }`}>
                                  {isComplete ? (
                                    <PiCheckCircleBold className="w-3.5 h-3.5 text-olive" />
                                  ) : isCurrent ? (
                                    <PiCircleNotchBold className="w-3.5 h-3.5 animate-spin text-gold" />
                                  ) : (
                                    <Icon className="w-3.5 h-3.5 text-muted-foreground/40" />
                                  )}
                                </div>
                                <span className={`text-xs transition-colors duration-300 ${
                                  isComplete ? "text-olive font-medium" :
                                  isCurrent ? "text-foreground font-medium" :
                                  "text-muted-foreground/50"
                                }`}>
                                  {stage.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Progress bar */}
                        <div className="mt-4 w-full bg-border/50 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-gold transition-all duration-1000 ease-out"
                            style={{ width: `${Math.min(((discoveryStage + 1) / 6) * 100, 95)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center mt-2">
                          Deep analysis with AI — this typically takes 30–60 seconds
                        </p>
                      </div>
                    );
                  })()}
                </Card>
              ) : (
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs font-display uppercase tracking-wide"
                    onClick={() => setStep("upload")}
                  >
                    Skip — I have a written claim
                  </Button>
                  <Button
                    onClick={analyzeRecords}
                    disabled={!(session.medicalRecords || []).some(r => r.status === "analyzed")}
                    className="gap-2 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide text-xs"
                  >
                    <PiMagnifyingGlassBold className="w-4 h-4" />
                    Discover Claimable Conditions
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──── Discovery Review Step ──── */}
        {step === "discovery-review" && session && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left — Discovered conditions list */}
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="font-display font-bold text-2xl uppercase tracking-tight">
                      Conditions Discovered
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      We found {(session.discoveredConditions || []).length} potential conditions.
                      Deselect any you don't want to pursue.
                    </p>
                  </div>
                  <Button
                    onClick={confirmDiscovery}
                    disabled={loading || !(session.discoveredConditions || []).some(dc => dc.selected)}
                    className="gap-2 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide text-xs"
                  >
                    {loading ? (
                      <PiCircleNotchBold className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Proceed to Interview
                        <PiCaretRightBold className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>

                {/* Group by claim type */}
                {(["direct", "secondary", "presumptive", "aggravation"] as const).map(claimType => {
                  const conditions = (session.discoveredConditions || []).filter(dc => dc.claimType === claimType);
                  if (conditions.length === 0) return null;

                  return (
                    <div key={claimType} className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className={`text-[11px] uppercase tracking-widest font-display ${
                          claimType === "direct" ? "bg-navy-deep text-white" :
                          claimType === "secondary" ? "bg-gold/20 text-gold-dark border border-gold/30" :
                          claimType === "presumptive" ? "bg-olive/15 text-olive-dark border border-olive/30" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {claimType === "direct" ? "Direct Service Connection" :
                           claimType === "secondary" ? "Secondary Condition" :
                           claimType === "presumptive" ? "Presumptive" :
                           "Aggravation"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {conditions.length} condition{conditions.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {conditions.map(dc => (
                          <Card
                            key={dc.id}
                            className={`p-4 rounded-xl transition-all duration-200 cursor-pointer ${
                              dc.selected
                                ? "border-l-4 border-l-gold shadow-sm"
                                : "opacity-50 border-l-4 border-l-transparent"
                            }`}
                            onClick={() => toggleDiscoveredCondition(dc.id)}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={dc.selected}
                                readOnly
                                className="w-4 h-4 mt-0.5 rounded accent-gold shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h3 className="text-sm font-display font-semibold uppercase tracking-tight">
                                    {dc.name}
                                  </h3>
                                  <Badge variant="secondary" className="text-[10px] uppercase tracking-widest font-display">
                                    {dc.category.replace("_", " ")}
                                  </Badge>
                                  <Badge className={`text-[10px] ${
                                    dc.evidenceStrength === "strong" ? "bg-olive/15 text-olive-dark" :
                                    dc.evidenceStrength === "moderate" ? "bg-gold/15 text-gold-dark" :
                                    "bg-destructive/10 text-destructive"
                                  }`}>
                                    {dc.evidenceStrength} evidence
                                  </Badge>
                                </div>

                                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                                  {dc.description}
                                </p>

                                {/* Secondary chain */}
                                {dc.parentCondition && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-gold-dark mb-2">
                                    <PiLinkBold className="w-3 h-3" />
                                    <span>Secondary to: <strong>{dc.parentCondition}</strong></span>
                                  </div>
                                )}

                                {/* Presumptive category */}
                                {dc.presumptiveCategory && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-olive-dark mb-2">
                                    <PiStarBold className="w-3 h-3" />
                                    <span>{dc.presumptiveCategory}</span>
                                  </div>
                                )}

                                {/* Key evidence */}
                                {dc.keyEvidence.length > 0 && (
                                  <div className="mb-2">
                                    <p className="text-[10px] uppercase tracking-widest font-display font-semibold text-muted-foreground mb-1">
                                      Evidence Found
                                    </p>
                                    {dc.keyEvidence.slice(0, 3).map((ev, j) => (
                                      <div key={j} className="flex items-start gap-1.5 text-[11px] text-olive">
                                        <PiCheckCircleBold className="w-3 h-3 mt-0.5 shrink-0" />
                                        <span>{ev}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Missing evidence */}
                                {dc.missingEvidence.length > 0 && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-widest font-display font-semibold text-muted-foreground mb-1">
                                      Still Needed
                                    </p>
                                    {dc.missingEvidence.slice(0, 2).map((ev, j) => (
                                      <div key={j} className="flex items-start gap-1.5 text-[11px] text-destructive">
                                        <PiWarningCircleBold className="w-3 h-3 mt-0.5 shrink-0" />
                                        <span>{ev}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Source files & ICD codes */}
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {dc.sourceRecords.map((src, j) => (
                                    <Badge key={j} variant="outline" className="text-[9px] font-mono">
                                      {src.length > 30 ? src.substring(0, 30) + "..." : src}
                                    </Badge>
                                  ))}
                                  {dc.icdCodes.map((code, j) => (
                                    <Badge key={`icd-${j}`} variant="outline" className="text-[9px] font-mono bg-navy-deep/5">
                                      ICD: {code}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right — Summary panel */}
            <div className="w-[320px] border-l border-border bg-card/50 hidden lg:flex lg:flex-col overflow-hidden">
              <div className="p-4 overflow-y-auto flex-1">
                <h2 className="text-sm font-display font-bold uppercase tracking-tight mb-3 flex items-center gap-2">
                  <PiListChecksBold className="w-4 h-4 text-gold" />
                  Discovery Summary
                </h2>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <Card className="p-3 rounded-xl text-center">
                    <p className="text-2xl font-display font-extrabold text-navy">
                      {(session.discoveredConditions || []).filter(dc => dc.selected).length}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest font-display text-muted-foreground">Selected</p>
                  </Card>
                  <Card className="p-3 rounded-xl text-center">
                    <p className="text-2xl font-display font-extrabold text-navy">
                      {(session.medicalRecords || []).length}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest font-display text-muted-foreground">Records</p>
                  </Card>
                </div>

                {/* Claim type breakdown */}
                <Card className="p-3 rounded-xl mb-4">
                  <p className="text-[10px] uppercase tracking-widest font-display font-semibold text-muted-foreground mb-2">
                    By Claim Type
                  </p>
                  {(["direct", "secondary", "presumptive", "aggravation"] as const).map(type => {
                    const count = (session.discoveredConditions || []).filter(dc => dc.claimType === type && dc.selected).length;
                    if (count === 0) return null;
                    return (
                      <div key={type} className="flex items-center justify-between py-1">
                        <span className="text-xs capitalize">{type}</span>
                        <Badge variant="outline" className="text-[10px]">{count}</Badge>
                      </div>
                    );
                  })}
                </Card>

                {/* Evidence strength breakdown */}
                <Card className="p-3 rounded-xl mb-4">
                  <p className="text-[10px] uppercase tracking-widest font-display font-semibold text-muted-foreground mb-2">
                    Evidence Strength
                  </p>
                  {(["strong", "moderate", "weak"] as const).map(strength => {
                    const count = (session.discoveredConditions || []).filter(dc => dc.evidenceStrength === strength && dc.selected).length;
                    if (count === 0) return null;
                    return (
                      <div key={strength} className="flex items-center justify-between py-1">
                        <span className={`text-xs capitalize ${
                          strength === "strong" ? "text-olive" :
                          strength === "moderate" ? "text-gold-dark" :
                          "text-destructive"
                        }`}>{strength}</span>
                        <Badge variant="outline" className="text-[10px]">{count}</Badge>
                      </div>
                    );
                  })}
                </Card>

                {/* Service era info */}
                {session.serviceHistory?.serviceEra && (
                  <Card className="p-3 rounded-xl accent-bar-olive">
                    <p className="text-[10px] uppercase tracking-widest font-display font-semibold text-muted-foreground mb-1">
                      Service Era Benefits
                    </p>
                    <p className="text-xs text-foreground/80">
                      {SERVICE_ERAS.find(e => e.value === session.serviceHistory!.serviceEra)?.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {SERVICE_ERAS.find(e => e.value === session.serviceHistory!.serviceEra)?.desc}
                    </p>
                  </Card>
                )}

                <Button
                  onClick={confirmDiscovery}
                  disabled={loading || !(session.discoveredConditions || []).some(dc => dc.selected)}
                  className="w-full mt-4 gap-2 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide text-xs"
                >
                  Proceed to Interview
                  <PiCaretRightBold className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ──── Upload Step ──── */}
        {step === "upload" && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-lg w-full space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-navy-deep/[0.06] flex items-center justify-center mx-auto mb-4">
                  <PiUploadSimpleBold className="w-7 h-7 text-navy" />
                </div>
                <h1 className="font-display font-bold text-2xl uppercase tracking-tight mb-2">
                  Let's get started
                </h1>
                <p className="text-sm text-muted-foreground">
                  Upload an existing VA claim or start a guided interview
                </p>
              </div>

              <Card
                className="p-8 text-center cursor-pointer border-2 border-dashed border-border hover:border-gold/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 rounded-2xl group"
                onClick={() => fileInputRef.current?.click()}
                data-testid="upload-area"
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <PiCircleNotchBold className="w-8 h-8 animate-spin text-gold" />
                    <p className="text-sm text-muted-foreground">Parsing your claim...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-gold/15 transition-colors">
                      <PiFileTextBold className="w-6 h-6 text-gold-dark" />
                    </div>
                    <p className="text-sm font-display font-semibold uppercase tracking-tight mb-1">
                      Upload your VA claim
                    </p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  data-testid="file-input"
                />
              </Card>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-4 py-0.5 text-xs text-muted-foreground/70 font-display uppercase tracking-wider rounded-full">
                    or
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full gap-2 font-display uppercase tracking-wide text-xs rounded-xl"
                onClick={async () => {
                  if (!session) return;
                  setStep("interview");
                  setSession(prev => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      conditions: [{
                        id: "manual-" + Date.now(),
                        name: "General Interview",
                        category: "general",
                        description: "",
                        status: "current",
                        interviewComplete: false,
                        interviewMessages: [],
                        cfrAnalysis: { strengths: [], weaknesses: [] },
                        medicalEvidence: [],
                      }],
                    };
                  });
                  setActiveConditionIndex(0);
                }}
                data-testid="start-interview-btn"
              >
                <PiChatTextBold className="w-4 h-4" />
                Start a guided interview instead
              </Button>
            </div>
          </div>
        )}

        {/* ──── Review Step ──── */}
        {step === "review" && session && (
          <div className="flex-1 p-6 overflow-auto">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="font-display font-bold text-2xl uppercase tracking-tight">
                    Conditions Found
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    We identified {session.conditions.length} conditions in your claim. Review and begin the interview.
                  </p>
                </div>
                <Button
                  onClick={() => startConditionInterview(0)}
                  className="gap-2 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide text-xs"
                  data-testid="begin-interview-btn"
                >
                  Begin Interview
                  <PiCaretRightBold className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3">
                {session.conditions.map((condition, i) => (
                  <Card
                    key={condition.id}
                    className="p-4 accent-bar-gold hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer rounded-xl"
                    data-testid={`condition-card-${i}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-display font-semibold uppercase tracking-tight">
                            {condition.name}
                          </h3>
                          <Badge variant="secondary" className="text-[11px] uppercase tracking-widest font-display">
                            {condition.category.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {condition.description}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startConditionInterview(i)}
                        className="shrink-0 text-xs font-display uppercase tracking-wide"
                        data-testid={`interview-condition-${i}`}
                      >
                        Interview
                        <PiCaretRightBold className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ──── Interview Step ──── */}
        {step === "interview" && session && activeCondition && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left — condition tabs + chat */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Condition tabs */}
              <div className="border-b border-border shrink-0 overflow-x-auto bg-card/50">
                <div className="flex px-3 gap-1 py-2">
                  {session.conditions.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => startConditionInterview(i)}
                      className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wide whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
                        i === activeConditionIndex
                          ? "bg-navy-deep text-white font-semibold"
                          : c.interviewComplete
                          ? "bg-olive/10 text-olive-dark border border-olive/20"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                      data-testid={`tab-condition-${i}`}
                    >
                      {c.interviewComplete && <PiCheckCircleBold className="w-3 h-3 text-olive" />}
                      <span className="max-w-[120px] truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat area */}
              <ScrollArea className="flex-1 p-4">
                <div className="max-w-2xl mx-auto space-y-4">
                  {/* Original claim context */}
                  {activeCondition.description && (
                    <div className="bg-navy-deep/[0.03] rounded-xl p-3 border border-navy/10 mb-4 accent-bar-olive">
                      <p className="text-[11px] uppercase tracking-widest font-display font-semibold text-muted-foreground mb-1.5">
                        Original Claim Statement
                      </p>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        {activeCondition.description}
                      </p>
                    </div>
                  )}

                  {activeCondition.interviewMessages.map((msg, i) => (
                    <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role !== "user" && (
                        <div className="w-7 h-7 rounded-full bg-gold/10 flex items-center justify-center shrink-0 mb-0.5">
                          <PiShieldStarBold className="w-5 h-5 text-gold" />
                        </div>
                      )}
                      <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-navy-deep text-white chat-bubble-user"
                          : "bg-card border border-card-border chat-bubble-ai"
                      }`}>
                        {msg.content}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 rounded-full bg-navy-deep/10 flex items-center justify-center shrink-0 mb-0.5">
                          <PiUserCircleBold className="w-5 h-5 text-navy-deep/60" />
                        </div>
                      )}
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-card-border rounded-2xl px-4 py-3 flex gap-1 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-gold/60 typing-dot" />
                        <span className="w-2 h-2 rounded-full bg-gold/60 typing-dot" />
                        <span className="w-2 h-2 rounded-full bg-gold/60 typing-dot" />
                      </div>
                    </div>
                  )}

                  {activeCondition.interviewComplete && (
                    <div className="bg-olive/[0.06] rounded-2xl p-5 border border-olive/15 text-center">
                      <PiCheckCircleBold className="w-6 h-6 mx-auto mb-2 text-olive" />
                      <p className="text-sm font-display font-semibold text-olive-dark uppercase tracking-tight">
                        Interview complete for {activeCondition.name}
                      </p>
                      {activeConditionIndex < session.conditions.length - 1 &&
                       session.conditions.some((c, idx) => idx > activeConditionIndex && !c.interviewComplete) && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Moving to next condition shortly...
                        </p>
                      )}
                      {activeConditionIndex >= session.conditions.length - 1 ||
                       !session.conditions.some((c, idx) => idx > activeConditionIndex && !c.interviewComplete) ? (
                        <p className="text-xs text-olive mt-1.5 font-medium">
                          All conditions interviewed — ready to generate your report
                        </p>
                      ) : null}
                      <div className="flex items-center justify-center gap-2 mt-4">
                        {activeConditionIndex < session.conditions.length - 1 && (
                          <Button
                            size="sm"
                            onClick={nextCondition}
                            className="text-xs gap-1 bg-navy-deep hover:bg-navy text-white font-display uppercase tracking-wide"
                            data-testid="next-condition-btn"
                          >
                            Next Condition Now <PiCaretRightBold className="w-3 h-3" />
                          </Button>
                        )}
                        {!session.conditions.some((c, idx) => idx > activeConditionIndex && !c.interviewComplete) && (
                          <Button
                            size="sm"
                            onClick={handleExport}
                            className="text-xs gap-1 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide"
                            data-testid="generate-report-btn"
                          >
                            <PiNotePencilBold className="w-3 h-3" /> Generate Report
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => analyzeCondition(activeConditionIndex)}
                          className="text-xs gap-1 font-display uppercase tracking-wide"
                          data-testid="analyze-btn"
                        >
                          <PiCrosshairSimpleBold className="w-3 h-3" /> Analyze Against CFR
                        </Button>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Chat input */}
              <div className="border-t border-border p-3 shrink-0 bg-card/30">
                <div className="max-w-2xl mx-auto flex gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Describe your symptoms, impact, and experiences..."
                    className="min-h-[44px] max-h-32 resize-none text-sm rounded-xl"
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    data-testid="chat-input"
                  />
                  <Button
                    size="icon"
                    onClick={sendMessage}
                    disabled={!chatInput.trim() || chatLoading}
                    className="shrink-0 h-[44px] w-[44px] bg-navy-deep hover:bg-navy rounded-xl"
                    data-testid="send-btn"
                  >
                    <PiPaperPlaneRightBold className="w-4 h-4" />
                  </Button>
                </div>
                <div className="max-w-2xl mx-auto flex items-center justify-between mt-2">
                  <div className="flex gap-2">
                    {activeConditionIndex > 0 && (
                      <Button variant="ghost" size="sm" onClick={prevCondition} className="text-xs gap-1 h-7 font-display uppercase tracking-wide">
                        <PiCaretLeftBold className="w-3 h-3" /> Previous
                      </Button>
                    )}
                    {activeConditionIndex < session.conditions.length - 1 && (
                      <Button variant="ghost" size="sm" onClick={nextCondition} className="text-xs gap-1 h-7 font-display uppercase tracking-wide">
                        Skip to Next <PiCaretRightBold className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    className="text-xs gap-1 h-7 font-display uppercase tracking-wide"
                    data-testid="export-btn"
                  >
                    <PiNotePencilBold className="w-3 h-3" /> Generate Report
                  </Button>
                </div>
              </div>
            </div>

            {/* Right — CFR Analysis Panel */}
            <div className="w-[360px] border-l border-border bg-card/50 hidden lg:flex lg:flex-col overflow-hidden">
              <div className="p-4 overflow-y-auto flex-1">
                <h2 className="text-sm font-display font-bold uppercase tracking-tight mb-3 flex items-center gap-2">
                  <PiChartBarBold className="w-4 h-4 text-gold" />
                  CFR Analysis
                </h2>

                {/* Combined rating */}
                {session.conditions.some(c => c.cfrAnalysis?.estimatedRating) && (
                  <Card className="p-4 mb-4 bg-navy-deep/[0.04] border-gold/20 accent-bar-gold rounded-xl">
                    {/* Combined rating with progress ring */}
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20">
                        <svg className="w-20 h-20" viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                          <circle
                            cx="40" cy="40" r="34" fill="none"
                            stroke="hsl(var(--gold))" strokeWidth="6"
                            strokeDasharray={`${2 * Math.PI * 34}`}
                            strokeDashoffset={`${2 * Math.PI * 34 * (1 - calculateCombinedRating(session.conditions) / 100)}`}
                            strokeLinecap="round"
                            className="progress-ring-circle"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-display font-extrabold text-navy">
                            {calculateCombinedRating(session.conditions)}%
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-widest font-display font-semibold text-muted-foreground">
                          Est. Combined Rating
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">VA bilateral factor applied</p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Per-condition analysis */}
                <div className="space-y-3">
                  {session.conditions.map((condition, i) => {
                    const cfr = condition.cfrAnalysis;
                    const hasAnalysis = cfr?.estimatedRating !== undefined && cfr.estimatedRating > 0;
                    const isActive = i === activeConditionIndex;

                    return (
                      <Card
                        key={condition.id}
                        className={`p-3 transition-colors cursor-pointer rounded-xl ${
                          isActive ? "ring-2 ring-gold/40 shadow-md accent-bar-gold" : ""
                        }`}
                        onClick={() => startConditionInterview(i)}
                        data-testid={`analysis-card-${i}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-display font-semibold uppercase tracking-tight truncate">
                              {condition.name}
                            </p>
                            {cfr?.diagnosticCode && (
                              <p className="text-[11px] text-muted-foreground font-mono">
                                DC {cfr.diagnosticCode}
                              </p>
                            )}
                          </div>
                          {hasAnalysis ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-sm font-display font-bold ${
                                cfr!.currentLanguageScore === "strong" ? "text-olive" :
                                cfr!.currentLanguageScore === "moderate" ? "text-gold-dark" :
                                "text-destructive"
                              }`}>
                                {cfr!.estimatedRating}%
                              </span>
                              {cfr!.currentLanguageScore === "strong" ? (
                                <PiCheckCircleBold className="w-4 h-4 text-olive" />
                              ) : cfr!.currentLanguageScore === "weak" ? (
                                <PiXCircleBold className="w-4 h-4 text-destructive" />
                              ) : (
                                <PiWarningCircleBold className="w-4 h-4 text-gold-dark" />
                              )}
                            </div>
                          ) : analyzing && isActive ? (
                            <PiCircleNotchBold className="w-4 h-4 animate-spin text-gold shrink-0" />
                          ) : (
                            <span className="text-[11px] text-muted-foreground shrink-0 font-display uppercase tracking-wider">
                              Pending
                            </span>
                          )}
                        </div>

                        {hasAnalysis && (
                          <div className="w-full bg-border/50 rounded-full h-1.5 mt-2">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-500 ${
                                cfr!.currentLanguageScore === "strong" ? "bg-olive" :
                                cfr!.currentLanguageScore === "moderate" ? "bg-gold" :
                                "bg-destructive"
                              }`}
                              style={{ width: `${cfr!.estimatedRating}%` }}
                            />
                          </div>
                        )}

                        {hasAnalysis && (
                          <div className="mt-2 space-y-1.5">
                            {cfr!.strengths?.length > 0 && (
                              <div>
                                {cfr!.strengths.slice(0, 2).map((s, j) => (
                                  <div key={j} className="flex items-start gap-1.5 text-[11px] text-olive">
                                    <PiCheckCircleBold className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span className="line-clamp-1">{s}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {cfr!.weaknesses?.length > 0 && (
                              <div>
                                {cfr!.weaknesses.slice(0, 2).map((w, j) => (
                                  <div key={j} className="flex items-start gap-1.5 text-[11px] text-destructive">
                                    <PiXCircleBold className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span className="line-clamp-1">{w}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>

                {/* Analyze all button */}
                {session.conditions.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4 text-xs gap-1.5 font-display uppercase tracking-wide"
                    onClick={handleExport}
                    data-testid="analyze-all-btn"
                  >
                    <PiTargetBold className="w-3 h-3" />
                    Analyze All & Generate Report
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ──── Export Step ──── */}
        {step === "export" && session && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left — Generated document */}
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="font-display font-bold text-2xl uppercase tracking-tight">
                      Your Rewritten Claim
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Reviewed and rewritten using 38 CFR Part 4 language
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStep("interview")}
                      className="text-xs gap-1 font-display uppercase tracking-wide"
                    >
                      <PiArrowLeftBold className="w-3 h-3" /> Back to Interview
                    </Button>
                    <Button
                      size="sm"
                      onClick={downloadDocument}
                      disabled={!exportData?.document}
                      className="text-xs gap-1 bg-gold hover:bg-gold-dark text-navy-deep font-display font-semibold uppercase tracking-wide"
                      data-testid="download-btn"
                    >
                      <PiDownloadSimpleBold className="w-3 h-3" /> Download
                    </Button>
                  </div>
                </div>

                {exportLoading ? (
                  <Card className="p-12 text-center rounded-2xl">
                    <PiCircleNotchBold className="w-10 h-10 animate-spin mx-auto text-gold mb-4" />
                    <p className="text-base font-display font-semibold uppercase tracking-tight">
                      Building your claim document...
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">Analyzing all conditions against 38 CFR Part 4</p>
                    <div className="flex items-center justify-center gap-3 mt-6">
                      <div className="flex items-center gap-2 text-xs text-olive">
                        <PiCheckCircleBold className="w-3.5 h-3.5" />
                        <span>Conditions reviewed</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gold">
                        <PiCircleNotchBold className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating document</span>
                      </div>
                    </div>
                  </Card>
                ) : exportData?.document ? (
                  <Card className="p-6 accent-bar-gold paper-effect rounded-2xl">
                    <div className="prose prose-sm max-w-none">
                      {exportData.document.split("\n").map((line: string, i: number) => (
                        <p key={i} className={`text-sm leading-relaxed mb-2 ${
                          line.startsWith("#") ? "font-display font-bold text-base uppercase tracking-tight" :
                          line.startsWith("---") ? "border-t border-border pt-3 mt-3" :
                          ""
                        }`}>
                          {line.replace(/^#+\s*/, "")}
                        </p>
                      ))}
                    </div>
                  </Card>
                ) : (
                  <Card className="p-6 text-center text-muted-foreground">
                    <p className="text-sm">No document generated yet</p>
                  </Card>
                )}
              </div>
            </div>

            {/* Right — Changes summary */}
            <div className="w-[360px] border-l border-border bg-card/50 hidden lg:flex lg:flex-col overflow-hidden">
              <div className="p-4 overflow-y-auto flex-1">
                <h2 className="text-sm font-display font-bold uppercase tracking-tight mb-1">
                  Changes Summary
                </h2>
                <p className="text-[11px] text-muted-foreground mb-4">What was improved in your claim</p>

                {/* Combined rating */}
                {session.conditions.some(c => c.cfrAnalysis?.estimatedRating) && (
                  <Card className="p-4 mb-4 bg-navy-deep/[0.04] border-gold/20 accent-bar-gold rounded-xl">
                    {/* Combined rating with progress ring */}
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20">
                        <svg className="w-20 h-20" viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                          <circle
                            cx="40" cy="40" r="34" fill="none"
                            stroke="hsl(var(--gold))" strokeWidth="6"
                            strokeDasharray={`${2 * Math.PI * 34}`}
                            strokeDashoffset={`${2 * Math.PI * 34 * (1 - calculateCombinedRating(session.conditions) / 100)}`}
                            strokeLinecap="round"
                            className="progress-ring-circle"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-display font-extrabold text-navy">
                            {calculateCombinedRating(session.conditions)}%
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-widest font-display font-semibold text-muted-foreground">
                          Est. Combined Rating
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">VA bilateral factor applied</p>
                      </div>
                    </div>
                  </Card>
                )}

                <div className="space-y-3">
                  {session.conditions.map((condition, i) => {
                    const cfr = condition.cfrAnalysis;
                    const hasAnalysis = cfr?.estimatedRating !== undefined && cfr.estimatedRating > 0;

                    return (
                      <Card key={condition.id} className="p-3 rounded-xl" data-testid={`export-analysis-${i}`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-display font-semibold uppercase tracking-tight truncate flex-1 mr-2">
                            {condition.name}
                          </p>
                          {hasAnalysis ? (
                            <div className="flex items-center gap-1 shrink-0">
                              {cfr!.currentLanguageScore === "strong" ? (
                                <PiCheckCircleBold className="w-4 h-4 text-olive" />
                              ) : cfr!.currentLanguageScore === "weak" ? (
                                <PiXCircleBold className="w-4 h-4 text-destructive" />
                              ) : (
                                <PiWarningCircleBold className="w-4 h-4 text-gold-dark" />
                              )}
                              <span className="text-xs font-display font-bold">
                                {cfr!.estimatedRating}%
                              </span>
                            </div>
                          ) : exportLoading ? (
                            <PiCircleNotchBold className="w-3 h-3 animate-spin text-gold shrink-0" />
                          ) : (
                            <span className="text-[11px] text-muted-foreground shrink-0 font-display uppercase tracking-wider">
                              Pending
                            </span>
                          )}
                        </div>

                        {hasAnalysis && (
                          <>
                            {cfr!.cfrSection && (
                              <p className="text-[11px] text-muted-foreground mb-1.5 font-mono">
                                {cfr!.cfrSection}
                              </p>
                            )}
                            <div className="space-y-1">
                              {cfr!.strengths?.map((s, j) => (
                                <div key={`s-${j}`} className="flex items-start gap-1.5 text-[11px] text-olive">
                                  <PiCheckCircleBold className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{s}</span>
                                </div>
                              ))}
                              {cfr!.weaknesses?.map((w, j) => (
                                <div key={`w-${j}`} className="flex items-start gap-1.5 text-[11px] text-destructive">
                                  <PiXCircleBold className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{w}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
