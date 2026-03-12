import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import type { Session, ClaimCondition, ServiceHistory, MedicalRecord, DiscoveredCondition } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const uploadMultiple = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// In-memory session store
const sessions = new Map<string, Session>();

function categorizeCondition(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("ptsd") || n.includes("anxiety") || n.includes("mental") || n.includes("counseling") || n.includes("depression")) return "mental_health";
  if (n.includes("knee") || n.includes("hip") || n.includes("wrist") || n.includes("shoulder") || n.includes("back") || n.includes("spine") || n.includes("lumbar") || n.includes("cervical") || n.includes("neck") || n.includes("hamstring") || n.includes("thumb") || n.includes("gluteus") || n.includes("joint")) return "musculoskeletal";
  if (n.includes("hearing") || n.includes("tinnitus") || n.includes("ear")) return "auditory";
  if (n.includes("sinus") || n.includes("rhinitis") || n.includes("bronchitis") || n.includes("emphysema") || n.includes("respiratory") || n.includes("burn-pit") || n.includes("burn pit") || n.includes("cough")) return "respiratory";
  if (n.includes("diarrhea") || n.includes("ibs") || n.includes("gerd") || n.includes("heartburn") || n.includes("abdomen") || n.includes("gi") || n.includes("gastro")) return "gastrointestinal";
  if (n.includes("skin") || n.includes("rash") || n.includes("wart") || n.includes("lump") || n.includes("scar") || n.includes("laceration")) return "skin";
  if (n.includes("tbi") || n.includes("concussion") || n.includes("headache") || n.includes("migraine") || n.includes("dizziness")) return "neurological";
  if (n.includes("thyroid") || n.includes("graves")) return "endocrine";
  if (n.includes("vision") || n.includes("eye")) return "ophthalmologic";
  if (n.includes("gerd") || n.includes("heartburn") || n.includes("acid")) return "gastrointestinal";
  if (n.includes("fatigue") || n.includes("sleep") || n.includes("focus") || n.includes("sluggish")) return "general";
  return "other";
}

function detectDocumentType(filename: string): string {
  const fn = filename.toLowerCase();
  if (fn.includes("haims")) return "haims";
  if (fn.includes("genesis")) return "genesis";
  if (fn.includes("opr") || fn.includes("outpatient")) return "outpatient";
  if (fn.includes("awp") || fn.includes("wellness")) return "military_wellness";
  if (fn.includes("vba-") || fn.includes("va form") || fn.includes("21-")) return "va_form";
  if (fn.includes("evaluation") || fn.includes("therapy") || fn.includes("clinic")) return "private";
  if (fn.includes("str") || fn.includes("service treatment")) return "str";
  return "other";
}

function getServiceEraContext(era: string): string {
  const contexts: Record<string, string> = {
    "post-911": `SERVICE ERA CONTEXT — Post-9/11 (2001–Present):
- PACT Act (2022): Dramatically expanded presumptive conditions for burn pit and toxic exposure veterans
- Burn pit exposure is now presumptive for: constrictive bronchiolitis, constrictive pericarditis, and many cancers
- Concessions for Iraq/Afghanistan: TBI, hearing loss, tinnitus extremely common — presumptive for combat veterans
- Toxic Exposure Screening (TES): VA now required to screen all post-9/11 veterans
- Camp Lejeune provisions if applicable
- Key presumptive cancers: bladder, head/neck, respiratory, reproductive, melanoma, pancreatic, kidney, any "rare" cancer
- Sinusitis, rhinitis, and asthma presumptive if deployed to Southwest Asia/certain locations
- PTSD: Combat veterans have relaxed evidentiary standards (no stressor verification needed for combat-related PTSD)`,

    "gulf-war": `SERVICE ERA CONTEXT — Gulf War (1990–2001):
- Gulf War Syndrome: Medically unexplained chronic multi-symptom illness is presumptive
- Presumptive conditions: CFS, fibromyalgia, IBS, undiagnosed illnesses manifesting to 10%+ disability
- Southwest Asia theater: Iraq, Kuwait, Saudi Arabia, Bahrain, Qatar, UAE, Oman, Persian Gulf waters
- Oil well fire exposure, depleted uranium exposure presumptive
- Infectious diseases: brucellosis, campylobacter, Q fever, malaria, leishmaniasis, shigella, tuberculosis, West Nile virus
- 38 CFR 3.317: Undiagnosed illness or medically unexplained chronic multi-symptom illness`,

    "vietnam": `SERVICE ERA CONTEXT — Vietnam Era (1962–1975):
- Agent Orange: Extensive list of presumptive conditions including: AL amyloidosis, bladder cancer, chronic B-cell leukemia, chloracne, diabetes mellitus type 2, Hodgkin's disease, hypertension, ischemic heart disease, multiple myeloma, NHL, Parkinson's, PCNSL, porphyria cutanea tarda, prostate cancer, respiratory cancers, soft tissue sarcomas
- Blue Water Navy: Veterans who served on ships in Vietnamese coastal waters now covered
- Herbicide exposure presumed for boots-on-ground Vietnam veterans and those who served on inland waterways
- Thailand military bases (perimeter duty): herbicide exposure presumptive
- PTSD: Combat stressor concessions apply`,

    "cold-war": `SERVICE ERA CONTEXT — Cold War Era (1975–1990):
- Camp Lejeune Water Contamination (1953–1987): Presumptive conditions include bladder cancer, kidney cancer, liver cancer, adult leukemia, multiple myeloma, NHL, Parkinson's, aplastic anemia and other myelodysplastic syndromes, kidney disease, liver disease, scleroderma, and female infertility
- Nuclear weapons testing participation: Presumptive for radiogenic diseases
- Atomic Veterans: Special presumptive coverage for conditions caused by ionizing radiation
- Panama/Grenada/Cold War deployments: Standard direct and secondary connection rules`,

    "korean-war": `SERVICE ERA CONTEXT — Korean War (1950–1953):
- Extreme cold injury presumptive conditions: Peripheral neuropathy, Raynaud's phenomenon
- POW presumptive conditions: Beriberi, chronic dysentery, helminthiasis, malnutrition, psychosis, any anxiety state
- Standard direct and secondary connection rules apply`,

    "pre-korean": `SERVICE ERA CONTEXT — Pre-Korean/WWII:
- POW presumptive conditions apply for former POWs
- Radiation exposure from nuclear testing
- Standard direct and secondary connection rules`,
  };

  return contexts[era] || "Standard VA disability claim rules apply. Direct service connection, secondary conditions, and aggravation claims are available.";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Create a new session
  app.post("/api/session", (_req, res) => {
    const session: Session = {
      id: randomUUID(),
      conditions: [],
      currentStep: "service-history",
      medicalRecords: [],
      discoveredConditions: [],
      discoveryComplete: false,
    };
    sessions.set(session.id, session);
    res.json(session);
  });

  // Get session
  app.get("/api/session/:id", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  // Upload and parse claim document
  app.post("/api/parse-claim", upload.single("file"), async (req, res) => {
    try {
      const sessionId = req.body.sessionId;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      let text = "";
      const file = req.file;

      if (file) {
        session.uploadedFileName = file.originalname;
        
        if (file.mimetype === "application/pdf") {
          const pdfParse = (await import("pdf-parse")).default;
          const data = await pdfParse(file.buffer);
          text = data.text;
        } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          text = result.value;
        } else if (file.mimetype === "text/plain") {
          text = file.buffer.toString("utf-8");
        } else {
          return res.status(400).json({ error: "Unsupported file type. Please upload PDF, DOCX, or TXT." });
        }
      } else if (req.body.text) {
        text = req.body.text;
      } else {
        return res.status(400).json({ error: "No file or text provided" });
      }

      session.rawClaimText = text;

      // Parse conditions locally using bullet-point structure, then refine with Claude
      let conditions: ClaimCondition[] = [];
      
      // First try local regex parsing for structured VA claim documents
      const allBulletSections = text.split(/•/);
      // Skip the first section (intro text before first bullet)
      const bulletSections = allBulletSections.slice(1).filter(s => s.trim().length > 30);
      
      if (bulletSections.length >= 3) {
        // Structured document - parse each bullet as a condition
        for (const section of bulletSections) {
          const lines = section.trim().split('\n').map(l => l.replace(/\t/g, ' ').trim()).filter(Boolean);
          if (lines.length === 0) continue;
          
          // First line is typically the condition name with page refs
          const firstLine = lines[0];
          // Extract condition name (before the colon and page refs)
          let name = firstLine.split(':')[0].trim();
          // Clean up common patterns like "Page X, Doctor, Status:"
          name = name.replace(/\s*\(.*?\)\s*$/, '').trim();
          if (name.length > 80) name = name.substring(0, 80);
          if (name.length < 3) continue;
          
          // Get full description text
          const description = lines.join(' ').replace(/\s+/g, ' ').trim();
          
          // Extract doctors mentioned
          const doctorMatch = firstLine.match(/(?:,\s*)((?:[A-Z][a-z]+(?:\/[A-Z][a-z]+)*)(?=\s*,\s*Status))/i);
          const doctors = doctorMatch ? doctorMatch[1] : '';
          
          // Extract page references  
          const pageMatch = firstLine.match(/Pages?\s+([\d\/\-]+)/i);
          const pageRefs = pageMatch ? pageMatch[1] : '';
          
          conditions.push({
            id: randomUUID(),
            name,
            category: categorizeCondition(name),
            description: description.substring(0, 3000),
            status: 'current',
            doctors: doctors || undefined,
            pageReferences: pageRefs || undefined,
            interviewComplete: false,
            interviewMessages: [],
            cfrAnalysis: { strengths: [], weaknesses: [] },
            medicalEvidence: [],
          });
        }
      }

      // If local parsing found fewer than 3 conditions, use Claude as backup
      if (conditions.length < 3) {
        try {
          const parseResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [{
              role: "user",
              content: `You are a VA disability claims expert. Parse the following document and extract EVERY individual medical condition being claimed.

For each condition return a JSON object with: "name" (concise condition name), "description" (full text from the claim about this condition), "doctors" (any doctors mentioned), "pageReferences" (any page references), "status" (usually "current").

Return ONLY a valid JSON array. No markdown, no code blocks.

Document:
${text.substring(0, 15000)}`
            }],
          });

          const responseText = parseResponse.content[0].type === "text" ? parseResponse.content[0].text : "";
          let cleanJson = responseText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          cleanJson = cleanJson.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
          
          const parsed = JSON.parse(cleanJson);
          conditions = parsed.map((c: any) => ({
            id: randomUUID(),
            name: c.name || "Unknown Condition",
            category: categorizeCondition(c.name || ""),
            description: c.description || "",
            status: c.status || "current",
            doctors: c.doctors || "",
            pageReferences: c.pageReferences || "",
            interviewComplete: false,
            interviewMessages: [],
            cfrAnalysis: {},
          }));
        } catch (e) {
          console.error("Claude parsing also failed:", e);
          conditions = [{
            id: randomUUID(),
            name: "Full Claim",
            category: "other",
            description: text.substring(0, 3000),
            status: "current",
            interviewComplete: false,
            interviewMessages: [],
            cfrAnalysis: { strengths: [], weaknesses: [] },
            medicalEvidence: [],
          }];
        }
      }
      
      console.log(`Parsed ${conditions.length} conditions from claim`);
      console.log("Condition names:", conditions.map(c => c.name));

      session.conditions = conditions;
      session.currentStep = "review";
      sessions.set(sessionId, session);

      res.json(session);
    } catch (error: any) {
      console.error("Parse error:", error);
      res.status(400).json({ error: error.message || "Failed to parse claim" });
    }
  });

  // Interview endpoint - chat about a specific condition
  app.post("/api/interview", async (req, res) => {
    try {
      const { sessionId, conditionId, userMessage } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const condition = session.conditions.find(c => c.id === conditionId);
      if (!condition) return res.status(404).json({ error: "Condition not found" });

      // Add user message
      condition.interviewMessages.push({ role: "user", content: userMessage });

      // Build the category-specific checklist for deterministic completion
      const categoryChecklists: Record<string, string> = {
        musculoskeletal: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific joint(s) or body part(s) affected
[ ] Range of motion limitations (degrees if possible, or describe functional limits)
[ ] Pain level at WORST without medication (0-10 scale)
[ ] Flare-ups: frequency (daily/weekly/monthly), duration, and what additional limitations occur during flare-ups
[ ] Painful motion: at what point does pain begin during movement?
[ ] Functional loss: what specific activities can you no longer do or must limit? (lifting, bending, walking distance, stairs, etc.)
[ ] Impact on work/occupation: missed days, accommodations needed, job limitations
[ ] Use of assistive devices (brace, cane, wheelchair)
[ ] Whether condition is bilateral (affects both sides)`,

        mental_health: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific diagnosis (PTSD, anxiety, depression, etc.) and triggering event(s)
[ ] Frequency and severity of symptoms (nightmares, flashbacks, hypervigilance, panic attacks — how often per week/month)
[ ] Occupational impairment: ability to maintain work, relationships with coworkers/supervisors, missed work days, job changes due to condition
[ ] Social impairment: isolation, difficulty maintaining relationships, avoidance of crowds/public places
[ ] Sleep disturbance: type and frequency
[ ] Medication and treatment: what prescribed, any side effects
[ ] Suicidal ideation: history of (past or present)
[ ] Difficulty with concentration, memory, or decision-making
[ ] Irritability or angry outbursts: frequency and impact`,

        auditory: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition (hearing loss, tinnitus, or both)
[ ] Which ear(s) affected
[ ] For tinnitus: is it constant or intermittent? Describe the sound.
[ ] Impact on ability to understand speech, especially in noisy environments
[ ] Impact on work/occupation (difficulty on phone, in meetings, with alarms/signals)
[ ] Any dizziness or balance issues associated
[ ] Noise exposure history during service (weapons, machinery, aircraft, explosions)
[ ] Use of hearing aids`,

        respiratory: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition (asthma, COPD, sinusitis, rhinitis, burn pit exposure, etc.)
[ ] Frequency of episodes or attacks (daily/weekly/monthly)
[ ] Incapacitating episodes: how often, how long do they last, do they require bed rest?
[ ] Medications: inhalational therapy, oral medications, corticosteroids — frequency of use
[ ] Impact on physical activity (walking distance, climbing stairs, exercise tolerance)
[ ] Impact on work/occupation
[ ] Emergency room visits or hospitalizations for this condition
[ ] Exposure history during service (burn pits, chemicals, dust, fumes)`,

        gastrointestinal: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition (GERD, IBS, ulcer, etc.)
[ ] Frequency and severity of symptoms (daily, weekly)
[ ] Incapacitating episodes: how many per year, duration of each
[ ] Specific symptoms: pain, nausea, vomiting, diarrhea, constipation, reflux, bloating
[ ] Dietary restrictions required
[ ] Medications and their effectiveness
[ ] Impact on work (missed days, need for breaks, proximity to bathroom)
[ ] Weight loss or nutritional deficiency`,

        neurological: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition (TBI, migraines, neuropathy, etc.)
[ ] For headaches/migraines: frequency per month, duration of each episode
[ ] Prostrating attacks: how many per month completely prevent normal activity?
[ ] Associated symptoms (light/sound sensitivity, aura, nausea, cognitive fog)
[ ] Impact on work: missed days due to episodes, ability to concentrate
[ ] Medications and side effects
[ ] Any cognitive impairment (memory, concentration, decision-making)
[ ] History of head trauma during service`,

        skin: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition and body areas affected
[ ] Percentage of body area affected (estimate)
[ ] Percentage of exposed areas affected (face, neck, hands)
[ ] Is it constant or does it flare? Frequency and duration of flares
[ ] Treatment: topical medications, systemic therapy (oral/injected), frequency
[ ] Scarring: size, painful, unstable (frequently loses covering)?
[ ] Impact on daily activities and work
[ ] Disfigurement (if head, face, or neck)`,

        endocrine: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition (hypothyroidism, hyperthyroidism, diabetes, etc.)
[ ] Current symptoms (fatigue, weight changes, temperature sensitivity, etc.)
[ ] Medications and dosage
[ ] Frequency of medical monitoring required
[ ] Impact on energy levels and daily functioning
[ ] Impact on work/occupation
[ ] Any associated conditions (cardiovascular, mental health, etc.)
[ ] Hospitalizations related to condition`,

        ophthalmologic: `REQUIRED INFORMATION CHECKLIST:
[ ] Specific condition (vision loss, macular degeneration, cataracts, etc.)
[ ] Visual acuity (corrected and uncorrected if known)
[ ] Visual field limitations
[ ] Impact on daily activities (driving, reading, computer use)
[ ] Impact on work/occupation
[ ] Corrective lenses or other treatments
[ ] Whether condition is getting worse over time`,
      };

      const checklist = categoryChecklists[condition.category] || `REQUIRED INFORMATION CHECKLIST:
[ ] Specific diagnosis and symptoms
[ ] Frequency and severity of symptoms
[ ] Impact on work/occupation (missed days, limitations, accommodations)
[ ] Impact on daily activities and social functioning
[ ] Medications and treatments, including side effects
[ ] Whether condition is stable, improving, or worsening
[ ] Flare-ups: frequency, duration, additional limitations
[ ] Pain level at worst without medication (0-10)`;

      const exchangeCount = condition.interviewMessages.filter(m => m.role === "user").length;

      // Build medical evidence context if available from discovery pipeline
      const medicalEvidenceContext = condition.medicalEvidence && condition.medicalEvidence.length > 0
        ? `\nMEDICAL RECORDS EVIDENCE (extracted from veteran's uploaded records):\n${condition.medicalEvidence.map(e => `• ${e}`).join("\n")}\n\nUse this evidence to ask more targeted follow-up questions. Reference specific findings when coaching the veteran.`
        : "";

      const claimTypeContext = condition.claimType
        ? `\nCLAIM TYPE: ${condition.claimType}${condition.claimType === "secondary" ? " — this condition is claimed as secondary to another service-connected condition. Ask about the connection between conditions." : ""}${condition.claimType === "presumptive" ? " — this qualifies as a presumptive condition. Focus on confirming the diagnosis and current severity rather than proving nexus." : ""}`
        : "";

      // Service era context if available
      const serviceHistory = session.serviceHistory;
      const eraContext = serviceHistory?.serviceEra ? `\nSERVICE ERA: ${serviceHistory.serviceEra.replace("-", " ")} veteran` : "";

      const systemPrompt = `You are a compassionate, knowledgeable VA disability claims assistant helping a veteran articulate their condition for a VA disability claim. You understand 38 CFR Part 4 (Schedule for Rating Disabilities) deeply.

Your job is to interview the veteran about their condition: "${condition.name}"
Category: ${condition.category}
${claimTypeContext}${eraContext}

Here's what they originally wrote in their claim:
"${condition.description}"
${medicalEvidenceContext}

${checklist}

INTERVIEW RULES:

1. Ask ONE targeted question at a time. Focus on the NEXT unchecked checklist item.

2. RESPONSE FORMAT — Be direct and concise. Your total response should be 1-3 sentences MAX.
   - DO NOT start with "Thank you for sharing" or "I appreciate you telling me" or similar filler on every message. You may acknowledge briefly on the FIRST exchange only.
   - After the first exchange, go straight to the next question. Example: "Got it. How often do flare-ups occur, and how long does each one last?"
   - If the veteran shares something that needs VA-specific terminology, briefly coach them in-line. Example: "The VA calls those 'prostrating attacks' — how many per month would you say completely prevent normal activity?"
   - Never repeat back what the veteran just told you. Move forward.

3. Use VA-recognized terminology and coach toward precise language:
   - Headaches: "prostrating attacks" not "bad headaches"
   - Mental health: "occupational and social impairment"
   - Joints: "painful motion," "functional loss," "flare-ups"
   - GI: "incapacitating episodes"
   - Always ask about pain at WORST WITHOUT medication

4. COMPLETION RULES:

   Track which checklist items have been adequately answered.

   IF all critical items are covered (or veteran indicated they don't apply) AND you have enough detail for a CFR-aligned statement:
   → Write 2-3 bullet points summarizing key details captured, then "INTERVIEW_COMPLETE" on its own line.

   ${exchangeCount >= 6 ? "You have had many exchanges. Wrap up now — ask about any remaining critical gaps in ONE combined question, then mark complete on the next response." : "Continue asking about the next unchecked item."}

   After 8 or more veteran responses, you MUST complete the interview on your next response regardless.`;

      const messages = condition.interviewMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: systemPrompt,
        messages,
      });

      const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";

      const isComplete = assistantMessage.includes("INTERVIEW_COMPLETE");
      const cleanMessage = assistantMessage.replace("INTERVIEW_COMPLETE", "").trim();

      condition.interviewMessages.push({ role: "assistant", content: cleanMessage });
      
      if (isComplete) {
        condition.interviewComplete = true;
      }

      sessions.set(sessionId, session);

      res.json({
        message: cleanMessage,
        interviewComplete: isComplete,
        condition,
      });
    } catch (error: any) {
      console.error("Interview error:", error);
      res.status(400).json({ error: error.message || "Failed to process interview" });
    }
  });

  // Start interview for a condition (get the first question)
  app.post("/api/interview/start", async (req, res) => {
    try {
      const { sessionId, conditionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const condition = session.conditions.find(c => c.id === conditionId);
      if (!condition) return res.status(404).json({ error: "Condition not found" });

      // Reset messages if restarting
      condition.interviewMessages = [];
      condition.interviewComplete = false;

      // Build context for start prompt
      const startMedicalContext = condition.medicalEvidence && condition.medicalEvidence.length > 0
        ? `\n\nMedical records show: ${condition.medicalEvidence.slice(0, 3).join("; ")}`
        : "";
      const startClaimType = condition.claimType ? ` (${condition.claimType} claim)` : "";

      const systemPrompt = `You are a direct, knowledgeable VA disability claims assistant. You understand 38 CFR Part 4 deeply.

The veteran is claiming: "${condition.name}"${startClaimType}
Category: ${condition.category}

Their original statement:
"${condition.description}"${startMedicalContext}

Briefly acknowledge their claim (1 sentence max), then ask your first specific follow-up question targeting details that align with VA rating criteria under 38 CFR Part 4.

Keep your total response to 2-3 sentences. Be warm but efficient — no filler phrases like "Thank you for sharing" or "I really appreciate you telling me." Just get to the question.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: `Please review my claim for ${condition.name} and help me strengthen it.` }],
      });

      const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";

      condition.interviewMessages = [
        { role: "user", content: `Please review my claim for ${condition.name} and help me strengthen it.` },
        { role: "assistant", content: assistantMessage },
      ];

      sessions.set(sessionId, session);

      res.json({
        message: assistantMessage,
        condition,
      });
    } catch (error: any) {
      console.error("Start interview error:", error);
      res.status(400).json({ error: error.message || "Failed to start interview" });
    }
  });

  // Analyze a condition against CFR
  app.post("/api/analyze", async (req, res) => {
    try {
      const { sessionId, conditionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const condition = session.conditions.find(c => c.id === conditionId);
      if (!condition) return res.status(404).json({ error: "Condition not found" });

      const interviewContext = condition.interviewMessages
        .map(m => `${m.role === "user" ? "Veteran" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const analysisResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `You are an expert on 38 CFR Part 4 — the Schedule for Rating Disabilities used by the VA.

Analyze the following veteran's condition claim and interview responses against the relevant CFR section.

CONDITION: ${condition.name}
CATEGORY: ${condition.category}

ORIGINAL CLAIM TEXT:
${condition.description}

INTERVIEW RESPONSES:
${interviewContext}

Provide your analysis as a JSON object (no markdown, no code blocks, just raw JSON) with these fields:
{
  "diagnosticCode": "The most relevant diagnostic code (e.g., '7346' for GERD, '9411' for PTSD, '5201' for shoulder)",
  "cfrSection": "The specific CFR section (e.g., '38 CFR § 4.71a, Diagnostic Code 5260')",
  "currentLanguageScore": "strong" or "moderate" or "weak" based on how well their language aligns with CFR criteria,
  "estimatedRating": a number (0, 10, 30, 50, 70, or 100),
  "possibleRatings": [array of possible rating percentages for this condition],
  "strengths": ["list of things they described well that align with CFR criteria"],
  "weaknesses": ["list of gaps or things they should articulate better"],
  "suggestedLanguage": "Specific VA-recognized phrases and language they should use",
  "rewrittenStatement": "A complete rewritten personal statement for this condition using proper VA language and CFR-aligned terminology. This should be a full paragraph that the veteran could submit. Include specific CFR language where relevant."
}

Be thorough and specific. Reference actual diagnostic codes and rating criteria.`
        }],
      });

      const analysisText = analysisResponse.content[0].type === "text" ? analysisResponse.content[0].text : "{}";
      
      try {
        let cleanJson = analysisText.trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        const analysis = JSON.parse(cleanJson);
        condition.cfrAnalysis = {
          diagnosticCode: analysis.diagnosticCode || "",
          cfrSection: analysis.cfrSection || "",
          currentLanguageScore: analysis.currentLanguageScore || "moderate",
          estimatedRating: analysis.estimatedRating || 0,
          possibleRatings: analysis.possibleRatings || [],
          strengths: analysis.strengths || [],
          weaknesses: analysis.weaknesses || [],
          suggestedLanguage: analysis.suggestedLanguage || "",
          rewrittenStatement: analysis.rewrittenStatement || "",
        };
      } catch (e) {
        console.error("Failed to parse analysis:", e);
        condition.cfrAnalysis = {
          currentLanguageScore: "moderate",
          estimatedRating: 0,
          strengths: ["Could not analyze at this time"],
          weaknesses: ["Analysis parsing failed - please try again"],
        };
      }

      sessions.set(sessionId, session);
      res.json({ condition, session });
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(400).json({ error: error.message || "Failed to analyze condition" });
    }
  });

  // Analyze all conditions (batched for speed)
  app.post("/api/analyze-all", async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const toAnalyze = session.conditions.filter(c => !c.cfrAnalysis?.estimatedRating);
      const BATCH_SIZE = 5;
      
      for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
        const batch = toAnalyze.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(async (condition) => {
          const interviewContext = condition.interviewMessages
            .map(m => `${m.role === "user" ? "Veteran" : "Assistant"}: ${m.content}`)
            .join("\n\n");

          try {
            // Use Sonnet for batch analysis (faster), Opus for individual deep analysis
            const analysisResponse = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 4096,
              messages: [{
                role: "user",
                content: `You are an expert on 38 CFR Part 4.

Analyze this condition and return a JSON object (no markdown, no code blocks):

CONDITION: ${condition.name}
CATEGORY: ${condition.category}
ORIGINAL CLAIM: ${condition.description?.substring(0, 2000)}
${interviewContext ? `INTERVIEW: ${interviewContext.substring(0, 2000)}` : ""}

Return JSON with: diagnosticCode, cfrSection, currentLanguageScore ("strong"/"moderate"/"weak"), estimatedRating (number), possibleRatings (array), strengths (array of 2-3 items), weaknesses (array of 2-3 items), suggestedLanguage (string), rewrittenStatement (string - a complete rewritten personal statement using proper VA/CFR language).`
              }],
            });

            const text = analysisResponse.content[0].type === "text" ? analysisResponse.content[0].text : "{}";
            let cleanJson = text.trim();
            if (cleanJson.startsWith("```")) {
              cleanJson = cleanJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
            }
            const analysis = JSON.parse(cleanJson);
            condition.cfrAnalysis = {
              diagnosticCode: analysis.diagnosticCode || "",
              cfrSection: analysis.cfrSection || "",
              currentLanguageScore: analysis.currentLanguageScore || "moderate",
              estimatedRating: analysis.estimatedRating || 0,
              possibleRatings: analysis.possibleRatings || [],
              strengths: analysis.strengths || [],
              weaknesses: analysis.weaknesses || [],
              suggestedLanguage: analysis.suggestedLanguage || "",
              rewrittenStatement: analysis.rewrittenStatement || "",
            };
            console.log(`Analyzed: ${condition.name} -> ${analysis.estimatedRating}%`);
          } catch (e) {
            console.error(`Failed to analyze ${condition.name}:`, e);
          }
        }));
      }

      sessions.set(sessionId, session);
      res.json(session);
    } catch (error: any) {
      console.error("Analyze all error:", error);
      res.status(400).json({ error: error.message || "Failed to analyze conditions" });
    }
  });

  // Generate export document
  app.post("/api/export", async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const conditionSummaries = session.conditions.map(c => {
        const rewritten = c.cfrAnalysis?.rewrittenStatement || c.description;
        return `## ${c.name}
${c.cfrAnalysis?.cfrSection ? `(${c.cfrAnalysis.cfrSection})` : ""}

${rewritten}

Status: ${c.status || "Current"}
${c.doctors ? `Treating Physicians: ${c.doctors}` : ""}
${c.pageReferences ? `Medical Record References: ${c.pageReferences}` : ""}`;
      }).join("\n\n---\n\n");

      // Generate the full document using Claude Opus for highest quality reasoning
      const exportResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{
          role: "user",
          content: `You are writing a formal VA disability claim letter. Using the rewritten condition statements below, compose a complete, professional claim letter similar to one submitted to the VA Claims Department.

The letter should:
1. Start with "Dear VA Claims Department," 
2. Include an introduction paragraph about the veteran's service
3. List each condition with the improved, CFR-aligned language
4. Include proper medical terminology and VA-recognized language throughout
5. End with a professional closing

Veteran Info:
Name: ${session.veteranName || "The Veteran"}
Branch: ${session.branch || "United States Military"}
Rank: ${session.rank || ""}

Conditions with rewritten statements:
${conditionSummaries}

Write the complete letter. Make it professional, thorough, and aligned with how successful VA claims read.`
        }],
      });

      const documentText = exportResponse.content[0].type === "text" ? exportResponse.content[0].text : "";

      res.json({
        document: documentText,
        conditions: session.conditions.map(c => ({
          name: c.name,
          originalDescription: c.description,
          rewrittenStatement: c.cfrAnalysis?.rewrittenStatement || c.description,
          estimatedRating: c.cfrAnalysis?.estimatedRating || 0,
          diagnosticCode: c.cfrAnalysis?.diagnosticCode || "",
          cfrSection: c.cfrAnalysis?.cfrSection || "",
        })),
      });
    } catch (error: any) {
      console.error("Export error:", error);
      res.status(400).json({ error: error.message || "Failed to generate export" });
    }
  });

  // Manual interview mode - start a fresh conversation
  app.post("/api/manual-interview/start", async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      session.currentStep = "interview";
      sessions.set(sessionId, session);

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are a compassionate VA disability claims assistant. The veteran doesn't have a written claim yet - you need to interview them from scratch.

Start by introducing yourself and asking about their military service (branch, years of service, deployments). Then you'll systematically ask about each medical condition they want to claim.

Be warm, professional, and thorough. Ask one question at a time.`,
        messages: [{ role: "user", content: "I'd like help filing my VA disability claim. I don't have a written claim yet." }],
      });

      const message = response.content[0].type === "text" ? response.content[0].text : "";

      res.json({ message });
    } catch (error: any) {
      console.error("Manual interview error:", error);
      res.status(400).json({ error: error.message || "Failed to start interview" });
    }
  });

  // Update session info
  app.patch("/api/session/:id", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    Object.assign(session, req.body);
    sessions.set(req.params.id, session);
    res.json(session);
  });

  // ═══════════════════════════════════════════════════
  // DISCOVERY PIPELINE ROUTES
  // ═══════════════════════════════════════════════════

  // Save service history
  app.post("/api/service-history", (req, res) => {
    try {
      const { sessionId, serviceHistory } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      session.serviceHistory = serviceHistory;
      session.branch = serviceHistory.branch;
      session.rank = serviceHistory.rank;
      session.currentStep = "discovery-upload";
      sessions.set(sessionId, session);

      res.json(session);
    } catch (error: any) {
      console.error("Service history error:", error);
      res.status(400).json({ error: error.message || "Failed to save service history" });
    }
  });

  // Upload multiple medical records for discovery
  app.post("/api/discovery/upload", uploadMultiple.array("files", 20), async (req, res) => {
    try {
      const sessionId = req.body.sessionId;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const records: MedicalRecord[] = [];

      for (const file of files) {
        const record: MedicalRecord = {
          id: randomUUID(),
          fileName: file.originalname,
          fileType: detectDocumentType(file.originalname),
          extractedText: "",
          pageCount: 0,
          uploadedAt: new Date().toISOString(),
          status: "processing",
        };

        try {
          let text = "";
          if (file.mimetype === "application/pdf") {
            const pdfParse = (await import("pdf-parse")).default;
            const data = await pdfParse(file.buffer);
            text = data.text;
            record.pageCount = data.numpages || 0;
          } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            text = result.value;
          } else if (file.mimetype === "text/plain") {
            text = file.buffer.toString("utf-8");
          } else {
            record.status = "error";
            record.errorMessage = "Unsupported file type";
            records.push(record);
            continue;
          }

          record.extractedText = text;
          record.status = "analyzed";
        } catch (e: any) {
          record.status = "error";
          record.errorMessage = e.message || "Failed to parse file";
        }

        records.push(record);
      }

      session.medicalRecords = [...(session.medicalRecords || []), ...records];
      sessions.set(sessionId, session);

      res.json({ records, session });
    } catch (error: any) {
      console.error("Discovery upload error:", error);
      res.status(400).json({ error: error.message || "Failed to upload records" });
    }
  });

  // Analyze uploaded records to discover claimable conditions
  app.post("/api/discovery/analyze", async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const records = (session.medicalRecords || []).filter(r => r.status === "analyzed");
      if (records.length === 0) {
        return res.status(400).json({ error: "No analyzed records to process" });
      }

      const serviceHistory = session.serviceHistory;
      const eraContext = getServiceEraContext(serviceHistory?.serviceEra || "other");
      const exposureContext = (serviceHistory?.exposures || []).join(", ");

      // Combine all record texts (truncated) for analysis
      const combinedRecords = records.map(r =>
        `--- FILE: ${r.fileName} (Type: ${r.fileType}) ---\n${r.extractedText.substring(0, 8000)}\n`
      ).join("\n");

      const discoveryPrompt = `You are a VA disability claims expert with deep knowledge of 38 CFR, the PACT Act, and presumptive conditions.

VETERAN SERVICE HISTORY:
- Branch: ${serviceHistory?.branch || "Unknown"}
- Service era: ${serviceHistory?.serviceEra || "Unknown"}
- Service dates: ${serviceHistory?.serviceStart || "?"} to ${serviceHistory?.serviceEnd || "?"}
- MOS: ${serviceHistory?.mos || "Unknown"}
- Deployments: ${serviceHistory?.deployments?.map(d => d.location).join(", ") || "None listed"}
- Known exposures: ${exposureContext || "None listed"}
- Combat service: ${serviceHistory?.combatService ? "Yes" : "No"}

${eraContext}

MEDICAL RECORDS:
${combinedRecords.substring(0, 50000)}

INSTRUCTIONS:
Analyze ALL medical records above and identify EVERY potentially claimable condition. For each condition, determine:

1. **Claim type**:
   - "direct" = condition occurred in or was caused by service
   - "secondary" = caused or aggravated by another service-connected condition
   - "presumptive" = qualifies under presumptive rules (PACT Act, Agent Orange, Gulf War, etc.)
   - "aggravation" = pre-existing condition worsened by service

2. **Evidence strength**: "strong" (clear documentation), "moderate" (some evidence), "weak" (mentioned but minimal docs)

3. **Secondary condition chains**: If a condition is secondary, identify the primary condition it connects to.

4. **Presumptive categories**: If applicable, name the specific presumptive category (e.g., "PACT Act - Burn Pit Exposure", "Agent Orange", "Gulf War Syndrome").

5. **ICD-10 codes** if found in the records.

6. **Missing evidence** that would strengthen the claim.

Return a JSON array of objects. Each object:
{
  "name": "Condition name (use VA-recognized terminology)",
  "category": "musculoskeletal|mental_health|auditory|respiratory|gastrointestinal|neurological|skin|endocrine|ophthalmologic|cardiovascular|other",
  "claimType": "direct|secondary|presumptive|aggravation",
  "evidenceStrength": "strong|moderate|weak",
  "description": "Brief description of the condition and how it relates to service",
  "sourceRecords": ["filenames where evidence was found"],
  "icdCodes": ["any ICD codes found"],
  "relatedConditions": ["names of conditions this connects to"],
  "parentCondition": "if secondary, name of the primary condition",
  "presumptiveCategory": "if presumptive, the specific category",
  "keyEvidence": ["bullet points of specific evidence found in records"],
  "missingEvidence": ["what additional evidence would help"],
  "dateFirstNoted": "earliest date found in records for this condition"
}

Be thorough. Look for:
- Explicitly diagnosed conditions
- Conditions implied by medications prescribed
- Conditions implied by referrals or specialist visits
- Repetitive complaints that suggest chronic conditions
- Mental health indicators (sleep issues, mood changes, behavioral health visits)
- Secondary conditions (e.g., back pain → radiculopathy, PTSD → sleep apnea, PTSD → migraines)
- Presumptive conditions based on the veteran's service era and exposures

Return ONLY valid JSON array. No markdown, no code blocks.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: discoveryPrompt }],
      });

      const responseText = response.content[0].type === "text" ? response.content[0].text : "[]";
      let cleanJson = responseText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      cleanJson = cleanJson.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

      let parsed: any[];
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        console.error("Failed to parse discovery response:", e);
        parsed = [];
      }

      const discoveredConditions: DiscoveredCondition[] = parsed.map((c: any) => ({
        id: randomUUID(),
        name: c.name || "Unknown Condition",
        category: c.category || categorizeCondition(c.name || ""),
        claimType: c.claimType || "direct",
        evidenceStrength: c.evidenceStrength || "moderate",
        description: c.description || "",
        sourceRecords: c.sourceRecords || [],
        icdCodes: c.icdCodes || [],
        relatedConditions: c.relatedConditions || [],
        parentCondition: c.parentCondition || undefined,
        presumptiveCategory: c.presumptiveCategory || undefined,
        keyEvidence: c.keyEvidence || [],
        missingEvidence: c.missingEvidence || [],
        dateFirstNoted: c.dateFirstNoted || undefined,
        selected: true,
      }));

      session.discoveredConditions = discoveredConditions;
      session.currentStep = "discovery-review";
      sessions.set(sessionId, session);

      console.log(`Discovered ${discoveredConditions.length} conditions from ${records.length} records`);
      res.json({ discoveredConditions, session });
    } catch (error: any) {
      console.error("Discovery analysis error:", error);
      res.status(400).json({ error: error.message || "Failed to analyze records" });
    }
  });

  // Confirm discovered conditions and move to interview pipeline
  app.post("/api/discovery/confirm", (req, res) => {
    try {
      const { sessionId, selectedConditionIds } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      // Update selection state
      for (const dc of session.discoveredConditions || []) {
        dc.selected = selectedConditionIds.includes(dc.id);
      }

      // Convert selected discovered conditions to ClaimConditions for the interview pipeline
      const selectedConditions = (session.discoveredConditions || []).filter(dc => dc.selected);

      const claimConditions: ClaimCondition[] = selectedConditions.map(dc => ({
        id: randomUUID(),
        name: dc.name,
        category: dc.category,
        description: dc.description,
        status: "current",
        interviewComplete: false,
        interviewMessages: [],
        cfrAnalysis: { strengths: [], weaknesses: [] },
        discoveryId: dc.id,
        medicalEvidence: dc.keyEvidence,
        claimType: dc.claimType,
      }));

      session.conditions = claimConditions;
      session.discoveryComplete = true;
      session.currentStep = "review";
      sessions.set(sessionId, session);

      res.json(session);
    } catch (error: any) {
      console.error("Discovery confirm error:", error);
      res.status(400).json({ error: error.message || "Failed to confirm conditions" });
    }
  });

  // Toggle a discovered condition's selected state
  app.post("/api/discovery/toggle", (req, res) => {
    try {
      const { sessionId, conditionId } = req.body;
      const session = sessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const dc = (session.discoveredConditions || []).find(c => c.id === conditionId);
      if (dc) dc.selected = !dc.selected;
      sessions.set(sessionId, session);

      res.json({ condition: dc, session });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to toggle condition" });
    }
  });

  return httpServer;
}
