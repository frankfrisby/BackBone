# LinkedIn Profile Enrichment

## Category
profile, onboarding

## Tags
linkedin, profile, enrichment, web-search, identity

## Description
Automatically enrich any user's LinkedIn profile from public web sources. This skill runs when a user's LinkedIn profile data is incomplete (< 70% completeness). It uses web search to find public information about the person and fills in missing sections.

## When to Use
- User's LinkedIn profile completeness is below 70%
- User explicitly asks to "fill in my profile" or "get my LinkedIn info"
- During onboarding when profile is first connected
- Autonomous engine detects profile data gaps

## Process

### Phase 1: Assessment
1. Call `enrich-linkedin-profile` tool with `action: "status"`
2. Check `completeness` score and `missing` sections
3. If completeness >= 70%, skip (already sufficient)

### Phase 2: Plan
1. Call `enrich-linkedin-profile` tool with `action: "plan"`
2. Receive a list of search queries targeted at the user's missing sections
3. Each query has a `purpose`, `query` string, and `fillsSections` list

### Phase 3: Research
1. Execute each search query from the plan via `WebSearch`
2. For top results, use `WebFetch` to extract detailed information
3. Prioritize these source types (in order of reliability):
   - Personal website / portfolio
   - University/employer press releases or news articles
   - Conference talks or publications
   - Professional directories (ZoomInfo, etc.)
   - LinkedIn public page (limited without auth)
4. Extract structured data: name, headline, about, experience (with dates), education (with degrees), skills, certifications, articles

### Phase 4: Compile
1. Organize all gathered data into a structured profile object:
   ```json
   {
     "action": "enrich",
     "profileUrl": "https://www.linkedin.com/in/username/",
     "name": "Full Name",
     "headline": "Title at Company",
     "location": "City, State",
     "about": "Multi-paragraph professional summary...",
     "currentRole": "Current Job Title",
     "currentCompany": "Company Name",
     "experience": [
       {
         "title": "Job Title",
         "company": "Company Name",
         "location": "City, State",
         "description": "What they did there",
         "current": true
       }
     ],
     "education": [
       {
         "school": "University Name",
         "degree": "Master's Degree",
         "field": "Field of Study",
         "startYear": "2010",
         "endYear": "2012"
       }
     ],
     "skills": [{"name": "Python"}, {"name": "Machine Learning"}],
     "certifications": [{"name": "AWS Certified", "issuer": "Amazon"}],
     "languages": [{"name": "English", "proficiency": "Native"}],
     "featuredItems": [{"title": "Article Name", "type": "article", "date": "2024"}],
     "volunteerExperience": [{"role": "Board Member", "organization": "Org"}],
     "summary": "One-paragraph professional summary"
   }
   ```
2. Only include fields where you found actual data (don't fabricate)
3. Mark `current: true` on the current job in experience

### Phase 5: Save
1. Call `enrich-linkedin-profile` tool with `action: "enrich"` and the compiled data
2. Verify the returned completeness score improved
3. If still below 70%, note which sections couldn't be found from public sources

## Decision Framework
- **Don't fabricate**: If info isn't found, leave the section empty. Better incomplete than wrong.
- **Merge, don't overwrite**: The tool merges new data with existing. Existing data is preserved.
- **Prioritize high-weight sections**: experience (15), education (12), about (10), skills (10), name (10)
- **Public sources only**: Never attempt to scrape behind login walls. Use what's publicly available.
- **Re-run if stale**: If `lastUpdated` is > 30 days old, consider re-running even if completeness is OK.

## My Preferences
- Prefer detailed experience descriptions over just job titles
- Include notable achievements and projects when available
- Capture published articles and talks as featured items

## Examples

### Trigger: Low Profile Completeness
```
AI detects: Profile completeness 33%
AI calls: enrich-linkedin-profile action=plan
AI receives: 6 search queries for missing sections
AI executes: WebSearch for each query
AI compiles: Structured profile data
AI calls: enrich-linkedin-profile action=enrich data={...}
Result: Profile completeness now 86%
```

### Trigger: User Request
```
User: "Fill in my LinkedIn profile info"
AI calls: enrich-linkedin-profile action=status
AI sees: 45% completeness, missing experience, skills, about
AI follows: Phase 2-5 above
```
