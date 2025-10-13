
/**
 * @file src/jobPostingSchema.ts
 * @description This file defines the comprehensive Zod schema for validating structured job posting data.
 * All optional fields have been assigned default values to ensure a consistent and predictable object shape after parsing.
 * This "defensive" schema design prevents downstream errors by eliminating undefined properties on the validated object.
 */

import { z } from 'zod';

// --- Common Helpers ---

const optionalString = z.string().min(1).optional().default("n/a");
const optionalURL = z.string().url().optional().default("n/a");
const isoDateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+\-]\d{2}:\d{2})?)?$/,
  "Expected ISO 8601 date string"
).optional().default("n/a");

// --- Sub-Schemas with Defaults ---

const moneyRangeSchema = z.object({
  currency: z.string().min(1).describe("ISO currency code or symbol (e.g., 'USD', '$').").optional().default("n/a"),
  min: z.number().nonnegative().optional().default(0),
  max: z.number().nonnegative().optional().default(0),
  period: z.enum(["hour", "day", "week", "month", "year", "one-time"]).optional().default("year"),
  notes: optionalString,
}).describe("Generic money range model.");

const compensationSchema = z.object({
  baseSalary: moneyRangeSchema.nullable().optional().default(null),
  bonus: moneyRangeSchema.nullable().optional().default(null),
  equity: z.object({
    type: z.enum(["RSU", "Options", "ESPP", "Other"]).optional(),
    value: moneyRangeSchema.nullable().optional().default(null),
    notes: optionalString,
  }).nullable().optional().default(null),
  benefitsSummary: optionalString,
  benefits: z.array(z.object({
    name: z.string().min(1),
    description: optionalString,
    url: optionalURL,
  })).optional().default([]),
  totalCompEstimate: moneyRangeSchema.nullable().optional().default(null),
  compensationTextRaw: optionalString,
}).nullable().optional().default(null);

const contactSchema = z.object({
  name: optionalString,
  title: optionalString,
  email: optionalString,
  phone: optionalString,
  linkedinUrl: optionalURL,
  otherUrls: z.array(optionalURL).optional().default([]),
});

const locationSchema = z.object({
  formatted: optionalString,
  city: optionalString,
  state: optionalString,
  region: optionalString,
  country: optionalString,
  postalCode: optionalString,
  geo: z.object({
    lat: z.number().optional(),
    lon: z.number().optional(),
  }).nullable().optional().default(null),
  remote: z.boolean().optional().default(false),
  hybrid: z.boolean().optional().default(false),
  onsite: z.boolean().optional().default(false),
  travelPercent: z.number().min(0).max(100).optional().default(0),
}).nullable().optional().default(null);

const orgSchema = z.object({
  companyName: z.string().min(1).describe("Hiring company.").optional().default("n/a"),
  companyLegalName: optionalString,
  companyAlias: z.array(z.string().min(1)).optional().default([]),
  companyIndustry: optionalString,
  companySizeRange: z.object({
    min: z.number().nonnegative().optional().default(0),
    max: z.number().nonnegative().optional().default(0),
  }).nullable().optional().default(null),
  companyLinkedinUrl: optionalURL,
  companyWebsite: optionalURL,
  companyAbout: optionalString,
  companyCommitments: z.array(z.object({
    category: z.enum(["DEI", "Work-life balance", "Environmental sustainability", "Social impact", "Career growth and learning", "Other"]).optional(),
    proofUrl: optionalURL,
    description: optionalString,
  })).optional().default([]),
}).nullable().optional().default(null);

const jobIdSchema = z.object({
  externalPostingId: optionalString,
  atsId: optionalString,
  thirdPartyIds: z.array(z.object({
    source: z.string().min(1),
    id: z.string().min(1),
    url: optionalURL,
  })).optional().default([]),
}).nullable().optional().default(null);

const timeWindowSchema = z.object({
  postedAt: isoDateString,
  updatedAt: isoDateString,
  closesAt: isoDateString,
  originalPostedText: optionalString,
}).nullable().optional().default(null);

const enumJobType = z.enum(["Full-time", "Part-time", "Contract", "Temporary", "Internship", "Freelance", "Apprenticeship", "Volunteer", "n/a"]).optional().default("n/a");

const employmentSchema = z.object({
  jobType: enumJobType,
  workArrangement: z.enum(["Onsite", "Remote", "Hybrid"]).optional(),
  seniorityLevel: optionalString,
  department: optionalString,
  team: optionalString,
  function: optionalString,
  managerTitle: optionalString,
  reportsToTeam: optionalString,
  directReports: z.number().int().nonnegative().optional().default(0),
}).nullable().optional().default(null);

const sectionSchema = z.object({
  heading: optionalString,
  bullets: z.array(z.string().min(1)).optional().default([]),
  text: optionalString,
});

const aiFlagsSchema = z.object({
  mentionsAI: z.boolean().optional().default(false),
  mentionsML: z.boolean().optional().default(false),
  mentionsGenAI: z.boolean().optional().default(false),
  mentionsRAG: z.boolean().optional().default(false),
  mentionsLLM: z.boolean().optional().default(false),
  mentionsAnalytics: z.boolean().optional().default(false),
  mentionsSalesforce: z.boolean().optional().default(false),
  mentionsLegalTech: z.boolean().optional().default(false),
});

const applicationSchema = z.object({
  applyUrl: optionalURL,
  isAcceptingApplications: z.boolean().optional().default(true),
  applicationPlatform: optionalString,
  referralPreferred: z.boolean().optional().default(false),
  applicationInstructions: optionalString,
  screeningQuestions: z.array(z.string()).optional().default([]),
  relocationOffered: z.boolean().optional().default(false),
  visaSponsorship: z.boolean().optional().default(false),
  backgroundCheckRequired: z.boolean().optional().default(false),
}).nullable().optional().default(null);

const sourceSchema = z.object({
  sourcePlatform: optionalString,
  sourceUrl: optionalURL,
  scrapedAt: isoDateString,
  rawHtmlAvailable: z.boolean().optional().default(false),
  attribution: optionalString,
}).nullable().optional().default(null);

const metricsSchema = z.object({
  applicantsCount: z.number().int().nonnegative().optional().default(0),
  recentApplicantsCount: z.number().int().nonnegative().optional().default(0),
  applicantSeniorityBreakdown: z.record(z.string(), z.number().int().nonnegative()).optional().default({}),
  applicantEducationBreakdown: z.record(z.string(), z.number().int().nonnegative()).optional().default({}),
  medianEmployeeTenureYears: z.number().nonnegative().optional().default(0),
  departmentGrowthRates: z.record(z.string(), z.number()).optional().default({}),
}).nullable().optional().default(null);

const externalLinksSchema = z.object({
  benefitsUrl: optionalURL,
  companyCareersUrl: optionalURL,
  additionalDocs: z.array(z.object({
    title: z.string().min(1),
    url: z.string().url(),
    type: optionalString,
  })).optional().default([]),
}).nullable().optional().default(null);

const tagsSchema = z.object({
  skills: z.array(z.string().min(1)).optional().default([]),
  technologies: z.array(z.string().min(1)).optional().default([]),
  domains: z.array(z.string().min(1)).optional().default([]),
  keywords: z.array(z.string().min(1)).optional().default([]),
}).nullable().optional().default(null);

const governanceSchema = z.object({
  securityClearanceRequired: z.boolean().optional().default(false),
  confidentialityLevel: optionalString,
  complianceAreas: z.array(z.string().min(1)).optional().default([]),
  dataAccessLevel: optionalString,
}).nullable().optional().default(null);

const interviewPrepSchema = z.object({
  suggestedFocusAreas: z.array(z.string().min(1)).optional().default([]),
  likelyStakeholders: z.array(z.string().min(1)).optional().default([]),
  roleOutcomes: z.array(z.string().min(1)).optional().default([]),
}).nullable().optional().default(null);


// --- Main Schema with Defaults ---

export const jobPostingSchema = z.object({
  // Core
  jobTitle: z.string().min(1).optional().default("n/a"),
  companyName: z.string().min(1).optional().default("n/a"),
  location: z.string().min(1).optional().default("n/a"),

  // Rich org + location detail
  organization: orgSchema,
  locationDetail: locationSchema,

  // Classification
  jobType: enumJobType,
  seniorityLevel: z.string().optional().default("n/a"),
  employment: employmentSchema,

  // Content sections
  responsibilities: z.array(z.string()).optional().default([]),
  qualifications: z.union([
    z.array(z.string()),
    z.object({}).passthrough()
  ]).optional().default([]),
  sections: z.array(sectionSchema).optional().default([]),
  descriptionTextRaw: optionalString,

  // Tags
  skills: z.array(z.string()).optional().default([]),
  tags: tagsSchema,

  // Identifiers and sourcing
  identifiers: jobIdSchema,
  source: sourceSchema,

  // Time window
  timeline: timeWindowSchema,

  // Compensation & benefits
  compensation: compensationSchema,

  // Application channel
  application: applicationSchema,

  // Contacts
  contacts: z.array(contactSchema).optional().default([]),

  // Analytics/insights from the page
  insightsMetrics: metricsSchema,

  // External links
  externalLinks: externalLinksSchema,

  // AI/tech presence flags
  aiFlags: aiFlagsSchema.optional().default({
    mentionsAI: false,
    mentionsML: false,
    mentionsGenAI: false,
    mentionsRAG: false,
    mentionsLLM: false,
    mentionsAnalytics: false,
    mentionsSalesforce: false,
    mentionsLegalTech: false,
  }),

  // Governance & compliance
  governance: governanceSchema,

  // Derived helper content for agents
  interviewPrep: interviewPrepSchema,

  // Meta flags
  isReposted: z.boolean().optional().default(false),
  isPromoted: z.boolean().optional().default(false),
  isClosed: z.boolean().optional().default(false),
  language: optionalString,
});

export type JobPosting = z.infer<typeof jobPostingSchema>;

/**
 * Ensures that a partially-filled job posting object is returned as a complete
 * JobPosting object, with all missing fields populated with their default values.
 * This is a safeguard to guarantee a predictable object shape for downstream consumers.
 */
export function ensureFullJobPosting(extractedData: Partial<JobPosting>): JobPosting {
  const defaultAiFlags = {
    mentionsAI: false,
    mentionsML: false,
    mentionsGenAI: false,
    mentionsRAG: false,
    mentionsLLM: false,
    mentionsAnalytics: false,
    mentionsSalesforce: false,
    mentionsLegalTech: false,
  };

  const fullResult: JobPosting = {
    // Core fields
    jobTitle: extractedData.jobTitle ?? "n/a",
    companyName: extractedData.companyName ?? "n/a",
    location: extractedData.location ?? "n/a",

    // Rich details
    organization: extractedData.organization ?? null,
    locationDetail: extractedData.locationDetail ?? null,

    // Classification
    jobType: extractedData.jobType ?? "n/a",
    seniorityLevel: extractedData.seniorityLevel ?? "n/a",
    employment: extractedData.employment ?? null,

    // Content sections
    responsibilities: extractedData.responsibilities ?? [],
    qualifications: extractedData.qualifications ?? [],
    sections: extractedData.sections ?? [],
    descriptionTextRaw: extractedData.descriptionTextRaw ?? "n/a",

    // Tags
    skills: extractedData.skills ?? [],
    tags: extractedData.tags ?? null,

    // Identifiers and sourcing
    identifiers: extractedData.identifiers ?? null,
    source: extractedData.source ?? null,

    // Time window
    timeline: extractedData.timeline ?? null,

    // Compensation & benefits
    compensation: extractedData.compensation ?? null,

    // Application
    application: extractedData.application ?? null,

    // Contacts
    contacts: extractedData.contacts ?? [],

    // Metrics
    insightsMetrics: extractedData.insightsMetrics ?? null,

    // External links
    externalLinks: extractedData.externalLinks ?? null,

    // AI flags
    aiFlags: extractedData.aiFlags ?? defaultAiFlags,

    // Governance
    governance: extractedData.governance ?? null,

    // Interview prep
    interviewPrep: extractedData.interviewPrep ?? null,

    // Meta flags
    isReposted: extractedData.isReposted ?? false,
    isPromoted: extractedData.isPromoted ?? false,
    isClosed: extractedData.isClosed ?? false,
    language: extractedData.language ?? "n/a",
  };

  return fullResult;
}
