import { z } from "zod";

// Service history — collected at the start of the pipeline
export const serviceHistorySchema = z.object({
  branch: z.string().optional(),
  rank: z.string().optional(),
  mos: z.string().optional(), // Military Occupational Specialty
  serviceStart: z.string().optional(),
  serviceEnd: z.string().optional(),
  serviceEra: z.enum([
    "post-911",      // Post-9/11 (2001–present) — PACT Act, burn pits, GWOT
    "gulf-war",      // Gulf War (1990–2001) — Gulf War Syndrome presumptives
    "cold-war",      // Cold War era (1975–1990) — Camp Lejeune, nuclear testing
    "vietnam",       // Vietnam era (1962–1975) — Agent Orange presumptives
    "korean-war",    // Korean War (1950–1953)
    "pre-korean",    // Pre-Korean/WWII
    "other",
  ]).optional(),
  deployments: z.array(z.object({
    location: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).default([]),
  exposures: z.array(z.string()).default([]), // burn pits, agent orange, radiation, camp lejeune water, etc.
  combatService: z.boolean().default(false),
});

export type ServiceHistory = z.infer<typeof serviceHistorySchema>;

// A medical record uploaded for discovery analysis
export const medicalRecordSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  fileType: z.string(), // "str", "genesis", "haims", "private", "va_form", "outpatient", "other"
  extractedText: z.string(),
  pageCount: z.number().default(0),
  uploadedAt: z.string(),
  status: z.enum(["uploading", "processing", "analyzed", "error"]).default("uploading"),
  errorMessage: z.string().optional(),
});

export type MedicalRecord = z.infer<typeof medicalRecordSchema>;

// A condition discovered from medical records analysis
export const discoveredConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  claimType: z.enum(["direct", "secondary", "presumptive", "aggravation"]),
  evidenceStrength: z.enum(["strong", "moderate", "weak"]),
  description: z.string(),
  sourceRecords: z.array(z.string()).default([]), // references to which uploaded files
  icdCodes: z.array(z.string()).default([]),
  relatedConditions: z.array(z.string()).default([]), // for secondary claim chains
  parentCondition: z.string().optional(), // if secondary, what primary it connects to
  presumptiveCategory: z.string().optional(), // e.g., "PACT Act", "Agent Orange", "Gulf War"
  keyEvidence: z.array(z.string()).default([]), // bullet-point evidence found
  missingEvidence: z.array(z.string()).default([]), // what's still needed
  dateFirstNoted: z.string().optional(),
  selected: z.boolean().default(true), // whether veteran wants to pursue this claim
});

export type DiscoveredCondition = z.infer<typeof discoveredConditionSchema>;

// Claim condition extracted from a VA claim document
export const claimConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(), // musculoskeletal, mental_health, respiratory, gi, skin, neurological, etc.
  description: z.string(),
  status: z.string().default("current"),
  doctors: z.string().optional(),
  pageReferences: z.string().optional(),
  interviewComplete: z.boolean().default(false),
  interviewMessages: z.array(z.object({
    role: z.enum(["assistant", "user"]),
    content: z.string(),
  })).default([]),
  cfrAnalysis: z.object({
    diagnosticCode: z.string().optional(),
    cfrSection: z.string().optional(),
    currentLanguageScore: z.enum(["strong", "moderate", "weak"]).optional(),
    estimatedRating: z.number().optional(),
    possibleRatings: z.array(z.number()).optional(),
    strengths: z.array(z.string()).default([]),
    weaknesses: z.array(z.string()).default([]),
    suggestedLanguage: z.string().optional(),
    rewrittenStatement: z.string().optional(),
  }).default({}),
  // Discovery pipeline link
  discoveryId: z.string().optional(), // links back to discoveredCondition
  medicalEvidence: z.array(z.string()).default([]), // evidence extracted from records
  claimType: z.string().optional(), // direct, secondary, presumptive, aggravation
});

export type ClaimCondition = z.infer<typeof claimConditionSchema>;

// Session state
export const sessionSchema = z.object({
  id: z.string(),
  veteranName: z.string().optional(),
  branch: z.string().optional(),
  rank: z.string().optional(),
  uploadedFileName: z.string().optional(),
  rawClaimText: z.string().optional(),
  conditions: z.array(claimConditionSchema).default([]),
  currentStep: z.enum([
    "landing",
    "service-history",
    "discovery-upload",
    "discovery-review",
    "upload",
    "review",
    "interview",
    "export",
  ]).default("service-history"),
  activeConditionId: z.string().optional(),
  // Discovery pipeline data
  serviceHistory: serviceHistorySchema.optional(),
  medicalRecords: z.array(medicalRecordSchema).default([]),
  discoveredConditions: z.array(discoveredConditionSchema).default([]),
  discoveryComplete: z.boolean().default(false),
});

export type Session = z.infer<typeof sessionSchema>;

// API request/response types
export const parseClaimRequestSchema = z.object({
  text: z.string(),
  fileName: z.string().optional(),
});

export type ParseClaimRequest = z.infer<typeof parseClaimRequestSchema>;

export const interviewMessageSchema = z.object({
  sessionId: z.string(),
  conditionId: z.string(),
  userMessage: z.string(),
});

export type InterviewMessage = z.infer<typeof interviewMessageSchema>;

export const analyzeConditionRequestSchema = z.object({
  sessionId: z.string(),
  conditionId: z.string(),
});

export type AnalyzeConditionRequest = z.infer<typeof analyzeConditionRequestSchema>;
