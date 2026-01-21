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
  loanAppTimeFrame: string;
  loanCommitment: string;
  preApprovalDays: number;
  
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
