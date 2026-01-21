/**
 * Education Detection Service for BACKBONE
 * Detects education status from email domain and LinkedIn data
 */

/**
 * Common education email domain patterns
 */
const EDU_DOMAINS = [
  ".edu",
  ".ac.uk",
  ".edu.au",
  ".edu.cn",
  ".ac.jp",
  ".edu.sg",
  ".edu.hk",
  ".edu.in",
  ".edu.br",
  ".edu.mx",
  ".edu.co",
  ".uni-",
  ".university",
  ".college"
];

/**
 * Known university domains (partial list)
 */
const UNIVERSITY_DOMAINS = {
  "stanford.edu": { name: "Stanford University", level: "gradSchool" },
  "harvard.edu": { name: "Harvard University", level: "gradSchool" },
  "mit.edu": { name: "MIT", level: "gradSchool" },
  "berkeley.edu": { name: "UC Berkeley", level: "gradSchool" },
  "yale.edu": { name: "Yale University", level: "gradSchool" },
  "princeton.edu": { name: "Princeton University", level: "gradSchool" },
  "columbia.edu": { name: "Columbia University", level: "gradSchool" },
  "nyu.edu": { name: "New York University", level: "gradSchool" },
  "ucla.edu": { name: "UCLA", level: "college" },
  "umich.edu": { name: "University of Michigan", level: "gradSchool" },
  "uchicago.edu": { name: "University of Chicago", level: "gradSchool" },
  "upenn.edu": { name: "University of Pennsylvania", level: "gradSchool" },
  "cmu.edu": { name: "Carnegie Mellon University", level: "gradSchool" },
  "gatech.edu": { name: "Georgia Tech", level: "gradSchool" },
  "utexas.edu": { name: "UT Austin", level: "gradSchool" },
  "illinois.edu": { name: "UIUC", level: "gradSchool" },
  "cornell.edu": { name: "Cornell University", level: "gradSchool" },
  "duke.edu": { name: "Duke University", level: "gradSchool" },
  "northwestern.edu": { name: "Northwestern University", level: "gradSchool" },
  "ox.ac.uk": { name: "Oxford University", level: "gradSchool" },
  "cam.ac.uk": { name: "Cambridge University", level: "gradSchool" }
};

/**
 * Get education configuration from environment
 */
export const getEducationConfig = () => {
  const userEmail = process.env.USER_EMAIL;

  return {
    userEmail,
    hasEmail: Boolean(userEmail)
  };
};

/**
 * Check if email domain indicates education
 */
export const isEducationEmail = (email) => {
  if (!email) return false;

  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;

  // Check known university domains first
  if (UNIVERSITY_DOMAINS[domain]) {
    return true;
  }

  // Check common education TLDs
  return EDU_DOMAINS.some((eduDomain) => domain.includes(eduDomain));
};

/**
 * Get university info from email domain
 */
export const getUniversityFromEmail = (email) => {
  if (!email) return null;

  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return null;

  // Check known university domains
  if (UNIVERSITY_DOMAINS[domain]) {
    return UNIVERSITY_DOMAINS[domain];
  }

  // Check if it's an edu domain but not in our list
  if (EDU_DOMAINS.some((eduDomain) => domain.includes(eduDomain))) {
    // Extract university name from domain
    const parts = domain.split(".");
    const name = parts[0]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      name: name,
      level: "college", // Default assumption
      domain: domain
    };
  }

  return null;
};

/**
 * Detect education status from multiple sources
 */
export const detectEducationStatus = (email, linkedInEducation) => {
  const result = {
    isStudent: false,
    educationLevel: null,
    schoolName: null,
    fieldOfStudy: null,
    source: null
  };

  // Check email first
  if (email) {
    const universityInfo = getUniversityFromEmail(email);
    if (universityInfo) {
      result.isStudent = true;
      result.educationLevel = universityInfo.level;
      result.schoolName = universityInfo.name;
      result.source = "email";
    }
  }

  // LinkedIn data takes precedence if available and indicates current enrollment
  if (linkedInEducation?.inSchool) {
    result.isStudent = true;
    result.schoolName = linkedInEducation.schoolName || result.schoolName;
    result.fieldOfStudy = linkedInEducation.fieldOfStudy;
    result.source = "linkedin";

    // Detect education level from degree type
    if (linkedInEducation.degreeType) {
      const level = detectEducationLevelFromDegree(linkedInEducation.degreeType);
      if (level) {
        result.educationLevel = level;
      }
    }
  }

  return result;
};

/**
 * Detect education level from degree string
 */
export const detectEducationLevelFromDegree = (degreeType) => {
  if (!degreeType) return null;

  const lower = degreeType.toLowerCase();

  // Doctoral/PhD
  if (
    lower.includes("phd") ||
    lower.includes("doctorate") ||
    lower.includes("doctoral") ||
    lower.includes("d.phil")
  ) {
    return "gradSchool";
  }

  // Masters
  if (
    lower.includes("master") ||
    lower.includes("mba") ||
    lower.includes("m.s.") ||
    lower.includes("m.a.") ||
    lower.includes("msc") ||
    lower.includes("ma ") ||
    lower.includes("ms ") ||
    lower.includes("llm") ||
    lower.includes("meng")
  ) {
    return "gradSchool";
  }

  // Bachelors
  if (
    lower.includes("bachelor") ||
    lower.includes("b.s.") ||
    lower.includes("b.a.") ||
    lower.includes("bsc") ||
    lower.includes("ba ") ||
    lower.includes("bs ")
  ) {
    return "college";
  }

  // Associate
  if (lower.includes("associate") || lower.includes("a.a.") || lower.includes("a.s.")) {
    return "college";
  }

  // High School
  if (
    lower.includes("high school") ||
    lower.includes("secondary") ||
    lower.includes("diploma") ||
    lower.includes("ged")
  ) {
    return "highSchool";
  }

  return "college"; // Default
};

/**
 * Build education section for profile
 */
export const buildEducationSection = (educationStatus) => {
  if (!educationStatus.isStudent) {
    return null;
  }

  return {
    active: true,
    level: educationStatus.educationLevel,
    school: educationStatus.schoolName,
    field: educationStatus.fieldOfStudy,
    displayName:
      educationStatus.educationLevel === "gradSchool"
        ? "Grad School"
        : educationStatus.educationLevel === "college"
          ? "College"
          : "High School"
  };
};
