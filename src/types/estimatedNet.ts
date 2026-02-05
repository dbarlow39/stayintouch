export interface PropertyData {
  // Basic Information
  name: string;
  sellerPhone: string;
  sellerEmail: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  
  // Financial Details
  offerPrice: number;
  firstMortgage: number;
  secondMortgage: number;
  listingAgentCommission: number;
  buyerAgentCommission: number;
  closingCost: number;
  
  // Loan Details
  typeOfLoan: string;
  lenderName: string;
  lendingOfficer: string;
  lendingOfficerPhone: string;
  lendingOfficerEmail: string;
  buyerName1: string;
  buyerName2: string;
  loanAppTimeFrame: string;
  loanCommitment: string;
  preApprovalDays: number;
  appraisalContingency: boolean;
  
  // Additional Costs
  homeWarranty: number;
  homeWarrantyCompany: string;
  deposit: number;
  depositCollection: string;
  
  // Dates
  inContract: string;
  closingDate: string;
  possession: string;
  finalWalkThrough: string;
  respondToOfferBy: string;
  
  // Inspection
  inspectionDays: number;
  remedyPeriodDays: number;
  
  // Tax Information
  annualTaxes: number;
  firstHalfPaid: boolean;
  secondHalfPaid: boolean;
  taxDaysDueThisYear: number;
  daysFirstHalfTaxes: number;
  daysSecondHalfTaxes: number;
  
  // Agent Information
  agentName: string;
  agentContact: string;
  agentEmail: string;
  
  // Listing Agent Information
  listingAgentName: string;
  listingAgentPhone: string;
  listingAgentEmail: string;
  
   // Title Company Information
   titleCompanyName: string;
   titleProcessor: string;
   titlePhone: string;
   titleEmail: string;
 
  adminFee: number;
  
  // Additional
  appliances: string;
  notes: string;
}

export interface ClosingCostData {
  sellingPrice: number;
  firstMortgage: number;
  secondMortgage: number;
  buyerClosingCost: number;
  annualTaxes: number;
  taxesFirstHalf: number;
  taxesSecondHalf: number;
  taxesDueForYear: number;
  listingAgentCommission: number;
  buyerAgentCommission: number;
  countyConveyanceFee: number;
  homeWarranty: number;
  homeWarrantyCompany: string;
  titleExamination: number;
  titleSettlement: number;
  closingFee: number;
  deedPreparation: number;
  overnightFee: number;
  recordingFee: number;
  surveyCoverage: number;
  adminFee: number;
  titleInsurance: number;
  estimatedNet: number;
}

export interface EstimatedNetProperty {
  id: string;
  agent_id: string;
  client_id: string | null;
  name: string;
  seller_phone: string | null;
  seller_email: string | null;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  offer_price: number;
  first_mortgage: number;
  second_mortgage: number;
  listing_agent_commission: number;
  buyer_agent_commission: number;
  closing_cost: number;
  type_of_loan: string | null;
  loan_app_time_frame: string | null;
  loan_commitment: string | null;
  pre_approval_days: number | null;
  home_warranty: number;
  home_warranty_company: string | null;
  deposit: number;
  deposit_collection: string | null;
  admin_fee: number;
  in_contract: string | null;
  closing_date: string | null;
  possession: string | null;
  final_walk_through: string | null;
  respond_to_offer_by: string | null;
  inspection_days: number | null;
  remedy_period_days: number | null;
  annual_taxes: number;
  first_half_paid: boolean;
  second_half_paid: boolean;
  tax_days_due_this_year: number | null;
  days_first_half_taxes: number | null;
  days_second_half_taxes: number | null;
  listing_agent_name: string | null;
  listing_agent_phone: string | null;
  listing_agent_email: string | null;
  agent_name: string | null;
  agent_contact: string | null;
  agent_email: string | null;
  appliances: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
