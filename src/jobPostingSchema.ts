/**
 * @file src/jobPostingSchema.ts
 * @description This file defines the comprehensive Zod schema for validating structured job posting data.
 * It is designed to be highly detailed and flexible, accommodating data from various job boards and platforms.
 * The schema is composed of smaller, reusable sub-schemas for clarity and maintainability.
 * This schema is a critical component for ensuring data quality and consistency in the AI-powered extraction pipeline.
 * It is optimized for both human developers and AI agents to understand the expected data structure.
 */

import { z } from 'zod';

// Common helpers

/**
 * @description An optional string that must have a minimum length of 1 if provided.
 */
const optionalString = z.string().min(1).optional();

/**
 * @description An optional string that must be a valid URL if provided.
 */
const optionalURL = z.string().url().optional();

/**
 * @description A string that must conform to the ISO 8601 date format.
 * Supports date-only, date-time, and timezone information.
 */
const isoDateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+\-]\d{2}:\d{2})?)?$/,
  "Expected ISO 8601 date string"
);

/**
 * @description Defines a schema for representing a monetary range.
 * This is used for salaries, bonuses, and other compensation components.
 */
const moneyRangeSchema = z.object({
  /** @description ISO 4217 currency code or a common currency symbol (e.g., 'USD', '$'). */
  currency: z.string().min(1).describe("ISO currency code or symbol (e.g., 'USD', '$')."),
  /** @description The minimum value of the monetary range. Must be a non-negative number. */
  min: z.number().nonnegative().optional().describe("Minimum amount in the currency."),
  /** @description The maximum value of the monetary range. Must be a non-negative number. */
  max: z.number().nonnegative().optional().describe("Maximum amount in the currency."),
  /** @description The time period to which the compensation applies (e.g., 'year', 'hour'). */
  period: z.enum(["hour", "day", "week", "month", "year", "one-time"]).optional()
    .describe("Compensation period."),
  /** @description Additional notes or context about the compensation range (e.g., 'includes equity', 'OTE'). */
  notes: optionalString.describe("Any notes about the range (e.g., 'includes equity')."),
}).describe("Generic money range model.");

/**
 * @description A comprehensive schema for all compensation-related details of a job posting.
 */
const compensationSchema = z.object({
  /** @description The base salary range for the position. */
  baseSalary: moneyRangeSchema.optional().describe("Base salary range."),
  /** @description The potential bonus range. */
  bonus: moneyRangeSchema.optional().describe("Bonus range."),
  /** @description Details about equity compensation, including type and value. */
  equity: z.object({
    /** @description The type of equity offered (e.g., RSU, Options). */
    type: z.enum(["RSU", "Options", "ESPP", "Other"]).optional(),
    /** @description The value of the equity grant. */
    value: moneyRangeSchema.optional(),
    /** @description Additional notes about the equity. */
    notes: optionalString,
  }).optional().describe("Equity details."),
  /** @description A high-level, narrative summary of the benefits package. */
  benefitsSummary: optionalString.describe("Narrative summary of benefits."),
  /** @description A structured list of specific benefits offered. */
  benefits: z.array(z.object({
    /** @description The name of the benefit (e.g., 'Health Insurance', '401(k) Matching'). */
    name: z.string().min(1),
    /** @description A short description of the benefit. */
    description: optionalString,
    /** @description A URL for more information about the benefit. */
    url: optionalURL,
  })).optional().describe("Structured benefits list."),
  /** @description An estimated total compensation range, potentially including base, bonus, and equity. */
  totalCompEstimate: moneyRangeSchema.optional().describe("Estimated total compensation."),
  /** @description The raw, unprocessed text related to compensation as it appeared in the source. */
  compensationTextRaw: optionalString.describe("Raw text scraped for compensation."),
}).optional().describe("Compensation details for the job posting.");

/**
 * @description Schema for contact information, typically for a recruiter or hiring manager.
 */
const contactSchema = z.object({
  /** @description The full name of the contact person. */
  name: optionalString,
  /** @description The job title of the contact person. */
  title: optionalString,
  /** @description The email address of the contact. */
  email: optionalString,
  /** @description The phone number of the contact. */
  phone: optionalString,
  /** @description The LinkedIn profile URL of the contact. */
  linkedinUrl: optionalURL,
  /** @description A list of other relevant URLs for the contact (e.g., personal website, Twitter). */
  otherUrls: z.array(optionalURL).optional(),
}).describe("Recruiter or hiring contact info.");

/**
 * @description A detailed, structured representation of the job's location.
 */
const locationSchema = z.object({
  /** @description The full, formatted location string (e.g., 'San Francisco, CA, USA'). */
  formatted: optionalString.describe("Full location string (e.g., 'San Francisco, CA, USA')."),
  /** @description The city where the job is located. */
  city: optionalString,
  /** @description The state, province, or administrative region. */
  state: optionalString,
  /** @description A broader geographical region (e.g., 'Bay Area', 'EMEA'). */
  region: optionalString.describe("Broader region (e.g., 'Bay Area', 'EMEA')."),
  /** @description The country where the job is located. */
  country: optionalString,
  /** @description The postal or ZIP code. */
  postalCode: optionalString,
  /** @description Geographic coordinates. */
  geo: z.object({
    /** @description Latitude. */
    lat: z.number().optional(),
    /** @description Longitude. */
    lon: z.number().optional(),
  }).optional(),
  /** @description Flag indicating if the job is fully remote. */
  remote: z.boolean().optional().describe("True if fully remote."),
  /** @description Flag indicating if the job is a hybrid of remote and onsite work. */
  hybrid: z.boolean().optional().describe("True if hybrid."),
  /** @description Flag indicating if the job requires being physically present at an office. */
  onsite: z.boolean().optional().describe("True if onsite."),
  /** @description The estimated percentage of work time that involves travel. */
  travelPercent: z.number().min(0).max(100).optional(),
}).describe("Structured location info.");

/**
 * @description Schema for metadata about the hiring organization.
 */
const orgSchema = z.object({
  /** @description The primary name of the hiring company. */
  companyName: z.string().min(1).describe("Hiring company."),
  /** @description The legal name of the company, if different from its brand name. */
  companyLegalName: optionalString,
  /** @description Other names the company may be known by. */
  companyAlias: z.array(z.string().min(1)).optional(),
  /** @description The industry the company operates in. */
  companyIndustry: optionalString,
  /** @description The estimated range of the company's employee count. */
  companySizeRange: z.object({
    /** @description Minimum number of employees. */
    min: z.number().nonnegative().optional(),
    /** @description Maximum number of employees. */
    max: z.number().nonnegative().optional(),
  }).optional(),
  /** @description The URL of the company's LinkedIn profile. */
  companyLinkedinUrl: optionalURL,
  /** @description The URL of the company's official website. */
  companyWebsite: optionalURL,
  /** @description A summary or "about" section for the company. */
  companyAbout: optionalString,
  /** @description A list of the company's commitments to various initiatives (e.g., DEI). */
  companyCommitments: z.array(z.object({
    /** @description The category of the commitment. */
    category: z.enum(["DEI", "Work-life balance", "Environmental sustainability", "Social impact", "Career growth and learning", "Other"]).optional(),
    /** @description A URL providing evidence or details of the commitment. */
    proofUrl: optionalURL,
    /** @description A description of the commitment. */
    description: optionalString,
  })).optional(),
}).describe("Company metadata.");

/**
 * @description Schema for various identifiers associated with the job posting across different systems.
 */
const jobIdSchema = z.object({
  /** @description The job ID as displayed on the source website. */
  externalPostingId: optionalString.describe("Job ID shown on the site."),
  /** @description The internal ID from the Applicant Tracking System (ATS). */
  atsId: optionalString.describe("ATS internal ID."),
  /** @description A list of identifiers from third-party platforms where the job might be cross-posted. */
  thirdPartyIds: z.array(z.object({
    /** @description The name of the third-party source (e.g., 'Greenhouse'). */
    source: z.string().min(1),
    /** @description The ID on that source. */
    id: z.string().min(1),
    /** @description The URL to the posting on that source. */
    url: optionalURL,
  })).optional(),
}).describe("Identifiers across systems.");

/**
 * @description Schema for temporal information related to the job posting.
 */
const timeWindowSchema = z.object({
  /** @description The date the job was originally posted. */
  postedAt: isoDateString.optional(),
  /** @description The date the job posting was last updated. */
  updatedAt: isoDateString.optional(),
  /** @description The date the job posting is expected to close. */
  closesAt: isoDateString.optional(),
  /** @description The raw text indicating when the job was posted (e.g., 'Posted 2 days ago'). */
  originalPostedText: optionalString,
}).describe("Temporal markers for the posting.");

/**
 * @description An enumeration of possible job types.
 */
const enumJobType = z.enum(["Full-time", "Part-time", "Contract", "Temporary", "Internship", "Freelance", "Apprenticeship", "Volunteer"]).optional();

/**
 * @description Schema for the classification of the employment and its position within the organization.
 */
const employmentSchema = z.object({
  /** @description The type of employment (e.g., 'Full-time', 'Contract'). */
  jobType: enumJobType.describe("Employment type."),
  /** @description The work arrangement (e.g., 'Onsite', 'Remote', 'Hybrid'). */
  workArrangement: z.enum(["Onsite", "Remote", "Hybrid"]).optional(),
  /** @description The seniority level of the role (e.g., 'Senior', 'Director', 'Entry'). */
  seniorityLevel: optionalString.describe("e.g., 'Senior', 'Director', 'Entry'."),
  /** @description The department the role belongs to (e.g., 'Legal Operations'). */
  department: optionalString.describe("e.g., 'Legal Operations'."),
  /** @description The specific team within the department. */
  team: optionalString.describe("e.g., 'CLO Org'."),
  /** @description The job function or category (e.g., 'Product Management'). */
  function: optionalString.describe("e.g., 'Product Management'."),
  /** @description The title of the hiring manager. */
  managerTitle: optionalString,
  /** @description The team that this role reports to. */
  reportsToTeam: optionalString,
  /** @description The number of direct reports this role will have. */
  directReports: z.number().int().nonnegative().optional(),
}).describe("Employment classification and org position.");

/**
 * @description A generic schema for a content section within the job description, which may contain a heading, text, and bullet points.
 */
const sectionSchema = z.object({
  /** @description The heading of the section (e.g., 'What You'll Do'). */
  heading: optionalString,
  /** @description A list of bullet points within the section. */
  bullets: z.array(z.string().min(1)).optional(),
  /** @description The main text content of the section. */
  text: optionalString,
}).describe("Generic section container.");

/**
 * @description A schema for flags that indicate the presence of AI-related and other key technologies mentioned in the job description.
 */
const aiFlagsSchema = z.object({
  /** @description True if 'Artificial Intelligence' or 'AI' is mentioned. */
  mentionsAI: z.boolean().optional(),
  /** @description True if 'Machine Learning' or 'ML' is mentioned. */
  mentionsML: z.boolean().optional(),
  /** @description True if 'Generative AI' or 'GenAI' is mentioned. */
  mentionsGenAI: z.boolean().optional(),
  /** @description True if 'Retrieval-Augmented Generation' or 'RAG' is mentioned. */
  mentionsRAG: z.boolean().optional(),
  /** @description True if 'Large Language Model' or 'LLM' is mentioned. */
  mentionsLLM: z.boolean().optional(),
  /** @description True if 'Analytics' or 'Data Analysis' is mentioned. */
  mentionsAnalytics: z.boolean().optional(),
  /** @description True if 'Salesforce' is mentioned. */
  mentionsSalesforce: z.boolean().optional(),
  /** @description True if 'Legal Tech' is mentioned. */
  mentionsLegalTech: z.boolean().optional(),
}).optional().describe("Feature/tech presence flags derived from text.");

/**
 * @description Schema for details about the application process.
 */
const applicationSchema = z.object({
  /** @description The direct URL to apply for the job. */
  applyUrl: optionalURL,
  /** @description A flag indicating if the company is currently accepting applications. */
  isAcceptingApplications: z.boolean().optional(),
  /** @description The platform used for the application (e.g., 'LinkedIn', 'Greenhouse', 'Workday'). */
  applicationPlatform: optionalString.describe("e.g., 'LinkedIn', 'Greenhouse', 'Workday'."),
  /** @description A flag indicating if a referral is preferred. */
  referralPreferred: z.boolean().optional(),
  /** @description Any specific instructions for the application process. */
  applicationInstructions: optionalString,
  /** @description A list of screening questions asked during the application. */
  screeningQuestions: z.array(z.string()).optional(),
  /** @description A flag indicating if relocation assistance is offered. */
  relocationOffered: z.boolean().optional(),
  /** @description A flag indicating if visa sponsorship is available. */
  visaSponsorship: z.boolean().optional(),
  /** @description A flag indicating if a background check is required. */
  backgroundCheckRequired: z.boolean().optional(),
}).describe("Application channel and constraints.");

/**
 * @description Schema for metadata about the source of the job posting.
 */
const sourceSchema = z.object({
  /** @description The platform where the job posting was found (e.g., 'LinkedIn'). */
  sourcePlatform: optionalString.describe("e.g., 'LinkedIn'."),
  /** @description The URL of the original job posting. */
  sourceUrl: optionalURL,
  /** @description The timestamp when the data was scraped. */
  scrapedAt: isoDateString.optional(),
  /** @description A flag indicating if the raw HTML of the page was saved. */
  rawHtmlAvailable: z.boolean().optional(),
  /** @description Any attribution required by the source. */
  attribution: optionalString,
}).describe("Provenance metadata.");

/**
 * @description Schema for contextual metrics that may be available on the job posting page (e.g., on LinkedIn).
 */
const metricsSchema = z.object({
  /** @description The total number of applicants. */
  applicantsCount: z.number().int().nonnegative().optional(),
  /** @description The number of recent applicants. */
  recentApplicantsCount: z.number().int().nonnegative().optional(),
  /** @description A breakdown of applicants by seniority level. */
  applicantSeniorityBreakdown: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** @description A breakdown of applicants by educational background. */
  applicantEducationBreakdown: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** @description The median tenure of employees at the company in years. */
  medianEmployeeTenureYears: z.number().nonnegative().optional(),
  /** @description Growth rates for various departments within the company. */
  departmentGrowthRates: z.record(z.string(), z.number()).optional(),
}).optional().describe("Contextual metrics pulled from the page.");

/**
 * @description Schema for useful external links related to the job or company.
 */
const externalLinksSchema = z.object({
  /** @description A URL to the company's benefits page. */
  benefitsUrl: optionalURL,
  /** @description A URL to the company's main careers page. */
  companyCareersUrl: optionalURL,
  /** @description A list of other relevant documents or links. */
  additionalDocs: z.array(z.object({
    /** @description The title of the document. */
    title: z.string().min(1),
    /** @description The URL of the document. */
    url: z.string().url(),
    /** @description The type of document (e.g., 'PDF', 'Blog Post'). */
    type: optionalString,
  })).optional(),
}).optional().describe("Useful external links related to the job.");

/**
 * @description A schema for categorized tags extracted from the job posting.
 */
const tagsSchema = z.object({
  /** @description A list of key skills required for the job. */
  skills: z.array(z.string().min(1)).optional().describe("Key skill tags."),
  /** @description A list of technologies or software mentioned (the tech stack). */
  technologies: z.array(z.string().min(1)).optional().describe("Tech stack tags."),
  /** @description A list of business or industry domains relevant to the role (e.g., 'Legal Ops'). */
  domains: z.array(z.string().min(1)).optional().describe("Domain tags (e.g., 'Legal Ops')."),
  /** @description A list of other relevant keywords. */
  keywords: z.array(z.string().min(1)).optional().describe("Loose keyword tags."),
}).optional();

/**
 * @description Schema for governance, security, and compliance-related constraints.
 */
const governanceSchema = z.object({
  /** @description A flag indicating if a security clearance is required. */
  securityClearanceRequired: z.boolean().optional(),
  /** @description The level of confidentiality associated with the role. */
  confidentialityLevel: optionalString,
  /** @description A list of compliance areas the role will be involved with. */
  complianceAreas: z.array(z.string().min(1)).optional(),
  /** @description The level of data access this role will have. */
  dataAccessLevel: optionalString,
}).optional().describe("Governance/security constraints.");

/**
 * @description Schema for derived content intended to help downstream AI agents prepare for interviews.
 */
const interviewPrepSchema = z.object({
  /** @description A list of suggested areas to focus on during an interview. */
  suggestedFocusAreas: z.array(z.string().min(1)).optional(),
  /** @description A list of stakeholders the candidate is likely to meet. */
  likelyStakeholders: z.array(z.string().min(1)).optional(),
  /** @description A list of key outcomes or success metrics for the role in the first year. */
  roleOutcomes: z.array(z.string().min(1)).optional(),
}).optional().describe("Derived prep guidance for downstream agents.");

/**
 * @description The main, comprehensive schema for a job posting.
 * It combines all the sub-schemas into a single, structured object.
 */
export const jobPostingSchema = z.object({
  // Core
  /** @description The title of the job position (e.g., "Senior Software Engineer"). */
  jobTitle: z.string().min(1).optional().describe("The title of the job position."),
  /** @description The name of the company that is hiring. */
  companyName: z.string().min(1).optional().describe("The name of the company hiring."),
  /** @description The primary, unparsed location string (e.g., "San Francisco, CA"). */
  location: z.string().min(1).optional().describe("Primary location string."),

  // Rich org + location detail
  /** @description Detailed, structured information about the hiring organization. */
  organization: orgSchema.optional(),
  /** @description Detailed, structured information about the job's location. */
  locationDetail: locationSchema.optional(),

  // Classification
  /** @description The type of employment (e.g., "Full-time", "Contract"). */
  jobType: enumJobType.describe("The type of employment."),
  /** @description The seniority level of the role (e.g., "Mid-Senior level", "Entry level"). */
  seniorityLevel: z.string().optional().describe("The seniority level (e.g., 'Mid-Senior level', 'Entry level')."),
  /** @description Detailed information about the employment classification and its place in the organization. */
  employment: employmentSchema.optional(),

  // Content sections
  /** @description A list of the key responsibilities for the role. */
  responsibilities: z.array(z.string()).optional().describe("A list of the key responsibilities for the role."),
  /** @description A list of required or preferred qualifications. */
  qualifications: z.union([
    z.array(z.string()),
    z.object({}).passthrough()
  ]).optional().describe("A list of required or preferred qualifications."),
  /** @description Other structured sections extracted from the job posting. */
  sections: z.array(sectionSchema).optional().describe("Other structured sections from the posting."),
  /** @description The raw, unprocessed text of the job description to preserve fidelity. */
  descriptionTextRaw: optionalString.describe("Raw description text to preserve fidelity."),

  // Tags
  /** @description A list of key skills or technologies mentioned in the posting. */
  skills: z.array(z.string()).optional().describe("A list of key skills or technologies mentioned in the posting."),
  /** @description A collection of categorized tags (skills, technologies, domains, keywords). */
  tags: tagsSchema,

  // Identifiers and sourcing
  /** @description A collection of identifiers for the job posting across different systems. */
  identifiers: jobIdSchema.optional(),
  /** @description Metadata about the source of the job posting. */
  source: sourceSchema.optional(),

  // Time window
  /** @description Temporal information about the posting (e.g., posted date, closing date). */
  timeline: timeWindowSchema.optional(),

  // Compensation & benefits
  /** @description Comprehensive details about compensation and benefits. */
  compensation: compensationSchema,

  // Application channel
  /** @description Information about how to apply for the job. */
  application: applicationSchema.optional(),

  // Contacts
  /** @description A list of contact people associated with the job posting. */
  contacts: z.array(contactSchema).optional(),

  // Analytics/insights from the page
  /** @description Contextual metrics about the job or company, if available from the source. */
  insightsMetrics: metricsSchema,

  // External links
  /** @description A collection of useful external links. */
  externalLinks: externalLinksSchema,

  // AI/tech presence flags
  /** @description Flags indicating the presence of AI and other key technologies. */
  aiFlags: z.union([
    aiFlagsSchema,
    z.array(z.any())
  ]).optional().describe("AI-related technology flags or array of technologies mentioned."),

  // Governance & compliance
  /** @description Governance, security, or compliance-related constraints. */
  governance: governanceSchema,

  // Derived helper content for agents
  /** @description Derived content to assist downstream AI agents with interview preparation. */
  interviewPrep: interviewPrepSchema,

  // Meta flags
  /** @description A flag indicating if this is a reposting of a previous job. */
  isReposted: z.boolean().optional(),
  /** @description A flag indicating if the job posting is a promoted or sponsored listing. */
  isPromoted: z.boolean().optional(),
  /** @description A flag indicating if the job posting is closed or no longer accepting applications. */
  isClosed: z.boolean().optional(),
  /** @description The detected language of the job posting (e.g., 'en', 'es'). */
  language: optionalString.describe("Detected language of the posting."),
}).describe("Comprehensive job posting schema with broad optional flags and nested structures.");

