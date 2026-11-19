// All companies, people and domains below are fictional. Domains use the reserved .example TLD.
import type { SignalType } from "./schema";
import type { Icp } from "@/lib/types";

export const INDUSTRIES = ["Industrial / HVAC", "SaaS", "Logistics"] as const;

export interface CompanySeed {
  name: string;
  industry: (typeof INDUSTRIES)[number];
  size: number;
  location: string;
  summary: string;
}

const HVAC: [string, number, string, string][] = [
  ["Brightwater Mechanical", 220, "Columbus, OH, US", "Commercial HVAC installation and service for offices and schools."],
  ["Coldfront Climate Co.", 140, "Denver, CO, US", "Rooftop unit replacement and preventive maintenance contracts."],
  ["Ironleaf Heating & Air", 85, "Raleigh, NC, US", "Residential and light-commercial heating and cooling."],
  ["Northgate Boiler Works", 410, "Milwaukee, WI, US", "Industrial boilers, steam systems and 24/7 emergency service."],
  ["Pinecrest Air Systems", 60, "Boise, ID, US", "Ductless mini-split installs and indoor air quality services."],
  ["Redline Refrigeration", 310, "Dallas, TX, US", "Commercial refrigeration for grocery and food-service chains."],
  ["Summit Ridge HVAC", 175, "Calgary, AB, Canada", "Mechanical contractor for multi-family and mixed-use buildings."],
  ["Tidewell Controls", 95, "Norfolk, VA, US", "Building automation and controls retrofits."],
  ["Valleyforge Industrial", 680, "Allentown, PA, US", "Industrial ventilation and process cooling for manufacturers."],
  ["Westbrook Thermal", 38, "Portland, ME, US", "Heat pump installer serving small businesses."],
  ["Granite Peak Mechanical", 260, "Salt Lake City, UT, US", "Design-build HVAC and plumbing for commercial projects."],
  ["Harborline Fire & HVAC", 520, "Tacoma, WA, US", "Combined fire protection and HVAC service provider."],
  ["Copperfield Energy Services", 130, "Tulsa, OK, US", "Energy audits and high-efficiency HVAC upgrades."],
  ["Lakeshore Comfort Group", 1450, "Chicago, IL, US", "Multi-brand HVAC services group operating 30 branches."],
  ["Maplestone Air", 70, "Toronto, ON, Canada", "Commercial HVAC maintenance for property managers."],
  ["Sablewood Mechanical", 15, "Asheville, NC, US", "Owner-operated residential HVAC contractor."],
];

const SAAS: [string, number, string, string][] = [
  ["Quillstack", 120, "Austin, TX, US", "Contract lifecycle software for mid-market legal teams."],
  ["Ledgerloop", 260, "New York, NY, US", "Accounts payable automation for multi-entity finance teams."],
  ["Brightpath Analytics", 75, "Boston, MA, US", "Product analytics for B2B mobile apps."],
  ["Cobaltline", 430, "San Francisco, CA, US", "API security monitoring platform."],
  ["Fieldnote HQ", 55, "Seattle, WA, US", "Mobile forms and inspections software for field teams."],
  ["Harbor Metrics", 190, "Chicago, IL, US", "Revenue intelligence for subscription businesses."],
  ["Kiteshift", 32, "Remote, US", "Shift scheduling for hourly workforces."],
  ["Lumenary", 610, "London, UK", "Customer education and LMS platform."],
  ["Mosaic Payroll", 340, "Toronto, ON, Canada", "Payroll and benefits for Canadian SMBs."],
  ["Northwind Dispatch Cloud", 150, "Minneapolis, MN, US", "Dispatch and scheduling software for home-service contractors."],
  ["Orbitdesk", 88, "Berlin, Germany", "Internal help desk for IT and HR teams."],
  ["Pallet Labs", 210, "Atlanta, GA, US", "Warehouse management system for 3PLs."],
  ["Rivetly", 45, "Denver, CO, US", "Quoting and proposals software for contractors."],
  ["Sprocket CRM", 900, "San Jose, CA, US", "CRM for manufacturing sales teams."],
  ["Tallyhook", 18, "Portland, OR, US", "Early-stage expense tracking app."],
  ["Wavecrest Data", 275, "Toronto, ON, Canada", "Data pipeline tooling for analytics engineers."],
];

const LOGISTICS: [string, number, string, string][] = [
  ["Anchorpoint Freight", 380, "Memphis, TN, US", "Asset-light freight brokerage focused on dry van."],
  ["Bluehaul Logistics", 160, "Savannah, GA, US", "Drayage and port logistics for importers."],
  ["Crossdock Partners", 540, "Indianapolis, IN, US", "Cross-docking and regional distribution centers."],
  ["Driftwood Carriers", 90, "Fresno, CA, US", "Refrigerated trucking for produce growers."],
  ["Eastline Courier", 230, "Newark, NJ, US", "Same-day courier and final-mile delivery."],
  ["Frontier Rail Transload", 120, "Kansas City, MO, US", "Rail-to-truck transloading services."],
  ["Gullwing Fulfillment", 300, "Reno, NV, US", "E-commerce fulfillment for DTC brands."],
  ["Highmark Hauling", 65, "El Paso, TX, US", "Cross-border flatbed carrier."],
  ["Keystone 3PL", 820, "Harrisburg, PA, US", "Contract logistics and warehousing for CPG brands."],
  ["Meridian Cold Chain", 450, "Vancouver, BC, Canada", "Temperature-controlled warehousing and distribution."],
  ["Northstar Parcel", 1200, "Louisville, KY, US", "Regional parcel carrier with 22 hubs."],
  ["Prairie Line Transport", 140, "Omaha, NE, US", "Less-than-truckload carrier in the Midwest."],
  ["Seabright Forwarding", 75, "Miami, FL, US", "Freight forwarding to Latin America."],
  ["Truecourse Fleet Services", 210, "Phoenix, AZ, US", "Fleet maintenance and leasing for regional carriers."],
  ["Westerly Distribution", 25, "Spokane, WA, US", "Small regional distributor for hardware stores."],
  ["Yardbird Terminal Ops", 170, "Houston, TX, US", "Yard management and terminal operations."],
];

function toSeed(rows: [string, number, string, string][], industry: CompanySeed["industry"]): CompanySeed[] {
  return rows.map(([name, size, location, summary]) => ({ name, industry, size, location, summary }));
}

export const COMPANY_SEEDS: CompanySeed[] = [
  ...toSeed(HVAC, "Industrial / HVAC"),
  ...toSeed(SAAS, "SaaS"),
  ...toSeed(LOGISTICS, "Logistics"),
];

export function domainFor(name: string): string {
  return `${name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "")}.example`;
}

/** Signal templates per type. {c} = company name. Used for seeding and for "Run detection". */
type Industry = (typeof INDUSTRIES)[number];
const H: Industry = "Industrial / HVAC";
const S: Industry = "SaaS";
const L: Industry = "Logistics";

export interface SignalTemplate { text: string; source: string; for?: Industry[] }

export const SIGNAL_TEMPLATES: Record<SignalType, SignalTemplate[]> = {
  hiring: [
    { text: "Posted 6 open roles for field service technicians", source: "Job board", for: [H] },
    { text: "Hiring a Director of Operations to scale dispatch", source: "Careers page", for: [H, L] },
    { text: "Hiring 4 SDRs and a Sales Ops Manager", source: "Job board", for: [S] },
    { text: "Opened 12 warehouse associate roles at a new site", source: "Job board", for: [L] },
    { text: "Recruiting a Head of Customer Success", source: "LinkedIn jobs", for: [S] },
    { text: "Hiring 8 CDL drivers and a fleet dispatcher", source: "Job board", for: [L] },
  ],
  funding: [
    { text: "Raised a $14M Series A led by a growth fund", source: "Press release", for: [S] },
    { text: "Secured a $40M credit facility to fund fleet growth", source: "News", for: [L] },
    { text: "Closed a $22M Series B to expand go-to-market", source: "Press release", for: [S] },
    { text: "Received a private equity investment to pursue acquisitions", source: "News", for: [H, L] },
  ],
  expansion: [
    { text: "Opened a new branch office and service territory", source: "Company blog", for: [H] },
    { text: "Announced a second distribution center in the Southeast", source: "News", for: [L] },
    { text: "Acquired a regional competitor, adding 3 locations", source: "Press release", for: [H, L] },
    { text: "Expanding service coverage into two new states", source: "Company blog", for: [H, L] },
    { text: "Opened a second office to grow the sales team", source: "Company blog", for: [S] },
  ],
  product_launch: [
    { text: "Launched a new maintenance-plan subscription offering", source: "Company blog", for: [H] },
    { text: "Released a self-serve tier and public API", source: "Product Hunt", for: [S] },
    { text: "Launched a same-day delivery service line", source: "Press release", for: [L] },
  ],
  new_exec: [
    { text: "Appointed a new COO from a national competitor", source: "LinkedIn" },
    { text: "Named a new VP of Operations", source: "Press release" },
    { text: "Hired a new CRO to lead revenue", source: "LinkedIn", for: [S] },
  ],
  rfp: [
    { text: "Issued an RFP for field service management software", source: "Procurement portal", for: [H] },
    { text: "Requested proposals for a dispatch and routing system", source: "Procurement portal", for: [L, H] },
    { text: "Published an RFP for preventive maintenance contracts", source: "Procurement portal", for: [H] },
    { text: "Issued an RFP for a sales engagement platform", source: "Procurement portal", for: [S] },
  ],
};

/** Templates that make sense for a company's industry. */
export function templatesFor(type: SignalType, industry: string): SignalTemplate[] {
  const all = SIGNAL_TEMPLATES[type];
  const fit = all.filter((t) => !t.for || t.for.includes(industry as Industry));
  return fit.length ? fit : all;
}

export const FIRST_NAMES = [
  "Maya", "Jordan", "Priya", "Marcus", "Elena", "Theo", "Aisha", "Daniel", "Hana", "Lucas",
  "Sofia", "Omar", "Grace", "Rafael", "Nina", "Caleb", "Ines", "Victor", "Leah", "Kenji",
  "Amara", "Felix", "Rosa", "Ethan", "Zara", "Malik", "Clara", "Diego", "Freya", "Samir",
];
export const LAST_NAMES = [
  "Okafor", "Lindqvist", "Ramirez", "Chen", "Delacroix", "Brennan", "Haddad", "Novak", "Ishikawa", "Moreau",
  "Patel", "Whitlock", "Albrecht", "Castellano", "Osei", "Fairbanks", "Kowalski", "Mendel", "Strand", "Vance",
];

export const TITLES_BY_INDUSTRY: Record<CompanySeed["industry"], string[]> = {
  "Industrial / HVAC": ["VP Operations", "Director of Operations", "Service Manager", "COO", "Head of Field Service", "Office Manager"],
  SaaS: ["VP Sales", "Head of Revenue Operations", "COO", "Director of Operations", "CTO", "Marketing Manager"],
  Logistics: ["VP Operations", "Director of Operations", "COO", "Head of Dispatch", "Fleet Manager", "Controller"],
};

export const DEFAULT_ICP: Icp = {
  industries: ["Industrial / HVAC", "Logistics"],
  titles: ["VP Operations", "Director of Operations", "COO", "Head of Field Service", "Head of Dispatch"],
  sizeMin: 50,
  sizeMax: 1000,
  geographies: ["US", "Canada"],
  dealSize: 30000,
  mustHaveSignals: ["hiring", "expansion", "new_exec", "rfp"],
  disqualifiers: ["fewer than 20 employees", "competitor", "government"],
};

export const DEFAULT_SETTINGS = {
  companyName: "Routewise",
  offerDescription:
    "Dispatch and scheduling software that helps operations teams assign jobs, route crews and track every job from quote to invoice.",
  sendingDomain: "outreach.routewise.example",
};

export const REPLY_PRESETS: Record<"interested" | "not_now" | "wrong_person" | "out_of_office" | "unsubscribe" | "not_interested", string> = {
  interested: "Thanks for reaching out. Timing is actually good, we're feeling this exact pain with the new hires. Can you send a couple of times for a call next week?",
  not_now: "Appreciate the note. We're heads-down on a migration right now, not now. Try me again in Q2 and I'd be happy to take a look.",
  wrong_person: "I'm not the right person for this. You should reach out to our Director of Operations, Sam, who handles tooling decisions.",
  out_of_office: "I'm out of the office with limited access to email and will be back on December 2. For urgent matters contact the front desk.",
  unsubscribe: "Please unsubscribe me from this list. Not interested.",
  not_interested: "No thanks, we already have a system we're happy with.",
};
